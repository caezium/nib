import { useCallback, useEffect, useState } from "react"
import { Download, ImageIcon, Link2, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { ipc } from "@/gen/ipc"
import type { Shot } from "@/gen/app"
import { StylePicker, type StyleOption } from "@/components/style-picker"
import { EXAMPLE_ARTICLES, EXAMPLE_ARTICLE_URLS } from "@/lib/examples"
import { cn } from "@/lib/utils"

type ShotResult = {
  status: "idle" | "generating" | "done" | "error"
  image: string | null
  /** True once this image has been exported to a file the user chose. */
  saved?: boolean
}

/** Build the per-shot generation prompt from its idea + suggested labels. */
function shotPrompt(shot: Shot): string {
  const labels =
    shot.labels.length > 0 ? ` Suggested labels: ${shot.labels.join(", ")}.` : ""
  return `${shot.coreIdea}${labels}`
}

/**
 * Recognizable-as-a-URL heuristic for the single-line article input. Requires a
 * scheme, `www.`, a host+path, or a common TLD — so a dotted idea like
 * "feedback.loops" (no scheme/path/known TLD) is treated as text, not a page.
 */
function looksLikeUrl(s: string): boolean {
  const t = s.trim()
  if (!t || /\s/.test(t)) return false // articles have spaces; URLs don't
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return true
  if (/^[\w-]+(\.[\w-]+)+\/\S/.test(t)) return true // host + path
  return /\.(com|org|net|io|dev|app|co|ai|edu|gov|news|blog|me|xyz|info|us|uk|ca)(\/|$|\?|#)/i.test(t)
}

export function ArticlePanel({
  style,
  styles,
  onStyleChange,
  onZoom,
  avatarReady,
  onNeedAvatar,
  onDirtyChange,
}: {
  style: string
  styles: StyleOption[]
  onStyleChange: (id: string) => void
  onZoom?: (src: string) => void
  /** Whether the persistent avatar is set; generation is gated on it. */
  avatarReady: boolean
  /** Called when the user tries to generate without an avatar set. */
  onNeedAvatar: () => void
  /** Reports whether this panel holds generated-but-unsaved images. */
  onDirtyChange: (dirty: boolean) => void
}) {
  const [article, setArticle] = useState("")
  const [shots, setShots] = useState<Shot[]>([])
  const [planning, setPlanning] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [results, setResults] = useState<ShotResult[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const trimmed = article.trim()
  const isUrl = looksLikeUrl(trimmed)

  const fetchFromUrl = useCallback(
    async (urlOverride?: string) => {
      const url = (urlOverride ?? trimmed).trim()
      if (!url || fetching) return
      setArticle(url)
      setFetching(true)
      setFetchError(null)
      try {
        const res = await ipc.app.FetchArticle({ url })
        if (res.error) setFetchError(res.error)
        else setArticle(res.markdown)
      } catch {
        setFetchError("Couldn't reach that page.")
      } finally {
        setFetching(false)
      }
    },
    [trimmed, fetching]
  )

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
      // Same avatar gate as concept mode — generating without the reference
      // character would defeat the point.
      if (!avatarReady) {
        onNeedAvatar()
        return
      }
      setResult(i, { status: "generating", image: null })
      try {
        const res = await ipc.app.GenerateIcon({
          prompt: shotPrompt(shot),
          negativePrompt: "",
          referenceImage: "", // main falls back to the stored avatar
          seed: 0,
          variantCount: 1,
          style,
          referenceMime: "",
        })
        if (res.error || res.images.length === 0) {
          setResult(i, { status: "error", image: null })
        } else {
          setResult(i, {
            status: "done",
            image: `data:image/png;base64,${res.images[0]}`,
            saved: false,
          })
        }
      } catch {
        setResult(i, { status: "error", image: null })
      }
    },
    [shots, setResult, style, avatarReady, onNeedAvatar]
  )

  const generateAll = useCallback(async () => {
    if (batchRunning || shots.length === 0) return
    if (!avatarReady) {
      onNeedAvatar()
      return
    }
    setBatchRunning(true)
    // Sequential to stay gentle on rate limits.
    for (let i = 0; i < shots.length; i++) {
      await generateOne(i)
    }
    setBatchRunning(false)
  }, [batchRunning, shots, generateOne, avatarReady, onNeedAvatar])

  const save = useCallback(async (i: number) => {
    const img = results[i]?.image
    if (!img) return
    setSaveError(null)
    try {
      const buffer = await (await fetch(img)).arrayBuffer()
      const res = await ipc.app.SaveIcon({ imageData: new Uint8Array(buffer) })
      if (res.error) {
        setSaveError(res.error)
        return
      }
      if (!res.canceled && res.imagePath) {
        setResults((prev) => prev.map((x, j) => (j === i ? { ...x, saved: true } : x)))
      }
    } catch {
      setSaveError("Could not save the image.")
    }
  }, [results])

  const reset = useCallback(() => {
    setShots([])
    setResults([])
    setPlanError(null)
    setSaveError(null)
  }, [])

  // Report unsaved generated images up so the app's quit guard covers an
  // article batch; clear it when this panel unmounts (mode switch).
  const hasUnsaved = results.some((r) => r.image && !r.saved)
  useEffect(() => {
    onDirtyChange(hasUnsaved)
  }, [hasUnsaved, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const hasShots = shots.length > 0

  return (
    <div className="flex flex-col h-full w-full max-w-[680px] mx-auto px-4 pt-20 pb-4 gap-3 overflow-hidden">
      {/* Style picker — applies to every shot. */}
      <div className="shrink-0">
        <StylePicker styles={styles} value={style} onChange={onStyleChange} disabled={batchRunning} />
      </div>

      {/* Article input */}
      {!hasShots && (
        <>
          {!article.trim() && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">Try an example:</span>
              {EXAMPLE_ARTICLES.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setArticle(a.body)}
                  className="px-2.5 h-7 rounded-full text-xs font-medium border border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors"
                >
                  {a.title}
                </button>
              ))}
            </div>
          )}
          {!article.trim() && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">Or fetch a URL:</span>
              {EXAMPLE_ARTICLE_URLS.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={fetching}
                  onClick={() => void fetchFromUrl(a.url)}
                  className="flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium border border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50"
                >
                  <Link2 className="w-3 h-3" />
                  {a.label}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={article}
            onChange={(e) => setArticle(e.target.value)}
            placeholder="Paste an article or a URL — or pick an example. Nib picks 4–8 ideas to illustrate."
            className={cn(
              "w-full flex-1 min-h-[200px] rounded-2xl border border-border bg-secondary/40 p-4",
              "text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none",
              "focus:border-border/80 focus:bg-secondary/60 transition-colors"
            )}
            style={{ scrollbarWidth: "thin" }}
          />
          {(planError || fetchError) && (
            <p className="text-xs text-destructive" role="alert">
              {fetchError || planError}
            </p>
          )}
          <div className="flex justify-end">
            {isUrl ? (
              <button
                type="button"
                disabled={fetching}
                onClick={() => void fetchFromUrl()}
                title="Fetch the article text from this URL"
                className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {fetching ? "Fetching…" : "Fetch article"}
              </button>
            ) : (
              <button
                type="button"
                disabled={!article.trim() || planning}
                onClick={() => void makeShotList()}
                className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {planning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {planning ? "Planning…" : "Make shot list"}
              </button>
            )}
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

          {saveError && (
            <p className="text-xs text-destructive shrink-0" role="alert">
              {saveError}
            </p>
          )}

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
                      <img
                        src={r.image}
                        alt={shot.theme}
                        className="w-full h-full object-contain cursor-zoom-in"
                        draggable={false}
                        onClick={() => onZoom?.(r.image!)}
                      />
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
