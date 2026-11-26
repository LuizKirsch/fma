/**
 * IPC do motor de tasks. Chame `registrarIpcMotor(db, janela)` em index.ts depois de abrir o banco.
 * Canais (ipcMain.handle):
 *  E2/E3: tasks:criar, tasks:iniciar, tasks:parar, tasks:liberar, tasks:listar, tasks:obter, tasks:eventos, tasks:validar, tasks:pendencias.
 *  E4: tasks:iniciar-todas(projetoId) [RF 6.13], tasks:descartar(id) [6.17], tasks:tirar-da-fila(id) [6.16],
 *      tasks:tirar-carta(taskId, cartaId) [6.06], tasks:devolver-carta(taskId, cartaId) [6.07], tasks:previa(taskId) [trilha antes de iniciar],
 *      tasks:reabrir(id) [6.41], tasks:diff(id), tasks:aceitar(id, "pr"|"merge"), tasks:pedir-ajuste(id, texto) [revisão; tasks:descartar também apaga a branch de uma task em revisão], tasks:buscar(projetoId, termo) [8.06], tasks:carta-em-uso(cartaId) [1.34], tasks:andar-fila(projetoId) [6.15].
 *  `tasks:validar(projetoId, taskId?)`: com taskId, vale o time da task (sem as cartas tiradas).
 * Eventos para a janela: canal CANAL_MOTOR, formato EventoMotor (shared/task.ts); `{ tipo: "fila" }` traz a posição de cada task (RF 8.07).
 */
import { ipcMain, type BrowserWindow } from "electron"
import type { DatabaseSync } from "node:sqlite"
import { CANAL_MOTOR, type EventoMotor, type NovaTask } from "@shared/task"
import { buscarTasks, cartaEmUso, contarPendencias, detalheDaTask, lerEventos, listarTasks } from "./dados"
import {
  andarFila, aoEmitir, criarTask, descartarTask, devolverCarta, iniciarTask, iniciarTodas, liberarMaisUmaVolta,
  pararTask, seguirMesmoAssim, aceitarTask, diffDaTask, pedirAjuste, previaDaTask, reabrirTask, revisarTask, tirarCarta, tirarDaFila, validarMesa,
} from "./motor"

export function registrarIpcMotor(db: DatabaseSync, janela: BrowserWindow | (() => BrowserWindow | null)) {
  const alvo = () => (typeof janela === "function" ? janela() : janela)
  aoEmitir((e: EventoMotor) => {
    const j = alvo()
    if (j && !j.isDestroyed()) j.webContents.send(CANAL_MOTOR, e)
  })
  ipcMain.handle("tasks:criar", (_e, n: NovaTask) => criarTask(db, n))
  ipcMain.handle("tasks:iniciar", (_e, id: string) => iniciarTask(db, id))
  ipcMain.handle("tasks:parar", (_e, id: string) => pararTask(db, id))
  ipcMain.handle("tasks:liberar", (_e, id: string, resposta?: string) => liberarMaisUmaVolta(db, id, resposta))
  ipcMain.handle("tasks:seguir", (_e, id: string) => seguirMesmoAssim(db, id))
  ipcMain.handle("tasks:listar", (_e, projetoId?: string) => listarTasks(db, projetoId))
  ipcMain.handle("tasks:obter", (_e, id: string) => detalheDaTask(db, id))
  /** Console incluído (RF 8.12); `depois` é o criadoEm do último evento já recebido. */
  ipcMain.handle("tasks:eventos", (_e, id: string, opcoes?: { console?: boolean; depois?: number }) => lerEventos(db, id, opcoes))
  ipcMain.handle("tasks:validar", (_e, projetoId: string, taskId?: string) => validarMesa(db, projetoId, taskId))
  ipcMain.handle("tasks:pendencias", (_e, projetoId?: string) => contarPendencias(db, projetoId))

  ipcMain.handle("tasks:iniciar-todas", (_e, projetoId: string) => iniciarTodas(db, projetoId))
  ipcMain.handle("tasks:descartar", (_e, id: string) => descartarTask(db, id))
  ipcMain.handle("tasks:tirar-da-fila", (_e, id: string) => tirarDaFila(db, id))
  ipcMain.handle("tasks:tirar-carta", (_e, taskId: string, cartaId: string) => tirarCarta(db, taskId, cartaId))
  ipcMain.handle("tasks:devolver-carta", (_e, taskId: string, cartaId: string) => devolverCarta(db, taskId, cartaId))
  ipcMain.handle("tasks:diff", (_e, id: string) => diffDaTask(db, id))
  ipcMain.handle("tasks:aceitar", (_e, id: string, modo: "pr" | "merge" | "nada") => aceitarTask(db, id, modo))
  ipcMain.handle("tasks:pedir-ajuste", (_e, id: string, texto: string) => pedirAjuste(db, id, texto))
  ipcMain.handle("tasks:previa", (_e, taskId: string) => previaDaTask(db, taskId))
  ipcMain.handle("tasks:reabrir", (_e, id: string) => reabrirTask(db, id))
  ipcMain.handle("tasks:revisar", (_e, id: string) => revisarTask(db, id))
  ipcMain.handle("tasks:buscar", (_e, projetoId: string, termo: string) => buscarTasks(db, projetoId, termo))
  ipcMain.handle("tasks:carta-em-uso", (_e, cartaId: string) => cartaEmUso(db, cartaId))
  /** Chame depois de aumentar as vagas do projeto: começa as da fila que passaram a caber. */
  ipcMain.handle("tasks:andar-fila", (_e, projetoId: string) => andarFila(db, projetoId))
}
