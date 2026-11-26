/**
 * Build do FMA com electron-vite: três alvos no mesmo arquivo.
 * - main: o núcleo (banco, CLIs, MCP), roda no Node do Electron.
 * - preload: a ponte segura que expõe `window.fma` para a interface.
 * - renderer: a interface em React, com o visual do protótipo.
 * Tudo sai em `out/`. `src/shared` é usado pelos três.
 */
import { resolve } from "node:path"
import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const shared = { "@shared": resolve(__dirname, "src/shared") }

// Política de segurança da interface: só carrega o que vem do próprio app.
// Entra só no build; no `npm run dev` o Vite precisa de scripts inline para a recarga automática.
const csp = {
  name: "fma-csp",
  apply: "build" as const,
  transformIndexHtml: (html: string) =>
    html.replace(
      "<head>",
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:">`,
    ),
}

export default defineConfig({
  main: {
    resolve: { alias: shared },
    // node:sqlite é do próprio Node do Electron: não entra no pacote.
    build: { rollupOptions: { external: ["node:sqlite"] } },
  },
  preload: {
    resolve: { alias: shared },
  },
  renderer: {
    resolve: { alias: { ...shared, "@": resolve(__dirname, "src/renderer/src") } },
    plugins: [react(), tailwindcss(), csp],
  },
})
