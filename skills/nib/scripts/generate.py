#!/usr/bin/env python3
"""Nib illustration engine.

Generates one white-background 16:9 editorial illustration in which a recurring
avatar performs the given idea, in a chosen look. No third-party dependencies.

Usage:
  OPENROUTER_API_KEY=sk-or-... python3 generate.py \
      --idea "trust is built one piece of evidence at a time" \
      --style marker --avatar avatar.png --out out.png
"""
import argparse
import base64
import binascii
import json
import os
import sys
import urllib.error
import urllib.request

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash-image")

# The methodology and look library are the single canonical source shared with
# the desktop app — see ../references/style-data.json (also read by
# src/main/lib/styles.ts and prompt-builder.ts). Editing that JSON updates both
# the skill and the app, so they can never drift.
_DATA_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "references", "style-data.json"
)
with open(_DATA_PATH, encoding="utf-8") as _f:
    _STYLE_DATA = json.load(_f)

BASE_METHODOLOGY: str = _STYLE_DATA["baseMethodology"]
STYLES: dict[str, str] = {look["id"]: look["look"] for look in _STYLE_DATA["looks"]}
DEFAULT_STYLE: str = _STYLE_DATA["defaultStyleId"]


def build_prompt(idea: str, style: str) -> str:
    look = STYLES.get(style, STYLES[DEFAULT_STYLE])
    return f"{BASE_METHODOLOGY}\n\nLook: {look}\n\nConcept to illustrate: {idea.strip()}"


def avatar_data_url(path: str) -> str:
    with open(path, "rb") as f:
        b = f.read()
    ext = os.path.splitext(path)[1].lower()
    mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"}.get(ext, "image/png")
    return f"data:{mime};base64,{base64.b64encode(b).decode()}"


def extract_image_url(msg: dict) -> str | None:
    """Find the generated image URL in a chat message.

    Images normally arrive in ``message.images[].image_url.url``, but some
    models/providers put them in ``message.content`` instead, so scan both
    (mirrors the desktop app's OpenRouter provider).
    """
    for part in msg.get("images") or []:
        url = (part.get("image_url") or {}).get("url")
        if url:
            return url
    content = msg.get("content")
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and part.get("type") == "image_url":
                url = (part.get("image_url") or {}).get("url")
                if url:
                    return url
    return None


def image_bytes_from_url(url: str) -> bytes:
    """Decode an image reference into raw bytes.

    The reference may be a ``data:`` URL, a hosted ``http(s)`` URL, or a bare
    base64 payload — handle all three rather than assuming a data URL.
    """
    if url.startswith("data:"):
        b64 = url.split(",", 1)[1] if "," in url else ""
        return base64.b64decode(b64)
    if url.startswith(("http://", "https://")):
        with urllib.request.urlopen(url, timeout=120) as resp:
            return resp.read()
    # Fall back to treating the whole string as base64.
    return base64.b64decode(url)


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
            "HTTP-Referer": "https://github.com/caezium/nib",
            "X-Title": "Nib",
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
    url = extract_image_url(msg)
    if not url:
        sys.exit("OpenRouter returned no image. Ensure the model supports image output.")

    try:
        image_bytes = image_bytes_from_url(url)
    except urllib.error.URLError as e:
        sys.exit(f"network error fetching the generated image: {e.reason}")
    except (binascii.Error, ValueError) as e:
        sys.exit(f"could not decode the returned image: {e}")
    if not image_bytes:
        sys.exit("OpenRouter returned an empty image.")

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "wb") as f:
        f.write(image_bytes)
    return out


def main() -> None:
    p = argparse.ArgumentParser(description="Generate a Nib illustration.")
    p.add_argument("--idea", required=True, help="the idea to illustrate (one sentence)")
    p.add_argument("--style", default=DEFAULT_STYLE, choices=list(STYLES), help="look")
    p.add_argument("--avatar", help="path to the avatar/reference image")
    p.add_argument("--out", required=True, help="output PNG path")
    args = p.parse_args()
    print(generate(args.idea, args.style, args.avatar, args.out))


if __name__ == "__main__":
    main()
