import { useCallback, useEffect, useRef, useState } from "react"
import { ipc } from "@/gen/ipc"
import { useIconPipeline, type PipelineProgress, type PipelineStatus } from "@/lib/icon-pipeline"
import type { StyleOption } from "@/components/style-picker"
import type { OpenAIApiKeyManageReason } from "@/components/openai-api-key-modals"

/** One illustration in the gallery. A `historyId` tile is a collapsed past
 *  generation (thumbnail); clicking it expands its full variants. */
export interface Plate {
  id: string
  src: string
  idea: string
  look: string
  /** Set when this tile is a persisted past generation loaded from history. */
  historyId?: string
  /** Number of variants in that past generation (for the ×N badge). */
  count?: number
}

/**
 * Cap on the in-memory session gallery. Each full-res variant is a multi-MB
 * base64 string PLUS a decoded bitmap in the DOM, and the array was previously
 * never trimmed — a long session could climb to several GB. Plates beyond this
 * are dropped from the grid (oldest first); they remain in the on-disk history
 * store and reload as thumbnails, so nothing is lost. Newest plates (the user's
 * current work, prepended) are always kept.
 */
export const MAX_GALLERY_PLATES = 60

// Deep hooks extracted from AppContent (RFC #4). Each owns one cohesive slice
// of state + its IPC + mount effect behind a small return surface, so the view
// component is left to composition. They live in their own module (not the
// .tsx) so that file exports only the component — required for React Fast
// Refresh — and so each slice is testable in isolation with a mocked ipc client.

/**
 * The persistent reference-character avatar: readiness, preview data-URL, and
 * the setup/settings modal state. Loads on mount; gates first-run setup.
 */
export function useAvatar() {
  const [ready, setReady] = useState(false)
  const [src, setSrc] = useState<string | null>(null)
  const [modal, setModal] = useState<"setup" | "settings" | null>(null)

  const refresh = useCallback((gateOnFirstRun = false) => {
    ipc.app
      .GetAvatar({})
      .then((r) => {
        setReady(r.hasAvatar)
        if (r.hasAvatar && r.imageB64) {
          setSrc(`data:${r.mime || "image/png"};base64,${r.imageB64}`)
        } else {
          setSrc(null)
        }
        if (gateOnFirstRun && !r.hasAvatar) setModal("setup")
      })
      .catch(() => {})
  }, [])

  // Avatar gate: open the blocking setup modal on first run.
  useEffect(() => {
    refresh(true)
  }, [refresh])

  return { ready, src, modal, setModal, refresh }
}

/** The look library + current selection (loaded on mount). */
export function useStyles() {
  const [styles, setStyles] = useState<StyleOption[]>([])
  const [selected, setSelected] = useState("")

  useEffect(() => {
    ipc.app
      .GetStyles({})
      .then((r) => {
        setStyles(r.styles)
        if (r.styles.length > 0) setSelected((cur) => cur || r.styles[0].id)
      })
      .catch(() => {})
  }, [])

  const label = styles.find((s) => s.id === selected)?.label ?? selected
  return { styles, selected, setSelected, label }
}

/** Single-concept vs whole-article batch mode. */
export function useAppMode() {
  const [mode, setMode] = useState<"concept" | "article">("concept")
  return { mode, setMode }
}

/**
 * API-key gate: the mock-mode badge plus the startup/manage key modals. Probes
 * provider key status on mount and opens the blocking startup modal when a key
 * is required but missing.
 */
export function useApiKeyGate() {
  const [mockMode, setMockMode] = useState(false)
  const [startupOpen, setStartupOpen] = useState(false)
  const [manageReason, setManageReason] = useState<OpenAIApiKeyManageReason | null>(null)

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
        // Only the mock provider shows the placeholder badge — Codex (free sub)
        // also needs no key but is real generation.
        setMockMode(resp.isMock ?? resp.is_mock ?? false)
        if (required === true && hasKey !== true) {
          setStartupOpen(true)
        }
      })
      .catch(() => {})
  }, [])

  return { mockMode, startupOpen, setStartupOpen, manageReason, setManageReason }
}

export interface SaveResult {
  status: "saved" | "canceled" | "error"
  savedPath?: string
  imagePath?: string
  message?: string
}

/**
 * The session gallery + history grid: the plate list, selection, saved-tracking,
 * the StrictMode-safe history load, and the append/expand/clear/save mutations.
 * The grid IS the history. Save returns a result the caller maps to its modals.
 */
export function useGallery() {
  const [plates, setPlates] = useState<Plate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  // Mints unique ids for fresh plates (shared by generation + history expand).
  const counterRef = useRef(0)

  // Past generations → the grid.
  useEffect(() => {
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
        setPlates((g) => {
          const have = new Set(g.map((p) => p.id))
          const add = hist.filter((p) => !have.has(p.id))
          return add.length ? [...g, ...add].slice(0, MAX_GALLERY_PLATES) : g
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

  /** Append freshly-generated variants as new plates (newest first, capped). */
  const appendVariants = useCallback(
    (variants: string[], meta: { idea: string; look: string }) => {
      const fresh: Plate[] = variants.map((src) => ({
        id: `p${++counterRef.current}`,
        src,
        idea: meta.idea,
        look: meta.look,
      }))
      if (fresh.length === 0) return
      setPlates((g) => [...fresh, ...g].slice(0, MAX_GALLERY_PLATES))
      // Don't auto-select: leave Generate as "Generate" for the next idea.
      setSelectedId(null)
    },
    []
  )

  /** Expand a collapsed history tile into its full-res variants. */
  const openHistory = useCallback(async (plate: Plate) => {
    if (!plate.historyId) return
    try {
      const res = await ipc.app.GetHistoryItem({ id: plate.historyId })
      if (res.images.length === 0) return
      const fresh: Plate[] = res.images.map((b) => ({
        id: `p${++counterRef.current}`,
        src: `data:image/png;base64,${b}`,
        idea: plate.idea,
        look: plate.look,
      }))
      setPlates((g) =>
        [...fresh, ...g.filter((p) => p.id !== plate.id)].slice(0, MAX_GALLERY_PLATES)
      )
      setSavedIds((prev) => {
        const next = new Set(prev)
        for (const p of fresh) next.add(p.id)
        return next
      })
      setSelectedId(null)
    } catch {
      /* ignore */
    }
  }, [])

  /** Clear the whole gallery — also wipes the persisted history on disk. */
  const clear = useCallback(async () => {
    await ipc.app.ClearHistory({}).catch(() => {})
    setPlates([])
    setSavedIds(new Set())
    setSelectedId(null)
  }, [])

  /** Export a plate to a user-chosen file; records it as saved on success. */
  const save = useCallback(async (plate: Plate): Promise<SaveResult> => {
    try {
      const buffer = await (await fetch(plate.src)).arrayBuffer()
      const saved = await ipc.app.SaveIcon({ imageData: new Uint8Array(buffer) })
      if (saved.error) return { status: "error", message: saved.error }
      if (!saved.canceled && saved.imagePath) {
        setSavedIds((prev) => new Set(prev).add(plate.id))
        return { status: "saved", savedPath: saved.savedPath, imagePath: saved.imagePath }
      }
      return { status: "canceled" }
    } catch {
      return { status: "error", message: "Could not save the illustration." }
    }
  }, [])

  const selected = plates.find((p) => p.id === selectedId) ?? null
  const dirty = plates.some((p) => !savedIds.has(p.id))

  return {
    plates,
    selectedId,
    setSelectedId,
    savedIds,
    selected,
    dirty,
    appendVariants,
    openHistory,
    clear,
    save,
  }
}

interface UseGenerationOptions {
  avatarReady: boolean
  onNeedAvatar: () => void
  selectedStyle: string
  selectedStyleLabel: string
  /** The selected plate's src to refine from, else undefined (uses attachment). */
  refinePlateSrc: string | undefined
  /** Hand finished variants to the gallery. */
  onVariants: (variants: string[], meta: { idea: string; look: string }) => void
  /** Surface a generation failure (message + structured reason). */
  onError: (message: string, reason: string) => void
}

/**
 * Single-concept generation: the prompt, pasted/attached references, the icon
 * pipeline, and the status→result edge-detection that hands finished variants
 * to the gallery (via onVariants) or surfaces an error (via onError).
 */
export function useGeneration(opts: UseGenerationOptions) {
  const [prompt, setPrompt] = useState("")
  const [attachments, setAttachments] = useState<string[]>([])
  const pipeline = useIconPipeline()
  const prevStatusRef = useRef<PipelineStatus>(pipeline.status)
  // Metadata captured at generate time so finished plates caption correctly.
  // null when the next "done" came from loading history rather than generating.
  const pendingMetaRef = useRef<{ idea: string; look: string } | null>(null)
  // Latest callbacks, read inside the effect without re-subscribing each render.
  const optsRef = useRef(opts)
  optsRef.current = opts

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      for (const url of prev) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url)
      }
      return []
    })
  }, [])

  // Pipeline status → results. On a fresh generation completing, hand the new
  // variants to the gallery; errors are surfaced to the caller.
  useEffect(() => {
    const was = prevStatusRef.current
    prevStatusRef.current = pipeline.status
    if (was === pipeline.status) return

    if (pipeline.status === "done") {
      const meta = pendingMetaRef.current
      pendingMetaRef.current = null
      if (!meta) return // came from loadVariants (history), not a generation
      const variants = pipeline.variants.filter((v): v is string => v !== null)
      if (variants.length === 0) return
      optsRef.current.onVariants(variants, meta)
      clearAttachments()
    } else if (pipeline.status === "error") {
      pendingMetaRef.current = null
      const raw = pipeline.progress.label
      optsRef.current.onError(
        raw.startsWith("Error: ") ? raw.slice(7) : raw,
        pipeline.errorReason || ""
      )
    }
  }, [pipeline.status, pipeline.variants, pipeline.progress.label, pipeline.errorReason, clearAttachments])

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

  const attachFromPicker = async () => {
    try {
      const res = await ipc.app.PickReferenceImage({})
      if (res.canceled || !res.imageB64) return
      setAttachments((prev) => [...prev, `data:${res.mime || "image/png"};base64,${res.imageB64}`])
    } catch {
      /* ignore — the user can retry */
    }
  }

  const removeAttachment = (index: number) =>
    setAttachments((prev) => prev.filter((_, i) => i !== index))

  const start = () => {
    if (!prompt.trim() || pipeline.status === "generating") return
    if (!opts.avatarReady) {
      opts.onNeedAvatar()
      return
    }
    // Refine from the chosen plate if one is selected; else an attached reference.
    const reference = opts.refinePlateSrc ?? attachments[0]
    pendingMetaRef.current = { idea: prompt.trim(), look: opts.selectedStyleLabel }
    pipeline.generate(prompt, reference, opts.selectedStyle)
  }

  const stop = () => pipeline.cancel()

  return {
    prompt,
    setPrompt,
    attachments,
    isGenerating: pipeline.status === "generating",
    status: pipeline.status as PipelineStatus,
    progress: pipeline.progress as PipelineProgress,
    start,
    stop,
    attachFromPicker,
    removeAttachment,
  }
}
