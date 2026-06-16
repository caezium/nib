<div align="center">

# Nib

### An illustrator that never breaks character.

Nib turns an idea — or a whole article — into original, white-background, hand-drawn
**editorial illustrations** starring an avatar **you** own. One image, one idea.
The character you supply *performs* the idea; it is never just decoration. Because
your avatar is sent as the reference on every generation, it stays recognizable
across an entire piece.

**[nib.henryzh.dev](https://nib.henryzh.dev)** · Free & open source · MIT

</div>

---

Nib ships two ways from one engine:

- **An agent skill** — install it into Claude Code, Codex, Cursor, or Gemini CLI and
  illustrate straight from your editor. No app to download.
- **A desktop app** (macOS) — avatar onboarding, a style picker, generation history,
  and a zoomable lightbox.

Image generation runs on **your own** OpenRouter key (`google/gemini-2.5-flash-image`)
— a few cents per image, no subscription, no markup.

## Install the skill

| Agent | Command |
| --- | --- |
| **Claude Code** | `npx skills add caezium/nib --skill nib` |
| **Codex CLI** | `codex plugin add caezium/nib` |
| **Cursor** | Add plugin: `caezium/nib` |
| **Gemini CLI** | `gemini extensions install caezium/nib` |

Requires `python3` and an `OPENROUTER_API_KEY` in your environment.

## Use it from your agent

```text
Use nib to illustrate: "small habits compound into a big result"
Use nib to make illustrations for this article: https://jamesclear.com/feedback-loops
Use nib: set my avatar to ./avatar.png, then illustrate
  "saying no protects the few things that matter" in the woodcut style
Use nib to turn this post into a 5-image set in riso: <paste a URL or text>
```

Hand Nib a single idea and it makes one illustration. Hand it an article or a URL and
it picks the **load-bearing moments** (a judgment, a flow, a before/after, a trap, a
loop) — 4–8 of them, not one image per paragraph — and illustrates each in a single,
consistent look.

## The seven looks

One look per piece. Pick by content and mood:

| Look | Feel |
| --- | --- |
| `marker` | Chunky hand-drawn marker outlines, warm restrained palette |
| `riso` | Risograph print: grainy, offset, 2–3 spot colors |
| `blueprint` | Technical blueprint lines on white, annotated |
| `woodcut` | Bold woodcut / linocut, high-contrast carved strokes |
| `pixel` | Clean pixel-art, limited palette |
| `clay` | Soft clay / 3D-render look, rounded forms |
| `gouache` | Painterly gouache, visible brushwork |

## How it works

1. **Add your avatar** (once) — one image of your character. It's fed as the reference
   for every generation, so the character stays recognizable.
2. **Give it an idea or an article.** A URL is fetched and reduced to clean article
   text first.
3. **Nib invents a fresh, concrete physical metaphor** in which the avatar *performs*
   the idea — pushes, sorts, steers, builds, holds.
4. **Generate** — the avatar rides along as the reference on every call, which is what
   keeps the character consistent across a whole set.
5. **Review** against the quality bar (white background, one idea, avatar performing the
   action, short labels only, not a slide) and regenerate any that miss.

The methodology and the seven looks live in one place — `skills/nib/references/` —
and are read by **both** the skill engine and the desktop app, so they never drift.

## The desktop app

A TypeScript + React desktop app.

```sh
npm install            # first time
npm run gen            # generate IPC bindings from the proto (first time)
npm run dev            # real generation (needs an OpenAI or OpenRouter key)
npm run dev:mock       # placeholder images, no API calls
npm run build          # package a desktop app
```

**Providers** (auto-selected from the saved key; override with
`ICON_PROVIDER=mock|openai|openrouter`):

- **OpenRouter** — `google/gemini-2.5-flash-image` (override with `OPENROUTER_MODEL`),
  `aspect_ratio: 16:9`. The default.
- **OpenAI** — `gpt-image-1`, landscape `1536×1024`, reference via `/images/edits`.

## Privacy & telemetry

The **desktop app** sends anonymous usage events (which mode and style you use, and
whether a generation succeeded or failed) and crash reports, so bugs get fixed and the
roadmap reflects real use. It **never** sends your prompts, your avatar, your API keys,
or any generated image. You can turn it off anytime under **Settings → Telemetry**.
The **agent skill** sends no telemetry at all.

## Credits

Nib's house methodology is adapted from **[xiaohei (小黑)](https://github.com/helloianneo/ian-xiaohei-illustrations)**
by [helloianneo](https://github.com/helloianneo) — the hand-drawn editorial-illustration
skill that inspired this project. Nib reimplements its approach in its own words and code.

## License

MIT © 2026 Henry ([caezium](https://github.com/caezium)).
