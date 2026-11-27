/** Gasto de tokens de uma task por carta: soma dos eventos com tokens (quem gastou = deCartaId). */
import type { EventoTask, TaskCarta } from "./task"
import { cliPorId, type Modelo } from "./ia.ts"

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

/**
 * Classes que não escrevem código: planejam (orquestrador, analise), testam (teste) ou revisam/questionam (revisor, seguranca).
 * Ficam de fora quem escreve (dev), UX (entrega o desenho que o dev segue), PR e o Coringa (papel desconhecido).
 */
const SEM_CODIGO = new Set(["orquestrador", "analise", "teste", "seguranca", "revisor"])

export interface SugestaoModelo {
  cartaId: string
  classe: string
  de: Modelo
  para: Modelo
  /** Faixa aproximada de economia (%), estimativa. */
  ecoMin: number
  ecoMax: number
}

/**
 * Carta que não escreve código, no modelo mais caro da CLI e com fatia relevante do gasto (>= 15% ou >= 50 mil tokens)
 * ganha a sugestão do modelo intermediário da mesma CLI.
 * ponytail: "caro" = custo >= 4 e "intermediário" = o de maior custo <= 3 (campo `custo` de ia.ts); heurística, não é preço real.
 */
export function sugestoesDeModelo(gastos: GastoCarta[], cartas: Pick<TaskCarta, "cartaId" | "copia">[]): SugestaoModelo[] {
  const total = gastos.reduce((s, g) => s + g.total, 0)
  const out: SugestaoModelo[] = []
  for (const g of gastos) {
    const copia = cartas.find((c) => c.cartaId === g.cartaId)?.copia
    if (!copia || !SEM_CODIGO.has(copia.classe) || (g.total < total * 0.15 && g.total < 50_000)) continue
    const modelos = cliPorId(copia.cli).modelos
    const de = modelos.find((m) => m.id === copia.modelo)
    const para = modelos.filter((m) => m.custo <= 3).sort((a, b) => b.custo - a.custo)[0]
    if (!de || !para || de.custo < 4) continue
    const eco = (1 - para.custo / de.custo) * 100 // faixa de ±40% em torno da razão de custo, em passos de 5
    out.push({ cartaId: g.cartaId!, classe: copia.classe, de, para, ecoMin: Math.round((eco * 0.6) / 5) * 5, ecoMax: Math.round((eco * 1.4) / 5) * 5 })
  }
  return out
}
