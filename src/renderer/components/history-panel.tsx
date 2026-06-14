import { useEffect, useState } from "react"
import { Clock, Trash2, X } from "lucide-react"
import { ipc } from "@/gen/ipc"
import type { HistoryItem } from "@/gen/app"
import { cn } from "@/lib/utils"

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!t) return ""
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function HistoryPanel({
  open,
  onClose,
  onOpenItem,
}: {
  open: boolean
  onClose: () => void
  onOpenItem: (id: string) => void
}) {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    ipc.app
      .GetHistory({})
      .then((r) => setItems(r.items))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  const clear = async () => {
    await ipc.app.ClearHistory({}).catch(() => {})
    setItems([])
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="h-full w-[320px] max-w-[85vw] bg-background border-l border-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock className="w-4 h-4" /> History
          </span>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button
                type="button"
                onClick={clear}
                title="Clear history"
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-white/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5" style={{ scrollbarWidth: "thin" }}>
          {loading && <p className="text-xs text-muted-foreground p-3">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="text-xs text-muted-foreground p-3 leading-relaxed">
              No history yet. Your generations will appear here.
            </p>
          )}
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onOpenItem(it.id)}
              className={cn(
                "w-full flex gap-3 p-2 rounded-xl text-left transition-colors",
                "hover:bg-secondary/60"
              )}
            >
              <div className="w-[88px] shrink-0 aspect-[16/9] rounded-md overflow-hidden bg-white">
                {it.thumbB64 && (
                  <img
                    src={`data:image/png;base64,${it.thumbB64}`}
                    alt={it.prompt}
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground line-clamp-2 leading-snug">{it.prompt}</p>
                <p className="text-[11px] text-muted-foreground mt-1 capitalize">
                  {it.style} · {relTime(it.createdAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </aside>
    </div>
  )
}
