/**
 * IPC do Maestro. Chame uma vez no index.ts: `const maestro = registrarIpcMaestro(db, janela, motor)`
 * e use o retorno para ligar o motor (chamar, avisarLimiteTokens, resolverFora).
 * Canais (invoke): maestro:abrir(projetoId), maestro:estado(projetoId), maestro:enviar(projetoId, texto),
 * maestro:agir(mensagemId, acaoId), maestro:nao-lidas(projetoId), maestro:resolver-fora(projetoId, taskId?).
 * Evento para a interface: CANAL_EVENTO_MAESTRO ("maestro:evento"), tipo EventoMaestro.
 */
import { ipcMain } from "electron"
import type { DatabaseSync } from "node:sqlite"
import { CANAL_EVENTO_MAESTRO, type EventoMaestro } from "@shared/maestro"
import { criarMaestro, type Maestro } from "./maestro"
import type { MotorApi } from "./motor-api"

/** O mínimo de uma BrowserWindow que o Maestro usa. */
export interface JanelaMinima {
  isDestroyed(): boolean
  webContents: { send(canal: string, ...args: unknown[]): void }
}

export function registrarIpcMaestro(db: DatabaseSync, janela: JanelaMinima, motor: MotorApi): Maestro {
  const emitir = (e: EventoMaestro) => { if (!janela.isDestroyed()) janela.webContents.send(CANAL_EVENTO_MAESTRO, e) }
  const m = criarMaestro(db, motor, emitir)
  ipcMain.handle("maestro:abrir", (_e, projetoId: string) => m.abrir(projetoId))
  ipcMain.handle("maestro:estado", (_e, projetoId: string) => m.estado(projetoId))
  ipcMain.handle("maestro:enviar", (_e, projetoId: string, texto: string) => m.enviar(projetoId, texto))
  ipcMain.handle("maestro:agir", (_e, mensagemId: string, acaoId: string) => m.agir(mensagemId, acaoId))
  ipcMain.handle("maestro:nao-lidas", (_e, projetoId: string) => m.naoLidas(projetoId))
  ipcMain.handle("maestro:resolver-fora", (_e, projetoId: string, taskId?: string) => m.resolverFora(projetoId, taskId))
  return m
}
