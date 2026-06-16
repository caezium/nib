import type {
  ImageProvider,
  GenerationRequest,
  GenerationResult,
} from "../image-provider";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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

export class CodexProvider implements ImageProvider {
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const count = Math.max(1, request.count);
    const settled = await Promise.allSettled(
      Array.from({ length: count }, () => this.generateOne(request))
    );
    const images = settled
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);

    if (images.length === 0) {
      const rejection = settled.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      const reason = rejection?.reason;
      throw reason instanceof Error
        ? reason
        : new Error(String(reason ?? "Codex returned no image."));
    }
    return { images };
  }

  private async generateOne(request: GenerationRequest): Promise<string> {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "nib-codex-"));
    try {
      let avatarPath: string | undefined;
      if (request.referenceImageB64) {
        const mime = request.referenceImageMime || "image/png";
        const ext = mime.includes("jpeg")
          ? "jpg"
          : mime.includes("webp")
            ? "webp"
            : mime.includes("gif")
              ? "gif"
              : "png";
        avatarPath = path.join(workdir, `avatar.${ext}`);
        fs.writeFileSync(avatarPath, Buffer.from(request.referenceImageB64, "base64"));
      }

      const instruction =
        request.positivePrompt +
        "\n\nGenerate exactly ONE image matching the description above, rendered as a wide 16:9 " +
        "landscape, using your built-in image generation tool. Do NOT run any shell commands and " +
        "do NOT save or copy files yourself — only generate the image.";

      const args = ["exec", "--skip-git-repo-check", "-C", workdir];
      if (avatarPath) args.push("-i", avatarPath);

      const sessionId = await runCodex(args, instruction);

      const dir = sessionId ? path.join(GEN_ROOT, sessionId) : GEN_ROOT;
      const pngs = collectPngs(fs.existsSync(dir) ? dir : GEN_ROOT);
      if (pngs.length === 0) {
        throw new Error(
          "Codex produced no image — your plan may not include image generation. Switch to OpenRouter in Settings."
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
    const child = spawn("codex", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Codex timed out generating the image."));
    }, CODEX_TIMEOUT_MS);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Could not run Codex (${e.message}). Install it and run \`codex login\`, or switch to OpenRouter in Settings.`
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
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
