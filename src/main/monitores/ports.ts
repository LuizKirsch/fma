/**
 * O que os monitores pedem ao motor de tasks e à mesa (preencher com `configurarMonitores` na inicialização):
 *  - mesaPronta: nº de cartas na mesa e se o fluxo é válido (RF 5.21).
 *  - criarTask: cria a task do card com o time da mesa (RF 6.04). Se `iniciarAgora`, o motor começa a task na hora
 *    ou a põe na fila se não houver vaga. `cartaInicialId` fixa por qual carta começa (null = começo do fluxo). Devolve o id.
 *  - retomarTask: dá mais uma volta à task travada e entrega `resposta` à carta com problema; o motor também
 *    resolve o chamado do Maestro (RF 5.20).
 * O motor, por sua vez, chama em ./servico: `aoComecar(taskId)`, `aoConcluir(taskId, { prUrl })`, `aoTravar(taskId, duvida)`
 * (movem o card e comentam) e escuta `eventosMonitor`.
 */
import { EventEmitter } from "node:events"
import type { Monitor } from "@shared/monitor"

export interface DepsMonitor {
  mesaPronta(projetoId: string): { cartas: number; fluxoValido: boolean; erro?: string }
  criarTask(p: { projetoId: string; monitorId: string; titulo: string; descricao: string; url: string; /** Identidade da task (owner/repo#n): gravar como task.referencia. */ referencia?: string; cartaInicialId: string | null; iniciarAgora: boolean }): string
  retomarTask(taskId: string, resposta: string): void
}

let deps: DepsMonitor | undefined
export const configurarMonitores = (d: DepsMonitor) => { deps = d }
export function depsMonitor(): DepsMonitor {
  if (!deps) throw new Error("Monitores não configurados: chame configurarMonitores() na inicialização.")
  return deps
}

export type EventoMonitor =
  | { tipo: "checagem"; monitor: Monitor; criadas: string[]; retomadas: string[]; resultado: string }
  | { tipo: "erro-board"; monitorId: string; taskId: string; erro: string }
export const eventosMonitor = new EventEmitter<{ evento: [EventoMonitor] }>()
export const emitirMonitor = (e: EventoMonitor) => eventosMonitor.emit("evento", e)
