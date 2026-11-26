/**
 * Monitores (RF 5.01 a 5.22, 6.04): CRUD, checagem (automática e à mão), cada card uma vez,
 * escrita de volta no board (mover coluna, comentar a dúvida) e retomada quando o card volta de coluna.
 * Interfaces com o motor: ./ports.ts. Conector do board: ./conector.ts.
 */
import type { DatabaseSync } from "node:sqlite"
import { cardsNovos, INTERVALO_MIN_PADRAO, type EstadoVisto, type Monitor } from "@shared/monitor"
import { AvisoBoard, conectores, resolverConector } from "./conector"
import { transacao } from "../db"
import { depsMonitor, emitirMonitor } from "./ports"
import { MARCADOR, mesmaColuna, parseConsulta, motivoSemMesa, respostaDoCard } from "./puro"

interface Linha {
  id: string; projeto_id: string; nome: string; conector: string; consulta: string; intervalo_min: number; ativo: number; inicio_automatico: number
  carta_inicial_id: string | null; coluna_inicio: string; coluna_conclusao: string; coluna_trava: string; comentar_ao_travar: number
  coluna_retomada: string; ultima_checagem: number | null; proxima_checagem: number | null; ultimo_resultado: string; total_criadas: number
}
const paraMonitor = (l: Linha): Monitor => ({
  id: l.id, projetoId: l.projeto_id, nome: l.nome, conector: l.conector, consulta: l.consulta, intervaloMin: l.intervalo_min, ativo: !!l.ativo,
  inicioAutomatico: !!l.inicio_automatico, cartaInicialId: l.carta_inicial_id, colunaInicio: l.coluna_inicio, colunaConclusao: l.coluna_conclusao,
  colunaTrava: l.coluna_trava, comentarAoTravar: !!l.comentar_ao_travar, colunaRetomada: l.coluna_retomada, ultimaChecagem: l.ultima_checagem,
  proximaChecagem: l.proxima_checagem, ultimoResultado: l.ultimo_resultado, totalCriadas: l.total_criadas,
})

type Res<T> = { ok: true; valor: T } | { ok: false; erro: string }

export const listarMonitores = (db: DatabaseSync, projetoId?: string): Monitor[] =>
  (db.prepare(`SELECT * FROM monitor ${projetoId ? "WHERE projeto_id=?" : ""} ORDER BY rowid`).all(...(projetoId ? [projetoId] : [])) as unknown as Linha[]).map(paraMonitor)
export const monitorPorId = (db: DatabaseSync, id: string): Monitor | undefined => {
  const l = db.prepare("SELECT * FROM monitor WHERE id=?").get(id) as Linha | undefined
  return l && paraMonitor(l)
}

export { conectores }

export function validarMonitor(db: DatabaseSync, m: Monitor): string | null {
  const con = resolverConector(db, m.conector)
  if (!m.nome.trim()) return "Dê um nome para o monitor."
  if (m.nome.trim().length > 80) return "O nome pode ter até 80 caracteres."
  if (!con) return "Conector desconhecido."
  const e = con.validarConsulta(m.consulta)
  if (e) return e
  if (!Number.isInteger(m.intervaloMin) || m.intervaloMin < 1 || m.intervaloMin > 1440) return "O intervalo vai de 1 a 1440 minutos."
  for (const c of [m.colunaInicio, m.colunaConclusao, m.colunaTrava, m.colunaRetomada]) if (c.length > 60) return "O nome de uma coluna pode ter até 60 caracteres."
  if (m.cartaInicialId && !db.prepare("SELECT 1 FROM carta WHERE id=?").get(m.cartaInicialId)) return "A carta que começa não existe."
  return null
}

export type NovoMonitor = Partial<Omit<Monitor, "id" | "ultimaChecagem" | "proximaChecagem" | "ultimoResultado" | "totalCriadas">> & Pick<Monitor, "projetoId" | "nome" | "conector" | "consulta">

function gravar(db: DatabaseSync, m: Monitor) {
  db.prepare(`INSERT OR REPLACE INTO monitor (id, projeto_id, nome, conector, consulta, intervalo_min, ativo, inicio_automatico, carta_inicial_id, coluna_inicio,
    coluna_conclusao, coluna_trava, comentar_ao_travar, coluna_retomada, ultima_checagem, proxima_checagem, ultimo_resultado, total_criadas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(m.id, m.projetoId, m.nome.trim(), m.conector, m.consulta.trim(), m.intervaloMin, +m.ativo, +m.inicioAutomatico, m.cartaInicialId, m.colunaInicio, m.colunaConclusao,
      m.colunaTrava, +m.comentarAoTravar, m.colunaRetomada, m.ultimaChecagem, m.proximaChecagem, m.ultimoResultado, m.totalCriadas)
}

export function criarMonitor(db: DatabaseSync, n: NovoMonitor): Res<Monitor> {
  const m: Monitor = {
    intervaloMin: INTERVALO_MIN_PADRAO, ativo: true, inicioAutomatico: false, cartaInicialId: null, colunaInicio: "", colunaConclusao: "", colunaTrava: "",
    comentarAoTravar: false, colunaRetomada: "", ...n, id: crypto.randomUUID(), ultimaChecagem: null, proximaChecagem: null, ultimoResultado: "", totalCriadas: 0,
  }
  const erro = validarMonitor(db, m)
  if (erro) return { ok: false, erro }
  gravar(db, m)
  return { ok: true, valor: m }
}

/** RF 5.12 (pausar/ativar = `ativo`), 5.04, 5.06, 5.14 a 5.18 e demais campos editáveis. */
export function atualizarMonitor(db: DatabaseSync, id: string, p: Partial<Omit<Monitor, "id" | "projetoId">>): Res<Monitor> {
  const atual = monitorPorId(db, id)
  if (!atual) return { ok: false, erro: "Monitor não encontrado." }
  const novo: Monitor = { ...atual, ...p }
  const erro = validarMonitor(db, novo)
  if (erro) return { ok: false, erro }
  if (p.ativo === true && !atual.ativo) novo.proximaChecagem = Date.now() // ativado: checa logo
  if (p.intervaloMin && p.intervaloMin !== atual.intervaloMin && novo.ultimaChecagem) novo.proximaChecagem = novo.ultimaChecagem + novo.intervaloMin * 60_000
  gravar(db, novo)
  return { ok: true, valor: novo }
}

/** RF 5.13 / RN 56: para de ler; as tasks criadas ficam. */
export const excluirMonitor = (db: DatabaseSync, id: string) => void db.prepare("DELETE FROM monitor WHERE id=?").run(id)

function concluirChecagem(db: DatabaseSync, m: Monitor, resultado: string, criadas: string[], retomadas: string[]) {
  const agora = Date.now()
  const novo = { ...(monitorPorId(db, m.id) ?? m), ultimaChecagem: agora, proximaChecagem: agora + m.intervaloMin * 60_000, ultimoResultado: resultado }
  if (criadas.length) novo.totalCriadas += criadas.length
  gravar(db, novo)
  emitirMonitor({ tipo: "checagem", monitor: novo, criadas, retomadas, resultado })
  return novo
}

const emChecagem = new Set<string>()

/** RF 5.08/5.09: uma checagem. À mão (`manual`) funciona mesmo com o monitor pausado (RN 50). */
export async function checar(db: DatabaseSync, id: string, manual = false): Promise<Res<Monitor>> {
  const m = monitorPorId(db, id)
  if (!m) return { ok: false, erro: "Monitor não encontrado." }
  if (!manual && !m.ativo) return { ok: false, erro: "Monitor pausado." }
  if (emChecagem.has(id)) return { ok: false, erro: "Já existe uma checagem em andamento." }
  emChecagem.add(id)
  const criadas: string[] = [], retomadas: string[] = []
  try {
    const con = resolverConector(db, m.conector)
    if (!con) { // conector sumiu (fonte removida): grava o erro e adia, em vez de tentar a cada 30 s
      const r = concluirChecagem(db, m, "Conector desconhecido (a fonte foi removida?). Escolha outro conector.", [], [])
      return { ok: true, valor: r }
    }
    const d = depsMonitor()
    try {
      // 1. Retomada (RF 5.20): cards de tasks travadas que voltaram para a coluna de retomada.
      if (m.colunaRetomada) {
        const travadas = db.prepare("SELECT ref, task_id FROM monitor_visto WHERE monitor_id=? AND estado='travada' AND task_id IS NOT NULL").all(id) as { ref: string; task_id: string }[]
        for (const t of travadas) {
          const card = await con.lerCard(t.ref)
          if (!mesmaColuna(card.coluna, m.colunaRetomada)) continue
          d.retomarTask(t.task_id, respostaDoCard(card.comentarios))
          db.prepare("UPDATE monitor_visto SET estado='em_andamento' WHERE monitor_id=? AND ref=?").run(id, t.ref)
          retomadas.push(t.task_id)
        }
      }
      // 2. Cards novos, se a mesa estiver pronta (RF 5.21).
      const motivo = motivoSemMesa(d.mesaPronta(m.projetoId), m.inicioAutomatico)
      let resultado: string
      if (motivo) resultado = motivo
      else {
        const vistos = new Set((db.prepare("SELECT ref FROM monitor_visto WHERE monitor_id=?").all(id) as { ref: string }[]).map((r) => r.ref))
        // Identidade única com "Buscar"/criar projeto: task.referencia = chave do card (owner/repo#n ou ref da fonte).
        const jaNoProjeto = new Set((db.prepare("SELECT referencia FROM task WHERE projeto_id=? AND referencia IS NOT NULL").all(m.projetoId) as { referencia: string }[]).map((r) => r.referencia))
        const novos = cardsNovos(await con.buscar(m.consulta), vistos).filter((c) => !jaNoProjeto.has(c.chave ?? c.ref))
        for (const c of novos) {
          const referencia = c.chave ?? c.ref
          // ponytail: criarTask do motor abre transação própria (não aninha); aqui o visto e a referência gravam juntos logo depois.
          const taskId = d.criarTask({ projetoId: m.projetoId, monitorId: id, titulo: c.titulo, descricao: c.corpo, url: c.url, referencia, cartaInicialId: m.cartaInicialId, iniciarAgora: m.inicioAutomatico })
          transacao(db, () => {
            db.prepare("UPDATE task SET referencia=? WHERE id=?").run(referencia, taskId)
            db.prepare("INSERT INTO monitor_visto (monitor_id, ref, task_id, estado, titulo, criado_em) VALUES (?,?,?,?,?,?)").run(id, c.ref, taskId, "criada", c.titulo, Date.now())
          })
          criadas.push(taskId)
        }
        resultado = novos.length ? `${novos.length} card(s) novo(s) viraram task.` : "Nenhum card novo."
      }
      if (retomadas.length) resultado += ` ${retomadas.length} task(s) retomada(s).`
      return { ok: true, valor: concluirChecagem(db, m, resultado, criadas, retomadas) }
    } catch (e) {
      // Cards já criados antes do erro ficam registrados; o que falhou não foi marcado como visto e entra na próxima.
      return { ok: true, valor: concluirChecagem(db, m, `Erro na checagem: ${e instanceof Error ? e.message : String(e)}`, criadas, retomadas) }
    }
  } finally {
    emChecagem.delete(id)
  }
}

/** RF 5.09/5.22: confere de tempos em tempos quais monitores ativos estão na hora. Devolve a função que para. */
export function iniciarAgendador(db: DatabaseSync, passoMs = 30_000): () => void {
  const volta = () => {
    const agora = Date.now()
    for (const m of listarMonitores(db)) if (m.ativo && (m.proximaChecagem ?? 0) <= agora) void checar(db, m.id)
  }
  volta()
  const t = setInterval(volta, passoMs)
  return () => clearInterval(t)
}

// ---- Escrita de volta no board: o motor avisa o ciclo de vida da task ----

function doCard(db: DatabaseSync, taskId: string) {
  const v = db.prepare("SELECT monitor_id, ref FROM monitor_visto WHERE task_id=?").get(taskId) as { monitor_id: string; ref: string } | undefined
  const m = v && monitorPorId(db, v.monitor_id)
  const con = m && resolverConector(db, m.conector)
  return m && con && v ? { m, con, ref: v.ref } : undefined
}
const estado = (db: DatabaseSync, taskId: string, e: EstadoVisto) => db.prepare("UPDATE monitor_visto SET estado=? WHERE task_id=?").run(e, taskId)

async function escrever(db: DatabaseSync, taskId: string, fn: (c: NonNullable<ReturnType<typeof doCard>>) => Promise<void>) {
  const c = doCard(db, taskId)
  if (!c) return // task que não veio de monitor
  try { await fn(c) } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    if (e instanceof AvisoBoard) return void emitirMonitor({ tipo: "erro-board", monitorId: c.m.id, taskId, erro }) // aviso: só o evento, sem sujar o resultado
    db.prepare("UPDATE monitor SET ultimo_resultado=? WHERE id=?").run(`Erro ao escrever no board: ${erro}`, c.m.id)
    emitirMonitor({ tipo: "erro-board", monitorId: c.m.id, taskId, erro })
  }
}

/** RF 5.16. */
export async function aoComecar(db: DatabaseSync, taskId: string) {
  estado(db, taskId, "em_andamento")
  await escrever(db, taskId, async ({ m, con, ref }) => { if (m.colunaInicio) await con.mover(ref, m.colunaInicio) })
}

/** RF 5.17: move para a coluna de conclusão e deixa o link do PR no card, se houver. */
export async function aoConcluir(db: DatabaseSync, taskId: string, info: { prUrl?: string } = {}) {
  estado(db, taskId, "concluida")
  await escrever(db, taskId, async ({ m, con, ref }) => {
    if (m.colunaConclusao) await con.mover(ref, m.colunaConclusao)
    if (info.prUrl) await con.comentar(ref, `${MARCADOR} Task concluída. PR: ${info.prUrl}`)
  })
}

/** RF 5.18/5.19: move para a coluna de trava e, se ligado, comenta a dúvida. */
export async function aoTravar(db: DatabaseSync, taskId: string, duvida: string) {
  estado(db, taskId, "travada")
  await escrever(db, taskId, async ({ m, con, ref }) => {
    if (m.colunaTrava) await con.mover(ref, m.colunaTrava)
    if (m.comentarAoTravar) {
      const volta = m.colunaRetomada ? `\n\nResponda neste card e mova-o para "${m.colunaRetomada}" para a task continuar.` : ""
      await con.comentar(ref, `${MARCADOR} A task travou e precisa de você: ${duvida}${volta}`)
    }
  })
}

/** Task parada: comenta o motivo no card e o devolve à coluna de onde veio (a da consulta do monitor). */
export async function aoParar(db: DatabaseSync, taskId: string, motivo: string) {
  estado(db, taskId, "criada")
  await escrever(db, taskId, async ({ m, con, ref }) => {
    const origem = parseConsulta(m.consulta)?.coluna ?? m.consulta.slice(m.consulta.indexOf(":") + 1).trim()
    if (origem) await con.mover(ref, origem)
    await con.comentar(ref, `${MARCADOR} A task foi parada: ${motivo}`)
  })
}
