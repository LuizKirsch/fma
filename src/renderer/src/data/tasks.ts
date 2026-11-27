/**
 * Estado das tasks na interface: a lista de todas as tasks, o detalhe de cada uma já aberta
 * (cartas, conexões, crônica), as linhas do console e o contador de pendências.
 * Tudo se atualiza pelos eventos do motor (window.fma.tasks.aoEvento); um único ouvinte para o app.
 */
import { useEffect, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import type { DetalheTask, EstadoCarta, EventoTask, PreviaTask, Task, TaskCarta } from "@shared/task"
import type { Resultado } from "@shared/tipos"

export interface LinhaConsole { cartaId: string | null; canal: "stdout" | "stderr"; linha: string }
interface Estado {
  tasks: Task[]
  detalhes: Record<string, DetalheTask>
  consoles: Record<string, LinhaConsole[]>
  carregado: boolean
}

const MAX_CONSOLE = 2000
let estado: Estado = { tasks: [], detalhes: {}, consoles: {}, carregado: false }
const ouvintes = new Set<() => void>()
const muda = (e: Partial<Estado>) => { estado = { ...estado, ...e }; ouvintes.forEach((f) => f()) }
const pedidos = new Set<string>()

export async function carregarDetalhe(id: string) {
  const d = await window.fma.tasks.obter(id)
  if (d) muda({ detalhes: { ...estado.detalhes, [d.task.id]: d } })
}
export async function carregarConsole(id: string) {
  const ev = await window.fma.tasks.eventos(id, { console: true })
  muda({ consoles: { ...estado.consoles, [id]: ev.filter((e) => e.tipo === "console").map((e) => ({ cartaId: e.deCartaId, canal: "stdout" as const, linha: e.texto })) } })
}

function aoEvento(e: Parameters<Parameters<typeof window.fma.tasks.aoEvento>[0]>[0]) {
  if (e.tipo === "task") {
    const t = e.task
    const antes = estado.tasks.find((x) => x.id === t.id)
    if (antes && antes.situacao !== "concluida" && t.situacao === "concluida") void avisarConclusao(t.id)
    if (antes && antes.situacao !== "revisao" && t.situacao === "revisao") {
      toast.success(`Task ${t.referencia ?? "#" + t.numero} pronta para revisão`, { description: "Veja as mudanças e aceite, peça ajuste ou descarte.", action: { label: "Abrir", onClick: () => abrirTask(t.id) } })
      void window.fma.geral.pendencia(t.id, "revisao")
    }
    const tasks = estado.tasks.some((x) => x.id === t.id) ? estado.tasks.map((x) => (x.id === t.id ? t : x)) : [t, ...estado.tasks]
    const d = estado.detalhes[t.id]
    muda({ tasks, detalhes: d ? { ...estado.detalhes, [t.id]: { ...d, task: t } } : estado.detalhes })
    // time fixado ao começar e relatório ao fechar: relê o detalhe
    if (d && (d.task.situacao !== t.situacao || !d.cartas.length)) void carregarDetalhe(t.id)
  } else if (e.tipo === "carta") {
    const d = estado.detalhes[e.taskId]
    if (!d) return
    const cartas = d.cartas.map((c) => (c.cartaId === e.cartaId ? { ...c, estado: e.estado, atividade: e.atividade, concluida: e.estado === "concluida" } : c))
    muda({ detalhes: { ...estado.detalhes, [e.taskId]: { ...d, cartas } } })
  } else if (e.tipo === "evento") {
    const d = estado.detalhes[e.evento.taskId]
    if (d && e.evento.tipo !== "console") muda({ detalhes: { ...estado.detalhes, [d.task.id]: { ...d, eventos: [...d.eventos, e.evento] } } })
  } else if (e.tipo === "console") {
    const l = [...(estado.consoles[e.taskId] ?? []), { cartaId: e.cartaId, canal: e.canal, linha: e.linha }]
    muda({ consoles: { ...estado.consoles, [e.taskId]: l.length > MAX_CONSOLE ? l.slice(-MAX_CONSOLE) : l } })
  } else if (e.tipo === "decisao") {
    const t = estado.tasks.find((x) => x.id === e.taskId)
    toast.warning(`Task #${t?.numero ?? ""} espera sua decisão`, { description: e.decisao.motivo, action: { label: "Abrir", onClick: () => abrirTask(e.taskId) } })
    void window.fma.geral.pendencia(e.taskId, "decisao")
  } else if (e.tipo === "fila") {
    const pos = new Map(e.posicoes.map((p) => [p.taskId, p.posicao]))
    muda({ tasks: estado.tasks.map((t) => (t.projetoId === e.projetoId ? { ...t, posicaoFila: pos.get(t.id) ?? null } : t)) })
  }
}

/** Pedido de abrir uma task (clique na notificação ou no toast): o App troca para o projeto e o ProjetoAberto escolhe a task. */
let pedidoAbrir: { projetoId: string; taskId: string } | null = null
const ouvintesAbrir = new Set<() => void>()
export function abrirTask(taskId: string | null) {
  const t = taskId ? estado.tasks.find((x) => x.id === taskId) : null
  pedidoAbrir = t ? { projetoId: t.projetoId, taskId: t.id } : null
  ouvintesAbrir.forEach((f) => f())
}
export const usePedidoAbrir = () => useSyncExternalStore((f) => { ouvintesAbrir.add(f); return () => ouvintesAbrir.delete(f) }, () => pedidoAbrir)

/** RF 6.39: o núcleo mostra a notificação do sistema e devolve o resumo; aqui sai o toast. */
async function avisarConclusao(id: string) {
  const r = await window.fma.geral.concluida(id)
  if (!r) return
  const n = (k: number, um: string, varios: string) => `${k} ${k === 1 ? um : varios}`
  toast.success(`Task ${r.referencia ?? "#" + r.numero} concluída`, {
    description: `${r.projeto} · ${r.prUrl ? "PR aberto" : "sem PR"} · ${n(r.perguntas, "pergunta", "perguntas")} · ${n(r.devolucoes, "devolução", "devoluções")} · ${r.tokens.toLocaleString("pt-BR")} tokens`,
    action: r.prUrl ? { label: "Abrir PR", onClick: () => window.open(r.prUrl!) } : undefined,
    duration: 12000,
  })
}

let iniciado = false
function iniciar() {
  if (iniciado) return
  iniciado = true
  window.fma.tasks.aoEvento(aoEvento)
  window.fma.geral.aoAbrirTask(abrirTask)
  void window.fma.tasks.listar().then((tasks) => muda({ tasks, carregado: true }))
}

function useEstado() {
  return useSyncExternalStore((f) => { iniciar(); ouvintes.add(f); return () => ouvintes.delete(f) }, () => estado)
}

export const useTasks = () => useEstado().tasks

/** Detalhe da task (cartas, conexões, crônica); carrega uma vez e depois acompanha os eventos. */
export function useDetalhe(id: string | null) {
  const e = useEstado()
  useEffect(() => { if (id && !estado.detalhes[id] && !pedidos.has(id)) { pedidos.add(id); void carregarDetalhe(id) } }, [id, e.detalhes])
  return id ? e.detalhes[id] ?? null : null
}

/** Trilha antes de iniciar (RF 6.06 a 6.08): relê quando a task muda (tirar e devolver carta emitem o evento da task). */
export function usePrevia(task: Task) {
  const [previa, setPrevia] = useState<PreviaTask | null>(null)
  const ativo = task.situacao === "pronta" || task.situacao === "fila"
  useEffect(() => { if (ativo) void window.fma.tasks.previa(task.id).then(setPrevia) }, [ativo, task])
  return ativo ? previa : null
}

export function useConsole(id: string | null) {
  const e = useEstado()
  useEffect(() => { if (id && !estado.consoles[id]) { muda({ consoles: { ...estado.consoles, [id]: [] } }); void carregarConsole(id) } }, [id])
  return id ? e.consoles[id] ?? [] : []
}

/** RF 8.21: tasks esperando o usuário, no projeto ou em todos. */
export const pendenciasDe = (tasks: Task[], projetoId?: string) => tasks.filter((t) => (t.situacao === "aguardando" || t.situacao === "revisao") && (!projetoId || t.projetoId === projetoId)).length

/** Situação do projeto para a aba (RF 2.09). */
export function situacaoDoProjeto(tasks: Task[], projetoId: string): "esperando" | "rodando" | "parado" {
  const dele = tasks.filter((t) => t.projetoId === projetoId)
  return dele.some((t) => t.situacao === "aguardando" || t.situacao === "revisao") ? "esperando" : dele.some((t) => t.situacao === "andamento") ? "rodando" : "parado"
}

/** RN 88: parte das cartas que concluiu, no máximo 95% até a task concluir. */
export function progresso(t: Task, cartas: TaskCarta[] | undefined): number {
  if (t.situacao === "concluida") return 100
  if (t.situacao === "revisao") return 95
  const ativas = (cartas ?? []).filter((c) => !c.retirada)
  if (!ativas.length || t.situacao === "pronta" || t.situacao === "fila") return 0
  return Math.min(95, Math.round((ativas.filter((c) => c.estado === "concluida").length / ativas.length) * 100))
}

/** Quantas vezes cada carta foi devolvida (RF 8.04): eventos de devolução que a miraram. */
export function devolucoes(eventos: EventoTask[]): Record<string, number> {
  const r: Record<string, number> = {}
  for (const e of eventos) if (e.tipo === "devolucao" && e.paraCartaId) r[e.paraCartaId] = (r[e.paraCartaId] ?? 0) + 1
  return r
}

export const vagasEmUso = (tasks: Task[], projetoId: string) => tasks.filter((t) => t.projetoId === projetoId && (t.situacao === "andamento" || t.situacao === "aguardando")).length

/** Mostra o erro do núcleo como aviso e devolve o valor (ou null). */
export function ok<T>(r: Resultado<T>): T | null {
  if (r.ok) return r.valor
  toast.error(r.erro)
  return null
}

export type { EstadoCarta }

/** Ações do usuário sobre a task; o erro do núcleo vira aviso e o estado novo chega pelos eventos. */
export const iniciarTask = async (id: string) => ok(await window.fma.tasks.iniciar(id))
export const pararTask = async (id: string) => ok(await window.fma.tasks.parar(id))
export const liberarTask = async (id: string, resposta?: string) => ok(await window.fma.tasks.liberar(id, resposta))
export const seguirTask = async (id: string) => ok(await window.fma.tasks.seguir(id))
export const descartarTask = async (id: string) => ok(await window.fma.tasks.descartar(id))
export const tirarDaFila = async (id: string) => ok(await window.fma.tasks.tirarDaFila(id))
export const aceitarTask = async (id: string, modo: "pr" | "merge" | "nada") => ok(await window.fma.tasks.aceitar(id, modo))
export const pedirAjuste = async (id: string, texto: string) => ok(await window.fma.tasks.pedirAjuste(id, texto))
export const revisarTask = async (id: string) => ok(await window.fma.tasks.revisar(id))
export const reabrirTask = async (id: string) => ok(await window.fma.tasks.reabrir(id))
export const tirarCarta = async (taskId: string, cartaId: string) => ok(await window.fma.tasks.tirarCarta(taskId, cartaId))
export const devolverCarta = async (taskId: string, cartaId: string) => ok(await window.fma.tasks.devolverCarta(taskId, cartaId))
export async function iniciarTodas(projetoId: string) {
  const r = await window.fma.tasks.iniciarTodas(projetoId)
  if (r.iniciadas.length || r.fila.length) toast.success(`${r.iniciadas.length} iniciada${r.iniciadas.length === 1 ? "" : "s"}${r.fila.length ? `, ${r.fila.length} na fila` : ""}`)
  for (const e of r.erros) toast.error(e.erro)
}
