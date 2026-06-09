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
  /** Up to 3 generated 16:9 PNG data-URLs (shown in the preview and saved as-is). */
  variants: (string | null)[]
  /**
   * Same images as `variants` — kept as a separate field so existing callers
   * that distinguish "preview" from "save" data keep working. Illustrations are
   * saved exactly as generated (no masking), so the two are identical.
   */
  rawVariants: (string | null)[]
  generate: (prompt: string, referenceDataUrl?: string) => void
  cancel: () => void
}

// ── Blob/data URL → base64 helper ──────────────────────────────────────────

async function blobUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Strip the "data:<mime>;base64," prefix.
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
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
  const [rawVariants, setRawVariants] = useState<(string | null)[]>([null, null, null])

  // Set when the user clicks Stop while a request is in flight.
  const cancelledRef = useRef(false)

  const cancel = useCallback(() => {
    cancelledRef.current = true
  }, [])

  const generate = useCallback(async (prompt: string, referenceDataUrl?: string) => {
    cancelledRef.current = false
    setVariants([null, null, null])
    setRawVariants([null, null, null])
    setStatus("generating")
    setProgress({ fraction: 0, label: "" })

    try {
      // Convert an optional per-generation reference (blob/data URL) to raw base64.
      let referenceImage = ""
      if (referenceDataUrl) {
        try {
          referenceImage = await blobUrlToBase64(referenceDataUrl)
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
      })

      if (cancelledRef.current) {
        setStatus("idle")
        setProgress({ fraction: 0, label: "" })
        return
      }

      if (response.error) {
        setStatus("error")
        setProgress({ fraction: 0, label: `Error: ${response.error}` })
        return
      }

      const next: (string | null)[] = [null, null, null]
      for (let i = 0; i < Math.min(response.images.length, 3); i++) {
        next[i] = `data:image/png;base64,${response.images[i]}`
      }
      setVariants(next)
      setRawVariants(next)
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

  return { status, progress, variants, rawVariants, generate, cancel }
}
