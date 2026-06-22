import { useState } from "react"
import {
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Route,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react"
import { ipc } from "@/gen/ipc"
import { cn } from "@/lib/utils"
import {
  type ImageSettings,
  type ApiKeyKind,
  keyKind,
  useTelemetryOptOut,
  useImageSettings,
  useApiKey,
} from "./settings-modal.hooks"

/** Accurate Codex hint — distinguishes "not installed" from "installed but
 *  logged out" from "installed but too old for image artifacts (needs 0.141+)". */
function codexHint(img: ImageSettings | null): string {
  switch (img?.codexStatus) {
    case "ok":
      return "Signed-in app subscription"
    case "logged-out":
      return "Found — run `codex login`"
    case "needs-update":
      return "Found — update Codex (needs 0.141+)"
    case "no-cli":
      return "Codex CLI not found"
    default:
      return img?.codexAvailable ? "Signed-in app subscription" : "Codex CLI not found"
  }
}

type ModelDetails = {
  name: string
  note: string
}

const OPENAI_API_KEYS_HELP_URL = "https://platform.openai.com/api-keys"
const OPENROUTER_API_KEYS_HELP_URL = "https://openrouter.ai/keys"

const MODEL_DETAILS: Record<string, ModelDetails> = {
  "google/gemini-3.1-flash-image-preview": {
    name: "Nano Banana 2",
    note: "Gemini 3.1 Flash Image Preview",
  },
  "google/gemini-3-pro-image-preview": {
    name: "Nano Banana Pro",
    note: "Gemini 3 Pro Image Preview",
  },
  "google/gemini-2.5-flash-image": {
    name: "Nano Banana",
    note: "Gemini 2.5 Flash Image",
  },
  "openai/gpt-5.4-image-2": {
    name: "GPT-5.4 Image 2",
    note: "OpenAI on OpenRouter",
  },
  "openai/gpt-5-image-mini": {
    name: "GPT-5 Image Mini",
    note: "OpenAI on OpenRouter",
  },
  "openai/gpt-5-image": {
    name: "GPT-5 Image",
    note: "OpenAI on OpenRouter",
  },
  "black-forest-labs/flux.2-pro": {
    name: "FLUX.2 Pro",
    note: "BFL image generation",
  },
  "black-forest-labs/flux.2-flex": {
    name: "FLUX.2 Flex",
    note: "BFL image generation",
  },
  "bytedance-seed/seedream-4.5": {
    name: "Seedream 4.5",
    note: "ByteDance Seed",
  },
  "x-ai/grok-imagine-image-quality": {
    name: "Grok Imagine",
    note: "xAI image quality",
  },
  // Text models (shot-list / article planning).
  "openai/gpt-5.4-mini": { name: "GPT-5.4 Mini", note: "OpenAI · fast & cheap · ~$0.75/M" },
  "openai/gpt-5.4-nano": { name: "GPT-5.4 Nano", note: "OpenAI · cheapest · ~$0.20/M" },
  "google/gemini-3.1-flash-lite": { name: "Gemini 3.1 Flash Lite", note: "Google · cheap · ~$0.25/M" },
  "google/gemini-3.5-flash": { name: "Gemini 3.5 Flash", note: "Google · capable · ~$1.50/M" },
  "deepseek/deepseek-v4-flash": { name: "DeepSeek V4 Flash", note: "DeepSeek · ultra-cheap · ~$0.09/M" },
  "qwen/qwen3.6-flash": { name: "Qwen3.6 Flash", note: "Qwen · cheap · ~$0.19/M" },
  "x-ai/grok-4.3": { name: "Grok 4.3", note: "xAI · ~$1.25/M" },
  "anthropic/claude-opus-4.8": { name: "Claude Opus 4.8", note: "Anthropic · top quality · ~$5/M" },
}

function keyKindLabel(kind: ApiKeyKind): string {
  if (kind === "openrouter") return "OpenRouter key"
  if (kind === "openai") return "OpenAI key"
  return "No key saved"
}

function modelDetails(id: string): ModelDetails {
  return MODEL_DETAILS[id] ?? { name: id || "Default model", note: "Custom OpenRouter model id" }
}

function openExternal(url: string) {
  ipc.app.OpenExternalUrl({ url }).catch(() => {})
}

function routeSummary(img: ImageSettings | null, apiKeyDraft: string): string {
  if (!img) return "Loading route..."
  const kind = keyKind(apiKeyDraft)
  const preferred = img.freeBackendPreference
  const primary = preferred === "gemini" ? "Gemini CLI" : "Codex"
  const secondary = preferred === "gemini" ? "Codex" : "Gemini CLI"
  const primaryAvailable = preferred === "gemini" ? img.geminiAvailable : img.codexAvailable
  const secondaryAvailable = preferred === "gemini" ? img.codexAvailable : img.geminiAvailable
  if (img.backend === "codex") return "Codex uses your signed-in Codex app subscription."
  if (img.backend === "gemini") return "Gemini uses your signed-in Gemini CLI."
  if (img.backend === "openai") return "OpenAI API uses gpt-image-1, high quality, 1536x1024."
  if (img.backend === "openrouter") return `OpenRouter uses ${img.model || "the default model"}.`
  if (primaryAvailable && secondaryAvailable) {
    return `Auto will try ${primary}, then ${secondary}, then API keys.`
  }
  if (primaryAvailable) return `Auto will use ${primary}; ${secondary} is unavailable.`
  if (secondaryAvailable) return `Auto will use ${secondary}; ${primary} is unavailable.`
  if (kind === "openrouter") return `Auto will use OpenRouter with ${img.model || "the default model"}.`
  if (kind === "openai") return "Auto will use OpenAI API with gpt-image-1."
  return "Auto needs an OpenAI or OpenRouter API key."
}

function keyModelSummary(img: ImageSettings | null, apiKeyDraft: string): string {
  const kind = keyKind(apiKeyDraft)
  if (kind === "openrouter") {
    const model = img?.model || "google/gemini-3.1-flash-image-preview"
    const details = modelDetails(model)
    return `This OpenRouter key uses ${details.name} (${model}).`
  }
  if (kind === "openai") {
    return "This OpenAI key uses gpt-image-1 at high quality."
  }
  return "Save an OpenAI or OpenRouter key to see its model."
}

/**
 * Settings: the image-generation backend + model, API key, and telemetry opt-out.
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const telemetry = useTelemetryOptOut()
  const image = useImageSettings()
  const key = useApiKey(image.setHasKey)

  // Aliases so the JSX below reads unchanged.
  const img = image.img
  const saveImg = image.save
  const optOut = telemetry.optOut
  const telemetryOn = telemetry.on
  const toggleTelemetry = telemetry.toggle
  const apiKey = key.apiKey
  const apiKeyDraft = key.draft
  const kind = key.kind
  const canSaveKey = key.canSave
  const keyBusy = key.busy
  const keyError = key.error
  const keySaved = key.saved
  const keyVisible = key.visible
  const saveKey = key.save
  const clearKey = key.clear

  const routeWarning =
    img?.backend === "openrouter" && kind !== "openrouter"
      ? "OpenRouter needs an sk-or key."
      : img?.backend === "openai" && kind !== "openai"
        ? "OpenAI API needs an OpenAI key."
        : null

  const backends = [
    {
      id: "auto",
      label: "Auto",
      hint:
        img?.freeBackendPreference === "gemini"
          ? "Gemini, Codex, then key"
          : "Codex, Gemini, then key",
      disabled: false,
    },
    {
      id: "codex",
      label: "Codex",
      hint: codexHint(img),
      disabled: img != null && !img.codexAvailable,
    },
    {
      id: "gemini",
      label: "Gemini",
      hint: img?.geminiAvailable ? "Signed-in Gemini CLI" : "Gemini CLI not found",
      disabled: img != null && !img.geminiAvailable,
    },
    { id: "openrouter", label: "OpenRouter", hint: "sk-or key + model picker", disabled: false },
    { id: "openai", label: "OpenAI", hint: "sk key + gpt-image-1", disabled: false },
  ]

  const showOpenRouterModel =
    img != null &&
    (img.backend === "openrouter" ||
      (img.backend === "auto" && keyKind(apiKeyDraft) === "openrouter"))

  return (
    <div
      className="non-draggable fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div
        className="relative max-h-[calc(100vh-32px)] w-[560px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <h2 id="settings-title" className="font-medium text-foreground">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] hover:bg-foreground/5 hover:text-foreground active:scale-[0.96]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              Image generation
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-lg bg-background/70 px-3 py-2 text-xs text-muted-foreground ring-1 ring-border">
              <Route className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{routeSummary(img, apiKeyDraft)}</span>
            </div>

            <div className="mt-3 text-xs font-medium text-muted-foreground">Backend</div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {backends.map((b) => {
                const active = (img?.backend || "auto") === b.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={img == null || b.disabled}
                    onClick={() => img && saveImg({ ...img, backend: b.id })}
                    className={cn(
                      "min-h-14 rounded-lg border px-2.5 py-2 text-left transition-[background-color,border-color,box-shadow,transform]",
                      "disabled:cursor-not-allowed disabled:opacity-45",
                      active
                        ? "border-primary bg-primary/10 shadow-[0_1px_2px_-1px_rgba(28,26,23,0.16)]"
                        : "border-border bg-background/50 hover:border-foreground/30 hover:bg-background/80 active:scale-[0.99]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">{b.label}</span>
                      {active && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                      {b.hint}
                    </div>
                  </button>
                )
              })}
            </div>

            {img && (
              <div className="mt-3 rounded-lg bg-background/60 p-2 ring-1 ring-border">
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <div className="text-xs font-medium text-muted-foreground">Auto order</div>
                  <div className="text-[10px] text-muted-foreground/70">Used when Backend is Auto</div>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {(["codex", "gemini"] as const).map((value) => {
                    const active = img.freeBackendPreference === value
                    const available = value === "codex" ? img.codexAvailable : img.geminiAvailable
                    const label = value === "codex" ? "Codex first" : "Gemini first"
                    const fallback = value === "codex" ? "then Gemini" : "then Codex"
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => saveImg({ ...img, freeBackendPreference: value })}
                        className={cn(
                          "min-h-11 rounded-lg border px-2.5 py-1.5 text-left transition-[background-color,border-color,box-shadow,transform]",
                          active
                            ? "border-primary bg-primary/10 shadow-[0_1px_2px_-1px_rgba(28,26,23,0.16)]"
                            : "border-border bg-secondary/20 hover:border-foreground/30 hover:bg-background/80 active:scale-[0.99]"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-foreground">{label}</span>
                          {active && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                        <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                          {available ? fallback : "skips if unavailable"}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {showOpenRouterModel && img && (
              <ModelPicker
                value={img.model}
                suggestions={img.suggestedModels}
                onChange={(model) => saveImg({ ...img, model })}
              />
            )}

            {showOpenRouterModel && img && (
              <>
                <ModelPicker
                  label="Shot-list model · drafts an article's ideas"
                  placeholder="openai/gpt-5.4-mini"
                  value={img.textModel}
                  suggestions={img.suggestedTextModels}
                  onChange={(textModel) => saveImg({ ...img, textModel })}
                />
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  A cheap text model is plenty. On Codex/Gemini lanes the CLI plans the article instead.
                </p>
              </>
            )}
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              API key
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  type={keyVisible ? "text" : "password"}
                  value={apiKeyDraft}
                  onChange={(e) => key.setDraft(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-... or sk-or-..."
                  className="h-9 w-full rounded-lg border border-border bg-background/70 px-3 pr-9 font-mono text-xs text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-foreground/40 focus:ring-2 focus:ring-foreground/[0.06]"
                />
                <button
                  type="button"
                  onClick={() => key.toggleVisible()}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] hover:bg-foreground/5 hover:text-foreground active:scale-[0.96]"
                  aria-label={keyVisible ? "Hide API key" : "Show API key"}
                >
                  {keyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>

              <button
                type="button"
                disabled={!canSaveKey}
                onClick={() => void saveKey()}
                className={cn(
                  "h-9 rounded-lg px-3 text-xs font-medium transition-[background-color,color,transform]",
                  canSaveKey
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.96]"
                    : "cursor-not-allowed bg-secondary text-muted-foreground/60"
                )}
              >
                {keyBusy ? "Saving..." : "Save"}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span>{keyKindLabel(kind)}</span>
              {routeWarning && <span className="text-destructive">{routeWarning}</span>}
              {keyError && <span className="text-destructive">{keyError}</span>}
              {keySaved && !keyError && <span className="text-foreground/70">Saved</span>}
            </div>

            <div className="mt-2 rounded-lg bg-background/60 px-3 py-2 text-xs text-muted-foreground ring-1 ring-border">
              {keyModelSummary(img, apiKeyDraft)}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => openExternal(OPENAI_API_KEYS_HELP_URL)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-background/70 px-2.5 text-xs font-medium text-muted-foreground ring-1 ring-border transition-[background-color,color,transform] hover:bg-background hover:text-foreground active:scale-[0.96]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  OpenAI
                </button>
                <button
                  type="button"
                  onClick={() => openExternal(OPENROUTER_API_KEYS_HELP_URL)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-background/70 px-2.5 text-xs font-medium text-muted-foreground ring-1 ring-border transition-[background-color,color,transform] hover:bg-background hover:text-foreground active:scale-[0.96]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  OpenRouter
                </button>
              </div>
              {apiKey && (
                <button
                  type="button"
                  disabled={keyBusy}
                  onClick={() => void clearKey()}
                  className="h-8 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] hover:bg-foreground/5 hover:text-foreground active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="text-sm font-medium text-foreground">
                  Share anonymous usage and crash reports
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={telemetryOn}
                aria-label="Share anonymous usage and crash reports"
                disabled={optOut === null}
                onClick={toggleTelemetry}
                className={cn(
                  "flex h-6 w-10 shrink-0 items-center rounded-full px-0.5 transition-colors duration-200",
                  optOut === null
                    ? "cursor-wait bg-muted"
                    : telemetryOn
                      ? "bg-primary"
                      : "bg-foreground/20"
                )}
              >
                <span
                  className={cn(
                    "h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                    telemetryOn ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>
            <p className="mt-2 pl-6 text-xs leading-relaxed text-muted-foreground">
              When off, Nib does not send usage or crash events. When on, events are coarse and
              exclude prompts, keys, avatars, and images.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModelPicker({
  value,
  suggestions,
  onChange,
  label = "OpenRouter model",
  placeholder = "google/gemini-2.5-flash-image",
}: {
  value: string
  suggestions: string[]
  onChange: (model: string) => void
  label?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = modelDetails(value)
  const options = suggestions.length > 0 ? suggestions : Object.keys(MODEL_DETAILS)

  return (
    <div className="mt-3">
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div
        className="relative"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex min-h-10 w-full items-center gap-2 rounded-lg bg-background/70 px-3 text-left ring-1 ring-border",
            "transition-[background-color,box-shadow,transform] hover:bg-background active:scale-[0.99]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25"
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-foreground">{selected.name}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{value || selected.note}</span>
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={`${label} suggestions`}
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg bg-card p-1 shadow-[0_0_0_1px_rgba(28,26,23,0.08),0_12px_32px_-12px_rgba(28,26,23,0.3)]"
          >
            {options.map((model) => {
              const details = modelDetails(model)
              const active = model === value
              return (
                <button
                  key={model}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(model)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left transition-[background-color,color]",
                    active
                      ? "bg-secondary/70 text-foreground"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{details.name}</span>
                    <span className="block truncate font-mono text-[10px]">{model}</span>
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder={placeholder}
        className="mt-1.5 h-8 w-full rounded-lg border border-border bg-background/70 px-3 font-mono text-xs text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-foreground/40 focus:ring-2 focus:ring-foreground/[0.06]"
      />
    </div>
  )
}
