import { useCallback, useRef, useState } from "react"
import { ipc } from "@/gen/ipc"

// ── Types ──────────────────────────────────────────────────────────────────

export type PipelineStatus =
  | "idle"
  | "downloading"
  | "generating"
  | "done"
  | "error"

export interface PipelineProgress {
  /** Overall 0–1 fraction across all active phases. */
  fraction: number
  /** Human-readable message. */
  label: string
}

export interface IconPipeline {
  status: PipelineStatus
  progress: PipelineProgress
  /**
   * Machine-readable failure class from the last error (GenerateIconResponse
   * error_reason): no_key | no_credits | cli_missing | timeout |
   * unsupported_model | declined | unknown. Empty unless status === "error".
   */
  errorReason: string
  /**
   * Up to 3 generated 16:9 PNG data-URLs, shown in the preview and saved exactly
   * as generated. (The icon app kept a separate unmasked copy for .icns export;
   * illustrations need no masking, so there is a single array now.)
   */
  variants: (string | null)[]
  generate: (prompt: string, referenceDataUrl?: string, style?: string) => void
  cancel: () => void
  /** Load a past generation's variants into the preview (from history). */
  loadVariants: (dataUrls: string[]) => void
}

// ── Blob/data URL → base64 helper ──────────────────────────────────────────

/** Decode a blob/data URL to raw base64 plus its MIME type (for the provider). */
async function blobUrlToBase64(url: string): Promise<{ b64: string; mime: string }> {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Strip the "data:<mime>;base64," prefix.
      const comma = result.indexOf(",")
      const b64 = comma >= 0 ? result.slice(comma + 1) : result
      resolve({ b64, mime: blob.type || "image/png" })
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useIconPipeline(): IconPipeline {
  const [status, setStatus] = useState<PipelineStatus>("idle")
  const [progress, setProgress] = useState<PipelineProgress>({ fraction: 0, label: "" })
  const [variants, setVariants] = useState<(string | null)[]>([null, null, null])
  const [errorReason, setErrorReason] = useState("")

  // Set when the user clicks Stop while a request is in flight.
  const cancelledRef = useRef(false)

  const cancel = useCallback(() => {
    cancelledRef.current = true
  }, [])

  const generate = useCallback(async (prompt: string, referenceDataUrl?: string, style?: string) => {
    cancelledRef.current = false
    setVariants([null, null, null])
    setStatus("generating")
    setProgress({ fraction: 0, label: "" })
    setErrorReason("")

    try {
      // Convert an optional per-generation reference (blob/data URL) to raw
      // base64, preserving its MIME so a non-PNG attachment isn't mislabeled.
      let referenceImage = ""
      let referenceMime = ""
      if (referenceDataUrl) {
        try {
          const decoded = await blobUrlToBase64(referenceDataUrl)
          referenceImage = decoded.b64
          referenceMime = decoded.mime
        } catch {
          // Non-fatal: proceed without the extra reference image.
        }
      }

      if (cancelledRef.current) {
        setStatus("idle")
        return
      }

      const response = await ipc.app.GenerateIcon({
        prompt,
        negativePrompt: "",
        referenceImage,
        seed: 0,
        variantCount: 0, // 0 = default (3)
        style: style ?? "",
        referenceMime,
      })

      if (cancelledRef.current) {
        setStatus("idle")
        setProgress({ fraction: 0, label: "" })
        return
      }

      if (response.error) {
        setStatus("error")
        setErrorReason(response.errorReason || "")
        setProgress({ fraction: 0, label: `Error: ${response.error}` })
        return
      }

      const next: (string | null)[] = [null, null, null]
      for (let i = 0; i < Math.min(response.images.length, 3); i++) {
        next[i] = `data:image/png;base64,${response.images[i]}`
      }
      setVariants(next)
      setStatus("done")
      setProgress({ fraction: 1, label: "" })
    } catch (err) {
      if (cancelledRef.current) {
        setStatus("idle")
        setProgress({ fraction: 0, label: "" })
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[pipeline] IPC call failed:", err)
      setStatus("error")
      setProgress({ fraction: 0, label: `Error: ${msg}` })
    }
  }, [])

  const loadVariants = useCallback((dataUrls: string[]) => {
    cancelledRef.current = true // drop any in-flight generation
    const next: (string | null)[] = [null, null, null]
    for (let i = 0; i < Math.min(dataUrls.length, 3); i++) next[i] = dataUrls[i]
    setVariants(next)
    setStatus("done")
    setProgress({ fraction: 1, label: "" })
  }, [])

  return { status, progress, variants, errorReason, generate, cancel, loadVariants }
}
