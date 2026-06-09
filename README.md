# Sidekick

Turn any idea into a **white-background, hand-drawn 16:9 illustration starring your own avatar.**

Sidekick is a small desktop app: bring your own character (a mascot, a logo
character, any avatar), type a concept, and get a clean explanatory illustration
in a consistent house style — your character *doing* the core action, not just
decorating the scene.

It's a [MōBrowser](https://teamdev.com/mobrowser/) (TypeScript + React) desktop
app, repurposed from an app-icon generator.

## How it works

1. **Add your avatar** (first run) — one image of your character. It's fed as the
   reference for every generation, so the character stays recognizable.
2. **Add an API key** — OpenAI (`sk-…`) **or** OpenRouter (`sk-or-…`). The
   provider is chosen automatically from the key shape.
3. **Describe an idea** — e.g. *"trust is built one piece of evidence at a time."*
   You get three 16:9 variants; pick one, refine it, and **save a PNG**.

Optionally attach a one-off reference image (button or ⌘V paste) for a single
generation.

## Style

White background, generous whitespace, one idea per image, chunky hand-drawn
outlines, restrained warm palette with small red/orange/blue/mint accents, and a
few short handwritten labels at most. The character always performs the central
action. The full "house style" lives in `src/main/lib/prompt-builder.ts`.

## Run it

```sh
npm run gen        # generate IPC bindings from the proto (first time)
npm run dev        # real generation (needs an OpenAI or OpenRouter key)
npm run dev:mock   # placeholder images, no API calls
npm run build      # package a desktop app
```

## Providers

- **OpenAI** — `gpt-image-1`, landscape `1536×1024`, reference via `/images/edits`.
- **OpenRouter** — `google/gemini-2.5-flash-image` (override with `OPENROUTER_MODEL`),
  `aspect_ratio: 16:9`, via chat-completions image output.

The active provider is inferred from the saved key; `ICON_PROVIDER=mock|openai|openrouter`
overrides it.

## Status

MVP. Single concept → illustration works end to end. Next: paste an article →
auto shot-list → batch generate.
