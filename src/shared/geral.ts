/** Visão geral e acabamento (E8): o que a interface e o núcleo trocam sobre o resumo dos projetos, o aviso de conclusão e o reinício. */
import type { ClasseId } from "./catalogo"

/** RF 2.16 e 2.18: o time da mesa de um projeto e o estado do fluxo. */
export interface ResumoProjeto {
  projetoId: string
  time: { id: string; nome: string; classe: ClasseId; simbolo: string; cor: string }[]
  fluxoValido: boolean
  /** Classes sugeridas que a mesa não tem (só quando o fluxo não é válido). */
  faltam: ClasseId[]
  /** Primeiro erro do fluxo, quando há cartas e o problema não é falta de classe. */
  problema: string | null
}

/** RF 6.39 */
export interface ResumoConclusao {
  numero: number
  referencia: string | null
  titulo: string | null
  projeto: string
  prUrl: string | null
  /** Perguntas feitas pelas cartas que questionam (o Revisor, em geral). */
  perguntas: number
  devolucoes: number
  tokens: number
}
