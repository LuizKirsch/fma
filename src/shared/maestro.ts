/** Tipos do Maestro (módulo 7) compartilhados entre o núcleo e a interface. */

export type SituacaoTask = "pronta" | "fila" | "andamento" | "aguardando" | "revisao" | "concluida" | "parada"

export type TipoMensagem = "alerta" | "ok" | "info"

/** Botão de um chamado. `id` é o que a interface devolve em `maestro:agir`. */
export interface AcaoChamado {
  id: "confirmar" | "recusar" | "parar" | "liberar" | "seguir" | "manter"
  rotulo: string
}

/** O que uma proposta faz quando confirmada. */
export type TipoProposta = "ajuste" | "tirar_carta" | "parar_tokens"

export interface MensagemChat {
  id: string
  projetoId: string
  taskId: string | null
  autor: "voce" | "maestro"
  texto: string
  tipo: TipoMensagem | null
  acoes: AcaoChamado[]
  resolvida: boolean
  propostaTipo: TipoProposta | null
  propostaTexto: string | null
  propostaCartaId: string | null
  artefatoId: string | null
  lida: boolean
  criadoEm: number
}

export interface PedidoRapido {
  id: string
  rotulo: string
  texto: string
  /** true: só preenche o campo (falta o usuário completar), não envia. */
  preencher?: boolean
}

/** RF 7.19 */
export const PEDIDOS_RAPIDOS: PedidoRapido[] = [
  { id: "como-estao", rotulo: "Como estão as tasks?", texto: "Como estão as tasks?" },
  { id: "liberar", rotulo: "Liberar a travada", texto: "Libere mais uma volta na task travada." },
  { id: "nova", rotulo: "Nova task", texto: "nova task: ", preencher: true },
  { id: "parar", rotulo: "Parar a travada", texto: "Pare a task travada." },
]

export interface EstadoChat {
  /** false enquanto não houver carta de Orquestrador na mesa (RF 7.02). */
  disponivel: boolean
  motivo?: string
  orquestrador?: { nome: string; cli: string; modelo: string }
  mensagens: MensagemChat[]
  pedidos: PedidoRapido[]
}

export type ResultadoMaestro<T = void> = { ok: true; valor: T } | { ok: false; erro: string }

/** Evento enviado à interface em `CANAL_EVENTO_MAESTRO`. */
export type EventoMaestro =
  | { tipo: "mensagem"; mensagem: MensagemChat }
  | { tipo: "atualizada"; mensagem: MensagemChat }
  | { tipo: "nao-lidas"; projetoId: string; total: number }
  | { tipo: "digitando"; projetoId: string; ativo: boolean }

export const CANAL_EVENTO_MAESTRO = "maestro:evento"
