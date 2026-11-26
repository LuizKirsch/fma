/**
 * Tipos do motor de tasks (módulo 6) trocados entre núcleo e interface.
 * Eventos do motor chegam à janela pelo canal CANAL_MOTOR.
 */
import type { CliId } from "./ia"
import type { Esforco } from "./conta"

export const CANAL_MOTOR = "motor:evento"

export type SituacaoTask = "pronta" | "fila" | "andamento" | "aguardando" | "revisao" | "concluida" | "parada"
/** Estado de uma carta dentro da task (RF 3.28 mostra isso embaixo da carta). */
export type EstadoCarta = "espera" | "pronta" | "trabalhando" | "questionando" | "concluida"
export type TipoEvento =
  | "missao" | "plano" | "trabalho" | "entrega" | "pergunta" | "resposta" | "devolucao"
  | "aprovacao" | "decisao" | "aviso" | "fim" | "console"

export interface DecisaoPendente {
  motivo: string
  /** Carta com problema. */
  cartaId: string
  /** Carta que devolveu. */
  questionadorId: string
}

export interface Task {
  id: string
  numero: number
  projetoId: string
  /** Task de ajuste: a task concluída que ela ajusta (RF 6.34). */
  taskOriginalId: string | null
  referencia: string | null
  titulo: string | null
  missao: string
  ajustes: string
  /** Contexto da task: editável só antes de iniciar. */
  contexto: string
  /** Card da fonte (spec) em texto legível; buscado na importação e ao iniciar. */
  card?: string | null
  situacao: SituacaoTask
  branch: string | null
  worktree: string | null
  voltas: number
  tokens: number
  alertaOrcamento: boolean
  /** Posição na fila do projeto, a partir de 1 (RF 8.07); null fora da fila. */
  posicaoFila: number | null
  decisao: DecisaoPendente | null
  /** PR aberto ao aceitar a task. */
  prUrl: string | null
  criadaEm: number
  iniciadaEm: number | null
  encerradaEm: number | null
}

/** A carta como estava no começo da task (RF 1.33). */
export interface CopiaCarta {
  nome: string
  classe: string
  simbolo: string
  cor: string
  cli: CliId
  modelo: string
  metodos: string[]
  skills: string[]
  /** Prompt final (principal + adicionais ligados). */
  prompt: string
  /** Conta e esforço no começo da task; ausentes em task antiga (usa a padrão e o esforço alto). */
  contaId?: string | null
  esforco?: Esforco
}

export interface TaskCarta {
  id: string
  taskId: string
  cartaId: string
  retirada: boolean
  comeca: boolean
  concluida: boolean
  estado: EstadoCarta
  /** Frase curta do que a carta faz agora (RF 3.28). */
  atividade: string
  tarefa: string | null
  entrega: string | null
  /** Voltas que esta carta, como quem questiona, já devolveu. */
  voltas: number
  copia: CopiaCarta | null
}

export interface TaskConexao {
  id: string
  taskId: string
  deCartaId: string
  paraCartaId: string
  tipo: "entrega" | "questiona"
  ordem: number
  skills: string[]
}

export interface EventoTask {
  id: string
  taskId: string
  tipo: TipoEvento
  deCartaId: string | null
  paraCartaId: string | null
  texto: string
  tokens: number | null
  criadoEm: number
}

export interface DetalheTask {
  task: Task
  cartas: TaskCarta[]
  conexoes: TaskConexao[]
  eventos: EventoTask[]
}

export interface NovaTask {
  projetoId: string
  missao: string
  titulo?: string
  referencia?: string
  contexto?: string
  /** Cartas por onde a task manual começa (RF 6.02). Vazio: o começo natural do fluxo. */
  comecaPor?: string[]
}

/** Task que usa uma carta (RF 1.34). */
export interface TaskUsandoCarta { id: string; numero: number; titulo: string | null; referencia: string | null; situacao: SituacaoTask }

/** Time da task antes de iniciar: já sem as cartas tiradas e com o fluxo religado (RF 6.06 a 6.10). */
export interface PreviaTask {
  cartas: { id: string; nome: string; classe: string; orquestrador: boolean; retirada: boolean }[]
  conexoes: { de: string; para: string; tipo: "entrega" | "questiona"; ordem: number }[]
  erros: string[]
  avisos: string[]
}

/** Mudanças da branch da task contra a base (task em revisão). */
export interface DiffTask {
  arquivos: { caminho: string; adicionadas: number; removidas: number }[]
  patch: string
}

/** Tudo que o motor manda à janela, no canal CANAL_MOTOR. */
export type EventoMotor =
  | { tipo: "task"; task: Task }
  | { tipo: "carta"; taskId: string; cartaId: string; estado: EstadoCarta; atividade: string }
  | { tipo: "evento"; evento: EventoTask }
  | { tipo: "console"; taskId: string; cartaId: string | null; canal: "stdout" | "stderr"; linha: string }
  /** Task parou esperando decisão (RF 8.20); a interface soma as pendências (RF 8.21). */
  /** A fila do projeto mudou (RF 8.07): posição de cada task, a partir de 1. */
  | { tipo: "fila"; projetoId: string; posicoes: { taskId: string; posicao: number }[] }
  | { tipo: "decisao"; taskId: string; projetoId: string; decisao: DecisaoPendente }
