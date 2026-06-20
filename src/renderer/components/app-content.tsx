import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  Check,
  ChevronDown,
  Download,
  ImagePlus,
  Info,
  Layers,
  Maximize2,
  Settings,
  Sparkles,
  UserRound,
  X,
} from "lucide-react"
import { AboutModal } from "@/components/about-modal"
import { SettingsModal } from "@/components/settings-modal"
import { Lightbox } from "@/components/lightbox"
import {
  OpenAIApiKeyManageModal,
  OpenAIApiKeyStartupModal,
  type OpenAIApiKeyManageReason,
} from "@/components/openai-api-key-modals"
import { ErrorModal, generationErrorSuggestsApiKeyIssue } from "@/components/error-modal"
import { SaveSuccessModal } from "@/components/save-success-modal"
import { AvatarSetupModal } from "@/components/avatar-setup-modal"
import { ArticlePanel } from "@/components/article-panel"
import { TitleBarStatus } from "@/components/title-bar-status"
import type { StyleOption } from "@/components/style-picker"
import { useIconPipeline } from "@/lib/icon-pipeline"
import { EXAMPLE_PROMPTS } from "@/lib/examples"
import { ipc } from "@/gen/ipc"
import { cn } from "@/lib/utils"
import appIcon from "../../../assets/app.png"

/** One illustration in the gallery. A `historyId` tile is a collapsed past
 *  generation (thumbnail); clicking it expands its full variants. */
interface Plate {
  id: string
  src: string
  idea: string
  look: string
  /** Set when this tile is a persisted past generation loaded from history. */
  historyId?: string
  /** Number of variants in that past generation (for the ×N badge). */
  count?: number
}

export function AppContent() {
  const [prompt, setPrompt] = useState("")
  const [attachments, setAttachments] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<{ folderPath: string; imagePath: string } | null>(
    null
  )
  const [openAIApiKeyStartupOpen, setOpenAIApiKeyStartupOpen] = useState(false)
  const [openAIApiKeyManageReason, setOpenAIApiKeyManageReason] =
    useState<OpenAIApiKeyManageReason | null>(null)
  // Avatar gate: the persistent reference character. Blocking on first run.
  const [avatarReady, setAvatarReady] = useState(false)
  const [avatarModal, setAvatarModal] = useState<"setup" | "settings" | null>(null)
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null)
  // True when the mock provider is active (placeholder images, no API calls).
  const [mockMode, setMockMode] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Full-screen image viewer (null = closed).
  const [lightbox, setLightbox] = useState<string | null>(null)
  // Single-concept vs whole-article batch mode.
  const [mode, setMode] = useState<"concept" | "article">("concept")
  // Look library + current selection.
  const [styles, setStyles] = useState<StyleOption[]>([])
  const [selectedStyle, setSelectedStyle] = useState("")
  // The session gallery: every generated plate, newest first.
  const [gallery, setGallery] = useState<Plate[]>([])
  const [selectedPlateId, setSelectedPlateId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  // Unsaved illustrations also live in Article mode (a separate component).
  const [articleDirty, setArticleDirty] = useState(false)

  const pipeline = useIconPipeline()
  const prevPipelineStatusRef = useRef(pipeline.status)
  const plateCounterRef = useRef(0)
  // Metadata captured at generate time so the finished plates caption correctly.
  // null when the next "done" came from loading history rather than generating.
  const pendingMetaRef = useRef<{ idea: string; look: string } | null>(null)

  const selectedStyleLabel =
    styles.find((s) => s.id === selectedStyle)?.label ?? selectedStyle
  const selectedPlate = gallery.find((p) => p.id === selectedPlateId) ?? null
  const isGenerating = pipeline.status === "generating"
  const galleryDirty = gallery.some((p) => !savedIds.has(p.id))

  const refreshAvatar = useCallback((gateOnFirstRun = false) => {
    ipc.app
      .GetAvatar({})
      .then((r) => {
        setAvatarReady(r.hasAvatar)
        if (r.hasAvatar && r.imageB64) {
          setAvatarSrc(`data:${r.mime || "image/png"};base64,${r.imageB64}`)
        } else {
          setAvatarSrc(null)
        }
        if (gateOnFirstRun && !r.hasAvatar) setAvatarModal("setup")
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    ipc.app
      .GetOpenAIApiKeyStatus({})
      .then((s) => {
        const resp = s as unknown as {
          openaiKeyRequired?: boolean
          openai_key_required?: boolean
          hasOpenaiKey?: boolean
          has_openai_key?: boolean
          isMock?: boolean
          is_mock?: boolean
        }
        const required = resp.openaiKeyRequired ?? resp.openai_key_required
        const hasKey = resp.hasOpenaiKey ?? resp.has_openai_key
        const isMock = resp.isMock ?? resp.is_mock ?? false
        // Only the mock provider shows the placeholder badge — Codex (free sub)
        // also needs no key but is real generation.
        setMockMode(isMock)
        if (required === true && hasKey !== true) {
          setOpenAIApiKeyStartupOpen(true)
        }
      })
      .catch(() => {})

    // Avatar gate: open the blocking setup modal on first run.
    refreshAvatar(true)

    // Look library.
    ipc.app
      .GetStyles({})
      .then((r) => {
        setStyles(r.styles)
        if (r.styles.length > 0) setSelectedStyle((cur) => cur || r.styles[0].id)
      })
      .catch(() => {})

    // Past generations → the gallery grid (the grid IS the history now).
    ipc.app
      .GetHistory({})
      .then((r) => {
        const hist: Plate[] = r.items.map((raw) => {
          const it = raw as unknown as {
            id: string
            prompt?: string
            style?: string
            thumbB64?: string
            thumb_b64?: string
            count?: number
          }
          return {
            id: `h-${it.id}`,
            src: `data:image/png;base64,${it.thumbB64 ?? it.thumb_b64 ?? ""}`,
            idea: it.prompt || "Untitled",
            look: it.style || "",
            historyId: it.id,
            count: it.count ?? 1,
          }
        })
        if (hist.length === 0) return
        // Dedupe by id — StrictMode runs this effect twice in dev, and we never
        // want the same persisted generation to appear as two tiles.
        setGallery((g) => {
          const have = new Set(g.map((p) => p.id))
          const add = hist.filter((p) => !have.has(p.id))
          return add.length ? [...g, ...add] : g
        })
        setSavedIds((prev) => {
          const next = new Set(prev)
          for (const p of hist) next.add(p.id)
          return next
        })
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Forward uncaught UI errors to the main process (telemetry opt-out enforced there).
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      ipc.app
        .ReportRendererError({
          message: e.message || "Renderer error",
          stack: e.error instanceof Error ? (e.error.stack ?? "") : "",
          source: "window.onerror",
        })
        .catch(() => {})
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      ipc.app
        .ReportRendererError({
          message: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error ? (reason.stack ?? "") : "",
          source: "unhandledrejection",
        })
        .catch(() => {})
    }
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      for (const url of prev) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url)
      }
      return []
    })
  }, [])

  // Pipeline status → gallery. On a fresh generation completing, append the new
  // plates (newest first) and select the first. Errors surface in a modal.
  useEffect(() => {
    const was = prevPipelineStatusRef.current
    prevPipelineStatusRef.current = pipeline.status
    if (was === pipeline.status) return

    if (pipeline.status === "done") {
      const meta = pendingMetaRef.current
      pendingMetaRef.current = null
      if (!meta) return // came from loadVariants (history), not a generation
      const fresh: Plate[] = pipeline.variants
        .filter((v): v is string => v !== null)
        .map((src) => ({
          id: `p${++plateCounterRef.current}`,
          src,
          idea: meta.idea,
          look: meta.look,
        }))
      if (fresh.length === 0) return
      setGallery((g) => [...fresh, ...g])
      // Don't auto-select: leave Generate as "Generate" so the next idea starts
      // fresh. Selecting a plate is an explicit choice to refine from it.
      setSelectedPlateId(null)
      clearAttachments()
    } else if (pipeline.status === "error") {
      pendingMetaRef.current = null
      const raw = pipeline.progress.label
      setErrorMessage(raw.startsWith("Error: ") ? raw.slice(7) : raw)
    }
  }, [pipeline.status, pipeline.variants, pipeline.progress.label, clearAttachments])

  // Quit guard: any unsaved plate (gallery or article) is unsaved work.
  useEffect(() => {
    ipc.app.SetUnsavedIconState({ unsaved: galleryDirty || articleDirty }).catch(() => {})
  }, [galleryDirty, articleDirty])

  // Once past onboarding, show "More ways to use Nib" a single time.
  useEffect(() => {
    if (!avatarReady || avatarModal !== null || openAIApiKeyStartupOpen) return
    try {
      if (!localStorage.getItem("nib.seenAbout")) {
        localStorage.setItem("nib.seenAbout", "1")
        setAboutOpen(true)
      }
    } catch {
      /* localStorage unavailable — the info button still works */
    }
  }, [avatarReady, avatarModal, openAIApiKeyStartupOpen])

  // ⌘V anywhere attaches a pasted image as a reference.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length === 0) return
      e.preventDefault()
      Promise.all(
        files.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.onerror = () => reject(reader.error)
              reader.readAsDataURL(file)
            })
        )
      )
        .then((urls) => setAttachments((prev) => [...prev, ...urls]))
        .catch(() => {})
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [])

  const handleAttachClick = async () => {
    try {
      const res = await ipc.app.PickReferenceImage({})
      if (res.canceled || !res.imageB64) return
      setAttachments((prev) => [...prev, `data:${res.mime || "image/png"};base64,${res.imageB64}`])
    } catch {
      /* ignore — the user can retry */
    }
  }

  const startGeneration = () => {
    if (!prompt.trim() || isGenerating) return
    if (!avatarReady) {
      setAvatarModal("setup")
      return
    }
    // Refine from the chosen plate if one is selected; else an attached reference.
    const reference = selectedPlate?.src ?? attachments[0]
    pendingMetaRef.current = { idea: prompt.trim(), look: selectedStyleLabel }
    pipeline.generate(prompt, reference, selectedStyle)
  }

  const stopGeneration = () => pipeline.cancel()

  const savePlate = async (plate: Plate) => {
    try {
      const response = await fetch(plate.src)
      const buffer = await response.arrayBuffer()
      const imageData = new Uint8Array(buffer)
      const saved = await ipc.app.SaveIcon({ imageData })
      if (saved.error) {
        setErrorMessage(saved.error)
        return
      }
      if (!saved.canceled && saved.imagePath) {
        setSavedIds((prev) => new Set(prev).add(plate.id))
        setSaveSuccess({ folderPath: saved.savedPath, imagePath: saved.imagePath })
      }
    } catch {
      setErrorMessage("Could not save the illustration.")
    }
  }

  // Clicking a collapsed history tile expands it: load its full-res variants,
  // drop the thumbnail, and surface the variants at the top of the grid.
  const openHistory = useCallback(async (plate: Plate) => {
    if (!plate.historyId) return
    try {
      const res = await ipc.app.GetHistoryItem({ id: plate.historyId })
      if (res.images.length === 0) return
      const fresh: Plate[] = res.images.map((b) => ({
        id: `p${++plateCounterRef.current}`,
        src: `data:image/png;base64,${b}`,
        idea: plate.idea,
        look: plate.look,
      }))
      setGallery((g) => [...fresh, ...g.filter((p) => p.id !== plate.id)])
      setSavedIds((prev) => {
        const next = new Set(prev)
        for (const p of fresh) next.add(p.id)
        return next
      })
      setSelectedPlateId(null)
    } catch {
      /* ignore */
    }
  }, [])

  const removeAttachment = (index: number) =>
    setAttachments((prev) => prev.filter((_, i) => i !== index))

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Window drag region across the top (clears the traffic lights). */}
      <div className="draggable" />

      {errorMessage && (
        <ErrorModal
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
          onUpdateApiKey={
            generationErrorSuggestsApiKeyIssue(errorMessage)
              ? () => {
                  setErrorMessage(null)
                  setOpenAIApiKeyManageReason("authError")
                }
              : undefined
          }
        />
      )}

      {saveSuccess && (
        <SaveSuccessModal
          folderPath={saveSuccess.folderPath}
          imagePath={saveSuccess.imagePath}
          onClose={() => setSaveSuccess(null)}
        />
      )}

      {/* Avatar gate takes priority over the API-key prompt on first run. */}
      {avatarModal !== null && (
        <AvatarSetupModal
          onSaved={() => {
            setAvatarModal(null)
            refreshAvatar()
          }}
          onClose={avatarModal === "settings" ? () => setAvatarModal(null) : undefined}
        />
      )}

      {openAIApiKeyStartupOpen && avatarModal === null && (
        <OpenAIApiKeyStartupModal onSaved={() => setOpenAIApiKeyStartupOpen(false)} />
      )}
      {openAIApiKeyManageReason !== null && (
        <OpenAIApiKeyManageModal
          key={openAIApiKeyManageReason}
          reason={openAIApiKeyManageReason}
          onClose={(saved) => {
            setOpenAIApiKeyManageReason(null)
            if (saved) setOpenAIApiKeyStartupOpen(false)
          }}
        />
      )}

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />

      {/* ── Control rail ────────────────────────────────────────────────── */}
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-card">
        {/* Brand (clears the traffic lights). */}
        <div className="flex items-center gap-2 h-14 px-4 pl-20 non-draggable select-none">
          <img
            src={appIcon}
            alt=""
            draggable={false}
            className="h-8 w-8 rounded-lg object-cover shadow-sm ring-1 ring-black/[0.06]"
          />
          <span className="text-sm font-semibold tracking-tight">Nib</span>
        </div>

        {/* Mode toggle. */}
        <div className="px-3 pb-3">
          <div className="flex items-center gap-0.5 rounded-lg bg-secondary/60 p-0.5 text-xs">
            {(["concept", "article"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 px-3 h-7 rounded-md font-medium transition-colors capitalize",
                  mode === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {mode === "concept" ? (
          <ConceptRail
            prompt={prompt}
            onPromptChange={setPrompt}
            onSubmit={startGeneration}
            isGenerating={isGenerating}
            onStop={stopGeneration}
            avatarSrc={avatarSrc}
            onEditAvatar={() => setAvatarModal("settings")}
            styles={styles}
            selectedStyle={selectedStyle}
            onSelectStyle={setSelectedStyle}
            attachments={attachments}
            onAttach={handleAttachClick}
            onRemoveAttachment={removeAttachment}
            examples={EXAMPLE_PROMPTS}
            onPickExample={setPrompt}
            refining={selectedPlate != null}
          />
        ) : (
          <div className="scrollbar-none flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto px-3 pb-3">
            <CharacterField avatarSrc={avatarSrc} onEditAvatar={() => setAvatarModal("settings")} />
            <LookField styles={styles} selectedStyle={selectedStyle} onSelectStyle={setSelectedStyle} />
            <p className="px-0.5 text-[11px] leading-relaxed text-muted-foreground/70">
              Paste an article on the right. Nib pulls the load-bearing ideas and draws each
              one in this look, starring your character.
            </p>
          </div>
        )}

        {/* Utility row pinned to the bottom of the rail. */}
        <div className="mt-auto flex items-center gap-1 border-t border-border px-3 py-2.5">
          {[
            { icon: Settings, label: "Settings", onClick: () => setSettingsOpen(true) },
            { icon: Info, label: "More ways to use Nib", onClick: () => setAboutOpen(true) },
          ].map(({ icon: Icon, label, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              title={label}
              aria-label={label}
              className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground transition-[transform,color,background-color] hover:text-foreground hover:bg-foreground/5 active:scale-[0.96]"
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main surface ───────────────────────────────────────────────── */}
      <main className="relative flex-1 min-w-0 flex flex-col">
        {pipeline.status === "downloading" && pipeline.progress.label !== "" && (
          <TitleBarStatus
            label={pipeline.progress.label}
            fraction={pipeline.progress.fraction}
            isError={false}
          />
        )}

        {mode === "concept" ? (
          <Gallery
            plates={gallery}
            generating={isGenerating}
            selectedId={selectedPlateId}
            onSelect={(id) => setSelectedPlateId((cur) => (cur === id ? null : id))}
            onOpenHistory={openHistory}
            onZoom={setLightbox}
            onSave={savePlate}
            savedIds={savedIds}
            mockMode={mockMode}
            examples={EXAMPLE_PROMPTS}
            onPickExample={setPrompt}
          />
        ) : (
          <div className="flex-1 min-h-0 pt-14">
            <ArticlePanel
              style={selectedStyle}
              onZoom={setLightbox}
              avatarReady={avatarReady}
              onNeedAvatar={() => setAvatarModal("setup")}
              onDirtyChange={setArticleDirty}
            />
          </div>
        )}
      </main>
    </div>
  )
}

// ── Control rail (concept mode) ──────────────────────────────────────────────

function ConceptRail({
  prompt,
  onPromptChange,
  onSubmit,
  isGenerating,
  onStop,
  avatarSrc,
  onEditAvatar,
  styles,
  selectedStyle,
  onSelectStyle,
  attachments,
  onAttach,
  onRemoveAttachment,
  examples,
  onPickExample,
  refining,
}: {
  prompt: string
  onPromptChange: (v: string) => void
  onSubmit: () => void
  isGenerating: boolean
  onStop: () => void
  avatarSrc: string | null
  onEditAvatar: () => void
  styles: StyleOption[]
  selectedStyle: string
  onSelectStyle: (id: string) => void
  attachments: string[]
  onAttach: () => void
  onRemoveAttachment: (i: number) => void
  examples: string[]
  onPickExample: (text: string) => void
  refining: boolean
}) {
  const canGenerate = prompt.trim().length > 0
  return (
    <div className="scrollbar-none flex-1 min-h-0 flex flex-col overflow-y-auto px-3 gap-4 pb-3">
      {/* Idea */}
      <Section label="Idea">
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              if (canGenerate && !isGenerating) onSubmit()
            }
          }}
          rows={4}
          placeholder="Describe the idea to illustrate…"
          className="w-full resize-none rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground outline-none transition-[border-color,box-shadow] focus:border-foreground/40 focus:ring-2 focus:ring-foreground/[0.06]"
        />
      </Section>

      {!prompt.trim() && (
        <Section label="Starters">
          <div className="grid gap-1.5">
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => onPickExample(ex)}
                className="min-h-8 rounded-md bg-secondary/30 px-2.5 py-1.5 text-left text-[11px] leading-snug text-foreground/80 transition-[transform,background-color,color] hover:bg-secondary/60 hover:text-foreground active:scale-[0.98]"
              >
                {ex}
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Character */}
      <CharacterField avatarSrc={avatarSrc} onEditAvatar={onEditAvatar} />

      {/* Look */}
      <LookField styles={styles} selectedStyle={selectedStyle} onSelectStyle={onSelectStyle} />

      {/* Reference */}
      <Section label="Reference">
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((src, i) => (
              <div key={i} className="relative group h-12 w-12 overflow-hidden rounded-md ring-1 ring-border">
                <img src={src} alt="Reference" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(i)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove reference"
                >
                  <X className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={onAttach}
              className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              aria-label="Add reference image"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAttach}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Add an image
          </button>
        )}
      </Section>

      {/* Generate */}
      <div className="mt-auto pt-1">
        <button
          type="button"
          onClick={isGenerating ? onStop : onSubmit}
          disabled={!isGenerating && !canGenerate}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg h-10 text-sm font-medium transition-[transform,background-color,box-shadow,color] duration-200",
            isGenerating
              ? "bg-secondary text-foreground hover:bg-secondary/80 active:scale-[0.97]"
              : canGenerate
                ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] shadow-[0_1px_2px_-1px_rgba(28,26,23,0.2),0_4px_12px_-6px_rgba(28,26,23,0.25)]"
                : "bg-secondary/40 text-muted-foreground/50 cursor-not-allowed"
          )}
        >
          {isGenerating ? (
            <>
              <span className="h-2.5 w-2.5 rounded-[1px] bg-current" aria-hidden />
              Stop
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {refining ? "Refine" : "Generate"}
            </>
          )}
        </button>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground/70">
          {refining ? "Builds 3 new drafts from the selected plate" : "⌘↵ to generate · 3 drafts"}
        </p>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

function CharacterField({
  avatarSrc,
  onEditAvatar,
}: {
  avatarSrc: string | null
  onEditAvatar: () => void
}) {
  return (
    <Section label="Character">
      <button
        type="button"
        onClick={onEditAvatar}
        className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-secondary/30 px-2.5 py-2 text-left transition-[transform,border-color,background-color] hover:border-foreground/30 hover:bg-secondary/50 active:scale-[0.99]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary ring-1 ring-border">
          {avatarSrc ? (
            <img src={avatarSrc} alt="Your character" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <UserRound className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1 text-xs">
          <span className="block font-medium text-foreground">Your character</span>
          <span className="block text-muted-foreground">{avatarSrc ? "Tap to change" : "Set one up"}</span>
        </span>
      </button>
    </Section>
  )
}

function LookField({
  styles,
  selectedStyle,
  onSelectStyle,
}: {
  styles: StyleOption[]
  selectedStyle: string
  onSelectStyle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (styles.length === 0) return null
  const selected = styles.find((s) => s.id === selectedStyle) ?? styles[0]

  return (
    <Section label="Look">
      <div
        className="relative"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg bg-secondary/30 px-2.5 text-left",
            "ring-1 ring-border transition-[transform,background-color,box-shadow]",
            "hover:bg-secondary/50 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25"
          )}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--brand)" }} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {selected.label}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label="Look"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg bg-card p-1 shadow-[0_0_0_1px_rgba(28,26,23,0.08),0_10px_30px_-12px_rgba(28,26,23,0.28)]"
          >
            {styles.map((s) => {
              const active = s.id === selected.id
              return (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onSelectStyle(s.id)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-[background-color,color]",
                    active
                      ? "bg-secondary/70 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: active ? "var(--brand)" : "var(--border)" }}
                  />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Gallery (main surface, concept mode) ─────────────────────────────────────

function Gallery({
  plates,
  generating,
  selectedId,
  onSelect,
  onOpenHistory,
  onZoom,
  onSave,
  savedIds,
  mockMode,
  examples,
  onPickExample,
}: {
  plates: Plate[]
  generating: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenHistory: (plate: Plate) => void
  onZoom: (src: string) => void
  onSave: (plate: Plate) => void
  savedIds: Set<string>
  mockMode: boolean
  examples: string[]
  onPickExample: (text: string) => void
}) {
  const empty = plates.length === 0 && !generating

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-14 pb-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Gallery</span>
          {plates.length > 0 && (
            <span className="text-muted-foreground/60 tnum">
              · {plates.length} {plates.length === 1 ? "plate" : "plates"}
            </span>
          )}
          {mockMode && (
            <span className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-700 border border-amber-500/30">
              mock
            </span>
          )}
        </div>
      </div>

      {empty ? (
        <div className="flex flex-col items-center justify-center pt-[8vh] text-center">
          <img
            src={appIcon}
            alt=""
            draggable={false}
            className="mb-5 h-11 w-11 rounded-xl object-cover shadow-sm ring-1 ring-black/[0.06]"
          />
          <p className="mb-1 max-w-[340px] text-pretty text-[15px] font-medium text-foreground">
            Draw your first plate
          </p>
          <p className="mb-6 max-w-[360px] text-balance text-sm text-muted-foreground">
            Describe an idea on the left and Nib renders three drafts starring your character.
          </p>
          <p className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground/70">
            Or start from a concept
          </p>
          <div className="grid w-full max-w-[520px] grid-cols-2 gap-2">
            {examples.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPickExample(ex)}
                className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-[13px] leading-snug text-foreground/85 transition-[transform,background-color,border-color,box-shadow] duration-150 hover:border-foreground/30 hover:bg-secondary/40 hover:shadow-[0_2px_10px_-6px_rgba(28,26,23,0.15)] active:scale-[0.98]"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {generating &&
            [0, 1, 2].map((i) => (
              <div
                key={`gen-${i}`}
                className="overflow-hidden rounded-lg ring-1 ring-border bg-card plate-in"
                style={{ animationDelay: `${i * 55}ms` }}
              >
                <div className="relative flex aspect-[16/9] items-center justify-center bg-secondary/25">
                  <span className="flex gap-1 text-muted-foreground/70" aria-hidden>
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </span>
                </div>
                <div className="px-2.5 py-2 text-[11px] text-muted-foreground">Drawing…</div>
              </div>
            ))}

          {plates.map((p, i) => {
            const isSelected = p.id === selectedId
            const isSaved = savedIds.has(p.id)

            // Collapsed past generation: click expands its full-res variants.
            if (p.historyId) {
              return (
                <figure
                  key={p.id}
                  className="group relative plate-in"
                  style={{ animationDelay: `${Math.min(i, 5) * 45}ms` }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenHistory(p)}
                    title="Open this generation"
                    className="block w-full overflow-hidden rounded-lg bg-white ring-1 ring-border shadow-[0_1px_2px_-1px_rgba(28,26,23,0.05),0_5px_14px_-10px_rgba(28,26,23,0.14)] transition-[box-shadow,transform] duration-200 hover:ring-foreground/30 hover:shadow-[0_2px_5px_-2px_rgba(28,26,23,0.08),0_14px_28px_-12px_rgba(28,26,23,0.22)] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                  >
                    <div className="relative flex aspect-[16/9] items-center justify-center">
                      <img src={p.src} alt={p.idea} className="h-full w-full object-contain" draggable={false} />
                    </div>
                  </button>
                  {p.count != null && p.count > 1 && (
                    <span className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                      <Layers className="h-2.5 w-2.5" />
                      {p.count}
                    </span>
                  )}
                  <figcaption className="mt-1.5 flex items-center gap-1.5 px-0.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/70" title={p.idea}>
                      {p.idea}
                    </span>
                    {p.look && <span className="shrink-0 text-[11px] text-muted-foreground">{p.look}</span>}
                  </figcaption>
                </figure>
              )
            }

            return (
              <figure
                key={p.id}
                className="group relative plate-in"
                style={{ animationDelay: `${Math.min(i, 2) * 55}ms` }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className={cn(
                    "block w-full overflow-hidden rounded-lg bg-white transition-[box-shadow,transform] duration-200 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
                    isSelected
                      ? "ring-2 ring-[var(--brand)] shadow-[0_2px_6px_-2px_rgba(224,83,61,0.22),0_12px_26px_-12px_rgba(28,26,23,0.18)]"
                      : "ring-1 ring-border shadow-[0_1px_2px_-1px_rgba(28,26,23,0.05),0_5px_14px_-10px_rgba(28,26,23,0.14)] hover:ring-foreground/30 hover:shadow-[0_2px_5px_-2px_rgba(28,26,23,0.08),0_14px_28px_-12px_rgba(28,26,23,0.22)]"
                  )}
                >
                  <div className="relative aspect-[16/9] flex items-center justify-center">
                    <img src={p.src} alt={p.idea} className="h-full w-full object-contain" draggable={false} />
                  </div>
                </button>

                {/* Hover actions */}
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onZoom(p.src)}
                    title="View larger"
                    aria-label="View larger"
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-sm transition-[transform,background-color] hover:bg-black/75 active:scale-[0.95]"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSave(p)}
                    title={isSaved ? "Saved — save again" : "Save"}
                    aria-label="Save"
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-sm transition-[transform,background-color] hover:bg-black/75 active:scale-[0.95]"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>

                {isSelected && (
                  <span
                    className="absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                    style={{ background: "var(--brand)" }}
                  >
                    chosen
                  </span>
                )}

                <figcaption className="mt-1.5 flex items-center gap-1.5 px-0.5">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/80" title={p.idea}>
                    {p.idea}
                  </span>
                  {p.look && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{p.look}</span>
                  )}
                  {isSaved && <Download className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
                </figcaption>
              </figure>
            )
          })}
        </div>
      )}
    </div>
  )
}
