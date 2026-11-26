/**
 * Fontes de tasks (E10): onde as tasks nascem. GitHub pelo `gh` (o mesmo conector dos monitores);
 * Qualquer outro sistema por servidor MCP próprio (fontes-mcp.ts); Lupito ainda não tem especificação.
 * `registrarIpcFontes(db)` cuida também do contexto do projeto e da task.
 */
import { ipcMain } from "electron"
import type { DatabaseSync } from "node:sqlite"
import { COLUNA_PRONTA, type Fonte, type NovaFonte, type ProjetoDaFonte, type TaskDaFonte } from "@shared/fonte"
import type { Resultado } from "@shared/tipos"
import { graphqlGithub } from "./monitores/conector"
import { projetosMcp, servidorDe, tasksMcp, testarMcp, ferramentasMcp } from "./fontes-mcp"
import { criarTask, definirContextoTask } from "./motor/motor"
import { listarMcpsDaClaude } from "./claude-mcp"

type Cfg = Record<string, unknown>
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const ok = <T,>(valor: T): Resultado<T> => ({ ok: true, valor })

const paraFonte = (l: any): Fonte => ({ id: l.id, tipo: l.tipo, rotulo: l.rotulo, config: JSON.parse(l.config), conectadaEm: l.conectada_em })
export const listarFontes = (db: DatabaseSync): Fonte[] => (db.prepare("SELECT * FROM fonte ORDER BY conectada_em").all() as any[]).map(paraFonte)
const lerFonte = (db: DatabaseSync, id: string) => listarFontes(db).find((f) => f.id === id)

/** Erro de formato da fonte, ou null. */
function validar(n: NovaFonte): string | null {
  if (n.tipo === "lupito") return "O MCP Lupito chega quando a especificação existir."
  if (!["github", "mcp"].includes(n.tipo)) return "Tipo de fonte desconhecido."
  if (n.tipo === "mcp" && !String(n.config.ferramentaTasks ?? "").trim()) return "Informe a ferramenta que lista as tasks."
  if (!n.rotulo.trim()) return "Dê um nome à fonte."
  if (n.tipo !== "github") try { servidorDe(n.config) } catch (e) { return msg(e) }
  return null
}

export function criarFonte(db: DatabaseSync, n: NovaFonte): Resultado<Fonte> {
  const erro = validar(n)
  if (erro) return { ok: false, erro }
  const id = crypto.randomUUID()
  db.prepare("INSERT INTO fonte (id, tipo, rotulo, config, conectada_em) VALUES (?,?,?,?,?)").run(id, n.tipo, n.rotulo.trim(), JSON.stringify(n.config), Date.now())
  return ok(lerFonte(db, id)!)
}

export function atualizarFonte(db: DatabaseSync, id: string, n: Partial<NovaFonte>): Resultado<Fonte> {
  const atual = lerFonte(db, id)
  if (!atual) return { ok: false, erro: "Essa fonte não existe mais." }
  const novo = { tipo: atual.tipo, rotulo: n.rotulo ?? atual.rotulo, config: n.config ?? atual.config }
  const erro = validar(novo)
  if (erro) return { ok: false, erro }
  db.prepare("UPDATE fonte SET rotulo = ?, config = ? WHERE id = ?").run(novo.rotulo.trim(), JSON.stringify(novo.config), id)
  return ok(lerFonte(db, id)!)
}

/** Os projetos que usavam a fonte ficam como estão (a ligação vira nula); os monitores dela são excluídos (as tasks criadas ficam). */
export function removerFonte(db: DatabaseSync, id: string): Resultado<null> {
  db.prepare("DELETE FROM monitor WHERE conector = ?").run(`fonte:${id}`) // sem a fonte o monitor não lê mais o board
  db.prepare("DELETE FROM fonte WHERE id = ?").run(id)
  return ok(null)
}

// ---------- GitHub (Projects v2, pelo gh) ----------

const STATUS = `status:fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }`
const CONTEUDO = `content{ ... on Issue{title body url number ie:state repository{nameWithOwner}} ... on PullRequest{title body url number pe:state repository{nameWithOwner}} ... on DraftIssue{title body} }`
const aberto = (n: any) => !["CLOSED", "MERGED"].includes(n.content?.ie ?? n.content?.pe)
const mesmo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

async function donoGithub(cfg: Cfg): Promise<string> {
  const d = String(cfg.dono ?? "").trim()
  return d || (await graphqlGithub("query{ viewer{ login } }")).viewer.login
}

const taskGithub = (n: any, pronta: string): TaskDaFonte => ({
  ref: n.content.repository ? `${n.content.repository.nameWithOwner}#${n.content.number}` : n.id,
  titulo: n.content.title, descricao: n.content.body ?? "", url: n.content.url, pronta: !!n.status?.name && mesmo(n.status.name, pronta),
})

async function projetosGithub(cfg: Cfg): Promise<ProjetoDaFonte[]> {
  const pronta = String(cfg.colunaPronta || COLUNA_PRONTA)
  const d = await graphqlGithub(
    `query($dono:String!){ repositoryOwner(login:$dono){ ... on ProjectV2Owner { projectsV2(first:30, orderBy:{field:UPDATED_AT,direction:DESC}){ nodes{ number title closed
      items(first:100){ nodes{ id ${STATUS} ${CONTEUDO} } } } } } } }`, { dono: await donoGithub(cfg) })
  const nos: any[] = d.repositoryOwner?.projectsV2?.nodes ?? []
  // ponytail: conta só os 100 primeiros itens de cada projeto.
  return nos.filter((p) => !p.closed).map((p) => {
    const t = p.items.nodes.filter((n: any) => n.content?.title && aberto(n)).map((n: any) => taskGithub(n, pronta))
    return { id: `${p.number}`, titulo: p.title, totalTasks: t.length, prontas: t.filter((k: TaskDaFonte) => k.pronta).length }
  })
}

async function tasksGithub(cfg: Cfg, numero: string): Promise<TaskDaFonte[]> {
  const pronta = String(cfg.colunaPronta || COLUNA_PRONTA), dono = await donoGithub(cfg)
  const out: TaskDaFonte[] = []
  let depois = ""
  for (let pagina = 0; pagina < 5; pagina++) { // ponytail: até 500 itens
    const d = await graphqlGithub(
      `query($dono:String!,$n:Int!,$depois:String){ repositoryOwner(login:$dono){ ... on ProjectV2Owner { projectV2(number:$n){ items(first:100, after:$depois){
        pageInfo{hasNextPage endCursor} nodes{ id ${STATUS} ${CONTEUDO} } } } } } }`, { dono, n: Number(numero), ...(depois ? { depois } : {}) })
    const itens = d.repositoryOwner?.projectV2?.items
    if (!itens) throw new Error(`Projeto ${dono}/${numero} não encontrado (ou sem permissão).`)
    for (const n of itens.nodes) if (n.content?.title && aberto(n)) out.push(taskGithub(n, pronta))
    if (!itens.pageInfo.hasNextPage) break
    depois = itens.pageInfo.endCursor
  }
  return out
}

// ---------- por fonte ----------

function daFonte(db: DatabaseSync, id: string): Fonte {
  const f = lerFonte(db, id)
  if (!f) throw new Error("Essa fonte não existe mais.")
  if (f.tipo === "lupito") throw new Error("O MCP Lupito chega quando a especificação existir.")
  return f
}

export async function testarFonte(db: DatabaseSync, id: string): Promise<string> {
  const f = daFonte(db, id)
  if (f.tipo === "github") return `Conectado como ${(await graphqlGithub("query{ viewer{ login } }")).viewer.login}.`
  return testarMcp(f.config)
}
export function projetosDaFonte(db: DatabaseSync, id: string): Promise<ProjetoDaFonte[]> {
  const f = daFonte(db, id)
  return f.tipo === "github" ? projetosGithub(f.config) : projetosMcp(f.tipo, f.config)
}
export function tasksDaFonte(db: DatabaseSync, id: string, projetoId: string): Promise<TaskDaFonte[]> {
  const f = daFonte(db, id)
  return f.tipo === "github" ? tasksGithub(f.config, projetoId) : tasksMcp(f.tipo, f.config, projetoId)
}

/** "Buscar": traz as tasks abertas do projeto da fonte que ainda não existem no projeto (pela referência). */
export async function buscarRestantes(db: DatabaseSync, projetoId: string): Promise<number> {
  const p = db.prepare("SELECT fonte_id, fonte_projeto FROM projeto WHERE id = ?").get(projetoId) as { fonte_id: string | null; fonte_projeto: string | null } | undefined
  if (!p?.fonte_id || !p.fonte_projeto) throw new Error("Este projeto não veio de uma fonte.")
  const ja = new Set((db.prepare("SELECT referencia FROM task WHERE projeto_id = ? AND referencia IS NOT NULL").all(projetoId) as { referencia: string }[]).map((r) => r.referencia))
  let n = 0
  for (const t of await tasksDaFonte(db, p.fonte_id, JSON.parse(p.fonte_projeto).id)) {
    if (ja.has(t.ref)) continue
    if (criarTask(db, { projetoId, missao: t.descricao.trim() || t.titulo, titulo: t.titulo, referencia: t.ref }).ok) n++
  }
  return n
}

async function tentar<T>(fn: () => T | Promise<T>): Promise<Resultado<T>> {
  try { return ok(await fn()) } catch (e) { return { ok: false, erro: msg(e) } }
}

export function registrarIpcFontes(db: DatabaseSync) {
  ipcMain.handle("fontes:listar", () => listarFontes(db))
  ipcMain.handle("fontes:criar", (_e, n: NovaFonte) => criarFonte(db, n))
  ipcMain.handle("fontes:atualizar", (_e, id: string, n: Partial<NovaFonte>) => atualizarFonte(db, id, n))
  ipcMain.handle("fontes:remover", (_e, id: string) => removerFonte(db, id))
  ipcMain.handle("fontes:ferramentas", (_e, config: Record<string, unknown>) => tentar(() => ferramentasMcp(config)))
  ipcMain.handle("fontes:testar", (_e, id: string) => tentar(() => testarFonte(db, id)))
  ipcMain.handle("fontes:projetos", (_e, id: string) => tentar(() => projetosDaFonte(db, id)))
  ipcMain.handle("fontes:tasks", (_e, id: string, projetoId: string) => tentar(() => tasksDaFonte(db, id, projetoId)))
  ipcMain.handle("fontes:buscar", (_e, projetoId: string) => tentar(() => buscarRestantes(db, projetoId)))
  ipcMain.handle("fontes:mcps-claude", () => listarMcpsDaClaude())
  ipcMain.handle("contexto:projeto", (_e, id: string, texto: string) => {
    db.prepare("UPDATE projeto SET contexto = ? WHERE id = ?").run(texto.trim(), id)
    return ok(null)
  })
  ipcMain.handle("contexto:task", (_e, id: string, texto: string) => definirContextoTask(db, id, texto))
}
