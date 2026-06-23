import { useEffect, useState, type ReactNode } from "react"
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
} from "@/components/openai-api-key-modals"
import { ErrorModal, generationErrorSuggestsApiKeyIssue } from "@/components/error-modal"
import { SaveSuccessModal } from "@/components/save-success-modal"
import { AvatarSetupModal } from "@/components/avatar-setup-modal"
import { ArticlePanel } from "@/components/article-panel"
import { TitleBarStatus } from "@/components/title-bar-status"
import type { StyleOption } from "@/components/style-picker"
import {
  useAvatar,
  useStyles,
  useAppMode,
  useApiKeyGate,
  useGallery,
  useGeneration,
  type Plate,
} from "@/components/app-content.hooks"
import { EXAMPLE_PROMPTS } from "@/lib/examples"
import { ipc } from "@/gen/ipc"
import { cn } from "@/lib/utils"
import appIcon from "../../../assets/app.png"

export function AppContent() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Structured failure class (GenerateIconResponse.error_reason) when available;
  // preferred over message string-matching to decide the "Update API key" action.
  const [errorReason, setErrorReason] = useState<string>("")
  const [saveSuccess, setSaveSuccess] = useState<{ folderPath: string; imagePath: string } | null>(
    null
  )
  const [aboutOpen, setAboutOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Full-screen image viewer (null = closed).
  const [lightbox, setLightbox] = useState<string | null>(null)
  // Unsaved illustrations also live in Article mode (a separate component).
  const [articleDirty, setArticleDirty] = useState(false)

  // Deep hooks (RFC #4): each owns a cohesive slice of state + its IPC + effects.
  // Aliased back to the original names so the view below is unchanged.
  const avatar = useAvatar()
  const avatarReady = avatar.ready
  const avatarSrc = avatar.src
  const avatarModal = avatar.modal
  const setAvatarModal = avatar.setModal
  const refreshAvatar = avatar.refresh
  const styleLib = useStyles()
  const styles = styleLib.styles
  const selectedStyle = styleLib.selected
  const setSelectedStyle = styleLib.setSelected
  const selectedStyleLabel = styleLib.label
  const { mode, setMode } = useAppMode()
  const apiKeyGate = useApiKeyGate()
  const mockMode = apiKeyGate.mockMode
  const openAIApiKeyStartupOpen = apiKeyGate.startupOpen
  const setOpenAIApiKeyStartupOpen = apiKeyGate.setStartupOpen
  const openAIApiKeyManageReason = apiKeyGate.manageReason
  const setOpenAIApiKeyManageReason = apiKeyGate.setManageReason

  const galleryState = useGallery()
  const gallery = galleryState.plates
  const selectedPlateId = galleryState.selectedId
  const setSelectedPlateId = galleryState.setSelectedId
  const savedIds = galleryState.savedIds
  const selectedPlate = galleryState.selected
  const galleryDirty = galleryState.dirty
  const openHistory = galleryState.openHistory
  const clearGallery = galleryState.clear

  const generation = useGeneration({
    avatarReady,
    onNeedAvatar: () => setAvatarModal("setup"),
    selectedStyle,
    selectedStyleLabel,
    refinePlateSrc: selectedPlate?.src,
    onVariants: galleryState.appendVariants,
    onError: (message, reason) => {
      setErrorReason(reason)
      setErrorMessage(message)
    },
  })
  const prompt = generation.prompt
  const setPrompt = generation.setPrompt
  const attachments = generation.attachments
  const isGenerating = generation.isGenerating
  const startGeneration = generation.start
  const stopGeneration = generation.stop
  const handleAttachClick = generation.attachFromPicker
  const removeAttachment = generation.removeAttachment
  const pipelineStatus = generation.status
  const pipelineProgress = generation.progress

  const savePlate = async (plate: Plate) => {
    const r = await galleryState.save(plate)
    if (r.status === "error") {
      setErrorMessage(r.message ?? "Could not save the illustration.")
    } else if (r.status === "saved") {
      setSaveSuccess({ folderPath: r.savedPath ?? "", imagePath: r.imagePath ?? "" })
    }
  }

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

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Window drag region across the top (clears the traffic lights). */}
      <div className="draggable" />

      {errorMessage && (
        <ErrorModal
          message={errorMessage}
          onClose={() => setErrorMessage(null)}
          onUpdateApiKey={
            // Prefer the structured reason; fall back to the message heuristic
            // for errors that predate the taxonomy (or IPC-layer failures).
            errorReason === "no_key" ||
            (!errorReason && generationErrorSuggestsApiKeyIssue(errorMessage))
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
        {pipelineStatus === "downloading" && pipelineProgress.label !== "" && (
          <TitleBarStatus
            label={pipelineProgress.label}
            fraction={pipelineProgress.fraction}
            isError={false}
          />
        )}

        {/* Both surfaces stay mounted; the inactive one is display:none, not
            unmounted. Switching modes therefore never discards the other's
            state — a drafted shot list, generated article images, or an
            in-flight batch all survive a trip to Concept and back. */}
        <div className={cn("flex flex-1 min-h-0 flex-col", mode !== "concept" && "hidden")}>
          <Gallery
            plates={gallery}
            generating={isGenerating}
            selectedId={selectedPlateId}
            onSelect={(id) => setSelectedPlateId((cur) => (cur === id ? null : id))}
            onOpenHistory={openHistory}
            onZoom={setLightbox}
            onSave={savePlate}
            onClear={clearGallery}
            savedIds={savedIds}
            mockMode={mockMode}
            examples={EXAMPLE_PROMPTS}
            onPickExample={setPrompt}
          />
        </div>
        <div className={cn("flex-1 min-h-0 pt-14", mode !== "article" && "hidden")}>
          <ArticlePanel
            style={selectedStyle}
            onZoom={setLightbox}
            avatarReady={avatarReady}
            onNeedAvatar={() => setAvatarModal("setup")}
            onDirtyChange={setArticleDirty}
          />
        </div>
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
  onClear,
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
  onClear: () => void
  savedIds: Set<string>
  mockMode: boolean
  examples: string[]
  onPickExample: (text: string) => void
}) {
  const [confirmClear, setConfirmClear] = useState(false)
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

        {plates.length > 0 &&
          (confirmClear ? (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Clear all?</span>
              <button
                type="button"
                onClick={() => {
                  setConfirmClear(false)
                  onClear()
                }}
                className="h-7 rounded-md px-2 font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="h-7 rounded-md px-2 text-muted-foreground transition-colors hover:bg-foreground/5"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="h-7 rounded-md px-2 text-xs text-muted-foreground transition-[transform,color,background-color] hover:bg-foreground/5 hover:text-foreground active:scale-[0.97]"
            >
              Clear
            </button>
          ))}
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
