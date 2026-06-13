---
name: sidekick
description: >-
  Turns an idea or an article into original white-background, hand-drawn
  editorial illustrations starring a recurring avatar the user owns — one
  caught scene per idea, in one of several print looks. Use when the user asks
  to illustrate a post/article/concept with a consistent character, or invokes
  "sidekick". Not for generic draw/make-an-image requests.
version: 0.1.0
argument-hint: "[idea or article path/URL] | set avatar <image> | style <name>"
license: MIT
metadata:
  category: creative
  requires:
    bins: [python3]
    env: [OPENROUTER_API_KEY]
---

# Sidekick

Make original editorial illustrations for written content. **One image explains
one idea.** A **recurring avatar** — supplied once by the user — is the subject
of every scene and *performs* the idea (pushes, sorts, steers, builds, holds);
it is never decoration. The methodology is the constant; the **avatar** and the
**look** are the parameters.

This is a configurable house style, not a generic image generator. It is
intentionally not a photo, not a logo, not a corporate infographic, not a UI
mockup.

## Setup (once)

1. The user provides an **avatar image** (a mascot, logo character, any
   character). Save its path; it is the reference for every generation.
2. An **`OPENROUTER_API_KEY`** must be in the environment (an `sk-or-…` key).

## Workflow

1. **Read the input.** A single idea → one illustration. An article/post →
   first pick the **load-bearing moments** (a judgment, a flow, a before/after,
   a trap, a loop), 4–8 of them. Not one image per paragraph — the ones that
   matter.
2. **Pick a look** for the piece (see `references/styles.md`): marker, riso,
   blueprint, woodcut, pixel, clay, gouache. One look per piece.
3. For each idea, **invent a fresh, concrete physical metaphor** in which the
   avatar performs the idea (see `references/methodology.md`).
4. **Generate** by calling the engine once per image:

   ```sh
   python3 scripts/generate.py \
     --idea "trust is built one piece of evidence at a time" \
     --style marker \
     --avatar /path/to/avatar.png \
     --out ./out/trust.png
   ```

   It builds the full prompt (methodology + look + idea), sends the avatar as
   the reference for character consistency, and writes a 16:9 PNG.
5. **Review** against `references/quality-bar.md` (white background, one idea,
   avatar performing the action, short labels only, not a slide). Regenerate
   any that miss.
6. Report each saved path.

## Notes

- Keep text in the image short; the model can misspell long labels.
- The avatar is the reference on every call — that is what keeps the character
  consistent across a whole article.
- Cost: roughly a few cents per image via OpenRouter
  (`google/gemini-2.5-flash-image`), so a full post is well under a dollar.
