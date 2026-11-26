/** Card da fonte (saída JSON da ferramenta de detalhe) em texto legível estilo Markdown, para o painel e o prompt. */
import { mascarar } from "./ambiente.ts"

type Obj = Record<string, any>
const META = ["status", "tipo", "prioridade", "projeto", "dev", "qa", "ambiente", "link", "url"]
const IDS = ["codigo", "key", "ref"], NOMES = ["titulo", "title", "nome", "name", "autor", "author"], DATAS = ["data", "criado_em", "created"]
const ACENTO: Record<string, string> = { descricao: "descrição", criterios: "critérios", aceite: "aceite", sugestao: "sugestão", reproducao: "reprodução", passos: "passos", severidade: "severidade", usuario: "usuário" }
const rotulo = (k: string) => { const s = k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/\w+/g, (w) => ACENTO[w] ?? w); return s[0].toUpperCase() + s.slice(1) }
const LONGO = /^(descricao|comportamento|criterios|caminho_tela)/i
const vazio = (v: unknown) => v == null || v === "" || (typeof v === "object" && !Object.keys(v as object).length)
const pular = (k: string) => /_json$/i.test(k) || /^imagens?$/i.test(k) || /^id$|_id$|[a-z]Id$/.test(k)
const curto = (v: unknown) => typeof v !== "object" && !String(v).includes("\n") && String(v).trim().length <= 80
/** Objeto com nome (projeto, dev, qa) vira "Nome (chave)". */
const inline = (v: unknown): string | undefined => {
  if (vazio(v)) return
  if (typeof v !== "object") return curto(v) ? String(v).trim() : undefined
  const o = v as Obj, n = o.nome ?? o.name
  if (typeof n === "string" && !Array.isArray(v)) return o.chave ? `${n} (${o.chave})` : n
}
const recuo = (s: string, ind: string) => s.trim().split("\n").map((l) => ind + l).join("\n")

function corpo(o: Obj, d: number, ind: string): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(o)) {
    if (pular(k) || vazio(v)) continue
    if (typeof v !== "object") out.push(curto(v) ? `${ind}${rotulo(k)}: ${String(v).trim()}` : `${ind}${rotulo(k)}:\n${recuo(String(v), ind + "  ")}`)
    else if (d < 3) out.push(`${ind}${rotulo(k)}:`, ...(Array.isArray(v) ? itens(v, d + 1, ind + "  ") : corpo(v, d + 1, ind + "  ")))
  }
  return out
}

function itens(a: unknown[], d: number, ind: string): string[] {
  return a.filter((x) => !vazio(x)).flatMap((x) => {
    if (typeof x !== "object" || Array.isArray(x)) return [`${ind}- ${typeof x === "object" ? JSON.stringify(x) : String(x).trim()}`]
    const o = x as Obj, usadas: string[] = [], cab: string[] = []
    for (const g of [IDS, NOMES, DATAS]) { const k = g.find((c) => typeof o[c] === "string" && o[c]); if (k) { cab.push(o[k]); usadas.push(k) } }
    const resto = Object.fromEntries(Object.entries(o).filter(([k]) => !usadas.includes(k)))
    const sub = corpo(resto, d, ind + "  ")
    return [`${ind}- ${cab.join(" — ") || (sub.shift() ?? "").trim()}`, ...sub]
  })
}

export function cardLegivel(saida: string): string {
  let j: unknown
  try { j = JSON.parse(saida) } catch { return mascarar(saida).slice(0, 16_000) }
  if (!j || typeof j !== "object") return mascarar(saida).slice(0, 16_000)
  const o: Obj = Array.isArray(j) ? { itens: j } : (j as Obj)
  const id = IDS.map((k) => o[k]).find((v) => typeof v === "string" && v), titulo = NOMES.map((k) => o[k]).find((v) => typeof v === "string" && v)
  const meta: string[] = [], secoes: string[] = []
  const ordem = [...META.filter((k) => k in o), ...Object.keys(o).filter((k) => !META.includes(k))]
  for (const k of ordem) {
    const v = o[k]
    if (pular(k) || vazio(v) || IDS.includes(k) || NOMES.includes(k)) continue
    const s = LONGO.test(k) && typeof v === "string" ? undefined : inline(v)
    if (s !== undefined) meta.push(`${rotulo(k)}: ${s}`)
    else if (typeof v !== "object") secoes.push(`## ${rotulo(k)}\n${String(v).trim()}`)
    else {
      const l = Array.isArray(v) ? itens(v, 1, "") : corpo(v, 1, "")
      if (l.length) secoes.push(`## ${rotulo(k)}\n${l.join("\n")}`)
    }
  }
  const topo = [id, titulo].filter(Boolean).join(" — ")
  return mascarar([topo && `# ${topo}`, meta.join(" · "), ...secoes].filter(Boolean).join("\n\n")).slice(0, 16_000)
}
