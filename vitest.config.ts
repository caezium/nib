import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import * as path from "node:path"

// Renderer unit tests run under jsdom. The `@` alias mirrors tsconfig/vite so
// hooks can import `@/gen/ipc` etc. and have it mocked via vi.mock.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src/renderer") },
  },
  test: {
    environment: "jsdom",
    include: ["src/renderer/**/*.test.{ts,tsx}"],
  },
})
