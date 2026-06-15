import { useEffect, useState } from "react"
import { ShieldCheck, X } from "lucide-react"
import { ipc } from "@/gen/ipc"
import { cn } from "@/lib/utils"

/**
 * Settings. Currently the home of the telemetry opt-out toggle — the only place
 * telemetry is surfaced in the app (no startup or download notice by design).
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  // `optOut === true` means telemetry is OFF. null while loading.
  const [optOut, setOptOut] = useState<boolean | null>(null)

  useEffect(() => {
    ipc.app
      .GetTelemetryOptOut({})
      .then((r) => {
        const resp = r as unknown as { optOut?: boolean; opt_out?: boolean }
        setOptOut(resp.optOut ?? resp.opt_out ?? false)
      })
      .catch(() => setOptOut(false))
  }, [])

  const telemetryOn = optOut === false

  const toggle = () => {
    if (optOut === null) return
    const next = !optOut
    setOptOut(next)
    ipc.app.SetTelemetryOptOut({ optOut: next }).catch(() => {})
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div
        className="relative w-[440px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-background shadow-2xl"
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

        <div className="px-4 pb-4">
          <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    Share anonymous usage &amp; crash reports
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    Helps fix bugs and decide what to build next. Never includes your prompts,
                    your avatar, your API key, or any generated image.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={telemetryOn}
                aria-label="Share anonymous usage and crash reports"
                disabled={optOut === null}
                onClick={toggle}
                className={cn(
                  "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
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
          </div>
        </div>
      </div>
    </div>
  )
}
