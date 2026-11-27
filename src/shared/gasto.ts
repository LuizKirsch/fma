/** Gasto de tokens de uma task por carta: soma dos eventos com tokens (quem gastou = deCartaId). */
import type { EventoTask } from "./task"

export interface GastoCarta {
  /** null: gasto sem carta (nenhum hoje). */
  cartaId: string | null
  total: number
  /** Cada evento que gastou, na ordem em que aconteceu. */
  etapas: EventoTask[]
}

/** Ordenado do maior para o menor gasto. */
export function gastoPorCarta(eventos: EventoTask[]): GastoCarta[] {
  const por = new Map<string | null, GastoCarta>()
  for (const e of eventos) {
    if (!e.tokens) continue
    const g = por.get(e.deCartaId) ?? { cartaId: e.deCartaId, total: 0, etapas: [] }
    g.total += e.tokens
    g.etapas.push(e)
    por.set(e.deCartaId, g)
  }
  return [...por.values()].sort((a, b) => b.total - a.total)
}
