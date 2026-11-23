/**
 * Tipos do que o preload expõe em `window.tako`.
 * Mantenha este arquivo igual ao que `src/preload/preload.ts` publica.
 */
export interface TakoBridge {
  platform: string;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
}

declare global {
  interface Window {
    tako: TakoBridge;
  }
}
