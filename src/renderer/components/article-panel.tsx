import { useCallback, useState } from "react"
import { Download, ImageIcon, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { ipc } from "@/gen/ipc"
import type { Shot } from "@/gen/app"
import { cn } from "@/lib/utils"

type ShotResult = {
  status: "idle" | "generating" | "done" | "error"
  image: string | null
}

/** Build the per-shot generation prompt from its idea + suggested labels. */
function shotPrompt(shot: Shot): string {
  const labels =
    shot.labels.length > 0 ? ` Suggested labels: ${shot.labels.join(", ")}.` : ""
  return `${shot.coreIdea}${labels}`
}

export function ArticlePanel() {
  const [article, setArticle] = useState("")
  const [shots, setShots] = useState<Shot[]>([])
  const [planning, setPlanning] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [results, setResults] = useState<ShotResult[]>([])
  const [batchRunning, setBatchRunning] = useState(false)

  const makeShotList = useCallback(async () => {
    if (!article.trim() || planning) return
    setPlanning(true)
    setPlanError(null)
    try {
      const res = await ipc.app.MakeShotList({ article })
      if (res.error) {
        setPlanError(res.error)
        setShots([])
        setResults([])
      } else {
        setShots(res.shots)
        setResults(res.shots.map(() => ({ status: "idle", image: null })))
      }
    } catch {
      setPlanError("Could not reach the model. Check your API key and connection.")
    } finally {
      setPlanning(false)
    }
  }, [article, planning])

  const setResult = useCallback((i: number, r: ShotResult) => {
    setResults((prev) => prev.map((x, j) => (j === i ? r : x)))
  }, [])

  const generateOne = useCallback(
    async (i: number) => {
      const shot = shots[i]
      if (!shot) return
      setResult(i, { status: "generating", image: null })
      try {
        const res = await ipc.app.GenerateIcon({
          prompt: shotPrompt(shot),
          negativePrompt: "",
          referenceImage: "", // main falls back to the stored avatar
          seed: 0,
          variantCount: 1,
        })
        if (res.error || res.images.length === 0) {
          setResult(i, { status: "error", image: null })
        } else {
          setResult(i, { status: "done", image: `data:image/png;base64,${res.images[0]}` })
        }
      } catch {
        setResult(i, { status: "error", image: null })
      }
    },
    [shots, setResult]
  )

  const generateAll = useCallback(async () => {
    if (batchRunning || shots.length === 0) return
    setBatchRunning(true)
    // Sequential to stay gentle on rate limits.
    for (let i = 0; i < shots.length; i++) {
      await generateOne(i)
    }
    setBatchRunning(false)
  }, [batchRunning, shots, generateOne])

  const save = useCallback(async (i: number) => {
    const img = results[i]?.image
    if (!img) return
    try {
      const buffer = await (await fetch(img)).arrayBuffer()
      await ipc.app.SaveIcon({ imageData: new Uint8Array(buffer) })
    } catch {
      /* ignore */
    }
  }, [results])

  const reset = useCallback(() => {
    setShots([])
    setResults([])
    setPlanError(null)
  }, [])

  const hasShots = shots.length > 0

  return (
    <div className="flex flex-col h-full w-full max-w-[680px] mx-auto px-4 pt-20 pb-4 gap-3 overflow-hidden">
      {/* Article input */}
      {!hasShots && (
        <>
          <textarea
            value={article}
            onChange={(e) => setArticle(e.target.value)}
            placeholder="Paste an article, post, or notes… Sidekick will pick 4–8 ideas to illustrate."
            className={cn(
              "w-full flex-1 min-h-[200px] rounded-2xl border border-border bg-secondary/40 p-4",
              "text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none",
              "focus:border-border/80 focus:bg-secondary/60 transition-colors"
            )}
            style={{ scrollbarWidth: "thin" }}
          />
          {planError && (
            <p className="text-xs text-destructive" role="alert">
              {planError}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!article.trim() || planning}
              onClick={() => void makeShotList()}
              className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {planning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {planning ? "Planning…" : "Make shot list"}
            </button>
          </div>
        </>
      )}

      {/* Shot list + results */}
      {hasShots && (
        <>
          <div className="flex items-center justify-between shrink-0">
            <span className="text-sm text-muted-foreground">
              {shots.length} shots
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="h-8 px-3 rounded-lg text-xs font-medium bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                New article
              </button>
              <button
                type="button"
                disabled={batchRunning}
                onClick={() => void generateAll()}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {batchRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {batchRunning ? "Generating…" : "Generate all"}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3" style={{ scrollbarWidth: "thin" }}>
            {shots.map((shot, i) => {
              const r = results[i] ?? { status: "idle", image: null }
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-border bg-secondary/30 p-3 flex gap-3"
                >
                  {/* 16:9 image slot */}
                  <div className="relative w-[200px] shrink-0 aspect-[16/9] rounded-lg overflow-hidden bg-white flex items-center justify-center">
                    {r.image ? (
                      <img src={r.image} alt={shot.theme} className="w-full h-full object-contain" draggable={false} />
                    ) : r.status === "generating" ? (
                      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Meta + actions */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground truncate">{shot.theme}</span>
                    <span className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mt-0.5">
                      {shot.coreIdea}
                    </span>
                    {shot.labels.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/70 mt-1 truncate">
                        labels: {shot.labels.join(", ")}
                      </span>
                    )}
                    {r.status === "error" && (
                      <span className="text-xs text-destructive mt-1">Generation failed.</span>
                    )}
                    <div className="flex items-center gap-2 mt-auto pt-2">
                      <button
                        type="button"
                        disabled={r.status === "generating"}
                        onClick={() => void generateOne(i)}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {r.image ? "Redo" : "Generate"}
                      </button>
                      <button
                        type="button"
                        disabled={!r.image}
                        onClick={() => void save(i)}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
                      >
                        <Download className="w-3 h-3" />
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
