/**
 * IPC das cartas de apoio. Chamar `registrarIpcApoio(db, janela)` no index.ts (junto de configurarApoio).
 * Canais "apoio:*" (invoke) e o evento "apoio:evento" (main -> janela) com cada EventoApoio.
 * Os handlers devolvem Resultado<T> ({ ok, valor } | { ok: false, erro }).
 */
import { ipcMain, type BrowserWindow } from "electron"
import type { DatabaseSync } from "node:sqlite"
import { TIPOS_APOIO } from "@shared/apoio"
import { atualizarCartaApoio, criarCartaApoio, desligarNaTask, desligadasNaTask, ferramentasUsadas, listarCartasApoio, removerCartaApoio, cartaApoioPorId, type NovaCartaApoio } from "./repo"
import { artefatosDaTask, descartar, escritasPendentes } from "./artefatos"
import { confirmar } from "./escrita"
import { listarFerramentas } from "./mcp"
import { excluirMemoria, listarMemoria, salvarMemoria } from "./memoria"
import { eventosApoio, type EventoApoio } from "./ports"

const ok = <T>(valor: T) => ({ ok: true as const, valor })

export function registrarIpcApoio(db: DatabaseSync, janela: BrowserWindow): () => void {
  const h = (canal: string, fn: (...a: any[]) => unknown) => ipcMain.handle(canal, (_e, ...a) => fn(...a))
  h("apoio:catalogo", () => TIPOS_APOIO)
  h("apoio:listar", (projetoId: string) => listarCartasApoio(db, projetoId))
  h("apoio:criar", (n: NovaCartaApoio) => criarCartaApoio(db, n))
  h("apoio:atualizar", (id: string, p: Parameters<typeof atualizarCartaApoio>[2]) => atualizarCartaApoio(db, id, p))
  h("apoio:remover", (id: string) => (removerCartaApoio(db, id), ok(null)))
  h("apoio:ferramentas-mcp", async (id: string) => {
    const mcp = cartaApoioPorId(db, id)?.mcp
    if (!mcp) return { ok: false, erro: "Esta carta de apoio não tem servidor MCP." }
    try { return ok(await listarFerramentas(mcp)) } catch (e) { return { ok: false, erro: e instanceof Error ? e.message : String(e) } }
  })
  h("apoio:desligar-na-task", (taskId: string, id: string, desligado: boolean) => desligarNaTask(db, taskId, id, desligado))
  h("apoio:da-task", (taskId: string) => ({ artefatos: artefatosDaTask(db, taskId), desligadas: desligadasNaTask(db, taskId), usadas: ferramentasUsadas(db, taskId) }))
  h("apoio:pendentes", (taskId?: string) => escritasPendentes(db, taskId))
  h("apoio:confirmar", (id: string) => confirmar(db, id))
  h("apoio:descartar", (id: string) => descartar(db, id))
  h("apoio:memoria-listar", (projetoId: string) => listarMemoria(db, projetoId))
  h("apoio:memoria-salvar", (projetoId: string, titulo: string, texto: string, id?: string) => {
    const r = salvarMemoria(db, projetoId, titulo, texto, id)
    return typeof r === "string" ? { ok: false, erro: r } : ok(r)
  })
  h("apoio:memoria-excluir", (id: string) => (excluirMemoria(db, id), ok(null)))

  const aoEvento = (e: EventoApoio) => { if (!janela.isDestroyed()) janela.webContents.send("apoio:evento", e) }
  eventosApoio.on("evento", aoEvento)
  return () => eventosApoio.off("evento", aoEvento)
}
