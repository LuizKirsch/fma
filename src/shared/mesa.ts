/**
 * Mesa (módulo 3): tipos e regras puras de ligação (Processo 3.1), valem na interface e no núcleo.
 * Só importa tipos, para o self-check rodar direto no Node (fluxo.check.ts).
 * Coordenadas em pixels do mundo da mesa; a carta tem CARTA_W x CARTA_H.
 */
import type { ClasseId } from "./catalogo"

export type TipoConexao = "entrega" | "questiona"

/** Uma carta da coleção posta na mesa de um projeto. */
export interface CartaNaMesa { id: string; cartaId: string; x: number; y: number }

export interface Ligacao { deCartaId: string; paraCartaId: string; tipo: TipoConexao }
export interface Conexao extends Ligacao {
  id: string
  /** Posição entre as conexões do mesmo tipo que saem da carta (começa em 0, RN 31). */
  ordem: number
  /** Quanto a linha foi puxada a partir do meio da reta; null = reta. */
  curvaX: number | null
  curvaY: number | null
  /** Chaves de SKILLS_CONEXAO do tipo da conexão. */
  skills: string[]
}
/** O que se pode mudar numa conexão: tipo, skills ou o desvio da curva (null = automática). */
export interface MudancaConexao { tipo?: TipoConexao; skills?: string[]; curva?: { x: number; y: number } | null }
export interface Mesa { projetoId: string; cartas: CartaNaMesa[]; conexoes: Conexao[] }

/** Carta na mesa já com a classe, para as regras não precisarem do banco. */
export interface No { id: string; classe: ClasseId; x: number; y: number }

export interface SkillConexao { chave: string; nome: string; descricao: string; tipo: TipoConexao; pergunta?: string }
/** Catálogo das skills de conexão (fica no código, como o das cartas; o banco guarda só a chave). */
export const SKILLS_CONEXAO: SkillConexao[] = [
  { chave: "acessibilidade", tipo: "questiona", nome: "Questionar acessibilidade", descricao: "Contraste, teclado e leitor de tela.", pergunta: "O contraste, a navegação por teclado e o leitor de tela foram considerados?" },
  { chave: "regras-negocio", tipo: "questiona", nome: "Questionar regras de negócio", descricao: "Cada regra tem origem?", pergunta: "Cada regra de negócio aplicada tem origem na demanda ou na documentação?" },
  { chave: "evidencias", tipo: "questiona", nome: "Exigir evidências", descricao: "Prints e logs do que foi feito.", pergunta: "Quais evidências (prints, logs, saídas de comando) provam o que foi feito?" },
  { chave: "seguranca", tipo: "questiona", nome: "Questionar segurança", descricao: "Senhas, dados pessoais, entradas.", pergunta: "Senhas, dados pessoais e entradas do usuário estão protegidos e validados?" },
  { chave: "performance", tipo: "questiona", nome: "Questionar performance", descricao: "Tempo de resposta e consultas.", pergunta: "O tempo de resposta e as consultas feitas são adequados?" },
  { chave: "clareza", tipo: "questiona", nome: "Questionar clareza da tela", descricao: "Mensagens e estados claros.", pergunta: "As mensagens e os estados da tela (vazio, carregando, erro) estão claros?" },
  { chave: "resumo", tipo: "entrega", nome: "Enviar só um resumo", descricao: "Economiza contexto e custo." },
  { chave: "criterios", tipo: "entrega", nome: "Incluir critérios de aceite", descricao: "O próximo sabe quando está pronto." },
  { chave: "anexar-evidencias", tipo: "entrega", nome: "Anexar evidências", descricao: "Prints e logs junto da entrega." },
  { chave: "prioridade", tipo: "entrega", nome: "Marcar como prioridade", descricao: "O próximo começa por isto." },
]
export const skillConexao = (chave: string) => SKILLS_CONEXAO.find((s) => s.chave === chave)

export const CARTA_W = 188
export const CARTA_H = 270
const PASSO_X = 268
const PASSO_Y = 310
/** Altura da linha das cartas quando o Orquestrador fica acima. */
const LINHA_Y = CARTA_H + 70

/** Ordem do time na mesa nova (RN 16); o Orquestrador fica acima, fora da linha. */
export const ORDEM_MESA: ClasseId[] = ["analise", "ux", "dev", "custom", "teste", "seguranca", "revisor", "pr"]
/** Classes sugeridas que faltam na mesa viram espaços tracejados (RF 3.08). */
const SUGERIDAS: ClasseId[] = ["orquestrador", "analise", "ux", "dev", "teste", "seguranca", "revisor", "pr"]

const ehOrq = (n: { classe: ClasseId }) => n.classe === "orquestrador"
const porX = (a: No, b: No) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id)

/** RN 26: do Revisor para qualquer carta que não seja PR, Questiona; no resto, Entrega. */
export const tipoPadrao = (de: ClasseId, para: ClasseId): TipoConexao => (de === "revisor" && para !== "pr" ? "questiona" : "entrega")

/** RN 25, 30 e RF 3.13: devolve o motivo de recusar a ligação, ou null. */
export function validarLigacao(nos: No[], conexoes: Ligacao[], de: string, para: string): string | null {
  if (de === para) return "Uma carta não se liga a ela mesma."
  const a = nos.find((n) => n.id === de), b = nos.find((n) => n.id === para)
  if (!a || !b) return "Essa carta não está na mesa."
  if (ehOrq(a) || ehOrq(b)) return "O Orquestrador não se liga às cartas: ele conduz todas as tasks."
  if (conexoes.some((c) => c.deCartaId === de && c.paraCartaId === para)) return "Essas cartas já estão ligadas nesse sentido."
  return null
}

/** RN 33: entregas da esquerda para a direita e o Revisor questionando as cartas anteriores. */
export function ligarEmSequencia(nos: No[]): Ligacao[] {
  const fila = nos.filter((n) => !ehOrq(n)).sort(porX)
  const ligs: Ligacao[] = []
  fila.forEach((n, i) => {
    const antes = fila.slice(0, i)
    const origem = [...antes].reverse().find((a) => n.classe === "pr" || a.classe !== "revisor")
    if (origem) ligs.push({ deCartaId: origem.id, paraCartaId: n.id, tipo: "entrega" })
    if (n.classe === "revisor") for (const a of antes) if (a.classe !== "revisor" && a.classe !== "pr") ligs.push({ deCartaId: n.id, paraCartaId: a.id, tipo: "questiona" })
  })
  return ligs
}

/** RN 27 e 28: o que ligar (e desfazer) quando a carta `novoId`, já em `nos`, entra na mesa. */
export function ligarNova(nos: No[], conexoes: Ligacao[], novoId: string): { criar: Ligacao[]; remover: Ligacao[] } {
  const criar: Ligacao[] = [], remover: Ligacao[] = []
  const nova = nos.find((n) => n.id === novoId)
  if (!nova || ehOrq(nova)) return { criar, remover }
  const outros = nos.filter((n) => n.id !== nova.id && !ehOrq(n))
  const esquerda = outros.filter((n) => n.x < nova.x).sort(porX)
  const origem = [...esquerda].reverse().find((a) => nova.classe === "pr" || a.classe !== "revisor")
  if (origem) {
    criar.push({ deCartaId: origem.id, paraCartaId: nova.id, tipo: "entrega" })
    // Se a origem já entregava a alguém à direita da nova, a nova entra no meio.
    for (const c of conexoes) {
      const alvo = c.tipo === "entrega" && c.deCartaId === origem.id ? outros.find((n) => n.id === c.paraCartaId) : undefined
      if (alvo && alvo.x > nova.x) {
        remover.push(c)
        criar.push({ deCartaId: nova.id, paraCartaId: alvo.id, tipo: "entrega" })
      }
    }
  }
  if (nova.classe === "revisor") {
    for (const a of esquerda) if (a.classe !== "revisor" && a.classe !== "pr") criar.push({ deCartaId: nova.id, paraCartaId: a.id, tipo: "questiona" })
  } else if (nova.classe !== "pr") {
    for (const r of outros) if (r.classe === "revisor" && r.x > nova.x) criar.push({ deCartaId: r.id, paraCartaId: nova.id, tipo: "questiona" })
  }
  return { criar, remover }
}

/** Orquestradores centrados acima das colunas (`colunas` = quantas há). */
function acimaDasColunas(qtd: number, colunas: number): { x: number; y: number }[] {
  const largura = (Math.max(colunas, 1) - 1) * PASSO_X
  return Array.from({ length: qtd }, (_, i) => ({ x: largura / 2 - ((qtd - 1) * PASSO_X) / 2 + i * PASSO_X, y: 0 }))
}

/** RF 3.19: colunas pela ordem das entregas (o nível é o caminho mais longo até a carta), Orquestrador acima. */
export function organizar(nos: No[], conexoes: Ligacao[]): { id: string; x: number; y: number }[] {
  const cartas = nos.filter((n) => !ehOrq(n))
  const nivel = new Map(cartas.map((n) => [n.id, 0]))
  // Relaxa no máximo uma vez por carta: com círculo (fluxo inválido) termina do mesmo jeito.
  for (let i = 0; i < cartas.length; i++)
    for (const c of conexoes)
      if (c.tipo === "entrega" && nivel.has(c.deCartaId) && nivel.has(c.paraCartaId))
        nivel.set(c.paraCartaId, Math.max(nivel.get(c.paraCartaId)!, Math.min(nivel.get(c.deCartaId)! + 1, cartas.length - 1)))
  const colunas = new Map<number, No[]>()
  for (const n of [...cartas].sort(porX)) colunas.set(nivel.get(n.id)!, [...(colunas.get(nivel.get(n.id)!) ?? []), n])
  const saida: { id: string; x: number; y: number }[] = []
  for (const [nv, lista] of colunas) lista.forEach((n, i) => saida.push({ id: n.id, x: nv * PASSO_X, y: LINHA_Y + i * PASSO_Y }))
  const orqs = nos.filter(ehOrq)
  acimaDasColunas(orqs.length, colunas.size ? Math.max(...colunas.keys()) + 1 : 1).forEach((p, i) => saida.push({ id: orqs[i].id, ...p }))
  return saida
}

/** RN 16: cartas em linha na ordem do time e o Orquestrador acima; `ligarEmSequencia` liga o resto. */
export function mesaInicial(time: { id: string; classe: ClasseId }[]): { nos: No[]; ligacoes: Ligacao[] } {
  const { orquestradores, fluxo } = ordemDoTime(time)
  const nos: No[] = [
    ...fluxo.map((c, i) => ({ id: c.id, classe: c.classe, x: i * PASSO_X, y: LINHA_Y })),
    ...acimaDasColunas(orquestradores.length, fluxo.length).map((p, i) => ({ id: orquestradores[i].id, classe: orquestradores[i].classe, ...p })),
  ]
  return { nos, ligacoes: ligarEmSequencia(nos) }
}

/** RF 2.05: o time na ordem em que trabalha (Orquestradores à parte). */
export function ordemDoTime<T extends { classe: ClasseId }>(time: T[]): { orquestradores: T[]; fluxo: T[] } {
  const rank = (c: ClasseId) => ORDEM_MESA.indexOf(c)
  // sort é estável: cartas da mesma classe ficam na ordem em que foram escolhidas.
  return { orquestradores: time.filter(ehOrq), fluxo: time.filter((c) => !ehOrq(c)).sort((a, b) => rank(a.classe) - rank(b.classe)) }
}

/** RF 3.08: um espaço tracejado para cada classe sugerida que falta na mesa. */
export function espacosSugeridos(nos: No[]): { classe: ClasseId; x: number; y: number }[] {
  const cartas = nos.filter((n) => !ehOrq(n))
  const faltam = SUGERIDAS.filter((k) => !nos.some((n) => n.classe === k))
  const resto = faltam.filter((k) => k !== "orquestrador")
  const linha = cartas.length ? Math.min(...cartas.map((n) => n.y)) : LINHA_Y
  const ini = cartas.length ? Math.min(...cartas.map((n) => n.x)) : 0
  const fim = cartas.length ? Math.max(...cartas.map((n) => n.x)) + PASSO_X : 0
  const largura = cartas.length ? fim - PASSO_X - ini : Math.max(resto.length - 1, 0) * PASSO_X
  return faltam.map((classe) => classe === "orquestrador"
    ? { classe, x: ini + largura / 2, y: linha - LINHA_Y }
    : { classe, x: fim + resto.indexOf(classe) * PASSO_X, y: linha })
}
