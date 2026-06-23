import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"

// Mock the generated IPC client before importing the hooks under test.
vi.mock("@/gen/ipc", () => ({
  ipc: {
    app: {
      GetAvatar: vi.fn(),
      GetStyles: vi.fn(),
      GetOpenAIApiKeyStatus: vi.fn(),
    },
  },
}))

import { ipc } from "@/gen/ipc"
import { useStyles, useApiKeyGate, useAvatar } from "./app-content.hooks"

const app = ipc.app as unknown as {
  GetAvatar: ReturnType<typeof vi.fn>
  GetStyles: ReturnType<typeof vi.fn>
  GetOpenAIApiKeyStatus: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("useStyles", () => {
  it("loads styles and defaults the selection to the first id", async () => {
    app.GetStyles.mockResolvedValue({
      styles: [
        { id: "marker", label: "Marker" },
        { id: "riso", label: "Riso" },
      ],
    })
    const { result } = renderHook(() => useStyles())
    await waitFor(() => expect(result.current.styles.length).toBe(2))
    expect(result.current.selected).toBe("marker")
    expect(result.current.label).toBe("Marker")
  })
})

describe("useApiKeyGate", () => {
  it("opens the startup modal when a key is required but missing", async () => {
    app.GetOpenAIApiKeyStatus.mockResolvedValue({
      openaiKeyRequired: true,
      hasOpenaiKey: false,
      isMock: false,
    })
    const { result } = renderHook(() => useApiKeyGate())
    await waitFor(() => expect(result.current.startupOpen).toBe(true))
    expect(result.current.mockMode).toBe(false)
  })

  it("stays closed for the mock provider", async () => {
    app.GetOpenAIApiKeyStatus.mockResolvedValue({
      openaiKeyRequired: false,
      hasOpenaiKey: false,
      isMock: true,
    })
    const { result } = renderHook(() => useApiKeyGate())
    await waitFor(() => expect(result.current.mockMode).toBe(true))
    expect(result.current.startupOpen).toBe(false)
  })
})

describe("useAvatar", () => {
  it("exposes the avatar src + readiness from GetAvatar", async () => {
    app.GetAvatar.mockResolvedValue({ hasAvatar: true, imageB64: "AAAA", mime: "image/png" })
    const { result } = renderHook(() => useAvatar())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.src).toBe("data:image/png;base64,AAAA")
  })

  it("opens setup on first run when no avatar is set", async () => {
    app.GetAvatar.mockResolvedValue({ hasAvatar: false })
    const { result } = renderHook(() => useAvatar())
    await waitFor(() => expect(result.current.modal).toBe("setup"))
  })
})
