import { useCallback, useEffect, useState } from "react"
import { ipc } from "@/gen/ipc"
import type { StyleOption } from "@/components/style-picker"
import type { OpenAIApiKeyManageReason } from "@/components/openai-api-key-modals"

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
