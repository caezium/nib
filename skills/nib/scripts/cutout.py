#!/usr/bin/env python3
"""Lift a Nib render off its white ground → transparent PNG.

Nib renders on a solid white background. This cuts that ground away so the
character + scene drop cleanly onto anything — slides, stickers, dark UI, a
print layout.

Transparency is OPTIONAL. It needs `rembg` (U^2-Net salient-object matting),
which Nib deliberately does NOT bundle — the core engine stays dependency-free
(`python3` only). Install it once:

  # macOS: system pip is PEP-668 blocked, so use a venv
  python3 -m venv .venv && .venv/bin/pip install 'rembg[cpu]'
  .venv/bin/python skills/nib/scripts/cutout.py render.png

  # elsewhere
  pip install 'rembg[cpu]'
  python3 skills/nib/scripts/cutout.py render.png [out.png]

The first run downloads the ~175 MB U^2-Net model to ~/.u2net/.

Used directly (above), or via `generate.py --transparent`, which calls
`remove_bg` on the freshly rendered PNG.
"""
# Defer annotation evaluation so `str | None` works on Python 3.9 (stock macOS).
from __future__ import annotations

import sys


class RembgMissing(RuntimeError):
    """rembg isn't installed — transparency is unavailable until it is."""


def remove_bg(src: str, dst: str | None = None) -> str:
    """Write a transparent-background copy of `src` to `dst` (default: in place).

    Raises RembgMissing if rembg can't be imported, so callers can keep the
    opaque render instead of losing it.
    """
    try:
        from rembg import remove  # type: ignore
    except Exception as exc:  # ImportError, or a broken onnxruntime install
        raise RembgMissing(
            "transparent output needs rembg (not bundled — Nib's core stays dependency-free).\n"
            "  install:  pip install 'rembg[cpu]'   "
            "(macOS: use a venv — system pip is PEP-668 blocked)"
        ) from exc
    dst = dst or src
    with open(src, "rb") as f:
        data = remove(f.read())
    with open(dst, "wb") as f:
        f.write(data)
    return dst


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: cutout.py <image.png> [out.png]")
    try:
        print(remove_bg(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
    except RembgMissing as e:
        sys.exit(f"error: {e}")


if __name__ == "__main__":
    main()
