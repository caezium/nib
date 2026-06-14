import { useCallback, useEffect, useRef, useState } from "react"
import { Clock, Download } from "lucide-react"
import { MacOSIcon } from "@/components/macos-icon"
import { HistoryPanel } from "@/components/history-panel"
import {
  OpenAIApiKeyManageModal,
  OpenAIApiKeyStartupModal,
  type OpenAIApiKeyManageReason,
} from "@/components/openai-api-key-modals"
import { PromptInput, type PrimaryAction } from "@/components/prompt-input"
import { ErrorModal, generationErrorSuggestsApiKeyIssue } from "@/components/error-modal"
import { SaveSuccessModal } from "@/components/save-success-modal"
import { AvatarSetupModal } from "@/components/avatar-setup-modal"
import { ArticlePanel } from "@/components/article-panel"
import { StylePicker, type StyleOption } from "@/components/style-picker"
import { TitleBarStatus } from "@/components/title-bar-status"
import type { IconState } from "@/components/icon-types"
import { useIconPipeline } from "@/lib/icon-pipeline"
import { ipc } from "@/gen/ipc"
import { cn } from "@/lib/utils"

type ResumeAfterCancel = "idle" | "generated" | "refine"

export function AppContent() {
  const [iconState, setIconState] = useState<IconState>("idle")
  const [prompt, setPrompt] = useState("")
  const [attachments, setAttachments] = useState<string[]>([])
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null)
  const [baseIconSrc, setBaseIconSrc] = useState<string | null>(null)
  // Unmasked square version of baseIconSrc, used when writing the .icns file.
  const [rawBaseIconSrc, setRawBaseIconSrc] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<{ folderPath: string; imagePath: string } | null>(
    null
  )
  const [iconDirty, setIconDirty] = useState(false)
  const [openAIApiKeyStartupOpen, setOpenAIApiKeyStartupOpen] = useState(false)
  const [openAIApiKeyManageReason, setOpenAIApiKeyManageReason] =
    useState<OpenAIApiKeyManageReason | null>(null)
  // Avatar gate: the persistent reference character. Blocking on first run.
  const [avatarReady, setAvatarReady] = useState(false)
  const [avatarModal, setAvatarModal] = useState<"setup" | "settings" | null>(null)
  // True when the mock provider is active (placeholder images, no API calls).
  const [mockMode, setMockMode] = useState(false)
  // Generation history drawer.
  const [historyOpen, setHistoryOpen] = useState(false)
  // Single-concept vs whole-article batch mode.
  const [mode, setMode] = useState<"concept" | "article">("concept")
  // Look library + current selection.
  const [styles, setStyles] = useState<StyleOption[]>([])
  const [selectedStyle, setSelectedStyle] = useState("")
  const resumeAfterCancelRef = useRef<ResumeAfterCancel>("idle")

  const pipeline = useIconPipeline()
  const prevPipelineStatusRef = useRef(pipeline.status)

  useEffect(() => {
    ipc.app
      .GetOpenAIApiKeyStatus({})
      .then((s) => {
        const resp = s as unknown as {
          openaiKeyRequired?: boolean
          openai_key_required?: boolean
          hasOpenaiKey?: boolean
          has_openai_key?: boolean
        }
        const required = resp.openaiKeyRequired ?? resp.openai_key_required
        const hasKey = resp.hasOpenaiKey ?? resp.has_openai_key
        // A key is required for every real provider; only mock needs none.
        setMockMode(required === false)
        if (required === true && hasKey !== true) {
          setOpenAIApiKeyStartupOpen(true)
        }
      })
      .catch(() => {})

    // Avatar gate: open the blocking setup modal on first run.
    ipc.app
      .GetAvatar({})
      .then((r) => {
        setAvatarReady(r.hasAvatar)
        if (!r.hasAvatar) setAvatarModal("setup")
      })
      .catch(() => {})

    // Look library.
    ipc.app
      .GetStyles({})
      .then((r) => {
        setStyles(r.styles)
        if (r.styles.length > 0) setSelectedStyle((cur) => cur || r.styles[0].id)
      })
      .catch(() => {})
  }, [])

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      for (const url of prev) URL.revokeObjectURL(url)
      return []
    })
  }, [])

  // Sync iconState with pipeline status changes.
  useEffect(() => {
    if (pipeline.status === "done") {
      const hasAny = pipeline.variants.some((v) => v !== null)
      setIconState(hasAny ? "generated" : "idle")
    } else if (pipeline.status === "error") {
      // Restore the icon display to what it was before generation started.
      setIconState(resumeAfterCancelRef.current)
      // Surface the error in a modal. Strip the "Error: " prefix added by the pipeline.
      const raw = pipeline.progress.label
      setErrorMessage(raw.startsWith("Error: ") ? raw.slice(7) : raw)
    }
  }, [pipeline.status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const was = prevPipelineStatusRef.current
    prevPipelineStatusRef.current = pipeline.status
    if (pipeline.status !== "done") return
    if (!pipeline.variants.some((v) => v !== null)) return
    if (was !== "done") {
      setIconDirty(true)
    }
  }, [pipeline.status, pipeline.variants])

  useEffect(() => {
    ipc.app.SetUnsavedIconState({ unsaved: iconDirty }).catch(() => {})
  }, [iconDirty])

  const startGeneration = () => {
    if (!prompt.trim() || iconState === "generating") return
    if (!avatarReady) {
      setAvatarModal("setup")
      return
    }
    resumeAfterCancelRef.current =
      iconState === "refine" ? "refine" : iconState === "generated" ? "generated" : "idle"
    setSelectedVariant(null)
    setIconState("generating")
    // In refine mode the confirmed variant is the reference; otherwise use the
    // user-attached image (if any).
    const referenceImage = iconState === "refine" ? (baseIconSrc ?? attachments[0]) : attachments[0]
    pipeline.generate(prompt, referenceImage, selectedStyle)
  }

  const stopGeneration = () => {
    pipeline.cancel()
    setIconState(resumeAfterCancelRef.current)
  }

  const confirmSelectedVariant = () => {
    if (iconState !== "generated" || selectedVariant === null) return
    setIconDirty(true)
    setBaseIconSrc(pipeline.variants[selectedVariant])
    setRawBaseIconSrc(pipeline.rawVariants[selectedVariant])
    setIconState("refine")
    setSelectedVariant(null)
    setPrompt("")
    clearAttachments()
  }

  const handleSave = async () => {
    // The chosen 16:9 illustration is saved exactly as generated.
    const src =
      iconState === "refine"
        ? rawBaseIconSrc
        : selectedVariant !== null
          ? pipeline.rawVariants[selectedVariant]
          : null
    if (!src) return

    try {
      // Fetch the data URL and convert to Uint8Array for IPC transfer.
      const response = await fetch(src)
      const buffer = await response.arrayBuffer()
      const imageData = new Uint8Array(buffer)
      const saved = await ipc.app.SaveIcon({ imageData })
      if (!saved.canceled && saved.imagePath) {
        setIconDirty(false)
        setSaveSuccess({ folderPath: saved.savedPath, imagePath: saved.imagePath })
      }
    } catch {
      // Silently ignore IPC errors.
    }
  }

  const openHistoryItem = useCallback(
    async (id: string) => {
      try {
        const res = await ipc.app.GetHistoryItem({ id })
        if (res.images.length === 0) return
        const urls = res.images.map((b) => `data:image/png;base64,${b}`)
        setMode("concept")
        setSelectedVariant(null)
        pipeline.loadVariants(urls)
        setIconState("generated")
        setHistoryOpen(false)
      } catch {
        /* ignore */
      }
    },
    [pipeline]
  )

  const inputPlaceholder =
    iconState === "refine"
      ? "Refine this illustration, or describe a new idea…"
      : "Describe the idea to illustrate…"

  const primaryAction: PrimaryAction =
    iconState === "generating"
      ? "stop"
      : iconState === "generated" && selectedVariant !== null
        ? "select"
        : iconState === "generated" && selectedVariant === null
          ? "refresh"
          : "submit"

  const primaryEnabled =
    iconState === "generating"
      ? true
      : primaryAction === "select"
        ? selectedVariant !== null
        : primaryAction === "refresh" || primaryAction === "submit"
          ? prompt.trim().length > 0
          : false

  const onPrimary = () => {
    if (primaryAction === "stop") {
      stopGeneration()
      return
    }
    if (primaryAction === "select") {
      confirmSelectedVariant()
      return
    }
    startGeneration()
  }

  const canSave = iconState === "refine" && rawBaseIconSrc != null

  const showStatus =
    pipeline.status === "downloading" && pipeline.progress.label !== ""

  return (
    <div className="dark flex flex-col h-screen bg-background text-foreground overflow-hidden">
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
            setAvatarReady(true)
            setAvatarModal(null)
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

      {/* macOS traffic-light spacer (also serves as the drag region). */}
      <div className="draggable" />

      {/* Mock-mode badge — placeholder images, no API calls. */}
      {mockMode && (
        <div className="absolute top-3 left-24 z-50 non-draggable">
          <span className="inline-flex items-center h-6 px-2 rounded-md text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Mock mode · placeholder images
          </span>
        </div>
      )}

      {/* Compact title-bar status: progress line + label. */}
      {showStatus && (
        <TitleBarStatus
          label={pipeline.progress.label}
          fraction={pipeline.progress.fraction}
          isError={pipeline.status === "error"}
        />
      )}

      {/* Mode toggle — top center. */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 non-draggable">
        <div className="flex items-center gap-0.5 rounded-lg bg-secondary/50 p-0.5 text-xs">
          {(["concept", "article"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "px-3 h-7 rounded-md font-medium transition-colors capitalize",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Top-right: history + save (Save is concept-only; article cards save individually). */}
      <div className="absolute top-3 right-3 z-50 flex items-center gap-2 non-draggable">
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          title="History"
          aria-label="History"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
        >
          <Clock className="w-4 h-4" />
        </button>
        {mode === "concept" && (
          <button
            disabled={!canSave}
            onClick={handleSave}
            className={cn(
              "flex items-center gap-2 px-4 h-8 rounded-lg text-sm font-medium transition-all duration-200",
              canSave
                ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] shadow-md"
                : "bg-secondary/30 text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            <Download className="w-3.5 h-3.5" />
            Save
          </button>
        )}
      </div>

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onOpenItem={openHistoryItem}
      />

      {mode === "concept" ? (
        <div className="flex flex-1 min-h-0 flex-col px-6 pt-16 pb-4 gap-4">
          {/* Preview fills the available space, vertically centered. */}
          <div className="flex flex-1 min-h-0 items-center justify-center">
            <MacOSIcon
              state={iconState}
              selected={selectedVariant}
              onSelect={setSelectedVariant}
              variants={pipeline.variants}
              baseIconSrc={baseIconSrc}
            />
          </div>

          {/* Controls pinned at the bottom. */}
          <div className="flex shrink-0 flex-col items-center gap-3">
            <StylePicker
              styles={styles}
              value={selectedStyle}
              onChange={setSelectedStyle}
              disabled={iconState === "generating"}
            />
            <PromptInput
              value={prompt}
              onChange={setPrompt}
              primaryAction={primaryAction}
              onPrimary={onPrimary}
              primaryEnabled={primaryEnabled}
              onRegenerate={primaryAction === "select" ? startGeneration : undefined}
              regenerateEnabled={prompt.trim().length > 0}
              inputDisabled={iconState === "generating"}
              placeholder={inputPlaceholder}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              onOpenApiKeySettings={() => setOpenAIApiKeyManageReason("settings")}
              onOpenAvatarSettings={() => setAvatarModal("settings")}
            />
          </div>
        </div>
      ) : (
        <ArticlePanel style={selectedStyle} styles={styles} onStyleChange={setSelectedStyle} />
      )}
    </div>
  )
}
