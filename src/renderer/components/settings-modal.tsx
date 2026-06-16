import { useEffect, useState } from "react"
import { ShieldCheck, Sparkles, X } from "lucide-react"
import { ipc } from "@/gen/ipc"
import { cn } from "@/lib/utils"

type ImageSettings = {
  backend: string
  model: string
  codexAvailable: boolean
  hasKey: boolean
  suggestedModels: string[]
}

/**
 * Settings: the image-generation backend + model, and the telemetry opt-out.
 * The only place either is surfaced in the app.
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  // `optOut === true` means telemetry is OFF. null while loading.
  const [optOut, setOptOut] = useState<boolean | null>(null)
  const [img, setImg] = useState<ImageSettings | null>(null)

  useEffect(() => {
    ipc.app
      .GetTelemetryOptOut({})
      .then((r) => {
        const resp = r as unknown as { optOut?: boolean; opt_out?: boolean }
        setOptOut(resp.optOut ?? resp.opt_out ?? false)
      })
      .catch(() => setOptOut(false))

    ipc.app
      .GetImageSettings({})
      .then((r) => {
        const resp = r as unknown as {
          backend?: string
          model?: string
          codexAvailable?: boolean
          codex_available?: boolean
          hasKey?: boolean
          has_key?: boolean
          suggestedModels?: string[]
          suggested_models?: string[]
        }
        setImg({
          backend: resp.backend || "auto",
          model: resp.model || "",
          codexAvailable: resp.codexAvailable ?? resp.codex_available ?? false,
          hasKey: resp.hasKey ?? resp.has_key ?? false,
          suggestedModels: resp.suggestedModels ?? resp.suggested_models ?? [],
        })
      })
      .catch(() => {})
  }, [])

  const telemetryOn = optOut === false
  const toggleTelemetry = () => {
    if (optOut === null) return
    const next = !optOut
    setOptOut(next)
    ipc.app.SetTelemetryOptOut({ optOut: next }).catch(() => {})
  }

  const saveImg = (next: ImageSettings) => {
    setImg(next)
    ipc.app.SetImageSettings({ backend: next.backend, model: next.model }).catch(() => {})
  }

  const backends = [
    { id: "auto", label: "Auto", hint: "Key if set, else free" },
    ...(img?.codexAvailable
      ? [{ id: "codex", label: "Free", hint: "Your ChatGPT sub" }]
      : []),
    { id: "openrouter", label: "OpenRouter", hint: "Your API key" },
  ]
  const showModel = img != null && img.backend !== "codex"

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div
        className="relative w-[460px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 id="settings-title" className="font-medium text-foreground">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-3">
          {/* Image generation */}
          <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              Image generation
            </div>

            <div className="mt-3 text-xs font-medium text-muted-foreground">Backend</div>
            <div className="mt-1.5 flex gap-1.5">
              {backends.map((b) => {
                const active = (img?.backend || "auto") === b.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={img == null}
                    onClick={() => img && saveImg({ ...img, backend: b.id })}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/30 hover:border-foreground/30"
                    )}
                  >
                    <div className="text-xs font-medium text-foreground">{b.label}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">{b.hint}</div>
                  </button>
                )
              })}
            </div>

            {img && !img.codexAvailable && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Install the Codex CLI and run <code className="font-mono">codex login</code> to
                generate free on your ChatGPT subscription.
              </p>
            )}

            {showModel && (
              <div className="mt-3">
                <label
                  htmlFor="or-model"
                  className="block text-xs font-medium text-muted-foreground mb-1.5"
                >
                  OpenRouter model
                </label>
                <input
                  id="or-model"
                  value={img.model}
                  onChange={(e) => saveImg({ ...img, model: e.target.value })}
                  spellCheck={false}
                  placeholder="google/gemini-2.5-flash-image"
                  className="w-full rounded-lg border border-border bg-secondary/20 px-3 h-8 font-mono text-xs text-foreground outline-none focus:border-foreground/40"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Any image-output model on OpenRouter.
                </p>
              </div>
            )}
          </div>

          {/* Telemetry */}
          <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="w-4 h-4 shrink-0 text-muted-foreground" />
                <div className="text-sm font-medium text-foreground">
                  Share anonymous usage &amp; crash reports
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
                  "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
                  optOut === null
                    ? "bg-muted cursor-wait"
                    : telemetryOn
                      ? "bg-primary"
                      : "bg-secondary border border-border"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                    telemetryOn ? "translate-x-[18px]" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mt-2 pl-6">
              Helps fix bugs and decide what to build next. Never includes your prompts, your
              avatar, your API key, or any generated image.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
