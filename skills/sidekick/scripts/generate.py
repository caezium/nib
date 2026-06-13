#!/usr/bin/env python3
"""Sidekick illustration engine.

Generates one white-background 16:9 editorial illustration in which a recurring
avatar performs the given idea, in a chosen look. No third-party dependencies.

Usage:
  OPENROUTER_API_KEY=sk-or-... python3 generate.py \
      --idea "trust is built one piece of evidence at a time" \
      --style marker --avatar avatar.png --out out.png
"""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash-image")

# The house methodology — constant across every look.
BASE_METHODOLOGY = (
    "One standalone 16:9 horizontal illustration on a pure white background. "
    "Express ONE single idea with generous empty white space. "
    "The recurring character shown in the reference image is the subject and MUST "
    "physically perform the idea (pushing, sorting, steering, building, holding, "
    "fishing, patching, balancing, arranging) — never decoration; keep it clearly "
    "recognizable and consistent in shape, color, and proportions. "
    "Invent a fresh, concrete physical metaphor for this specific idea; do not "
    "default to bridge / funnel / roadmap. Use simple low-tech tactile props "
    "(boxes, tubes, buckets, pulleys, boards, levers, carts, wires). "
    "Keep the main subject around 40-60% of the canvas. "
    "At most a few very short handwritten labels (1-4 words each), only when useful; "
    "no title; never write the structure name on the image. "
    "It is not a photo, not a logo, not a corporate infographic, not a formal "
    "flowchart, and not a UI mockup."
)

# Look library — same definitions as the desktop app.
STYLES = {
    "marker": "Loose hand-drawn marker look: chunky, slightly wobbly dark-brown ink outlines, lightly imperfect edges, flat fills, a restrained warm palette with small red / orange / blue / mint accents. No gradients, no drop shadows, no texture.",
    "riso": "Risograph print look: two or three flat spot colors, visible halftone grain, a slight ink-layer misregistration offset, soft rounded shapes, and a subtle paper grain over the white ground.",
    "blueprint": "Technical blueprint look: thin, even blue line-work and annotations on white, faint construction lines, small measurement ticks and labelled callouts, no shading, monochrome blue with at most one sparing accent color.",
    "woodcut": "Woodcut / linocut look: bold high-contrast carved black lines, chunky silhouettes, hatching and stipple for shade, one or two flat spot colors, and a hand-printed roughness on white.",
    "pixel": "Chunky pixel-art look: visible square pixels, a limited palette, blocky silhouettes with a clean dark outline, light dithering for shade, on a crisp white ground.",
    "clay": "Soft clay / plasticine look: rounded matte 3D forms, gentle even lighting, a faint fingerprinted texture, a warm muted palette on white, and no harsh shadows.",
    "gouache": "Gouache painting look: flat opaque brush shapes with soft visible brush edges, a slightly chalky matte color, a warm limited palette, and minimal shading on white.",
}
DEFAULT_STYLE = "marker"


def build_prompt(idea: str, style: str) -> str:
    look = STYLES.get(style, STYLES[DEFAULT_STYLE])
    return f"{BASE_METHODOLOGY}\n\nLook: {look}\n\nConcept to illustrate: {idea.strip()}"


def avatar_data_url(path: str) -> str:
    with open(path, "rb") as f:
        b = f.read()
    ext = os.path.splitext(path)[1].lower()
    mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"}.get(ext, "image/png")
    return f"data:{mime};base64,{base64.b64encode(b).decode()}"


def generate(idea: str, style: str, avatar: str | None, out: str) -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        sys.exit("error: set OPENROUTER_API_KEY (an sk-or-… key) in the environment.")

    content = []
    if avatar:
        content.append({"type": "image_url", "image_url": {"url": avatar_data_url(avatar)}})
    content.append({"type": "text", "text": build_prompt(idea, style)})

    body = {
        "model": MODEL,
        "modalities": ["image", "text"],
        "image_config": {"aspect_ratio": "16:9"},
        "messages": [{"role": "user", "content": content}],
    }
    req = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            "HTTP-Referer": "https://github.com/caezium/sidekick-illustrator",
            "X-Title": "Sidekick",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"OpenRouter API error {e.code}: {e.read().decode()[:600]}")
    except urllib.error.URLError as e:
        sys.exit(f"network error: {e.reason}")

    msg = (data.get("choices") or [{}])[0].get("message") or {}
    url = None
    for part in msg.get("images") or []:
        url = (part.get("image_url") or {}).get("url")
        if url:
            break
    if not url:
        sys.exit("OpenRouter returned no image. Ensure the model supports image output.")

    b64 = url.split(",", 1)[1] if "," in url else url
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "wb") as f:
        f.write(base64.b64decode(b64))
    return out


def main() -> None:
    p = argparse.ArgumentParser(description="Generate a Sidekick illustration.")
    p.add_argument("--idea", required=True, help="the idea to illustrate (one sentence)")
    p.add_argument("--style", default=DEFAULT_STYLE, choices=list(STYLES), help="look")
    p.add_argument("--avatar", help="path to the avatar/reference image")
    p.add_argument("--out", required=True, help="output PNG path")
    args = p.parse_args()
    print(generate(args.idea, args.style, args.avatar, args.out))


if __name__ == "__main__":
    main()
