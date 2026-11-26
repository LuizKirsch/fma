/// <reference types="vite/client" />
// Tipo do que o preload expõe na janela (src/preload/index.ts).
import type { FmaApi } from "@shared/tipos"

declare global {
  interface Window {
    fma: FmaApi
  }
}

export {}
