/**
 * O que a camada de apoio pede ao motor de tasks e à mesa (preencher com `configurarApoio` na inicialização):
 *  - cartasDaMesa: cartas do time na mesa do projeto (liga a ferramenta a quem costuma usar, RN 39).
 *  - task: dados da task para o PR (pasta do repositório, base, branch do trabalho, task original se for ajuste, se já começou).
 *  - cronica: grava uma linha na Crônica da task (RF 4.15).
 * O motor, por sua vez, chama daqui: `ferramentasDaCarta` (config MCP + contexto, RF 4.14), `registrarUso` (RF 4.15),
 * `proporEscrita` (escrita pendente) e escuta `eventosApoio` ("escrita-pendente")
 * para o Maestro chamar o usuário (RF 4.19).
 */
import { EventEmitter } from "node:events"
import type { ClasseId } from "@shared/catalogo"
import type { Artefato } from "@shared/apoio"

export interface DepsApoio {
  cartasDaMesa(projetoId: string): { id: string; classe: ClasseId }[]
  task(taskId: string): { projetoId: string; repo: string; ambiente: string; base: string; branch: string; taskOriginalId: string | null; iniciada: boolean } | undefined
  cronica(taskId: string, texto: string): void
}

let deps: DepsApoio | undefined
export const configurarApoio = (d: DepsApoio) => { deps = d }
export function depsApoio(): DepsApoio {
  if (!deps) throw new Error("Camada de apoio não configurada: chame configurarApoio() na inicialização.")
  return deps
}

export type EventoApoio =
  | { tipo: "escrita-pendente"; artefato: Artefato; emProducao: boolean }
  | { tipo: "escrita-resolvida"; artefato: Artefato }
  | { tipo: "uso"; artefato: Artefato }
export const eventosApoio = new EventEmitter<{ evento: [EventoApoio] }>()
export const emitirApoio = (e: EventoApoio) => eventosApoio.emit("evento", e)
