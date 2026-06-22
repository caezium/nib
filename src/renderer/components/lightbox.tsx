import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Full-screen image viewer. Click the image to toggle a larger zoom (the
 * backdrop scrolls when zoomed); click outside, press Escape, or hit the
 * close button to dismiss.
 */
export function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false)

  // Reset zoom whenever a new image opens.
  useEffect(() => {
    setZoomed(false)
  }, [src])

  // Close on Escape.
  useEffect(() => {
    if (!src) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [src, onClose])

  if (!src) return null

  return (
    <div
      className="non-draggable fixed inset-0 z-[110] overflow-auto bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="fixed top-4 right-4 z-10 flex items-center justify-center w-9 h-9 rounded-lg bg-foreground/5 text-white hover:bg-white/20 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="min-h-full flex items-center justify-center p-6">
        <img
          src={src}
          alt="Illustration"
          draggable={false}
          onClick={(e) => {
            e.stopPropagation()
            setZoomed((z) => !z)
          }}
          className={cn(
            "rounded-lg shadow-2xl select-none bg-white",
            zoomed
              ? "max-w-none w-[1400px] cursor-zoom-out"
              : "max-w-[92vw] max-h-[88vh] object-contain cursor-zoom-in"
          )}
        />
      </div>
    </div>
  )
}
