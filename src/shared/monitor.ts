/** Monitores (módulo 5): tipos e regras puras (dedupe de cards). */

export interface Monitor {
  id: string
  projetoId: string
  nome: string
  conector: string
  /** GitHub Projects: "<dono>/<número do projeto>:<coluna>", ex. "acme/3:Pronto para desenvolver". */
  consulta: string
  intervaloMin: number
  ativo: boolean
  inicioAutomatico: boolean
  cartaInicialId: string | null
  colunaInicio: string
  colunaConclusao: string
  colunaTrava: string
  comentarAoTravar: boolean
  colunaRetomada: string
  ultimaChecagem: number | null
  proximaChecagem: number | null
  ultimoResultado: string
  totalCriadas: number
}

export interface Card {
  /** Referência estável do card no board (guardada como vista). */
  ref: string
  /** Identidade comum a todos os caminhos (owner/repo#n): vira task.referencia e evita duplicar com "Buscar". */
  chave?: string
  titulo: string
  corpo: string
  url: string
}

export type EstadoVisto = "criada" | "em_andamento" | "travada" | "concluida"

/** RF 5.10: só entram os cards cuja referência ainda não foi vista, sem repetir dentro da mesma busca. */
export function cardsNovos(cards: Card[], vistos: ReadonlySet<string>): Card[] {
  const achados = new Set<string>()
  return cards.filter((c) => !vistos.has(c.ref) && !achados.has(c.ref) && !!achados.add(c.ref))
}

export const INTERVALO_MIN_PADRAO = 5
