/**
 * Artefatos da task (RF 4.15, 4.16, 4.24) e a escrita pendente.
 * Leitura/uso: vira artefato "registrado". Escrita (RN 42/43): vira artefato "pendente" com a ação a executar
 * e, quando há, o antes/depois (RF 4.23); só `confirmar` (escrita.ts) executa.
 */
import type { DatabaseSync } from "node:sqlite"
import { proximaSituacao, tipoApoio, type AcaoEscrita, type Artefato, type SituacaoArtefato } from "@shared/apoio"
import type { ClasseId } from "@shared/catalogo"
import { cartaApoioPorId, desligadasNaTask } from "./repo"
import { depsApoio, emitirApoio } from "./ports"

interface Linha {
  id: string; task_id: string; carta_apoio_id: string; carta_id: string; titulo: string; texto: string
  ambiente: string | null; situacao: string; antes: string | null; depois: string | null; acao: string | null; criado_em: number
}
const paraArtefato = (l: Linha): Artefato => ({
  id: l.id, taskId: l.task_id, cartaApoioId: l.carta_apoio_id, cartaId: l.carta_id, titulo: l.titulo, texto: l.texto,
  ambiente: l.ambiente as Artefato["ambiente"], situacao: l.situacao as SituacaoArtefato, antes: l.antes, depois: l.depois,
  acao: l.acao ? JSON.parse(l.acao) : null, criadoEm: l.criado_em,
})

export const artefatoPorId = (db: DatabaseSync, id: string): Artefato | undefined => {
  const l = db.prepare("SELECT * FROM apoio_artefato WHERE id=?").get(id) as Linha | undefined
  return l && paraArtefato(l)
}
/** RF 4.24: tudo que as ferramentas geraram na task, agrupável por `cartaApoioId` na Entrega. */
export const artefatosDaTask = (db: DatabaseSync, taskId: string): Artefato[] =>
  (db.prepare("SELECT * FROM apoio_artefato WHERE task_id=? ORDER BY criado_em, rowid").all(taskId) as unknown as Linha[]).map(paraArtefato)
/** Escritas esperando o usuário (todas as tasks, ou de uma). */
export const escritasPendentes = (db: DatabaseSync, taskId?: string): Artefato[] =>
  (db.prepare(`SELECT * FROM apoio_artefato WHERE situacao='pendente' ${taskId ? "AND task_id=?" : ""} ORDER BY criado_em`).all(...(taskId ? [taskId] : [])) as unknown as Linha[]).map(paraArtefato)

export const mudarSituacao = (db: DatabaseSync, id: string, situacao: SituacaoArtefato, texto?: string) =>
  db.prepare("UPDATE apoio_artefato SET situacao=?, texto=COALESCE(?, texto) WHERE id=?").run(situacao, texto ?? null, id)

interface Entrada { taskId: string; cartaApoioId: string; cartaId: string; titulo: string; texto?: string }
type Res<T> = { ok: true; valor: T } | { ok: false; erro: string }

function inserir(db: DatabaseSync, e: Entrada, situacao: SituacaoArtefato, extra: { antes?: string; depois?: string; acao?: AcaoEscrita } = {}): Artefato {
  const ca = cartaApoioPorId(db, e.cartaApoioId)!
  const usaAmb = tipoApoio(ca.tipo)?.usaAmbiente || extra.acao // escrita sempre guarda o ambiente
  const a: Artefato = {
    id: crypto.randomUUID(), taskId: e.taskId, cartaApoioId: e.cartaApoioId, cartaId: e.cartaId, titulo: e.titulo.slice(0, 200), texto: e.texto ?? "",
    ambiente: usaAmb ? ca.ambiente : null, situacao, antes: extra.antes ?? null, depois: extra.depois ?? null, acao: extra.acao ?? null, criadoEm: Date.now(),
  }
  db.prepare("INSERT INTO apoio_artefato (id, task_id, carta_apoio_id, carta_id, titulo, texto, ambiente, situacao, antes, depois, acao, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(a.id, a.taskId, a.cartaApoioId, a.cartaId, a.titulo, a.texto, a.ambiente, a.situacao, a.antes, a.depois, a.acao ? JSON.stringify(a.acao) : null, a.criadoEm)
  return a
}

/** RF 4.15: cada uso de ferramenta vira artefato e linha na Crônica. */
export function registrarUso(db: DatabaseSync, e: Entrada & { antes?: string; depois?: string }): Res<Artefato> {
  if (!cartaApoioPorId(db, e.cartaApoioId)) return { ok: false, erro: "Carta de apoio não encontrada." }
  const a = inserir(db, e, "registrado", { antes: e.antes, depois: e.depois }) // antes/depois: texto ou imagem (RF 4.23)
  depsApoio().cronica(e.taskId, `${e.titulo}`)
  emitirApoio({ tipo: "uso", artefato: a })
  return { ok: true, valor: a }
}

/** RN 42: classes que podem escrever com a ferramenta (lista vazia = qualquer carta ligada). */
export const podeEscrever = (tipoChave: string, classe: ClasseId): boolean => {
  const t = tipoApoio(tipoChave)
  return !!t && t.acesso === "escrita" && (!t.escrevem.length || t.escrevem.includes(classe))
}

/** RF 4.16/4.19: deixa a escrita pendente e avisa (o Maestro chama o usuário; produção vai marcada). */
export function proporEscrita(db: DatabaseSync, e: Entrada & { classe: ClasseId; antes?: string; depois?: string; acao: AcaoEscrita }): Res<Artefato> {
  const ca = cartaApoioPorId(db, e.cartaApoioId)
  if (!ca) return { ok: false, erro: "Carta de apoio não encontrada." }
  if (desligadasNaTask(db, e.taskId).includes(ca.id)) return { ok: false, erro: "Esta ferramenta está desligada nesta task." }
  if (!ca.usuarios.includes(e.cartaId)) return { ok: false, erro: "Esta carta não está ligada à ferramenta." }
  if (!podeEscrever(ca.tipo, e.classe)) return { ok: false, erro: "Esta classe de carta só lê com essa ferramenta." }
  const a = inserir(db, e, "pendente", e)
  depsApoio().cronica(e.taskId, `Escrita pendente: ${e.titulo}`)
  emitirApoio({ tipo: "escrita-pendente", artefato: a, emProducao: a.ambiente === "producao" })
  return { ok: true, valor: a }
}

/** RF 4.18. */
export function descartar(db: DatabaseSync, id: string): Res<Artefato> {
  const a = artefatoPorId(db, id)
  if (!a) return { ok: false, erro: "Escrita não encontrada." }
  const prox = proximaSituacao(a.situacao, "descartar")
  if (!prox) return { ok: false, erro: "Esta escrita já foi decidida." }
  mudarSituacao(db, id, prox)
  const r = { ...a, situacao: prox }
  depsApoio().cronica(a.taskId, `Escrita descartada: ${a.titulo}`)
  emitirApoio({ tipo: "escrita-resolvida", artefato: r })
  return { ok: true, valor: r }
}
