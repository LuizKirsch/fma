/**
 * Processo principal do Tako (Electron).
 *
 * Aqui mora o "núcleo": é o único lado com acesso ao sistema (processos, git,
 * CLIs de IA, servidores MCP). A interface não fala com o sistema direto; ela
 * pede pra este processo pelo preload. Por enquanto ele só abre a janela.
 */
import { app, BrowserWindow, shell } from "electron";
import path from "node:path";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Tako",
    backgroundColor: "#1B2328", // ardósia do Tako, evita o flash branco ao abrir
    show: false,
    webPreferences: {
      // A interface roda isolada: sem Node, sem acesso direto ao sistema.
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Só mostra a janela quando o conteúdo já está pronto.
  win.once("ready-to-show", () => win.show());

  // Link externo abre no navegador do sistema, nunca dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  // macOS: clicar no ícone do dock sem janela aberta cria uma nova.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows e Linux fecham o app junto com a última janela; no macOS o app continua no dock.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
