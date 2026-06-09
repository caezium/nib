import { useCallback, useEffect, useState } from "react"
import { ImagePlus, X } from "lucide-react"
import { ipc } from "@/gen/ipc"
import { cn } from "@/lib/utils"

/** Cap the avatar's longest edge so prefs, API payloads, and decode stay small. */
const MAX_AVATAR_PX = 1024

async function downscaleAvatar(
  b64: string,
  mime: string
): Promise<{ b64: string; mime: string }> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error("decode failed"))
      im.src = `data:${mime};base64,${b64}`
    })
    const scale = Math.min(1, MAX_AVATAR_PX / Math.max(img.width, img.height))
    if (scale >= 1) return { b64, mime } // already small enough
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return { b64, mime }
    ctx.drawImage(img, 0, 0, w, h)
    const out = canvas.toDataURL("image/png")
    const comma = out.indexOf(",")
    return { b64: comma >= 0 ? out.slice(comma + 1) : out, mime: "image/png" }
  } catch {
    return { b64, mime } // fall back to the original on any failure
  }
}

/**
 * "Add your avatar" — the persistent reference character every illustration
 * stars. Blocking on first run (no `onClose`); editable later from settings
 * (pass `onClose`).
 */
export function AvatarSetupModal({
  onSaved,
  onClose,
}: {
  onSaved: () => void
  /** When provided, the modal is dismissible (settings/edit mode). */
  onClose?: () => void
}) {
  const [imageB64, setImageB64] = useState("")
  const [mime, setMime] = useState("image/png")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill with the existing avatar when editing.
  useEffect(() => {
    ipc.app
      .GetAvatar({})
      .then((r) => {
        if (r.hasAvatar && r.imageB64) {
          setImageB64(r.imageB64)
          setMime(r.mime || "image/png")
        }
      })
      .catch(() => {})
  }, [])

  const choose = useCallback(async () => {
    setError(null)
    try {
      const res = await ipc.app.PickReferenceImage({})
      if (res.canceled) return
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.imageB64) {
        const scaled = await downscaleAvatar(res.imageB64, res.mime || "image/png")
        setImageB64(scaled.b64)
        setMime(scaled.mime)
      }
    } catch {
      setError("Could not open the file picker.")
    }
  }, [])

  const save = useCallback(async () => {
    if (!imageB64) {
      setError("Choose an image first.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await ipc.app.SetAvatar({ imageB64, mime })
      setBusy(false)
      if (res.error) {
        setError(res.error)
        return
      }
      onSaved()
    } catch {
      setBusy(false)
      setError("Could not save the avatar.")
    }
  }, [imageB64, mime, onSaved])

  const preview = imageB64 ? `data:${mime};base64,${imageB64}` : null

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-setup-title"
    >
      <div className="relative w-[440px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex justify-between items-center px-4 pt-4">
          <h2 id="avatar-setup-title" className="font-medium text-foreground">
            Add your avatar
          </h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Pick a clear image of your character — a mascot, a logo character, or any
            avatar. Every illustration will star this character, drawn in the house
            white-background style. A PNG with a simple or transparent background works best.
          </p>

          <button
            type="button"
            onClick={choose}
            className={cn(
              "w-full rounded-xl border border-dashed border-border bg-secondary/20",
              "flex items-center justify-center min-h-[140px] p-3",
              "text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            )}
          >
            {preview ? (
              <img
                src={preview}
                alt="Avatar preview"
                className="max-h-40 max-w-full object-contain rounded-lg"
                draggable={false}
              />
            ) : (
              <span className="flex flex-col items-center gap-2 text-xs">
                <ImagePlus className="w-7 h-7" strokeWidth={1.5} />
                Choose image…
              </span>
            )}
          </button>

          {preview && (
            <button
              type="button"
              onClick={choose}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Choose a different image
            </button>
          )}

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            type="button"
            disabled={busy || !imageB64}
            onClick={() => void save()}
            className="h-8 px-4 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save avatar"}
          </button>
        </div>
      </div>
    </div>
  )
}
