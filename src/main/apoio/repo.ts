/**
 * Cartas de apoio no projeto (RF 4.01 a 4.13, 4.21, 4.22): criar com padrão do tipo, editar, remover,
 * ligar a quem usa e desligar numa task antes de ela começar.
 */
import type { DatabaseSync } from "node:sqlite"
import { transacao } from "./tx"
import { AMBIENTES, AMBIENTE_PADRAO, tipoApoio, type Ambiente, type CartaApoio, type McpServidor } from "@shared/apoio"
import { depsApoio } from "./ports"

interface Linha { id: string; projeto_id: string; tipo: string; nome: string; ambiente: string; url_base: string; x: number; y: number; mcp: string | null }

function montar(db: DatabaseSync, l: Linha): CartaApoio {
  const usuarios = (db.prepare("SELECT carta_id FROM carta_apoio_uso WHERE carta_apoio_id = ?").all(l.id) as { carta_id: string }[]).map((r) => r.carta_id)
  return { id: l.id, projetoId: l.projeto_id, tipo: l.tipo, nome: l.nome, ambiente: l.ambiente as Ambiente, urlBase: l.url_base, x: l.x, y: l.y, mcp: l.mcp ? JSON.parse(l.mcp) : null, usuarios }
}

export const listarCartasApoio = (db: DatabaseSync, projetoId: string): CartaApoio[] =>
  (db.prepare("SELECT * FROM carta_apoio WHERE projeto_id = ? ORDER BY rowid").all(projetoId) as unknown as Linha[]).map((l) => montar(db, l))

export function cartaApoioPorId(db: DatabaseSync, id: string): CartaApoio | undefined {
  const l = db.prepare("SELECT * FROM carta_apoio WHERE id = ?").get(id) as Linha | undefined
  return l && montar(db, l)
}

/** Validação (RF 4.06 a 4.09). Devolve o erro ou null. */
export function validarCartaApoio(c: Pick<CartaApoio, "tipo" | "nome" | "ambiente" | "urlBase" | "mcp">): string | null {
  if (!tipoApoio(c.tipo)) return "Ferramenta desconhecida."
  if (!c.nome.trim()) return "Dê um nome para a carta de apoio."
  if (c.nome.trim().length > 60) return "O nome pode ter até 60 caracteres."
  if (!AMBIENTES.includes(c.ambiente)) return "Ambiente inválido."
  if (c.urlBase) {
    if (c.urlBase.length > 255) return "A URL base pode ter até 255 caracteres."
    let ok = false
    try { ok = /^https?:$/.test(new URL(c.urlBase).protocol) } catch { /* inválida */ }
    if (!ok) return "A URL base precisa começar com http:// ou https://."
  }
  if (c.mcp && !c.mcp.comando.trim()) return "Informe o comando do servidor MCP."
  return null
}

export interface NovaCartaApoio { projetoId: string; tipo: string; nome?: string; ambiente?: Ambiente; urlBase?: string; x?: number; y?: number; mcp?: McpServidor | null }
type Res<T> = { ok: true; valor: T } | { ok: false; erro: string }

/** RF 4.02/4.03: já entra ligada às cartas da mesa das classes que costumam usar a ferramenta (RN 39). */
export function criarCartaApoio(db: DatabaseSync, n: NovaCartaApoio): Res<CartaApoio> {
  const tipo = tipoApoio(n.tipo)
  if (!tipo) return { ok: false, erro: "Ferramenta desconhecida." }
  const c: CartaApoio = {
    id: crypto.randomUUID(), projetoId: n.projetoId, tipo: n.tipo, nome: n.nome?.trim() || tipo.nome,
    ambiente: n.ambiente ?? AMBIENTE_PADRAO, urlBase: n.urlBase?.trim() ?? "", x: n.x ?? 0, y: n.y ?? 0, mcp: n.mcp ?? null, usuarios: [],
  }
  const erro = validarCartaApoio(c)
  if (erro) return { ok: false, erro }
  c.usuarios = depsApoio().cartasDaMesa(n.projetoId).filter((m) => tipo.usuarios.includes(m.classe)).map((m) => m.id)
  transacao(db, () => {
    db.prepare("INSERT INTO carta_apoio (id, projeto_id, tipo, nome, ambiente, url_base, x, y, mcp) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(c.id, c.projetoId, c.tipo, c.nome, c.ambiente, c.urlBase, c.x, c.y, c.mcp ? JSON.stringify(c.mcp) : null)
    for (const u of c.usuarios) db.prepare("INSERT INTO carta_apoio_uso VALUES (?,?)").run(c.id, u)
  })
  return { ok: true, valor: c }
}

/** RF 4.04/4.05/4.06/4.08/4.09: troca o que veio em `p` (inclusive a lista de quem usa). */
export function atualizarCartaApoio(db: DatabaseSync, id: string, p: Partial<Pick<CartaApoio, "nome" | "ambiente" | "urlBase" | "x" | "y" | "mcp" | "usuarios">>): Res<CartaApoio> {
  const atual = cartaApoioPorId(db, id)
  if (!atual) return { ok: false, erro: "Carta de apoio não encontrada." }
  const novo = { ...atual, ...p }
  const erro = validarCartaApoio(novo)
  if (erro) return { ok: false, erro }
  transacao(db, () => {
    db.prepare("UPDATE carta_apoio SET nome=?, ambiente=?, url_base=?, x=?, y=?, mcp=? WHERE id=?")
      .run(novo.nome.trim(), novo.ambiente, novo.urlBase, novo.x, novo.y, novo.mcp ? JSON.stringify(novo.mcp) : null, id)
    if (p.usuarios) {
      db.prepare("DELETE FROM carta_apoio_uso WHERE carta_apoio_id = ?").run(id)
      for (const u of new Set(p.usuarios)) db.prepare("INSERT INTO carta_apoio_uso VALUES (?,?)").run(id, u)
    }
  })
  return { ok: true, valor: cartaApoioPorId(db, id)! }
}

/** RF 4.11. Escritas pendentes dela ficam descartadas; o histórico (artefatos) permanece. */
export function removerCartaApoio(db: DatabaseSync, id: string): void {
  transacao(db, () => {
    db.prepare("UPDATE apoio_artefato SET situacao='descartado' WHERE carta_apoio_id=? AND situacao='pendente'").run(id)
    db.prepare("DELETE FROM carta_apoio WHERE id=?").run(id)
  })
}

/** RF 4.21 / RN 47: só antes de a task começar. */
export function desligarNaTask(db: DatabaseSync, taskId: string, cartaApoioId: string, desligado: boolean): Res<null> {
  const t = depsApoio().task(taskId)
  if (!t) return { ok: false, erro: "Task não encontrada." }
  if (t.iniciada) return { ok: false, erro: "Depois que a task começa, as ferramentas ficam fixas." }
  if (desligado) db.prepare("INSERT OR IGNORE INTO task_apoio_desligado VALUES (?,?)").run(taskId, cartaApoioId)
  else db.prepare("DELETE FROM task_apoio_desligado WHERE task_id=? AND carta_apoio_id=?").run(taskId, cartaApoioId)
  return { ok: true, valor: null }
}
export const desligadasNaTask = (db: DatabaseSync, taskId: string): string[] =>
  (db.prepare("SELECT carta_apoio_id FROM task_apoio_desligado WHERE task_id=?").all(taskId) as { carta_apoio_id: string }[]).map((r) => r.carta_apoio_id)

/** RF 4.22: ferramentas que já geraram algum artefato na task. */
export const ferramentasUsadas = (db: DatabaseSync, taskId: string): string[] =>
  (db.prepare("SELECT DISTINCT carta_apoio_id FROM apoio_artefato WHERE task_id=?").all(taskId) as { carta_apoio_id: string }[]).map((r) => r.carta_apoio_id)

/** RF 3.29: aviso para a validação da mesa quando há carta de PR sem a carta de apoio Git. */
export function avisoPrSemGit(db: DatabaseSync, projetoId: string): string | null {
  const temPr = depsApoio().cartasDaMesa(projetoId).some((c) => c.classe === "pr")
  const temGit = listarCartasApoio(db, projetoId).some((c) => c.tipo === "git")
  return temPr && !temGit ? "A carta de Pull Request precisa da carta de apoio Repositório Git para abrir o PR." : null
}
