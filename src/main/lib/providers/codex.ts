import type {
  GenerationRequest,
  NormalizedReference,
} from "../image-provider";
import { BaseImageProvider, GenerationError } from "../image-provider";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getCodexCliPath } from "../app-settings";

/**
 * Free image lane: drive the logged-in Codex CLI's built-in image generation,
 * billed to the user's ChatGPT / Codex subscription — no API key.
 *
 * Codex runs read-only (we never grant it shell access), so an idea string can't
 * inject commands. It writes the rendered PNG into ~/.codex/generated_images/<session>/;
 * we parse the session id from its output and pick up the file. The prompt is sent
 * on stdin because `-i` is variadic and would otherwise swallow a positional prompt.
 */
const GEN_ROOT = path.join(os.homedir(), ".codex", "generated_images");
const CODEX_TIMEOUT_MS = 480_000;

export class CodexProvider extends BaseImageProvider {
  protected async generateOne(
    request: GenerationRequest,
    ref: NormalizedReference | undefined
  ): Promise<string> {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "nib-codex-"));
    try {
      let avatarPath: string | undefined;
      if (ref) {
        avatarPath = path.join(workdir, `avatar.${ref.ext}`);
        fs.writeFileSync(avatarPath, Buffer.from(ref.b64, "base64"));
      }

      const instruction =
        request.positivePrompt +
        "\n\nGenerate exactly ONE image matching the description above, rendered as a wide 16:9 " +
        "landscape, using your built-in image generation tool. Do NOT run any shell commands and " +
        "do NOT save or copy files yourself — only generate the image.";

      // `--enable imagegenext` is REQUIRED for `codex exec` to actually emit the
      // generated-image artifact (Codex CLI >=0.141). Without it the text agent
      // may claim it generated an image while no PNG ever appears — the cause of
      // the "every shot is the same image" bug. (Matches illo's Codex backend.)
      const args = ["exec", "--skip-git-repo-check", "--enable", "imagegenext", "-C", workdir];
      if (avatarPath) args.push("-i", avatarPath);

      const sessionId = await runCodex(args, instruction);

      // Pick up the image ONLY from this run's own session directory. The
      // session id is mandatory: without it we cannot tell this run's output
      // apart from a sibling's. (count>1 fans out generateOne() in parallel into
      // the SAME shared GEN_ROOT, so a mtime-scan fallback could hand back a
      // concurrent run's PNG — the "every shot is byte-identical" bug. Requiring
      // the session id makes each pickup concurrency-safe.)
      if (!sessionId) {
        throw new GenerationError(
          "declined",
          "Codex finished but didn't report a session id, so its image can't be located. Update the Codex CLI, or switch to OpenRouter in Settings."
        );
      }
      const sessionDir = path.join(GEN_ROOT, sessionId);
      const pngs = fs.existsSync(sessionDir) ? collectPngs(sessionDir) : [];
      if (pngs.length === 0) {
        throw new GenerationError(
          "not_entitled",
          "Codex produced no image — your ChatGPT / Codex plan isn't currently entitled to image generation (the API returns HTTP 403). Add an OpenRouter key and Nib falls back automatically, or switch to OpenRouter in Settings."
        );
      }
      const newest = pngs.sort(
        (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
      )[0];
      return fs.readFileSync(newest).toString("base64");
    } finally {
      fs.rmSync(workdir, { recursive: true, force: true });
    }
  }
}

/** Run `codex exec …` with the prompt on stdin; resolve the session id from stdout. */
function runCodex(args: string[], promptStdin: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const codex = getCodexCliPath();
    if (!codex) {
      reject(
        new GenerationError(
          "cli_missing",
          "Could not find the Codex CLI. Install it and run `codex login`, or switch to OpenRouter in Settings."
        )
      );
      return;
    }
    const child = spawn(codex, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new GenerationError("timeout", "Codex timed out generating the image.", true));
    }, CODEX_TIMEOUT_MS);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        new GenerationError(
          "cli_missing",
          `Could not run Codex (${e.message}). Install it and run \`codex login\`, or switch to OpenRouter in Settings.`
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        // A 403 means the logged-in plan isn't entitled to image generation —
        // distinct from a transient failure, and the trigger for the automatic
        // OpenRouter fallback (see provider-resolver). `codex exec` doesn't
        // always exit non-zero on it, so we also detect the no-image case above.
        if (/\b403\b|forbidden|not entitled|no access to|usage policy/i.test(err)) {
          reject(
            new GenerationError(
              "not_entitled",
              "Codex returned HTTP 403 — your ChatGPT / Codex plan isn't currently entitled to image generation. Add an OpenRouter key and Nib falls back automatically, or switch to OpenRouter in Settings."
            )
          );
          return;
        }
        reject(
          new GenerationError(
            "declined",
            `Codex failed (exit ${code}). Run \`codex login\`, or switch to OpenRouter. ${err.slice(0, 300)}`
          )
        );
        return;
      }
      const m = out.match(/session id:\s*([0-9a-fA-F-]+)/);
      resolve(m ? m[1] : "");
    });

    child.stdin.write(promptStdin);
    child.stdin.end();
  });
}

function collectPngs(dir: string): string[] {
  const found: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.toLowerCase().endsWith(".png")) found.push(p);
    }
  };
  walk(dir);
  return found;
}
