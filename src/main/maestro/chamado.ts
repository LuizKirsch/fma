/**
 * Regras puras do chat do Maestro (sem banco, sem Electron): ciclo de vida do chamado,
 * não lidas, rota do ajuste e o atalho "nova task:". Só importa tipos, para o self-check rodar no Node puro.
 */
import type { MensagemChat, SituacaoTask } from "@shared/maestro"

type Msg = Pick<MensagemChat, "autor" | "lida" | "resolvida" | "acoes" | "projetoId" | "taskId">

/** Chamado = mensagem do Maestro com botões ainda não usados. */
export const estaAberto = (m: Msg) => m.autor === "maestro" && !m.resolvida && m.acoes.length > 0

/** RF 7.20: a ação só vale se o chamado está aberto e tem esse botão. */
export const podeAgir = (m: Msg, acaoId: string) => estaAberto(m) && m.acoes.some((a) => a.id === acaoId)

/** RF 7.21 / 7.20: resolver tira os botões e marca como resolvida. */
export const resolver = <T extends Msg>(m: T): T => ({ ...m, resolvida: true, acoes: [] })

/** RF 7.04 / RN 87: só mensagens do Maestro contam. */
export const contarNaoLidas = (ms: Msg[], projetoId?: string) =>
  ms.filter((m) => m.autor === "maestro" && !m.lida && (!projetoId || m.projetoId === projetoId)).length

/** Chamados abertos que um evento de fora resolve (RN 86). Sem taskId, todos do projeto. */
export const chamadosResolvidosFora = <T extends Msg>(ms: T[], projetoId: string, taskId?: string) =>
  ms.filter((m) => m.projetoId === projetoId && estaAberto(m) && (!taskId || m.taskId === taskId))

export type RotaAjuste = "anotar" | "repassar" | "abrir_task" | "recusar"

/** RN 76-78: o que fazer com um ajuste conforme a situação da task. */
export function rotaAjuste(s: SituacaoTask): RotaAjuste {
  if (s === "pronta" || s === "fila") return "anotar"
  if (s === "andamento" || s === "aguardando") return "repassar"
  if (s === "concluida" || s === "revisao") return "abrir_task"
  return "recusar" // parada: é reaberta (RF 6.41), não recebe ajuste
}

/** RF 7.15: a missão escrita depois de "nova task:". */
export function extrairNovaTask(texto: string): string | null {
  const m = /^\s*nova\s+task\s*:\s*([\s\S]+)$/i.exec(texto)
  return m && m[1].trim() ? m[1].trim() : null
}

/** RF 6.40: avisa uma vez quando passa do limite. */
export const deveAvisarTokens = (tokens: number, limite: number | null, jaAvisou: boolean) =>
  limite != null && limite > 0 && tokens > limite && !jaAvisou

/** RN 80: "<nome> · <referência>". */
export const rotuloTask = (t: { orquestradorNome: string; referencia: string | null; numero: number }) =>
  `${t.orquestradorNome} · ${t.referencia ?? `#${t.numero}`}`

/** Acha a task por id, referência (sem diferenciar caixa) ou #número. */
export function acharTask<T extends { id: string; referencia: string | null; numero: number }>(ts: T[], ref: string): T | undefined {
  const r = ref.trim().toLowerCase().replace(/^#/, "")
  return ts.find((t) => t.id === ref || t.referencia?.toLowerCase() === r || String(t.numero) === r)
}
