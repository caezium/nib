import type {
  ImageProvider,
  GenerationRequest,
  GenerationResult,
} from "../image-provider";
import { GenerationError } from "../image-provider";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getGeminiCliPath } from "../app-settings";

const GEMINI_TIMEOUT_MS = 480_000;
const OUTPUT_NAME = "nib-output.png";

/**
 * Gemini CLI lane.
 *
 * Gemini CLI is a no-key lane when the user is signed in with Google. Unlike
 * Codex, image output depends on the user's Gemini CLI media tooling/extensions,
 * so we ask it to save a PNG in a temp workspace and then verify the file.
 */
export class GeminiProvider implements ImageProvider {
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
        : new Error(String(reason ?? "Gemini returned no image."));
    }
    return { images };
  }

  private async generateOne(request: GenerationRequest): Promise<string> {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "nib-gemini-"));
    try {
      let avatarPath = "";
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

      const outputPath = path.join(workdir, OUTPUT_NAME);
      const instruction = [
        request.positivePrompt,
        "",
        "Generate exactly ONE original illustration matching the description above.",
        "Use any Gemini CLI image/media generation tool available in this environment.",
        "Save the final image as a PNG file named `nib-output.png` in the current directory.",
        "The image must be a wide 16:9 landscape illustration.",
        avatarPath
          ? `Reference character — match its identity, colours, and proportions exactly: @${avatarPath}`
          : "",
        "Do not create code. Do not include markdown in the answer.",
        "If image generation tools are unavailable, say so plainly.",
      ]
        .filter(Boolean)
        .join("\n");

      await runGemini(workdir, instruction);

      const exact = fs.existsSync(outputPath) ? outputPath : "";
      // Exclude the avatar we wrote into this workdir — otherwise a run that
      // produced no output would "succeed" by handing the reference straight back.
      const pngs = exact ? [exact] : collectPngs(workdir, avatarPath);
      if (pngs.length === 0) {
        throw new GenerationError(
          "declined",
          "Gemini CLI ran but produced no PNG. Sign in with `gemini` and configure Gemini image/media generation tools, or use Codex/OpenRouter."
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

function runGemini(workdir: string, prompt: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const gemini = getGeminiCliPath();
    if (!gemini) {
      reject(
        new GenerationError(
          "cli_missing",
          "Could not find the Gemini CLI. Install it and run `gemini` to sign in, or use Codex/OpenRouter."
        )
      );
      return;
    }

    // Non-interactive: pass the whole prompt as the -p argument. (An empty -p
    // plus a stdin prompt was unreliable.) `@<path>` references in the prompt
    // tell the Gemini CLI to load that file — that's how the avatar reaches it.
    const child = spawn(
      gemini,
      ["--approval-mode", "auto_edit", "--output-format", "text", "-p", prompt],
      {
        cwd: workdir,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NO_COLOR: "1" },
      }
    );
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Gemini timed out generating the image."));
    }, GEMINI_TIMEOUT_MS);

    child.stdout.on("data", () => {});
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Could not run Gemini (${e.message}). Install it and run \`gemini\` to sign in, or use Codex/OpenRouter.`
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `Gemini failed (exit ${code}). Run \`gemini\` to sign in, configure image generation, or use Codex/OpenRouter. ${err.slice(0, 300)}`
          )
        );
        return;
      }
      resolve();
    });
  });
}

function collectPngs(dir: string, exclude?: string): string[] {
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
      else if (e.name.toLowerCase().endsWith(".png") && p !== exclude) found.push(p);
    }
  };
  walk(dir);
  return found;
}
