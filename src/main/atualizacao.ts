/**
 * Auto-update pelo GitHub Releases (repositório público LuizKirsch/fma, configurado em electron-builder.yml).
 * Só no app instalado: confere ao abrir e a cada 4 h, baixa em segundo plano e pergunta se reinicia.
 * Se a pessoa escolher "Depois", instala quando o FMA fechar.
 */
import { app, dialog } from "electron"
import { autoUpdater } from "electron-updater"

export function iniciarAtualizacao() {
  if (!app.isPackaged) return
  autoUpdater.on("update-downloaded", async (info) => {
    const r = await dialog.showMessageBox({
      type: "info",
      buttons: ["Reiniciar agora", "Depois"],
      defaultId: 0,
      cancelId: 1,
      message: `FMA ${info.version} está pronto para instalar`,
      detail: "Tasks em andamento são retomadas quando o FMA abrir de novo. Se escolher Depois, a atualização entra quando você fechar o FMA.",
    })
    if (r.response === 0) autoUpdater.quitAndInstall()
  })
  autoUpdater.on("error", (e) => console.error("[atualização]", e.message))
  const conferir = () => void autoUpdater.checkForUpdates().catch(() => {}) // sem internet: tenta na próxima
  conferir()
  setInterval(conferir, 4 * 60 * 60 * 1000)
}
