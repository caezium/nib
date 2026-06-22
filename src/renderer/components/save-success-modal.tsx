import { useEffect } from "react"
import { FolderOpen, X } from "lucide-react"
import { ipc } from "@/gen/ipc"

export function SaveSuccessModal({
  folderPath,
  imagePath,
  onClose,
}: {
  folderPath: string
  imagePath: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const openInFinder = () => {
    ipc.app.ShowPathInFinder({ path: imagePath }).catch(() => {})
  }

  return (
    <div
      className="non-draggable fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[420px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
          <span className="text-sm font-medium text-foreground">Illustration saved</span>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-2">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your illustration was saved as{" "}
            <span className="text-foreground font-medium">
              {imagePath.replace(/^.*[/\\]/, "") || "illustration.png"}
            </span>{" "}
            in the folder below. You can open it in Finder from here.
          </p>
          <pre
            className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all rounded-lg bg-secondary/40 px-3 py-2 max-h-36 overflow-y-auto select-text"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}
          >
            {folderPath}
          </pre>
        </div>

        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-lg text-xs font-medium bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              openInFinder()
              onClose()
            }}
            className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Show in Finder
          </button>
        </div>
      </div>
    </div>
  )
}
