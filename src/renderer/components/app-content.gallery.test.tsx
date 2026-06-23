import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

vi.mock("@/gen/ipc", () => ({
  ipc: {
    app: {
      GetHistory: vi.fn(),
      GetHistoryItem: vi.fn(),
      ClearHistory: vi.fn(),
      SaveIcon: vi.fn(),
      GenerateIcon: vi.fn(),
      PickReferenceImage: vi.fn(),
    },
  },
}))

import { ipc } from "@/gen/ipc"
import { useGallery, useGeneration } from "./app-content.hooks"

const app = ipc.app as unknown as Record<string, ReturnType<typeof vi.fn>>

const genOpts = (over: Partial<Parameters<typeof useGeneration>[0]> = {}) => ({
  avatarReady: true,
  onNeedAvatar: vi.fn(),
  selectedStyle: "marker",
  selectedStyleLabel: "Marker",
  refinePlateSrc: undefined,
  onVariants: vi.fn(),
  onError: vi.fn(),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  app.GetHistory.mockResolvedValue({ items: [] })
  app.ClearHistory.mockResolvedValue({})
})

describe("useGallery", () => {
  it("appendVariants prepends new plates, newest first, and marks dirty", async () => {
    const { result } = renderHook(() => useGallery())
    await waitFor(() => expect(app.GetHistory).toHaveBeenCalled())
    act(() => result.current.appendVariants(["a", "b"], { idea: "x", look: "marker" }))
    expect(result.current.plates.map((p) => p.src)).toEqual(["a", "b"])
    expect(result.current.dirty).toBe(true)
  })

  it("does not duplicate history tiles when the load effect double-fires (StrictMode)", async () => {
    app.GetHistory.mockResolvedValue({
      items: [{ id: "1", prompt: "p", style: "marker", thumbB64: "T", count: 1 }],
    })
    const { result, rerender } = renderHook(() => useGallery())
    await waitFor(() => expect(result.current.plates.length).toBe(1))
    // Simulate the StrictMode second mount-effect run.
    rerender()
    await waitFor(() => expect(app.GetHistory).toHaveBeenCalled())
    expect(result.current.plates.filter((p) => p.id === "h-1").length).toBe(1)
  })

  it("appendVariants keeps full-res src and swaps in a downscaled thumbnail", async () => {
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 1536
      naturalHeight = 1024
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0)
      }
    }
    vi.stubGlobal("Image", FakeImage)
    const proto = HTMLCanvasElement.prototype as unknown as {
      getContext: unknown
      toDataURL: unknown
    }
    const origGetContext = proto.getContext
    const origToDataURL = proto.toDataURL
    proto.getContext = () => ({ drawImage: () => {} })
    proto.toDataURL = () => "data:image/jpeg;base64,THUMB"

    const { result } = renderHook(() => useGallery())
    await waitFor(() => expect(app.GetHistory).toHaveBeenCalled())
    act(() => result.current.appendVariants(["FULLRES"], { idea: "x", look: "marker" }))
    await waitFor(() => expect(result.current.plates[0].thumbSrc).toBe("data:image/jpeg;base64,THUMB"))
    // Full-res is preserved for the lightbox / refine reference.
    expect(result.current.plates[0].src).toBe("FULLRES")

    proto.getContext = origGetContext
    proto.toDataURL = origToDataURL
    vi.unstubAllGlobals()
  })

  it("save() records the plate as saved and reports the path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) })
    )
    app.SaveIcon.mockResolvedValue({
      error: "",
      canceled: false,
      imagePath: "/out/x.png",
      savedPath: "/out",
    })
    const { result } = renderHook(() => useGallery())
    await waitFor(() => expect(app.GetHistory).toHaveBeenCalled())
    act(() => result.current.appendVariants(["a"], { idea: "x", look: "marker" }))
    const plate = result.current.plates[0]
    let res!: Awaited<ReturnType<typeof result.current.save>>
    await act(async () => {
      res = await result.current.save(plate)
    })
    expect(res.status).toBe("saved")
    expect(res.imagePath).toBe("/out/x.png")
    expect(result.current.savedIds.has(plate.id)).toBe(true)
    vi.unstubAllGlobals()
  })
})

describe("useGeneration", () => {
  it("calls onNeedAvatar and does not generate without an avatar", () => {
    const onNeedAvatar = vi.fn()
    const { result } = renderHook(() => useGeneration(genOpts({ avatarReady: false, onNeedAvatar })))
    act(() => result.current.setPrompt("a cat"))
    act(() => result.current.start())
    expect(onNeedAvatar).toHaveBeenCalled()
    expect(app.GenerateIcon).not.toHaveBeenCalled()
  })

  it("hands finished variants to onVariants on success", async () => {
    app.GenerateIcon.mockResolvedValue({ images: ["AAAA"], error: "", errorReason: "" })
    const onVariants = vi.fn()
    const { result } = renderHook(() => useGeneration(genOpts({ onVariants })))
    act(() => result.current.setPrompt("a cat"))
    act(() => result.current.start())
    await waitFor(() => expect(onVariants).toHaveBeenCalled())
    const [variants, meta] = onVariants.mock.calls[0]
    expect(variants).toEqual(["data:image/png;base64,AAAA"])
    expect(meta).toEqual({ idea: "a cat", look: "Marker" })
  })

  it("surfaces a failure via onError with the structured reason", async () => {
    app.GenerateIcon.mockResolvedValue({
      images: [],
      error: "No OpenRouter API key.",
      errorReason: "no_key",
    })
    const onError = vi.fn()
    const { result } = renderHook(() => useGeneration(genOpts({ onError })))
    act(() => result.current.setPrompt("a cat"))
    act(() => result.current.start())
    await waitFor(() => expect(onError).toHaveBeenCalled())
    const [message, reason] = onError.mock.calls[0]
    expect(reason).toBe("no_key")
    expect(message).toContain("No OpenRouter API key")
  })
})
