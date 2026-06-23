import { useCallback, useEffect, useState } from "react"
import { Check, Download, ImageIcon, Link2, Loader2, Maximize2, Plus, RefreshCw, Sparkles } from "lucide-react"
import { ipc } from "@/gen/ipc"
import type { Shot } from "@/gen/app"
import { EXAMPLE_ARTICLES, EXAMPLE_ARTICLE_URLS } from "@/lib/examples"
import { cn } from "@/lib/utils"

type ShotResult = {
  status: "idle" | "generating" | "done" | "error"
  image: string | null
  /** True once this image has been exported to a file the user chose. */
  saved?: boolean
  /** The failure reason from the engine, shown on the card when status is error. */
  error?: string
  /** Whether this shot is included in "Generate selected". Undefined = selected. */
  draw?: boolean
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
  onZoom,
  avatarReady,
  onNeedAvatar,
  onDirtyChange,
}: {
  /** The look id, chosen in the rail; applied to every shot. */
  style: string
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
  // "More ideas" expansion + the manually-added-shot draft.
  const [moreLoading, setMoreLoading] = useState(false)
  const [draftShot, setDraftShot] = useState("")

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

  // Merge a patch so flags the batch cares about (draw/saved) survive a status
  // change — generateOne only sends {status,image,error}.
  const setResult = useCallback((i: number, patch: Partial<ShotResult>) => {
    setResults((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))
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
          setResult(i, {
            status: "error",
            image: null,
            error: res.error || "No image was produced.",
          })
        } else {
          setResult(i, {
            status: "done",
            image: `data:image/png;base64,${res.images[0]}`,
            saved: false,
          })
        }
      } catch (e) {
        setResult(i, {
          status: "error",
          image: null,
          error: e instanceof Error ? e.message : "Generation failed.",
        })
      }
    },
    [shots, setResult, style, avatarReady, onNeedAvatar]
  )

  const generateAll = useCallback(async () => {
    if (batchRunning) return
    if (!avatarReady) {
      onNeedAvatar()
      return
    }
    // Only the selected shots (draw !== false), drawn in parallel.
    const targets = shots.map((_, i) => i).filter((i) => results[i]?.draw !== false)
    if (targets.length === 0) return
    setBatchRunning(true)
    await Promise.all(targets.map((i) => generateOne(i)))
    setBatchRunning(false)
  }, [batchRunning, shots, results, generateOne, avatarReady, onNeedAvatar])

  /** Toggle whether a shot is included in the batch. */
  const toggleDraw = useCallback((i: number) => {
    setResults((prev) => prev.map((x, j) => (j === i ? { ...x, draw: x.draw === false } : x)))
  }, [])

  /** Append a shot the user typed in themselves. */
  const addShot = useCallback(() => {
    const idea = draftShot.trim()
    if (!idea) return
    const theme = idea.split(/\s+/).slice(0, 4).join(" ")
    setShots((prev) => [...prev, { theme, coreIdea: idea, labels: [] }])
    setResults((prev) => [...prev, { status: "idle" as const, image: null }])
    setDraftShot("")
  }, [draftShot])

  /** Ask the model for more candidate shots and append the genuinely-new ones. */
  const moreShots = useCallback(async () => {
    if (!article.trim() || moreLoading) return
    setMoreLoading(true)
    setPlanError(null)
    try {
      const res = await ipc.app.MakeShotList({ article })
      if (res.error) {
        setPlanError(res.error)
        return
      }
      const have = new Set(shots.map((s) => s.coreIdea.trim().toLowerCase()))
      const fresh = res.shots.filter((s) => !have.has(s.coreIdea.trim().toLowerCase()))
      if (fresh.length === 0) return
      setShots((prev) => [...prev, ...fresh])
      setResults((prev) => [...prev, ...fresh.map(() => ({ status: "idle" as const, image: null }))])
    } catch {
      setPlanError("Could not reach the model. Check your API key and connection.")
    } finally {
      setMoreLoading(false)
    }
  }, [article, moreLoading, shots])

  const save = useCallback(
    async (i: number) => {
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
    },
    [results]
  )

  const reset = useCallback(() => {
    setShots([])
    setResults([])
    setPlanError(null)
    setSaveError(null)
  }, [])

  // Report unsaved generated images up so the app's quit guard covers an
  // article batch. The panel now stays mounted across mode switches (its state
  // must survive a trip to Concept), so this flag only clears when the work is
  // saved or the article is reset — and finally on app teardown.
  const hasUnsaved = results.some((r) => r.image && !r.saved)
  useEffect(() => {
    onDirtyChange(hasUnsaved)
  }, [hasUnsaved, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const hasShots = shots.length > 0

  // ── Shot list + results ────────────────────────────────────────────────
  if (hasShots) {
    const doneCount = results.filter((r) => r.image).length
    const selectedCount = shots.filter((_, i) => results[i]?.draw !== false).length
    return (
      <div className="flex h-full w-full flex-col overflow-hidden px-6 pt-4 pb-6">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tnum">
              {shots.length} {shots.length === 1 ? "idea" : "ideas"}
            </span>
            {selectedCount !== shots.length && (
              <span className="text-muted-foreground/60 tnum">· {selectedCount} selected</span>
            )}
            {doneCount > 0 && <span className="text-muted-foreground/60 tnum">· {doneCount} drawn</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="h-8 px-3 rounded-md text-xs font-medium text-muted-foreground transition-[transform,color,background-color] hover:text-foreground hover:bg-foreground/5 active:scale-[0.97]"
            >
              New article
            </button>
            <button
              type="button"
              disabled={moreLoading}
              onClick={() => void moreShots()}
              title="Ask the model for more candidate ideas"
              className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-muted-foreground transition-[transform,color,background-color] hover:text-foreground hover:bg-foreground/5 active:scale-[0.97] disabled:opacity-50"
            >
              {moreLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              More ideas
            </button>
            <button
              type="button"
              disabled={batchRunning || selectedCount === 0}
              onClick={() => void generateAll()}
              className="flex items-center gap-1.5 h-8 px-4 rounded-md text-xs font-medium bg-primary text-primary-foreground shadow-sm transition-[transform,background-color] hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
            >
              {batchRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {batchRunning
                ? "Drawing…"
                : selectedCount === shots.length
                  ? "Generate all"
                  : `Generate ${selectedCount}`}
            </button>
          </div>
        </div>

        {saveError && (
          <p className="mb-2 shrink-0 text-xs text-destructive" role="alert">
            {saveError}
          </p>
        )}

        <div className="grid flex-1 min-h-0 auto-rows-min grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4 overflow-y-auto pr-1">
          {shots.map((shot, i) => {
            const r = results[i] ?? { status: "idle", image: null }
            return (
              <figure
                key={i}
                className={cn(
                  "group plate-in flex flex-col transition-opacity",
                  r.draw === false && "opacity-55"
                )}
                style={{ animationDelay: `${Math.min(i, 5) * 45}ms` }}
              >
                <div
                  className={cn(
                    "relative overflow-hidden rounded-lg bg-white ring-1 ring-border",
                    "shadow-[0_1px_2px_-1px_rgba(28,26,23,0.05),0_5px_14px_-10px_rgba(28,26,23,0.14)]"
                  )}
                >
                  {/* Include/exclude this shot from the batch. */}
                  <button
                    type="button"
                    onClick={() => toggleDraw(i)}
                    title={r.draw === false ? "Include in Generate" : "Exclude from Generate"}
                    aria-label={r.draw === false ? "Include in Generate" : "Exclude from Generate"}
                    className={cn(
                      "absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-[5px] border transition-colors",
                      r.draw === false
                        ? "border-border bg-white/85 text-transparent hover:border-foreground/40"
                        : "border-[var(--brand)] bg-[var(--brand)] text-white"
                    )}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </button>
                  <div className="relative flex aspect-[16/9] items-center justify-center">
                    {r.image ? (
                      <img
                        src={r.image}
                        alt={shot.theme}
                        className="h-full w-full cursor-zoom-in object-contain"
                        draggable={false}
                        onClick={() => onZoom?.(r.image!)}
                      />
                    ) : r.status === "generating" ? (
                      <span className="flex gap-1 text-muted-foreground/70" aria-hidden>
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                      </span>
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground/30" strokeWidth={1.5} />
                    )}
                  </div>
                  {r.image && onZoom && (
                    <button
                      type="button"
                      onClick={() => onZoom(r.image!)}
                      title="View larger"
                      aria-label="View larger"
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white opacity-0 backdrop-blur-sm transition-[opacity,transform,background-color] hover:bg-black/75 active:scale-[0.95] group-hover:opacity-100"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <figcaption className="mt-2 flex flex-1 flex-col px-0.5">
                  <span className="truncate text-[13px] font-medium text-foreground">{shot.theme}</span>
                  <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                    {shot.coreIdea}
                  </span>
                  {r.status === "error" && (
                    <span
                      className="mt-1 line-clamp-2 text-[11px] text-destructive"
                      title={r.error || "Generation failed."}
                    >
                      {r.error || "Generation failed."}
                    </span>
                  )}
                  <div className="mt-2 flex items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      disabled={r.status === "generating"}
                      onClick={() => void generateOne(i)}
                      className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground transition-[transform,color,background-color] hover:bg-foreground/5 hover:text-foreground active:scale-[0.97] disabled:opacity-50"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {r.image ? "Redo" : "Draw"}
                    </button>
                    <button
                      type="button"
                      disabled={!r.image}
                      onClick={() => void save(i)}
                      className={cn(
                        "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-[transform,color,background-color] active:scale-[0.97]",
                        r.saved
                          ? "text-muted-foreground"
                          : "text-foreground hover:bg-foreground/5 disabled:text-muted-foreground/40 disabled:active:scale-100"
                      )}
                    >
                      <Download className="h-3 w-3" />
                      {r.saved ? "Saved" : "Save"}
                    </button>
                  </div>
                </figcaption>
              </figure>
            )
          })}
        </div>

        {/* Add your own shot (for your own writing / custom ideas). */}
        <div className="mt-3 flex shrink-0 items-center gap-2">
          <input
            value={draftShot}
            onChange={(e) => setDraftShot(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addShot()
              }
            }}
            placeholder="Add your own shot — describe what to draw…"
            className="h-9 flex-1 rounded-lg border border-border bg-secondary/30 px-3 text-[13px] text-foreground placeholder:text-muted-foreground outline-none transition-[border-color,box-shadow] focus:border-foreground/40 focus:ring-2 focus:ring-foreground/[0.06]"
          />
          <button
            type="button"
            disabled={!draftShot.trim()}
            onClick={addShot}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-secondary/60 px-3.5 text-[13px] font-medium text-foreground transition-[transform,background-color] hover:bg-secondary active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>
    )
  }

  // ── Article input ──────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full justify-center overflow-y-auto px-6 pt-[6vh] pb-6">
      <div className="flex w-full max-w-[600px] flex-col">
        <h2 className="text-pretty text-[15px] font-medium text-foreground">
          Turn an article into a set
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Paste a post or a URL. Nib picks the 4–8 load-bearing ideas and draws each one
          starring your character, all in the same look.
        </p>

        <textarea
          value={article}
          onChange={(e) => setArticle(e.target.value)}
          placeholder="Paste an article or a URL…"
          className={cn(
            "min-h-[200px] w-full resize-none rounded-lg border border-border bg-secondary/30 p-3.5",
            "text-sm leading-relaxed text-foreground placeholder:text-muted-foreground outline-none",
            "transition-[border-color,box-shadow] focus:border-foreground/40 focus:ring-2 focus:ring-foreground/[0.06]"
          )}
          style={{ scrollbarWidth: "thin" }}
        />

        {(planError || fetchError) && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {fetchError || planError}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground/70">
            {isUrl ? "Looks like a URL — fetch it first" : "⌘↵ or Make shot list"}
          </p>
          {isUrl ? (
            <button
              type="button"
              disabled={fetching}
              onClick={() => void fetchFromUrl()}
              className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-[transform,background-color] hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
            >
              {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {fetching ? "Fetching…" : "Fetch article"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!article.trim() || planning}
              onClick={() => void makeShotList()}
              className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-[transform,background-color] hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
            >
              {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {planning ? "Planning…" : "Make shot list"}
            </button>
          )}
        </div>

        {!article.trim() && (
          <div className="mt-8 space-y-3">
            <Picker label="Try a sample">
              {EXAMPLE_ARTICLES.map((a, i) => (
                <Chip key={i} onClick={() => setArticle(a.body)}>
                  {a.title}
                </Chip>
              ))}
            </Picker>
            <Picker label="Or fetch a URL">
              {EXAMPLE_ARTICLE_URLS.map((a, i) => (
                <Chip key={i} disabled={fetching} onClick={() => void fetchFromUrl(a.url)} icon>
                  {a.label}
                </Chip>
              ))}
            </Picker>
          </div>
        )}
      </div>
    </div>
  )
}

function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-medium tracking-wide text-muted-foreground/70">{label}</span>
      {children}
    </div>
  )
}

function Chip({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  icon?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 h-7 text-xs text-muted-foreground transition-[transform,color,background-color,border-color] hover:border-foreground/30 hover:bg-secondary/40 hover:text-foreground active:scale-[0.97] disabled:opacity-50"
    >
      {icon && <Link2 className="h-3 w-3" />}
      {children}
    </button>
  )
}
