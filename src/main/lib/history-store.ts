import { app } from '@mobrowser/api';
import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(exec);

/** Keep at most this many past generations; older ones are pruned from disk. */
const MAX_ENTRIES = 50;

interface Entry {
  id: string;
  createdAt: string;
  prompt: string;
  style: string;
  count: number;
}

function historyDir(): string {
  return path.join(app.getPath('userData'), 'history');
}
function indexPath(): string {
  return path.join(historyDir(), 'index.json');
}

async function readIndex(): Promise<Entry[]> {
  try {
    return JSON.parse(await fs.readFile(indexPath(), 'utf8')) as Entry[];
  } catch {
    return [];
  }
}
async function writeIndex(entries: Entry[]): Promise<void> {
  await fs.mkdir(historyDir(), { recursive: true });
  await fs.writeFile(indexPath(), JSON.stringify(entries, null, 2));
}

/**
 * Serializes every write to the history (saveGeneration does a read-modify-write
 * of index.json). Without this, two overlapping generations both read the same
 * index snapshot and the second write clobbers the first, silently dropping
 * entries — e.g. an Article "Generate all" batch fires its per-shot saves back
 * to back. Chaining them guarantees each save sees the prior save's result.
 */
let writeChain: Promise<void> = Promise.resolve();

/**
 * Persist a generation: writes each variant as a PNG plus a small thumbnail of
 * the first variant, appends an index entry, and prunes to MAX_ENTRIES.
 * Safe to call concurrently — writes are serialized; failures are non-fatal.
 */
export function saveGeneration(
  prompt: string,
  style: string,
  imagesB64: string[]
): Promise<void> {
  const task = writeChain.then(() =>
    saveGenerationInner(prompt, style, imagesB64)
  );
  // Keep the chain alive even if this write rejects, so later writes still run.
  writeChain = task.catch(() => {});
  return task;
}

async function saveGenerationInner(
  prompt: string,
  style: string,
  imagesB64: string[]
): Promise<void> {
  if (imagesB64.length === 0) return;
  const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const itemDir = path.join(historyDir(), id);
  await fs.mkdir(itemDir, { recursive: true });

  for (let i = 0; i < imagesB64.length; i++) {
    await fs.writeFile(path.join(itemDir, `v${i}.png`), Buffer.from(imagesB64[i], 'base64'));
  }

  // Small thumbnail of the first variant (sips); fall back to the full image.
  const v0 = path.join(itemDir, 'v0.png');
  const thumb = path.join(itemDir, 'thumb.png');
  try {
    await run(`sips -Z 360 "${v0}" --out "${thumb}"`);
  } catch {
    await fs.copyFile(v0, thumb).catch(() => {});
  }

  const index = await readIndex();
  index.push({ id, createdAt: new Date().toISOString(), prompt, style, count: imagesB64.length });
  while (index.length > MAX_ENTRIES) {
    const old = index.shift();
    if (old) await fs.rm(path.join(historyDir(), old.id), { recursive: true, force: true }).catch(() => {});
  }
  await writeIndex(index);
}

export interface HistoryListItem {
  id: string;
  createdAt: string;
  prompt: string;
  style: string;
  thumbB64: string;
  count: number;
}

/** Newest-first list with thumbnails only (keeps the payload small). */
export async function listHistory(limit = 40): Promise<HistoryListItem[]> {
  const index = await readIndex();
  const recent = index.slice(-limit).reverse();
  const out: HistoryListItem[] = [];
  for (const e of recent) {
    let thumbB64 = '';
    try {
      thumbB64 = (await fs.readFile(path.join(historyDir(), e.id, 'thumb.png'))).toString('base64');
    } catch {
      /* missing thumb is fine */
    }
    out.push({ id: e.id, createdAt: e.createdAt, prompt: e.prompt, style: e.style, thumbB64, count: e.count });
  }
  return out;
}

/** Full-resolution variants for one entry, base64 (no data URL prefix). */
export async function getHistoryItem(id: string): Promise<string[]> {
  const itemDir = path.join(historyDir(), id);
  const images: string[] = [];
  try {
    const files = (await fs.readdir(itemDir))
      .filter((f) => /^v\d+\.png$/.test(f))
      // Numeric sort so v10 follows v9 (a lexicographic sort would put v10 before v2).
      .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
    for (const f of files) {
      images.push((await fs.readFile(path.join(itemDir, f))).toString('base64'));
    }
  } catch {
    /* gone */
  }
  return images;
}

export async function clearHistory(): Promise<void> {
  await fs.rm(historyDir(), { recursive: true, force: true }).catch(() => {});
}
