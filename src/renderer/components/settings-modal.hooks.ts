import { useEffect, useState } from "react"
import { ipc } from "@/gen/ipc"

// ── Settings domain types ────────────────────────────────────────────────────

export type ApiKeyKind = "openrouter" | "openai" | "empty"
export type FreeBackendPreference = "codex" | "gemini"

export type ImageSettings = {
  backend: string
  model: string
  /** Text model that drafts an article's shot list (OpenRouter lane). */
  textModel: string
  codexAvailable: boolean
  /** Why the Codex lane is / isn't usable: ok | no-cli | logged-out | needs-update. */
  codexStatus: string
  geminiAvailable: boolean
  freeBackendPreference: FreeBackendPreference
  hasKey: boolean
  suggestedModels: string[]
  suggestedTextModels: string[]
}

export function keyKind(value: string): ApiKeyKind {
  const trimmed = value.trim()
  if (!trimmed) return "empty"
  return trimmed.startsWith("sk-or-") ? "openrouter" : "openai"
}

function normalizeFreeBackendPreference(value: string | undefined): FreeBackendPreference {
  return value === "gemini" ? "gemini" : "codex"
}

// ── Deep hooks (RFC #4) ──────────────────────────────────────────────────────
// Each owns one slice of state + its IPC + transitions behind a small surface,
// so SettingsModal is reduced to composition and the slices are testable in
// isolation (renderHook + a mocked ipc client). They live in their own module
// (not settings-modal.tsx) so that file exports only the component — required
// for React Fast Refresh to work without forcing full reloads.

/** Telemetry opt-out: tri-state (null = loading → switch disabled). */
export function useTelemetryOptOut() {
  const [optOut, setOptOut] = useState<boolean | null>(null)
  useEffect(() => {
    ipc.app
      .GetTelemetryOptOut({})
      .then((r) => {
        const resp = r as unknown as { optOut?: boolean; opt_out?: boolean }
        setOptOut(resp.optOut ?? resp.opt_out ?? false)
      })
      .catch(() => setOptOut(false))
  }, [])
  const toggle = () => {
    if (optOut === null) return
    const next = !optOut
    setOptOut(next)
    ipc.app.SetTelemetryOptOut({ optOut: next }).catch(() => {})
  }
  return { optOut, on: optOut === false, toggle }
}

/** Image settings: load (with snake/camel normalization), whole-object save. */
export function useImageSettings() {
  const [img, setImg] = useState<ImageSettings | null>(null)
  useEffect(() => {
    ipc.app
      .GetImageSettings({})
      .then((r) => {
        const resp = r as unknown as {
          backend?: string
          model?: string
          codexAvailable?: boolean
          codex_available?: boolean
          codexStatus?: string
          codex_status?: string
          geminiAvailable?: boolean
          gemini_available?: boolean
          freeBackendPreference?: string
          free_backend_preference?: string
          hasKey?: boolean
          has_key?: boolean
          suggestedModels?: string[]
          suggested_models?: string[]
          textModel?: string
          text_model?: string
          suggestedTextModels?: string[]
          suggested_text_models?: string[]
        }
        setImg({
          backend: resp.backend || "auto",
          model: resp.model || "",
          textModel: resp.textModel ?? resp.text_model ?? "",
          codexAvailable: resp.codexAvailable ?? resp.codex_available ?? false,
          codexStatus: resp.codexStatus ?? resp.codex_status ?? "",
          geminiAvailable: resp.geminiAvailable ?? resp.gemini_available ?? false,
          freeBackendPreference: normalizeFreeBackendPreference(
            resp.freeBackendPreference ?? resp.free_backend_preference
          ),
          hasKey: resp.hasKey ?? resp.has_key ?? false,
          suggestedModels: resp.suggestedModels ?? resp.suggested_models ?? [],
          suggestedTextModels: resp.suggestedTextModels ?? resp.suggested_text_models ?? [],
        })
      })
      .catch(() => {})
  }, [])
  const save = (next: ImageSettings) => {
    setImg(next)
    ipc.app
      .SetImageSettings({
        backend: next.backend,
        model: next.model,
        textModel: next.textModel,
        freeBackendPreference: next.freeBackendPreference,
      })
      .catch(() => {})
  }
  /** Keep the derived hasKey flag in sync after the key changes elsewhere. */
  const setHasKey = (hasKey: boolean) =>
    setImg((cur) => (cur ? { ...cur, hasKey } : cur))
  return { img, save, setHasKey }
}

/** API-key field: draft-vs-saved tracking + save/clear state machine. */
export function useApiKey(onHasKeyChange: (hasKey: boolean) => void) {
  const [apiKey, setApiKey] = useState("")
  const [draft, setDraftState] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    ipc.app
      .GetStoredOpenAIApiKey({})
      .then((r) => {
        const s = r.apiKey ?? ""
        setApiKey(s)
        setDraftState(s)
      })
      .catch(() => {})
  }, [])
  const setDraft = (value: string) => {
    setDraftState(value)
    setSaved(false)
    setError(null)
  }
  const dirty = draft.trim() !== apiKey
  const canSave = dirty && !busy
  const save = async () => {
    if (!canSave) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const trimmed = draft.trim()
    try {
      const res = await ipc.app.SetOpenAIApiKey({ apiKey: trimmed })
      if (res.error) {
        setError(res.error)
      } else {
        setApiKey(trimmed)
        setDraftState(trimmed)
        onHasKeyChange(trimmed.length > 0)
        setSaved(true)
      }
    } catch {
      setError("Could not save the API key.")
    } finally {
      setBusy(false)
    }
  }
  const clear = async () => {
    setDraftState("")
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await ipc.app.SetOpenAIApiKey({ apiKey: "" })
      if (res.error) {
        setError(res.error)
      } else {
        setApiKey("")
        onHasKeyChange(false)
        setSaved(true)
      }
    } catch {
      setError("Could not clear the API key.")
    } finally {
      setBusy(false)
    }
  }
  return {
    apiKey,
    draft,
    setDraft,
    kind: keyKind(draft),
    canSave,
    busy,
    error,
    saved,
    visible,
    toggleVisible: () => setVisible((v) => !v),
    save,
    clear,
  }
}
