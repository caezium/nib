import { useCallback, useEffect, useState } from "react"
import { ImagePlus, X } from "lucide-react"
import { ipc } from "@/gen/ipc"
import { cn } from "@/lib/utils"
import henImg from "@/assets/characters/hen.png"
import moImg from "@/assets/characters/mo.png"
import sumiImg from "@/assets/characters/sumi.png"

/** Bundled starter characters, so a user without an avatar isn't blocked. */
const STARTERS: { name: string; img: string; spec: string }[] = [
  {
    name: "Hen",
    img: henImg,
    spec:
      "A round, chunky white hen with a small red comb on top, a little orange beak, two black dot eyes, and short stubby wings. The red comb is the one accent; keep the body plump and white and the proportions chunky. Ignore any dark radial background in the reference image; it is not part of the character.",
  },
  {
    name: "Mo",
    img: moImg,
    spec:
      "A small mole: a rounded grey-brown body with a soft hand-drawn outline, a little pink triangular nose, two tiny dot eyes, and two small pale shovel-paws. One accent — a short red scarf. Keep the round body and the digging shovel-paws.",
  },
  {
    name: "Sumi",
    img: sumiImg,
    spec:
      "A small, deadpan ink-drop creature: a rounded solid-black body with a clean white outline, two round white dot eyes and a tiny flat mouth, and two short curved stick arms. One accent — a small red dot floating just above its head like a spark of an idea. Keep the silhouette simple and the red dot present in every image.",
  },
]

/** Cap the avatar's longest edge so prefs, API payloads, and decode stay small. */
const MAX_AVATAR_PX = 1024

/** Read a bundled asset URL into raw base64 + MIME (for SetAvatar). */
async function urlToBase64(url: string): Promise<{ b64: string; mime: string }> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const r = reader.result as string
      const comma = r.indexOf(",")
      resolve({ b64: comma >= 0 ? r.slice(comma + 1) : r, mime: blob.type || "image/png" })
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

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
  const [spec, setSpec] = useState("")
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
        const sp = (r as unknown as { spec?: string }).spec
        if (sp) setSpec(sp)
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
        setSpec("")
      }
    } catch {
      setError("Could not open the file picker.")
    }
  }, [])

  const pickStarter = useCallback(async (starter: (typeof STARTERS)[number]) => {
    setError(null)
    try {
      const { b64, mime: m } = await urlToBase64(starter.img)
      const scaled = await downscaleAvatar(b64, m)
      setImageB64(scaled.b64)
      setMime(scaled.mime)
      setSpec(starter.spec)
    } catch {
      setError("Could not load that character.")
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
      if (res.error) {
        setBusy(false)
        setError(res.error)
        return
      }
      await ipc.app.SetAvatarSpec({ spec }).catch(() => {})
      setBusy(false)
      onSaved()
    } catch {
      setBusy(false)
      setError("Could not save the avatar.")
    }
  }, [imageB64, mime, spec, onSaved])

  const preview = imageB64 ? `data:${mime};base64,${imageB64}` : null

  return (
    <div
      className="non-draggable fixed inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-sm"
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
              className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Every illustration stars one character. Start with one of ours, or upload your
            own — a mascot, a logo character, any avatar. A clean PNG on a simple background
            works best.
          </p>

          {/* Bundled starters — no avatar of your own needed. */}
          <div>
            <div className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
              Start with one of ours
            </div>
            <div className="grid grid-cols-3 gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => void pickStarter(s)}
                  title={`Use ${s.name}`}
                  className="group flex flex-col items-center gap-1.5 rounded-lg border border-border bg-secondary/20 p-2 transition-[transform,border-color,background-color] hover:border-foreground/30 hover:bg-secondary/40 active:scale-[0.97]"
                >
                  <span className="flex h-14 w-full items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-border">
                    <img src={s.img} alt={s.name} className="h-full w-full object-contain" draggable={false} />
                  </span>
                  <span className="text-[11px] font-medium text-foreground">{s.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
            <span className="h-px flex-1 bg-border" /> or upload your own
            <span className="h-px flex-1 bg-border" />
          </div>

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

          <div>
            <label
              htmlFor="avatar-spec"
              className="block text-xs font-medium text-foreground mb-1.5"
            >
              Describe your character{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="avatar-spec"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              rows={3}
              placeholder="e.g. a round white hen with a small red comb, two dot eyes and stubby wings — keep the red comb in every image"
              className="w-full rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/40 resize-none leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              A short written description locks the character's design tighter than the image alone.
            </p>
          </div>

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
