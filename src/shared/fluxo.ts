/**
 * Validação do fluxo da mesa (Processo 3.2, RN 36 a 38). Função pura: vale na interface (painel)
 * e no núcleo (recusar o início da task com erro). Só importa tipos, para rodar direto no Node.
 */
import type { ClasseId } from "./catalogo"

export interface NoFluxo { id: string; nome: string; classe: ClasseId }
export interface LigacaoFluxo { deCartaId: string; paraCartaId: string; tipo: "entrega" | "questiona" }
export interface Problema { codigo: "sem-comeco" | "circulo" | "solta" | "revisor-sem-pergunta" | "varios-comecos"; mensagem: string; cartaIds: string[] }
export interface ResultadoFluxo {
  erros: Problema[]
  avisos: Problema[]
  /** Cartas que começam as tasks: as que não recebem nenhuma Entrega (RN 36). */
  comeco: string[]
  /** Há cartas e nenhum erro: a task pode começar. */
  pronto: boolean
}

/** Acha um círculo de entregas e devolve os ids dele, ou null. */
function acharCirculo(ids: string[], entregas: LigacaoFluxo[]): string[] | null {
  const estado = new Map<string, 1 | 2>() // 1 = no caminho atual, 2 = já visto sem círculo
  const caminho: string[] = []
  const visitar = (id: string): string[] | null => {
    estado.set(id, 1)
    caminho.push(id)
    for (const c of entregas) {
      if (c.deCartaId !== id) continue
      if (estado.get(c.paraCartaId) === 1) return caminho.slice(caminho.indexOf(c.paraCartaId))
      if (!estado.has(c.paraCartaId)) { const r = visitar(c.paraCartaId); if (r) return r }
    }
    caminho.pop()
    estado.set(id, 2)
    return null
  }
  for (const id of ids) if (!estado.has(id)) { const r = visitar(id); if (r) return r }
  return null
}

export function validarFluxo(nos: NoFluxo[], conexoes: LigacaoFluxo[]): ResultadoFluxo {
  const cartas = nos.filter((n) => n.classe !== "orquestrador")
  const nome = (id: string) => cartas.find((n) => n.id === id)?.nome ?? "?"
  const entregas = conexoes.filter((c) => c.tipo === "entrega")
  const comeco = cartas.filter((n) => !entregas.some((c) => c.paraCartaId === n.id)).map((n) => n.id)
  const erros: Problema[] = [], avisos: Problema[] = []

  if (cartas.length && !comeco.length)
    erros.push({ codigo: "sem-comeco", mensagem: "Nenhuma carta começa o fluxo: todas recebem uma Entrega.", cartaIds: [] })
  const circulo = acharCirculo(cartas.map((n) => n.id), entregas)
  if (circulo)
    erros.push({ codigo: "circulo", mensagem: `As entregas formam um círculo (${[...circulo, circulo[0]].map(nome).join(" → ")}). Para voltar etapas, use Questiona.`, cartaIds: circulo })

  // ponytail: com uma carta só, "solta" seria ruído; o RF 3.22 não fala desse caso.
  if (cartas.length > 1)
    for (const n of cartas)
      if (!conexoes.some((c) => c.deCartaId === n.id || c.paraCartaId === n.id))
        avisos.push({ codigo: "solta", mensagem: `${n.nome} não está ligada a nenhuma carta.`, cartaIds: [n.id] })
  for (const n of cartas)
    if (n.classe === "revisor" && !conexoes.some((c) => c.tipo === "questiona" && c.deCartaId === n.id))
      avisos.push({ codigo: "revisor-sem-pergunta", mensagem: `${n.nome} não questiona ninguém.`, cartaIds: [n.id] })
  if (comeco.length > 1)
    avisos.push({ codigo: "varios-comecos", mensagem: `O fluxo começa por ${comeco.length} cartas (${comeco.map(nome).join(", ")}): elas começam ao mesmo tempo.`, cartaIds: comeco })

  return { erros, avisos, comeco, pronto: cartas.length > 0 && !erros.length }
}
