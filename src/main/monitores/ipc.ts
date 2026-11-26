/**
 * IPC dos monitores. Chamar `registrarIpcMonitores(db, janela)` no index.ts (junto de configurarMonitores e iniciarAgendador).
 * Canais "monitores:*" (invoke) e o evento "monitores:evento" (main -> janela) com cada EventoMonitor.
 */
import { ipcMain, type BrowserWindow } from "electron"
import type { DatabaseSync } from "node:sqlite"
import { conectoresDeFontes } from "./conector"
import { atualizarMonitor, checar, conectores, criarMonitor, excluirMonitor, listarMonitores, type NovoMonitor } from "./servico"
import { eventosMonitor, type EventoMonitor } from "./ports"

export function registrarIpcMonitores(db: DatabaseSync, janela: BrowserWindow): () => void {
  const h = (canal: string, fn: (...a: any[]) => unknown) => ipcMain.handle(canal, (_e, ...a) => fn(...a))
  h("monitores:conectores", () => [...conectores().map((c) => ({ id: c.id, nome: c.nome })), ...conectoresDeFontes(db)])
  h("monitores:listar", (projetoId: string) => listarMonitores(db, projetoId))
  h("monitores:criar", (n: NovoMonitor) => criarMonitor(db, n))
  h("monitores:atualizar", (id: string, p: Parameters<typeof atualizarMonitor>[2]) => atualizarMonitor(db, id, p))
  h("monitores:excluir", (id: string) => (excluirMonitor(db, id), { ok: true, valor: null }))
  h("monitores:buscar-agora", (id: string) => checar(db, id, true))

  const aoEvento = (e: EventoMonitor) => { if (!janela.isDestroyed()) janela.webContents.send("monitores:evento", e) }
  eventosMonitor.on("evento", aoEvento)
  return () => eventosMonitor.off("evento", aoEvento)
}
