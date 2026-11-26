/** Loja e biblioteca local (pacote 2, E10): habilidades, memórias e agentes publicados. */
import type { Carta } from "./tipos"

export type TipoItem = "habilidade" | "memoria"

export interface ItemBiblioteca {
  id: string
  tipo: TipoItem
  nome: string
  descricao: string
  /** Texto que entra no prompt da carta. */
  texto: string
  /** Vem com o app: não pode ser excluído. */
  padrao: boolean
  criadoEm: number
}

/** Carta que veio da Loja: o nome é do autor e fica travado (salvo se o autor é você). */
export interface OrigemLoja {
  lojaId: string
  autor: string
  travada: boolean
}

export interface AgenteLoja {
  id: string
  carta: Carta
  autor: string
  descricao: string
  categoria: string
  verificado: boolean
  meu: boolean
  instalacoes: number
  publicadoEm: number
}

export type NovoItem = Pick<ItemBiblioteca, "tipo" | "nome" | "descricao" | "texto">

export const CATEGORIAS_LOJA = ["Análise", "Design", "Desenvolvimento", "Qualidade", "Documentos", "Produtividade"]
