/**
 * O que o Maestro precisa do motor de tasks. O motor real implementa esta interface depois;
 * o Maestro não conhece o motor além disto. Métodos que falham devem lançar Error com
 * mensagem legível (ela vai para o chat).
 */
import type { CliId } from "@shared/ia"
import type { SituacaoTask } from "@shared/maestro"

export interface TaskInfo {
  id: string
  projetoId: string
  numero: number
  referencia: string | null
  titulo: string | null
  missao: string
  /** Ajustes acumulados, na ordem pedida (RN 79). */
  ajustes: string | null
  situacao: SituacaoTask
  tokens: number
  voltas: number
  /** Etapa/carta em que a task está, em texto livre. */
  etapa: string | null
  /** Cartas trabalhando agora e cartas que ainda faltam. */
  trabalhando: string[]
  faltam: string[]
  /** Por que está aguardando o usuário (decisao_motivo). */
  decisaoMotivo: string | null
  pr: { url: string; estado: string } | null
  taskOriginalId: string | null
  /** Nome do Orquestrador da task; o Maestro mostra "<nome> · <referência>" (RN 80). */
  orquestradorNome: string
  cartas: { id: string; nome: string; classe: string }[]
}

export interface OrquestradorInfo {
  cartaId: string
  nome: string
  cli: CliId
  modelo: string
  /** Pasta onde a CLI do Maestro roda (repositório do projeto). */
  pasta: string
  /** Onde a pasta está: "local" ou "wsl:<distro>" (RF 2.37). */
  ambiente: string
}

export interface MotorApi {
  /** Orquestrador do projeto na mesa, ou null se não houver (RF 7.02). */
  orquestrador(projetoId: string): OrquestradorInfo | null
  /** Limite de tokens por task do projeto (RF 2.24), ou null se não houver. */
  limiteTokens(projetoId: string): number | null
  listarTasks(projetoId: string): TaskInfo[]
  /** RF 7.15: task nova, pronta para iniciar. */
  criarTask(projetoId: string, missao: string): Promise<TaskInfo>
  /** RF 7.14: inicia (ou enfileira, se não houver vaga). */
  iniciarTask(taskId: string): Promise<void>
  /** RF 7.17 */
  pararTask(taskId: string): Promise<void>
  /** RF 7.16: mais uma volta numa task aguardando decisão. */
  liberarTask(taskId: string): Promise<void>
  /** Carta travada: aceita a entrega e segue (concluída com pendências). */
  seguirTask(taskId: string): Promise<void>
  /** RF 6.34: task nova pronta, ligada à original, mesma missão e referência, com o ajuste. */
  abrirTaskDeAjuste(taskOriginalId: string, ajuste: string): Promise<TaskInfo>
  /** RF 6.35: repassa ao Orquestrador da task; vale a partir da próxima entrega. */
  repassarAjuste(taskId: string, ajuste: string): Promise<void>
  /** RF 6.36: acrescenta ao texto de ajustes da task (RN 79); entra no plano quando ela começar. */
  anotarAjuste(taskId: string, ajuste: string): Promise<void>
  /** RF 7.13: só em task que não começou. */
  tirarCarta(taskId: string, cartaId: string): Promise<void>
}
