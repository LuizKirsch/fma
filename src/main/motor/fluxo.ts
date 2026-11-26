/**
 * Lógica pura do fluxo da task (sem banco, sem processos): validação (RN 36-38), começo,
 * ordem, espera de todas as entregas (RN 67) e devolução (RN 69). Testada em motor.check.ts.
 * Sem imports de propósito: roda direto com `node --experimental-strip-types`.
 */
export interface CartaFluxo { id: string; nome: string; orquestrador: boolean }
export interface ConexaoFluxo { de: string; para: string; tipo: "entrega" | "questiona"; ordem: number }
export type Estado = Record<string, "espera" | "pronta" | "trabalhando" | "questionando" | "concluida">

/** O Orquestrador fica fora do fluxo de entregas: ele só planeja e fecha. */
const doFluxo = (cartas: CartaFluxo[]) => cartas.filter((c) => !c.orquestrador)
const noFluxo = (ids: Set<string>, c: ConexaoFluxo) => ids.has(c.de) && ids.has(c.para)
const porOrdem = (a: ConexaoFluxo, b: ConexaoFluxo) => a.ordem - b.ordem

/** Cartas que não recebem nenhuma Entrega (RN 36). */
export function comecoNatural(cartas: CartaFluxo[], conexoes: ConexaoFluxo[]): string[] {
  const ids = new Set(doFluxo(cartas).map((c) => c.id))
  const recebem = new Set(conexoes.filter((c) => c.tipo === "entrega" && noFluxo(ids, c)).map((c) => c.para))
  return [...ids].filter((id) => !recebem.has(id))
}

/** RN 37 (erros que impedem) e RN 38 (avisos). */
export function validarFluxo(cartas: CartaFluxo[], conexoes: ConexaoFluxo[]): { erros: string[]; avisos: string[] } {
  const erros: string[] = [], avisos: string[] = []
  const fluxo = doFluxo(cartas)
  if (cartas.filter((c) => c.orquestrador).length !== 1) erros.push("O time precisa de exatamente um Orquestrador.")
  if (!fluxo.length) erros.push("Coloque na mesa pelo menos uma carta além do Orquestrador.")
  else {
    if (!comecoNatural(cartas, conexoes).length) erros.push("Nenhuma carta é começo do fluxo: todas recebem Entrega.")
    const ids = new Set(fluxo.map((c) => c.id))
    const ent = conexoes.filter((c) => c.tipo === "entrega" && noFluxo(ids, c))
    // Círculo de Entregas (Kahn): se sobrar carta sem sair da fila, há ciclo.
    const grau = new Map(fluxo.map((c) => [c.id, 0]))
    for (const c of ent) grau.set(c.para, grau.get(c.para)! + 1)
    const fila = [...grau].filter(([, g]) => g === 0).map(([id]) => id)
    let vistos = 0
    while (fila.length) {
      const id = fila.pop()!
      vistos++
      for (const c of ent) {
        if (c.de !== id) continue
        const g = grau.get(c.para)! - 1
        grau.set(c.para, g)
        if (g === 0) fila.push(c.para)
      }
    }
    if (vistos < fluxo.length) erros.push("As Entregas formam um círculo. Para voltar etapas, use Questiona.")
    for (const c of fluxo) if (!conexoes.some((x) => x.de === c.id || x.para === c.id)) avisos.push(`${c.nome} não tem nenhuma conexão.`)
    if (comecoNatural(cartas, conexoes).length > 1) avisos.push("O fluxo começa por mais de uma carta: elas começam ao mesmo tempo.")
  }
  return { erros, avisos }
}

/**
 * Religa o fluxo sem as cartas tiradas (RN 60): quem entregava para a carta passa a entregar direto a quem
 * recebia dela, sem conexão repetida nem da carta para ela mesma. Conexões que tocam a carta saem.
 */
export function religar<T extends ConexaoFluxo>(conexoes: T[], retiradas: string[]): T[] {
  let c = conexoes
  for (const x of retiradas) {
    const entram = c.filter((k) => k.tipo === "entrega" && k.para === x)
    const saem = c.filter((k) => k.tipo === "entrega" && k.de === x)
    c = c.filter((k) => k.de !== x && k.para !== x)
    for (const a of entram) for (const b of saem)
      if (a.de !== b.para && !c.some((k) => k.de === a.de && k.para === b.para)) c.push({ ...a, para: b.para })
  }
  return c
}

/** Cartas alcançadas pelas Entregas a partir de `de` (elas mesmas incluídas). */
export function descendentes(de: string[], conexoes: ConexaoFluxo[]): Set<string> {
  const vistos = new Set<string>(de)
  const pilha = [...de]
  while (pilha.length) {
    const id = pilha.pop()!
    for (const c of conexoes) if (c.tipo === "entrega" && c.de === id && !vistos.has(c.para)) { vistos.add(c.para); pilha.push(c.para) }
  }
  return vistos
}

/**
 * Estado ao começar. As cartas fora do alcance dos começos contam como concluídas (RN 64);
 * os começos ficam prontos; o resto espera.
 */
export function estadoInicial(cartas: CartaFluxo[], conexoes: ConexaoFluxo[], comecos: string[]): Estado {
  const alcance = descendentes(comecos, conexoes)
  const e: Estado = {}
  for (const c of doFluxo(cartas)) e[c.id] = comecos.includes(c.id) ? "pronta" : alcance.has(c.id) ? "espera" : "concluida"
  return e
}

/** Quem pode começar agora: as prontas, e as que esperam e já receberam de todos (RN 67). */
export function prontas(e: Estado, conexoes: ConexaoFluxo[]): string[] {
  return Object.keys(e).filter(
    (id) =>
      e[id] === "pronta" ||
      (e[id] === "espera" && conexoes.filter((c) => c.tipo === "entrega" && c.para === id && c.de in e).every((c) => e[c.de] === "concluida")),
  )
}

/** Entregas que chegam a uma carta, na ordem das conexões (RN 66). */
export const quemEntrega = (id: string, conexoes: ConexaoFluxo[]) =>
  conexoes.filter((c) => c.tipo === "entrega" && c.para === id).sort(porOrdem).map((c) => c.de)
/** Conexões Questiona que saem de `id`, na ordem (RN 68). */
export const quemQuestiona = (id: string, conexoes: ConexaoFluxo[]) =>
  conexoes.filter((c) => c.tipo === "questiona" && c.de === id).sort(porOrdem)

/** Fim da task: nenhuma carta trabalhando nem esperando (RN 74). */
export const terminou = (e: Estado) => Object.values(e).every((s) => s === "concluida")

/**
 * Devolução (RN 69): a carta com problema refaz, e tudo depois dela refaz também,
 * incluindo quem questionou (e o que vem depois dele). Devolve os ids que voltaram a esperar.
 */
export function devolver(e: Estado, conexoes: ConexaoFluxo[], alvo: string, questionador: string): string[] {
  const refaz = [...descendentes([alvo, questionador], conexoes)].filter((id) => id in e)
  for (const id of refaz) e[id] = "espera"
  return refaz
}

/** Task travada (RN 70): quem questiona já devolveu `limite` vezes. */
export const noLimite = (voltasDoQuestionador: number, limite: number) => voltasDoQuestionador >= limite

/** Liberar mais uma volta (RN 71): zera o contador de quem questiona. */
export const liberarVolta = (voltas: Record<string, number>, questionador: string) => { voltas[questionador] = 0 }
