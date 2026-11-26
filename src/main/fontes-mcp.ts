/**
 * Fonte de tasks por servidor MCP próprio: o usuário diz as ferramentas (tasks, projetos, e opcionalmente mover/comentar).
 * Se a ferramenta não existir no servidor, o erro lista o que ele expõe. Os argumentos que o servidor
 * não declara no schema da ferramenta são descartados.
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { COLUNA_PRONTA, type ProjetoDaFonte, type TaskDaFonte, type TipoFonte } from "@shared/fonte"
import { comCliente } from "./apoio/mcp"

type Obj = Record<string, any>
type Tool = { name: string; inputSchema?: { properties?: Record<string, unknown> } }

/** Lê `a.b.c` num objeto (chaves com ponto, como "System.Title", e maiúsculas/minúsculas são toleradas). */
export function ler(o: unknown, caminho: string): unknown {
  if (o == null || typeof o !== "object") return undefined
  const partes = caminho.split(".")
  for (let i = partes.length; i >= 1; i--) {
    const chave = partes.slice(0, i).join(".").toLowerCase()
    const k = Object.keys(o).find((x) => x.toLowerCase() === chave)
    if (k === undefined) continue
    const v = (o as Obj)[k]
    if (i === partes.length) return v
    const r = ler(v, partes.slice(i).join("."))
    if (r !== undefined) return r
  }
}
const primeiro = (o: unknown, ...caminhos: string[]) => {
  for (const c of caminhos) { const v = ler(o, c); if (v != null && v !== "") return v }
}

/** Texto de um campo que pode ser string, HTML simples ou documento rico (Jira ADF). */
export function texto(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  if (Array.isArray(v)) return v.map(texto).filter(Boolean).join("\n")
  if (typeof v === "object") return typeof (v as Obj).text === "string" ? (v as Obj).text : texto((v as Obj).content)
  return String(v)
}

/** A primeira lista de objetos da resposta (que costuma vir como JSON em texto). */
export function extrairLista(saida: string): Obj[] {
  let j: unknown
  try { j = JSON.parse(saida) } catch { throw new Error(`Resposta do servidor não reconhecida: ${saida.slice(0, 160)}`) }
  const acha = (v: unknown, nivel: number): Obj[] | null => {
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object")
    if (!v || typeof v !== "object" || nivel > 2) return null
    for (const k of ["issues", "values", "value", "projects", "workItems", "results", "items", "data"]) {
      const r = acha((v as Obj)[k], nivel + 1)
      if (r) return r
    }
    for (const x of Object.values(v)) if (Array.isArray(x)) return acha(x, nivel + 1)
    return null
  }
  return acha(j, 0) ?? []
}

export const FECHADA = /^(done|closed|resolved|removed|cancel+ed|conclu[ií]d[ao]s?|fechad[ao]s?|resolvid[ao]s?|cancelad[ao]s?)$/i

interface Contexto { c: Client; tools: Tool[]; extra: Obj }
interface Lida { o: Obj; ref: string; status: string; fechada: boolean }

async function chamar(x: Contexto, candidatas: string[], args: Obj): Promise<string> {
  const t = x.tools.find((k) => candidatas.includes(k.name))
  if (!t) throw new Error(`O servidor não expõe a ferramenta esperada (${candidatas.join(" ou ")}). Ele expõe: ${x.tools.map((k) => k.name).join(", ") || "nenhuma"}.`)
  const props = t.inputSchema?.properties
  const todos = { ...x.extra, ...args }
  const usados = props ? Object.fromEntries(Object.entries(todos).filter(([k]) => k in props)) : args
  const r = await x.c.callTool({ name: t.name, arguments: usados })
  const saida = (Array.isArray(r.content) ? r.content : []).map((p: { type: string; text?: string }) => (p.type === "text" ? p.text : "")).join("\n")
  if (r.isError) throw new Error(saida || "A ferramenta devolveu erro.")
  return saida
}

interface Perfil {
  projetos(x: Contexto): Promise<{ id: string; titulo: string }[]>
  tasks(x: Contexto, projetoId: string): Promise<Lida[]>
}

/** MCP próprio: o usuário diz as ferramentas. Sem ferramenta de projetos, a fonte vira um projeto só ("*"). */
function generico(config: Obj): Perfil {
  const fTasks = String(config.ferramentaTasks ?? "").trim(), fProj = String(config.ferramentaProjetos ?? "").trim()
  const arg = String(config.argProjeto ?? "").trim() || "project"
  return {
    async projetos(x) {
      if (!fProj) return [{ id: "*", titulo: "Todas as tasks" }]
      const l = extrairLista(await chamar(x, [fProj], {}))
      return l.map((p) => ({ id: String(primeiro(p, "key", "id", "name") ?? ""), titulo: String(primeiro(p, "name", "title", "key", "id") ?? "") })).filter((p) => p.id)
    },
    async tasks(x, projetoId) {
      const l = extrairLista(await chamar(x, [fTasks], projetoId === "*" ? {} : { [arg]: projetoId }))
      return l.map((o) => {
        const status = String(primeiro(o, "fields.status.name", "status.name", "status", "state", "situacao") ?? "")
        return { o, ref: String(primeiro(o, "key", "ref", "id", "number", "codigo") ?? ""), status, fechada: FECHADA.test(status) }
      })
    },
  }
}

function perfil(tipo: TipoFonte, config: Obj = {}): Perfil {
  if (tipo !== "mcp") throw new Error("Esta fonte não usa servidor MCP.")
  return generico(config)
}

/** `servidor` é uma URL (servidor remoto) ou uma linha de comando; `env` tem um K=V por linha. */
export function servidorDe(config: Obj) {
  const linha = String(config.servidor ?? "").trim()
  if (!linha) throw new Error("Informe o comando ou a URL do servidor MCP.")
  if (/^https?:\/\//i.test(linha)) return { url: linha }
  const partes = [...linha.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2])
  const env = Object.fromEntries(
    String(config.env ?? "").split(/\r?\n/).map((l) => l.split(/=(.*)/s)).filter((p) => p[0]?.trim() && p[1] !== undefined).map((p) => [p[0].trim(), p[1].trim()]),
  )
  return { comando: partes[0], args: partes.slice(1), env }
}

/** Conecta, descobre as ferramentas e, com servidor Atlassian, o cloudId (as ferramentas pedem). */
function comServidor<T>(config: Obj, fn: (x: Contexto) => Promise<T>): Promise<T> {
  return comCliente(servidorDe(config), async (c) => {
    const tools = (await c.listTools()).tools as Tool[]
    const x: Contexto = { c, tools, extra: {} }
    if (tools.some((t) => t.name === "getAccessibleAtlassianResources")) {
      try { x.extra.cloudId = String(primeiro(extrairLista(await chamar(x, ["getAccessibleAtlassianResources"], {}))[0], "id")) } catch { /* sem cloudId: segue */ }
    }
    return fn(x)
  })
}

/** Nomes das ferramentas do servidor, para o formulário do MCP próprio. */
export const ferramentasMcp = (config: Obj) => comServidor(config, async (x) => x.tools.map((t) => t.name))

export const testarMcp = (config: Obj) =>
  comServidor(config, async (x) => `${x.tools.length} ferramentas: ${x.tools.slice(0, 8).map((t) => t.name).join(", ")}${x.tools.length > 8 ? "…" : ""}`)

const colunaPronta = (config: Obj) => String(config.colunaPronta || COLUNA_PRONTA)

function paraTask(p: Lida, pronta: string): TaskDaFonte {
  const url = primeiro(p.o, "url", "_links.html.href")
  return {
    ref: p.ref,
    titulo: String(primeiro(p.o, "fields.summary", "fields.System.Title", "System.Title", "title", "summary", "name") ?? p.ref),
    descricao: texto(primeiro(p.o, "fields.description", "fields.System.Description", "System.Description", "description")),
    url: typeof url === "string" ? url : undefined,
    pronta: p.status.trim().toLowerCase() === pronta.trim().toLowerCase(),
  }
}

/** `comFechadas`: não descarta as tasks fechadas (para o monitor olhar a coluna de concluído). */
export const tasksMcp = (tipo: TipoFonte, config: Obj, projetoId: string, comFechadas = false): Promise<TaskDaFonte[]> =>
  comServidor(config, async (x) => (await perfil(tipo, config).tasks(x, projetoId)).filter((t) => (comFechadas || !t.fechada) && t.ref).map((t) => paraTask(t, colunaPronta(config))))

/** Escrita de volta no MCP próprio: chama `ferramenta` com os argumentos (só os que o schema dela declara). */
export const chamarFerramentaMcp = (config: Obj, ferramenta: string, args: Obj): Promise<string> =>
  comServidor(config, (x) => chamar(x, [ferramenta], args))

/** Projetos com o total de tasks abertas e quantas estão prontas. ponytail: conta até 100 tasks por projeto, no máximo 30 projetos. */
export const projetosMcp = (tipo: TipoFonte, config: Obj): Promise<ProjetoDaFonte[]> =>
  comServidor(config, async (x) => {
    const p = perfil(tipo, config)
    const lista = (await p.projetos(x)).slice(0, 30)
    return Promise.all(lista.map(async (pr) => {
      const t = (await p.tasks(x, pr.id).catch(() => [])).filter((k) => !k.fechada).map((k) => paraTask(k, colunaPronta(config)))
      return { id: pr.id, titulo: pr.titulo, totalTasks: t.length, prontas: t.filter((k) => k.pronta).length }
    }))
  })
