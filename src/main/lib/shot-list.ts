import { getResolvedApiKey } from "./openai-api-key";
import { resolveProviderName, withRetry } from "./image-provider";
import { getCodexCliPath, getGeminiCliPath } from "./app-settings";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface Shot {
  theme: string;
  coreIdea: string;
  labels: string[];
}

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 60_000;
const CODEX_TEXT_TIMEOUT_MS = 180_000;
const GEMINI_TEXT_TIMEOUT_MS = 180_000;
const MAX_RETRIES = 2;

const SYSTEM_PROMPT =
  "You select which ideas in an article deserve a standalone illustration. " +
  "Read the article and choose 4 to 8 of its strongest, most visualizable ideas — " +
  "a judgment, a process, a structure, a state, or a metaphor. " +
  "Skip generic intros, conclusions, and pure summaries; prefer concrete, drawable ideas. " +
  "For each chosen idea return: " +
  "theme (a 2-4 word title), " +
  "core_idea (ONE concrete sentence naming the single thing to visualize), " +
  "labels (0-3 very short 1-2 word phrases that could be handwritten on the image, or []). " +
  'Respond ONLY with JSON of the form ' +
  '{"shots":[{"theme":"...","core_idea":"...","labels":["..."]}]}.';

interface ChatConfig {
  url: string;
  model: string;
  headers: Record<string, string>;
}

function chatConfig(apiKey: string): ChatConfig {
  const name = resolveProviderName();
  if (name === "openrouter") {
    return {
      url: OPENROUTER_CHAT_URL,
      model: process.env.OPENROUTER_TEXT_MODEL?.trim() || "openai/gpt-4o-mini",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/caezium/nib",
        "X-Title": "Nib",
      },
    };
  }
  return {
    url: OPENAI_CHAT_URL,
    model: process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-mini",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  };
}

function makeCodexPrompt(article: string): string {
  return `${SYSTEM_PROMPT}

Article:
${article.slice(0, 24_000)}

Return only the JSON object. Do not include markdown fences, explanation, or commentary.`;
}

function runCodexShotList(article: string): Promise<Shot[]> {
  return new Promise<Shot[]>((resolve, reject) => {
    const codex = getCodexCliPath();
    if (!codex) {
      reject(
        new Error(
          "Could not find the Codex CLI. Install it and run `codex login`, or switch to OpenRouter in Settings."
        )
      );
      return;
    }
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "nib-codex-shotlist-"));
    const child = spawn(codex, ["exec", "--skip-git-repo-check", "-C", workdir], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";

    const cleanup = () => {
      fs.rmSync(workdir, { recursive: true, force: true });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      cleanup();
      reject(new Error("Codex timed out planning the article."));
    }, CODEX_TEXT_TIMEOUT_MS);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      cleanup();
      reject(
        new Error(
          `Could not run Codex (${e.message}). Install it and run \`codex login\`, or switch to OpenRouter in Settings.`
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      cleanup();
      if (code !== 0) {
        reject(
          new Error(
            `Codex failed planning the article (exit ${code}). Run \`codex login\`, or switch to OpenRouter. ${err.slice(0, 300)}`
          )
        );
        return;
      }
      try {
        const shots = parseShots(out);
        if (shots.length === 0) throw new Error("Codex returned no usable shots.");
        resolve(shots);
      } catch (e) {
        reject(e);
      }
    });

    child.stdin.write(makeCodexPrompt(article));
    child.stdin.end();
  });
}

function runGeminiShotList(article: string): Promise<Shot[]> {
  return new Promise<Shot[]>((resolve, reject) => {
    const gemini = getGeminiCliPath();
    if (!gemini) {
      reject(
        new Error(
          "Could not find the Gemini CLI. Install it and run `gemini` to sign in, or switch to OpenRouter in Settings."
        )
      );
      return;
    }
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "nib-gemini-shotlist-"));
    const child = spawn(gemini, ["--output-format", "text", "-p", ""], {
      cwd: workdir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    });
    let out = "";
    let err = "";

    const cleanup = () => {
      fs.rmSync(workdir, { recursive: true, force: true });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      cleanup();
      reject(new Error("Gemini timed out planning the article."));
    }, GEMINI_TEXT_TIMEOUT_MS);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      cleanup();
      reject(
        new Error(
          `Could not run Gemini (${e.message}). Install it and run \`gemini\` to sign in, or switch to OpenRouter in Settings.`
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      cleanup();
      if (code !== 0) {
        reject(
          new Error(
            `Gemini failed planning the article (exit ${code}). Run \`gemini\` to sign in, or switch to OpenRouter. ${err.slice(0, 300)}`
          )
        );
        return;
      }
      try {
        const shots = parseShots(out);
        if (shots.length === 0) throw new Error("Gemini returned no usable shots.");
        resolve(shots);
      } catch (e) {
        reject(e);
      }
    });

    child.stdin.write(makeCodexPrompt(article));
    child.stdin.end();
  });
}

/** Lenient JSON parse: tolerate ```json fences and surrounding prose. */
function parseShots(content: string): Shot[] {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Fall back to the first {...} block.
  if (!text.startsWith("{")) {
    const brace = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (brace >= 0 && end > brace) text = text.slice(brace, end + 1);
  }
  const parsed = JSON.parse(text) as { shots?: unknown };
  const raw = Array.isArray(parsed.shots) ? parsed.shots : [];
  const shots: Shot[] = [];
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const theme = typeof o.theme === "string" ? o.theme.trim() : "";
    const coreIdea = typeof o.core_idea === "string" ? o.core_idea.trim() : "";
    if (!coreIdea) continue;
    const labels = Array.isArray(o.labels)
      ? o.labels.filter((l): l is string => typeof l === "string").map((l) => l.trim()).filter(Boolean).slice(0, 3)
      : [];
    shots.push({ theme: theme || coreIdea.slice(0, 40), coreIdea, labels });
  }
  return shots.slice(0, 8);
}

/**
 * Turn an article into a shot list (4-8 illustratable ideas) via a text LLM.
 * Uses the same key/provider as image generation.
 */
export async function makeShotList(article: string): Promise<Shot[]> {
  const text = article.trim();
  if (!text) return [];

  const provider = resolveProviderName();
  if (provider === "mock") {
    return [
      { theme: "Two breakpoints", coreIdea: "A decision splits into two clearly different paths.", labels: ["A", "B"] },
      { theme: "Sort by purpose", coreIdea: "Items are sorted into labeled bins by their goal.", labels: ["sort"] },
      { theme: "Trust bridge", coreIdea: "Evidence tiles are laid one by one to build a bridge to trust.", labels: ["trust"] },
      { theme: "Idea well", coreIdea: "Ideas are pulled up from a deep well like buckets of water.", labels: [] },
    ];
  }
  if (provider === "codex") {
    return runCodexShotList(text);
  }
  if (provider === "gemini") {
    return runGeminiShotList(text);
  }

  const apiKey = getResolvedApiKey();
  if (!apiKey) {
    throw new Error("No API key. Add an OpenAI or OpenRouter key in app preferences.");
  }
  const cfg = chatConfig(apiKey);

  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        signal: controller.signal,
        headers: cfg.headers,
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text.slice(0, 24_000) },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Shot-list API error ${res.status}: ${body}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      const shots = parseShots(content);
      if (shots.length === 0) throw new Error("The model returned no usable shots.");
      return shots;
    } finally {
      clearTimeout(timeoutId);
    }
  }, MAX_RETRIES);
}
