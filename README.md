<div align="center">

# Nib

### Anyone can make one good AI illustration. Making the *10th* still look like **you** is the hard part.

**Nib turns an idea — or a whole article — into hand-drawn editorial illustrations for your
blog post, newsletter, or docs.** Every image is white-background, one-idea-per-image, and
stars **one character you own** (a mascot, a logo character, anything). The character
*performs* the idea — pushes it, sorts it, steers it — instead of just posing. And because
it's sent as the reference on every render, it stays on-model across the whole piece: the
2nd, 5th, and 10th image still look like the 1st.

<p>
  <img src="site/gallery/marker.jpg" width="32%" alt="marker look" />
  <img src="site/gallery/riso.jpg" width="32%" alt="riso look" />
  <img src="site/gallery/woodcut.jpg" width="32%" alt="woodcut look" />
</p>

*Same character, three looks — and it didn't drift.*

<p>
  <img src="site/concepts/momentum.jpg" width="32%" alt="building momentum — pushing a snowball uphill" />
  <img src="site/concepts/debugging.jpg" width="32%" alt="debugging — pulling one thread from a tangled ball of yarn" />
  <img src="site/concepts/focus.jpg" width="32%" alt="deep focus — working inside a glowing bubble while the world fades" />
</p>

*Three ideas in, three scenes out — `building momentum`, `debugging`, `deep focus` — the same character performing each.*

<p>
  <img src="site/concepts/app-rubberduck.jpg" width="32%" alt="rubber-duck debugging — explaining a problem to a rubber duck" />
  <img src="site/concepts/app-shipit.jpg" width="32%" alt="ship it early — driving a patched-together cart, fixing it on the move" />
  <img src="site/concepts/app-interest.jpg" width="32%" alt="compound interest — a seesaw tipping as percentage blocks stack up" />
</p>

*Real plates straight from the app — a different character, any concept, still on-model.*

**[nib.henryzh.dev](https://nib.henryzh.dev)** · Free & open source · MIT

</div>

---

## Install

Install the skill into your agent — one command, no app to download:

| Agent | Command |
| --- | --- |
| **Claude Code** | `npx skills add caezium/nib --skill nib` |
| **Codex CLI** | `codex plugin add caezium/nib` |
| **Cursor** | Add plugin: `caezium/nib` |
| **Gemini CLI** | `gemini extensions install caezium/nib` |

Then just ask:

```text
Use nib to illustrate: "small habits compound into a big result"
Use nib to make a 5-image set in riso for this article: https://paulgraham.com/ds.html
Use nib: set my avatar to ./avatar.png, then illustrate "saying no protects focus" in woodcut
```

## Two ways to pay: **free**, or pennies

- **Free — use your ChatGPT / Codex subscription.** If you're logged into the Codex CLI
  (`codex login`), Nib generates on your existing subscription. No API key, no per-image
  charge.
- **OpenRouter — a few cents an image.** Set `OPENROUTER_API_KEY` and Nib uses
  `google/gemini-3.1-flash-image-preview` (or any image model via `--model`). Exact 16:9. A
  whole blog post for under a dollar.

It picks automatically: your OpenRouter key if set, else a free **Codex** or **Gemini CLI**
lane (whichever you're signed into).

## Bring a character — or grab one

Don't have a mascot? Use a **bundled character**:

```text
Use nib with the "blip" character to illustrate "ship small, ship often"
```

The [`skills/nib/characters/`](skills/nib/characters/) library ships ready-to-use
characters (and **PRs adding your own are welcome** — a character is just a folder with a
one-paragraph spec + a reference image). Or bring your own avatar image, and optionally
**describe it in words** (`--avatar-spec`) to lock its design even tighter.

## How it works

1. **A character** — your avatar image, a bundled pack, or a written description. It's the
   reference on every render, so it stays recognizable.
2. **An idea or an article.** A URL is fetched and reduced to clean text first. For an
   article, Nib picks the **load-bearing moments** (a judgment, a flow, a before/after, a
   trap, a loop) — 4–8 of them, not one image per paragraph.
3. **A fresh, concrete metaphor** in which the character performs the idea — pushes it,
   sorts it, steers it, builds it.
4. **Generate**, reviewing each against the quality bar (white background, one idea, the
   character performing the action, short labels only).

The methodology and the looks live in one place — `skills/nib/references/` — read by
**both** the skill engine and the desktop app, so they never drift.

## The thirteen looks

`marker` · `riso` · `blueprint` · `woodcut` · `pixel` · `clay` · `gouache` · `chalk` ·
`diorama` · `enamel` · `felt` · `manila` · `phosphor` — one per piece, so a set reads as a
series. See [`references/styles.md`](skills/nib/references/styles.md).

## The engine

```sh
python3 skills/nib/scripts/generate.py \
  --idea "trust is built one piece of evidence at a time" \
  --style marker --avatar ./avatar.png --out out.png
```

Flags: `--backend auto|openrouter|codex` · `--model <id>` · `--avatar-pack <name>` ·
`--avatar-spec "<text>"` · `--register explainer` · `--transparent` · `--doctor`.
Dependency-free (`python3` 3.9+ only).

**Transparent cutouts.** Add `--transparent` to lift the art off its white ground into a
transparent PNG — for slides, stickers, or dark UI. It uses [`rembg`](https://github.com/danielgatis/rembg)
(`pip install 'rembg[cpu]'`), which isn't bundled, so the core stays dependency-free; without
it the opaque render is kept. Works standalone on any image too:
`python3 skills/nib/scripts/cutout.py <image.png>`.

## The desktop app

A TypeScript + React desktop app (macOS) — avatar onboarding, a style picker, a generation
history grid, and a zoomable lightbox. **Concept mode** draws one idea at a time; **Article
mode** turns a post — or your own draft — into a shot list you *shape*: pick which moments
to draw, add your own, ask for more, then generate them in parallel.

<p align="center">
  <img src="site/shots/concept.png" width="49%" alt="Concept mode — the studio: a control rail and a plate gallery" />
  <img src="site/shots/article.png" width="49%" alt="Article mode — a shot list you shape: select, add, or expand the ideas, then draw them in parallel" />
</p>
<p align="center">
  <img src="site/shots/avatar.png" width="49%" alt="Avatar setup — start from Hen, Mo, or Sumi, or bring your own character" />
  <img src="site/shots/settings.png" width="49%" alt="Settings — free Codex/Gemini lanes or a keyed OpenRouter model, plus a shot-list model picker" />
</p>

*Concept and Article modes · pick a starter character · free and keyed generation lanes.*

**Install (macOS, Apple Silicon):**

```sh
brew install --cask caezium/tap/nib
```

This is a self-signed pre-1.0 build, so the cask clears the Gatekeeper quarantine flag on
install. If macOS still blocks it, right-click the app and choose **Open**. Or grab the
`.dmg` straight from [Releases](https://github.com/caezium/nib/releases).

**Run from source:**

```sh
npm install && npm run gen   # first time
npm run dev                  # real generation (OpenAI or OpenRouter key)
npm run dev:mock             # placeholder images, no API calls
npm run build                # package the app
```

## Privacy & telemetry

The **desktop app** sends anonymous usage events (which mode/style, success/failure) and
crash reports — never your prompts, avatar, API keys, or images. Turn it off in
**Settings → Telemetry**. The **skill** sends no telemetry.

## Credits

Nib's house methodology is adapted from **[xiaohei (小黑)](https://github.com/helloianneo/ian-xiaohei-illustrations)**
by [helloianneo](https://github.com/helloianneo) — the hand-drawn editorial-illustration
skill that inspired this project. Nib reimplements its approach in its own words and code.

## License

MIT © 2026 Henry ([caezium](https://github.com/caezium)).
