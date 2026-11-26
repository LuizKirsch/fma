/** Leitura e gravação das tabelas do motor (task, task_carta, task_conexao, evento_task). */
import type { DatabaseSync } from "node:sqlite"
import type { CopiaCarta, DetalheTask, EstadoCarta, EventoTask, Task, TaskCarta, TaskConexao, TaskUsandoCarta, TipoEvento } from "@shared/task"

/** Roda `fn` numa transação (cópia local de db.transacao para o motor não depender do Electron). */
export function emTransacao<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN")
  try { const r = fn(); db.exec("COMMIT"); return r } catch (e) { db.exec("ROLLBACK"); throw e }
}

const tarefaDe = (l: any): Task => ({
  id: l.id, numero: l.numero, projetoId: l.projeto_id, taskOriginalId: l.task_original_id, referencia: l.referencia, titulo: l.titulo, missao: l.missao, ajustes: l.ajustes, contexto: l.contexto ?? "",
  situacao: l.situacao, branch: l.branch, worktree: l.worktree, voltas: l.voltas, tokens: l.tokens, alertaOrcamento: !!l.alerta_orcamento, posicaoFila: l.posicao_fila ?? null,
  decisao: l.decisao_motivo ? { motivo: l.decisao_motivo, cartaId: l.decisao_carta_id, questionadorId: l.decisao_questionador_id } : null,
  prUrl: l.pr_url ?? null, criadaEm: l.criada_em, iniciadaEm: l.iniciada_em, encerradaEm: l.encerrada_em,
})

/** Posição na fila = quantas da fila do projeto chegaram até ela (fila_em, depois número). */
const SELECIONAR = `SELECT task.*, CASE WHEN situacao = 'fila' THEN (SELECT COUNT(*) FROM task t2 WHERE t2.projeto_id = task.projeto_id AND t2.situacao = 'fila'
  AND (t2.fila_em, t2.numero) <= (task.fila_em, task.numero)) END AS posicao_fila FROM task`

export const lerTask = (db: DatabaseSync, id: string): Task | null => {
  const l = db.prepare(`${SELECIONAR} WHERE id = ?`).get(id)
  return l ? tarefaDe(l) : null
}
export const listarTasks = (db: DatabaseSync, projetoId?: string): Task[] =>
  (projetoId ? db.prepare(`${SELECIONAR} WHERE projeto_id = ? ORDER BY numero DESC`).all(projetoId) : db.prepare(`${SELECIONAR} ORDER BY numero DESC`).all()).map(tarefaDe)

/** RF 8.06: busca pela referência ou pelo título (ou pelo número, digitado como "12" ou "#12"). */
export function buscarTasks(db: DatabaseSync, projetoId: string, termo: string): Task[] {
  const t = termo.trim().toLowerCase()
  if (!t) return listarTasks(db, projetoId)
  const like = `%${t.replace(/[\\%_]/g, "\\$&")}%`
  return (db.prepare(`${SELECIONAR} WHERE projeto_id = ? AND (lower(COALESCE(referencia,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(titulo,'')) LIKE ? ESCAPE '\\' OR CAST(numero AS TEXT) = ?) ORDER BY numero DESC`)
    .all(projetoId, like, like, t.replace(/^#/, "")) as any[]).map(tarefaDe)
}

/**
 * RF 1.34 / RN 93: tasks na fila ou em andamento que usam a carta. Task na fila ainda segue a mesa (RN 58):
 * vale a carta estar na mesa do projeto e não ter sido tirada daquela task.
 */
export const cartaEmUso = (db: DatabaseSync, cartaId: string): TaskUsandoCarta[] =>
  (db.prepare(`SELECT t.id, t.numero, t.titulo, t.referencia, t.situacao FROM task t WHERE
    (t.situacao IN ('andamento','aguardando') AND EXISTS (SELECT 1 FROM task_carta c WHERE c.task_id = t.id AND c.carta_id = ?1 AND c.retirada = 0))
    OR (t.situacao = 'fila' AND EXISTS (SELECT 1 FROM carta_mesa m WHERE m.projeto_id = t.projeto_id AND m.carta_id = ?1)
        AND NOT EXISTS (SELECT 1 FROM task_carta c WHERE c.task_id = t.id AND c.carta_id = ?1 AND c.retirada = 1))
    ORDER BY t.numero`).all(cartaId) as any[]).map((l) => ({ id: l.id, numero: l.numero, titulo: l.titulo, referencia: l.referencia, situacao: l.situacao }))

/** Mensagem pronta para a exclusão da carta (RF 1.34), ou null se ela está livre. */
export function mensagemCartaEmUso(db: DatabaseSync, cartaId: string): string | null {
  const ts = cartaEmUso(db, cartaId)
  return ts.length ? `Esta carta está em uso nas tasks ${ts.map((t) => `#${t.numero}${t.referencia ? ` (${t.referencia})` : ""}`).join(", ")}. Espere terminarem ou pare as tasks.` : null
}

export const lerTaskCartas = (db: DatabaseSync, taskId: string): TaskCarta[] =>
  (db.prepare("SELECT * FROM task_carta WHERE task_id = ?").all(taskId) as any[]).map((l) => ({
    id: l.id, taskId: l.task_id, cartaId: l.carta_id, retirada: !!l.retirada, comeca: !!l.comeca, concluida: !!l.concluida,
    estado: l.estado as EstadoCarta, atividade: l.atividade, tarefa: l.tarefa, entrega: l.entrega, voltas: l.voltas,
    copia: l.copia_carta ? (JSON.parse(l.copia_carta) as CopiaCarta) : null,
  }))

export const lerTaskConexoes = (db: DatabaseSync, taskId: string): TaskConexao[] =>
  (db.prepare("SELECT * FROM task_conexao WHERE task_id = ? ORDER BY ordem").all(taskId) as any[]).map((l) => ({
    id: l.id, taskId: l.task_id, deCartaId: l.de_carta_id, paraCartaId: l.para_carta_id, tipo: l.tipo, ordem: l.ordem,
    skills: l.skills ? JSON.parse(l.skills) : [],
  }))

const eventoDe = (l: any): EventoTask => ({
  id: l.id, taskId: l.task_id, tipo: l.tipo as TipoEvento, deCartaId: l.de_carta_id, paraCartaId: l.para_carta_id,
  texto: l.texto, tokens: l.tokens, criadoEm: l.criado_em,
})
/** Crônica (sem o console) ou, com `console`, todos os eventos. `depois`: só os criados após esse instante. */
export const lerEventos = (db: DatabaseSync, taskId: string, opcoes: { console?: boolean; depois?: number } = {}): EventoTask[] =>
  (db.prepare(`SELECT * FROM evento_task WHERE task_id = ? AND criado_em > ? ${opcoes.console ? "" : "AND tipo <> 'console'"} ORDER BY criado_em, rowid`)
    .all(taskId, opcoes.depois ?? 0) as any[]).map(eventoDe)

export function detalheDaTask(db: DatabaseSync, taskId: string): DetalheTask | null {
  const task = lerTask(db, taskId)
  return task && { task, cartas: lerTaskCartas(db, taskId), conexoes: lerTaskConexoes(db, taskId), eventos: lerEventos(db, taskId) }
}

export function inserirEvento(db: DatabaseSync, e: Omit<EventoTask, "id" | "criadoEm">): EventoTask {
  const ev: EventoTask = { ...e, id: crypto.randomUUID(), criadoEm: Date.now() }
  db.prepare("INSERT INTO evento_task (id, task_id, tipo, de_carta_id, para_carta_id, texto, tokens, criado_em) VALUES (?,?,?,?,?,?,?,?)")
    .run(ev.id, ev.taskId, ev.tipo, ev.deCartaId, ev.paraCartaId, ev.texto, ev.tokens, ev.criadoEm)
  return ev
}

/** Quantas tasks esperam decisão (RF 8.21), no projeto ou em todos. */
export const contarPendencias = (db: DatabaseSync, projetoId?: string): number =>
  Number(((projetoId
    ? db.prepare("SELECT COUNT(*) n FROM task WHERE situacao IN ('aguardando', 'revisao') AND projeto_id = ?").get(projetoId)
    : db.prepare("SELECT COUNT(*) n FROM task WHERE situacao IN ('aguardando', 'revisao')").get()) as any).n)
