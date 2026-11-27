/**
 * Visão geral e acabamento (E8): resumo dos projetos para os cartões, aviso de task concluída
 * (notificação do sistema), boas-vindas do primeiro acesso e "apagar tudo".
 * Lê o banco direto; o motor só é chamado para parar as tasks.
 */
import { BrowserWindow, Notification } from "electron"
import type { DatabaseSync } from "node:sqlite"
import { carregarMesa } from "./mesa"
import { excluirProjeto, listarProjetos } from "./projetos"
import { pararTask } from "./motor/motor"
import { listarTasks } from "./motor/dados"
import { validarFluxo } from "@shared/fluxo"
import { ORDEM_SUGERIDA, type ClasseId } from "@shared/catalogo"
import type { ResumoConclusao, ResumoProjeto } from "@shared/geral"
import type { Resultado } from "@shared/tipos"

export function resumoDosProjetos(db: DatabaseSync): ResumoProjeto[] {
  const carta = db.prepare("SELECT id, nome, classe, simbolo, cor FROM carta WHERE id = ?")
  return listarProjetos(db).map((p) => {
    const mesa = carregarMesa(db, p.id)
    const time = mesa.cartas.map((c) => carta.get(c.cartaId) as ResumoProjeto["time"][number])
    const r = validarFluxo(time, mesa.conexoes)
    const faltam: ClasseId[] = r.pronto ? [] : ORDEM_SUGERIDA.filter((k) => !time.some((c) => c.classe === k))
    return { projetoId: p.id, time, fluxoValido: r.pronto, faltam, problema: r.pronto || faltam.length ? null : r.erros[0]?.mensagem ?? null }
  })
}

/** RF 6.39: monta o resumo da task concluída e mostra a notificação do sistema (a interface mostra o toast). */
export function avisarConclusao(db: DatabaseSync, taskId: string, janela: () => BrowserWindow | null): ResumoConclusao | null {
  const t = db.prepare("SELECT t.numero, t.referencia, t.titulo, t.voltas, t.tokens, p.nome AS projeto FROM task t JOIN projeto p ON p.id = t.projeto_id WHERE t.id = ?")
    .get(taskId) as { numero: number; referencia: string | null; titulo: string | null; voltas: number; tokens: number; projeto: string } | undefined
  if (!t) return null
  const perguntas = (db.prepare("SELECT COUNT(*) AS n FROM evento_task WHERE task_id = ? AND tipo = 'pergunta'").get(taskId) as { n: number }).n
  const prUrl = (db.prepare("SELECT pr_url FROM task WHERE id = ?").get(taskId) as { pr_url: string | null } | undefined)?.pr_url ?? null
  const r: ResumoConclusao = { numero: t.numero, referencia: t.referencia, titulo: t.titulo, projeto: t.projeto, prUrl, perguntas, devolucoes: t.voltas, tokens: t.tokens }
  notificar(janela, taskId, `Task ${t.referencia ?? "#" + t.numero} concluída`, `${t.projeto}${prUrl ? " · PR aberto" : ""} · ${t.voltas} devoluç${t.voltas === 1 ? "ão" : "ões"} · ${t.tokens.toLocaleString("pt-BR")} tokens`)
  return r
}

/** Notificação do sistema; o clique traz a janela e abre a task (evento "geral:abrir-task"). */
function notificar(janela: () => BrowserWindow | null, taskId: string, title: string, body: string) {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body })
  n.on("click", () => {
    const j = janela()
    if (!j || j.isDestroyed()) return
    if (j.isMinimized()) j.restore()
    j.focus()
    j.webContents.send("geral:abrir-task", taskId)
  })
  n.show()
}

/** A task precisa de você (decisão ou revisão). Com a janela em foco o toast já basta: só notifica com ela em segundo plano. */
export function avisarPendencia(db: DatabaseSync, taskId: string, tipo: "decisao" | "revisao", janela: () => BrowserWindow | null): void {
  const j = janela()
  if (j && !j.isDestroyed() && j.isFocused()) return
  const t = db.prepare("SELECT t.numero, t.referencia, t.titulo, t.missao, t.decisao_motivo, p.nome AS projeto FROM task t JOIN projeto p ON p.id = t.projeto_id WHERE t.id = ?")
    .get(taskId) as { numero: number; referencia: string | null; titulo: string | null; missao: string; decisao_motivo: string | null; projeto: string } | undefined
  if (!t) return
  const rotulo = `Task ${t.referencia ?? "#" + t.numero}`
  if (tipo === "decisao") notificar(janela, taskId, `${rotulo} espera sua decisão`, `${t.projeto} · ${(t.decisao_motivo ?? t.titulo ?? t.missao).slice(0, 180)}`)
  else notificar(janela, taskId, `${rotulo} pronta para revisão`, `${t.projeto} · ${(t.titulo ?? t.missao).slice(0, 180)}`)
}

const CHAVE_BOAS_VINDAS = "boas_vindas_vistas"
const conta = (db: DatabaseSync, tabela: "carta" | "projeto") => (db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n

/** RF 2.21: true só no primeiro acesso. Quem já tem cartas ou projetos (veio de antes da E8) não vê as boas-vindas. */
export function mostrarBoasVindas(db: DatabaseSync): boolean {
  if (db.prepare("SELECT 1 FROM configuracao WHERE chave = ?").get(CHAVE_BOAS_VINDAS)) return false
  if (conta(db, "carta") || conta(db, "projeto")) { concluirBoasVindas(db); return false }
  return true
}
export const concluirBoasVindas = (db: DatabaseSync) =>
  void db.prepare("INSERT OR REPLACE INTO configuracao (chave, valor) VALUES (?, '1')").run(CHAVE_BOAS_VINDAS)

/** RF 2.33: o tutorial abre sozinho uma vez; a flag fica em `configuracao`. */
const CHAVE_TUTORIAL = "tutorial_visto"
export const tutorialVisto = (db: DatabaseSync) => !!db.prepare("SELECT 1 FROM configuracao WHERE chave = ?").get(CHAVE_TUTORIAL)
export const concluirTutorial = (db: DatabaseSync) =>
  void db.prepare("INSERT OR REPLACE INTO configuracao (chave, valor) VALUES (?, '1')").run(CHAVE_TUTORIAL)

/** RF 2.23: para as tasks, apaga projetos (com mesa, tasks, apoio, monitores e chat) e cartas, e volta às boas-vindas. */
export async function apagarTudo(db: DatabaseSync): Promise<Resultado<null>> {
  for (const t of listarTasks(db)) if (["andamento", "aguardando"].includes(t.situacao)) await pararTask(db, t.id)
  // excluirProjeto já abre a própria transação; por isso não há uma por fora.
  for (const p of listarProjetos(db)) excluirProjeto(db, p.id)
  db.exec("DELETE FROM memoria_item; DELETE FROM carta")
  db.prepare("DELETE FROM configuracao WHERE chave IN (?, ?)").run(CHAVE_BOAS_VINDAS, CHAVE_TUTORIAL)
  return { ok: true, valor: null }
}
