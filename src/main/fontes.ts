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
import { projetosMcp, servidorDe, tasksMcp, testarMcp, ferramentasMcp, usarFerramentaMcp } from "./fontes-mcp"
import { criarTask, definirContextoTask, registrarEvento } from "./motor/motor"
import { lerTask } from "./motor/dados"
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
  const novas: string[] = []
  for (const t of await tasksDaFonte(db, p.fonte_id, JSON.parse(p.fonte_projeto).id)) {
    if (ja.has(t.ref)) continue
    const r = criarTask(db, { projetoId, missao: t.descricao.trim() || t.titulo, titulo: t.titulo, referencia: t.ref })
    if (r.ok) novas.push(r.valor.id)
  }
  cardsEmSegundoPlano(db, novas)
  return novas.length
}

// ---------- card como spec e movimento ao começar/aceitar (fonte MCP) ----------

/** A fonte MCP e o id do card de uma task: pelo monitor (conector "fonte:<id>") ou pelo projeto que veio da fonte. `monitor` traz as colunas do próprio monitor. */
function origemMcp(db: DatabaseSync, taskId: string) {
  const visto = db.prepare("SELECT v.ref, m.conector, m.coluna_inicio, m.coluna_conclusao FROM monitor_visto v JOIN monitor m ON m.id = v.monitor_id WHERE v.task_id = ?").get(taskId) as any
  // Sem visto (tasks criadas antes da correção do monitor): o monitor de fonte do próprio projeto.
  const v = visto ?? db.prepare("SELECT NULL AS ref, m.conector, m.coluna_inicio, m.coluna_conclusao FROM monitor m JOIN task t ON t.projeto_id = m.projeto_id WHERE t.id = ? AND m.conector LIKE 'fonte:%' LIMIT 1").get(taskId) as any
  const t = db.prepare("SELECT t.referencia, p.fonte_id FROM task t JOIN projeto p ON p.id = t.projeto_id WHERE t.id = ?").get(taskId) as any
  const id = v?.conector?.startsWith("fonte:") ? v.conector.slice(6) : t?.fonte_id
  const ref = v?.ref ?? t?.referencia
  const f = id && ref ? lerFonte(db, id) : undefined
  return f?.tipo === "mcp" ? { f, ref: String(ref), monitor: v ? { inicio: String(v.coluna_inicio), conclusao: String(v.coluna_conclusao) } : undefined } : undefined
}

/** Busca o card (ferramenta de detalhe) e grava em task.card; falha mantém o anterior. */
export async function atualizarCard(db: DatabaseSync, taskId: string): Promise<void> {
  const o = origemMcp(db, taskId)
  if (!o) throw new Error("Esta task não tem uma fonte MCP.")
  const d = await usarFerramentaMcp(o.f.config, "detalhe", o.ref)
  if (!d) throw new Error("A fonte não tem ferramenta de detalhe.")
  db.prepare("UPDATE task SET card = ? WHERE id = ?").run(d, taskId)
}
/** Igual, mas falha só vira aviso no histórico da task (importação e início). */
export const atualizarCardSilencioso = (db: DatabaseSync, taskId: string) =>
  atualizarCard(db, taskId).catch((e) => { if (origemMcp(db, taskId)) registrarEvento(db, taskId, "aviso", `Não consegui ler o card na fonte: ${msg(e)}`) })
/** Importação: busca os cards em segundo plano, um de cada vez (cada busca abre uma conexão). */
export function cardsEmSegundoPlano(db: DatabaseSync, ids: string[]) {
  void (async () => { for (const id of ids) await atualizarCardSilencioso(db, id) })()
}

/** Ao começar/aceitar, move o card para a coluna da fonte (se preenchida; o monitor, se tiver coluna própria, já moveu). */
export async function moverNaFonte(db: DatabaseSync, taskId: string, quando: "aoComecar" | "aoAceitar") {
  const o = origemMcp(db, taskId)
  const coluna = String(o?.f.config[quando] ?? "").trim()
  if (!o || !coluna || (quando === "aoComecar" ? o.monitor?.inicio : o.monitor?.conclusao)) return
  try { await usarFerramentaMcp(o.f.config, "mover", o.ref, coluna) } catch (e) {
    registrarEvento(db, taskId, "aviso", `Não consegui mover o card ${o.ref} para "${coluna}": ${msg(e)}`)
  }
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
  ipcMain.handle("tasks:atualizar-card", (_e, id: string) => tentar(async () => { await atualizarCard(db, id); return lerTask(db, id)! }))
  ipcMain.handle("fontes:buscar", (_e, projetoId: string) => tentar(() => buscarRestantes(db, projetoId)))
  ipcMain.handle("fontes:mcps-claude", () => listarMcpsDaClaude())
  ipcMain.handle("contexto:projeto", (_e, id: string, texto: string) => {
    db.prepare("UPDATE projeto SET contexto = ? WHERE id = ?").run(texto.trim(), id)
    return ok(null)
  })
  // motivos de decisão já gravados em outras tasks do projeto (para destacar travas repetidas)
  ipcMain.handle("contexto:decisoes", (_e, projetoId: string, exceto: string) =>
    (db.prepare("SELECT DISTINCT e.texto FROM evento_task e JOIN task t ON t.id = e.task_id WHERE t.projeto_id = ? AND e.task_id <> ? AND e.tipo = 'decisao'")
      .all(projetoId, exceto) as { texto: string }[]).map((l) => l.texto))
  ipcMain.handle("contexto:task", (_e, id: string, texto: string) => definirContextoTask(db, id, texto))
}
