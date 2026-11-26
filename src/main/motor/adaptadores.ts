/**
 * Liga o motor real às integrações, que só conhecem interfaces (MotorApi, DepsApoio, DepsMonitor).
 * Aqui é o único lugar que importa motor e integrações juntos; o motor só chama os ganchos registrados (ligarGanchos).
 * Ordem na inicialização (index.ts):
 *   registrarIpcMotor -> configurarApoio(criarDepsApoio) -> configurarMonitores(criarDepsMonitor)
 *   -> registrarIpcApoio / registrarIpcMonitores -> maestro = registrarIpcMaestro(db, janela, criarMotorApi(db))
 *   -> ligarIntegracoes(db, maestro) -> iniciarAgendador -> retomarAoAbrir(db); no before-quit: pararProcessos().
 */
import type { DatabaseSync } from "node:sqlite"
import type { MotorApi, TaskInfo } from "../maestro/motor-api"
import type { Maestro } from "../maestro/maestro"
import type { DepsApoio } from "../apoio/ports"
import { eventosApoio } from "../apoio/ports"
import { ferramentasDaCarta } from "../apoio/ferramentas"
import type { DepsMonitor } from "../monitores/ports"
import { aoComecar, aoConcluir, aoParar, aoTravar } from "../monitores/servico"
import type { Task } from "@shared/task"
import { lerTask, lerTaskCartas, listarTasks } from "./dados"
import { lerCartasDaMesa, lerProjeto } from "./leitura-mesa"
import * as motor from "./motor"

const ou = <T>(r: { ok: true; valor: T } | { ok: false; erro: string }): T => {
  if (!r.ok) throw new Error(r.erro)
  return r.valor
}

/** TaskInfo do Maestro a partir da task e das cartas dela. */
function info(db: DatabaseSync, t: Task): TaskInfo {
  const cartas = motor.cartasDaTask(db, t)
  const estados = new Map(lerTaskCartas(db, t.id).map((c) => [c.cartaId, c]))
  const orq = cartas.find((c) => c.classe === "orquestrador")
  const rodando = cartas.filter((c) => ["trabalhando", "questionando"].includes(estados.get(c.id)?.estado ?? ""))
  return {
    id: t.id, projetoId: t.projetoId, numero: t.numero, referencia: t.referencia, titulo: t.titulo, missao: t.missao,
    ajustes: t.ajustes || null, situacao: t.situacao, tokens: t.tokens, voltas: t.voltas,
    etapa: t.situacao === "fila" ? `Na fila (posição ${t.posicaoFila})` : rodando.map((c) => `${c.nome}: ${estados.get(c.id)?.atividade ?? ""}`).join("; ") || null,
    trabalhando: rodando.map((c) => c.nome),
    faltam: t.situacao === "andamento" || t.situacao === "aguardando"
      ? cartas.filter((c) => c.classe !== "orquestrador" && estados.get(c.id) && estados.get(c.id)!.estado !== "concluida" && !rodando.includes(c)).map((c) => c.nome)
      : [],
    decisaoMotivo: t.decisao?.motivo ?? null,
    pr: t.prUrl ? { url: t.prUrl, estado: "aberto" } : null,
    taskOriginalId: t.taskOriginalId,
    orquestradorNome: orq?.nome ?? "Orquestrador",
    cartas: cartas.map(({ id, nome, classe }) => ({ id, nome, classe })),
  }
}

/** O motor real como o Maestro o enxerga (passe a `registrarIpcMaestro`). */
export function criarMotorApi(db: DatabaseSync): MotorApi {
  const daTask = (id: string) => {
    const t = lerTask(db, id)
    if (!t) throw new Error("Essa task não existe mais.")
    return t
  }
  return {
    orquestrador(projetoId) {
      const o = lerCartasDaMesa(db, projetoId).find((c) => c.classe === "orquestrador")
      const p = lerProjeto(db, projetoId)
      return o && p ? { cartaId: o.id, nome: o.nome, cli: o.cli, modelo: o.modelo, pasta: p.repositorio, ambiente: p.ambiente } : null
    },
    limiteTokens: (projetoId) => lerProjeto(db, projetoId)?.limiteTokens || null,
    listarTasks: (projetoId) => listarTasks(db, projetoId).map((t) => info(db, t)),
    criarTask: async (projetoId, missao) => info(db, ou(motor.criarTask(db, { projetoId, missao }))),
    iniciarTask: async (id) => void ou(await motor.iniciarTask(db, id)),
    pararTask: async (id) => void ou(await motor.pararTask(db, id)),
    liberarTask: async (id) => void ou(motor.liberarMaisUmaVolta(db, id)),
    seguirTask: async (id) => void ou(motor.seguirMesmoAssim(db, id)),
    // task em revisão: o ajuste volta ao trabalho na mesma branch; concluída: task de ajuste nova
    abrirTaskDeAjuste: async (id, ajuste) => info(db, daTask(id).situacao === "revisao" ? ou(await motor.pedirAjuste(db, id, ajuste)) : ou(motor.abrirTaskDeAjuste(db, id, ajuste))),
    repassarAjuste: async (id, ajuste) => void ou(motor.repassarAjuste(db, id, ajuste)),
    anotarAjuste: async (id, ajuste) => void ou(motor.anotarAjuste(db, id, ajuste)),
    tirarCarta: async (id, cartaId) => void ou(motor.tirarCarta(db, daTask(id).id, cartaId)),
  }
}

/** Dados que a camada de apoio pede ao motor e à mesa (RF 4.14 a 4.21, 6.30, 6.31). */
export function criarDepsApoio(db: DatabaseSync): DepsApoio {
  return {
    cartasDaMesa: (projetoId) => lerCartasDaMesa(db, projetoId).map((c) => ({ id: c.id, classe: c.classe })),
    task(taskId) {
      const t = lerTask(db, taskId)
      const p = t && lerProjeto(db, t.projetoId)
      return t && p ? { projetoId: t.projetoId, repo: p.repositorio, ambiente: p.ambiente, base: p.branchBase, branch: t.branch ?? "", taskOriginalId: t.taskOriginalId, iniciada: t.iniciadaEm !== null } : undefined
    },
    cronica: (taskId, texto) => motor.registrarEvento(db, taskId, "aviso", texto),
  }
}

/** Dados que os monitores pedem ao motor (RF 5.21, 6.04, 5.20). */
export function criarDepsMonitor(db: DatabaseSync): DepsMonitor {
  return {
    mesaPronta(projetoId) {
      const cartas = lerCartasDaMesa(db, projetoId).length
      const { erros } = motor.validarMesa(db, projetoId)
      return { cartas, fluxoValido: !erros.length, erro: erros[0] }
    },
    criarTask(p) {
      const t = ou(motor.criarTask(db, {
        projetoId: p.projetoId, titulo: p.titulo, missao: p.descricao.trim() || p.titulo, referencia: p.referencia ?? (p.url || undefined),
        comecaPor: p.cartaInicialId ? [p.cartaInicialId] : undefined,
      }))
      db.prepare("UPDATE task SET monitor_id = ? WHERE id = ?").run(p.monitorId, t.id)
      if (p.iniciarAgora) void motor.iniciarTask(db, t.id).then((r) => {
        if (!r.ok) motor.chamarUsuario({ projetoId: p.projetoId, taskId: t.id, texto: `Task #${t.numero} (${p.titulo}) não conseguiu iniciar: ${r.erro}` }) // RN 81
      })
      return t.id
    },
    retomarTask: (taskId, resposta) => void ou(motor.liberarMaisUmaVolta(db, taskId, resposta)),
  }
}

/**
 * Registra os ganchos do motor (monitores, apoio, Maestro) e faz o Maestro chamar o usuário quando uma escrita fica pendente (RN 81).
 * Devolve a função que desfaz a escuta dos eventos do apoio.
 */
export function ligarIntegracoes(db: DatabaseSync, maestro: Maestro): () => void {
  motor.ligarGanchos({
    aoComecar: (id) => aoComecar(db, id),
    aoConcluir: (id) => aoConcluir(db, id, { prUrl: lerTask(db, id)?.prUrl ?? undefined }),
    aoParar: (id, m) => aoParar(db, id, m),
    aoTravar: (id, duvida) => aoTravar(db, id, duvida),
    ferramentasDaCarta: (p) => ferramentasDaCarta(db, p),
    avisarLimiteTokens(t) {
      const cartas = motor.cartasDaTask(db, t)
      return maestro.avisarLimiteTokens({ id: t.id, projetoId: t.projetoId, tokens: t.tokens, referencia: t.referencia, numero: t.numero, orquestradorNome: cartas.find((c) => c.classe === "orquestrador")?.nome ?? "Orquestrador" })
    },
    chamar: (p) => maestro.chamar(p),
    resolverFora: (projetoId, taskId) => maestro.resolverFora(projetoId, taskId),
  })
  const aoEvento = (e: Parameters<Parameters<typeof eventosApoio.on<"evento">>[1]>[0]) => {
    if (e.tipo !== "escrita-pendente") return
    const t = lerTask(db, e.artefato.taskId)
    if (t) maestro.chamar({ projetoId: t.projetoId, taskId: t.id, texto: `Task #${t.numero}${t.referencia ? ` (${t.referencia})` : ""}: "${e.artefato.titulo}" espera sua confirmação${e.emProducao ? " (ferramenta em produção)" : ""}.` })
  }
  eventosApoio.on("evento", aoEvento)
  return () => void eventosApoio.off("evento", aoEvento)
}
