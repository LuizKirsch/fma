/**
 * O que o Maestro faz de verdade: as ações por trás das ferramentas MCP e dos botões do chamado.
 * Cada função devolve um texto curto que a ferramenta entrega ao modelo. Erros viram texto
 * começando por "ERRO" para o modelo explicar ao usuário (ou perguntar qual task).
 */
import type { DatabaseSync } from "node:sqlite"
import type { AcaoChamado, EventoMaestro, MensagemChat, SituacaoTask, TipoProposta } from "@shared/maestro"
import type { MotorApi, TaskInfo } from "./motor-api"
import { acharTask, podeAgir, rotaAjuste, rotuloTask } from "./chamado"
import { buscarMensagem, gravarMensagem, resolverMensagem, type NovaMensagem } from "./store"

export interface Ctx {
  db: DatabaseSync
  motor: MotorApi
  emitir: (e: EventoMaestro) => void
}

const BOTOES_PROPOSTA: AcaoChamado[] = [
  { id: "confirmar", rotulo: "Confirmar" },
  { id: "recusar", rotulo: "Não repassar" },
]

/** Grava uma mensagem do Maestro e avisa a interface. */
export function publicar(ctx: Ctx, n: NovaMensagem): MensagemChat {
  const m = gravarMensagem(ctx.db, n)
  ctx.emitir({ tipo: "mensagem", mensagem: m })
  ctx.emitir({ tipo: "nao-lidas", projetoId: m.projetoId, total: naoLidasDe(ctx, m.projetoId) })
  return m
}

const naoLidasDe = (ctx: Ctx, projetoId: string) =>
  Number((ctx.db.prepare("SELECT COUNT(*) n FROM mensagem_chat WHERE projeto_id = ? AND autor = 'maestro' AND lida = 0").get(projetoId) as { n: number }).n)

const linha = (t: TaskInfo) => `- ${rotuloTask(t)} (id ${t.id}, #${t.numero}): ${t.situacao}`

/** RN 85: sem task clara, devolve ERRO listando as que servem para o modelo perguntar. */
function escolher(ts: TaskInfo[], ref: string | undefined, serve: (s: SituacaoTask) => boolean, para: string): TaskInfo | string {
  if (ref) {
    const t = acharTask(ts, ref)
    return t ?? `ERRO: não achei a task "${ref}". Tasks do projeto:\n${ts.map(linha).join("\n") || "(nenhuma)"}`
  }
  const opcoes = ts.filter((t) => serve(t.situacao))
  if (opcoes.length === 1) return opcoes[0]
  if (!opcoes.length) return `ERRO: nenhuma task serve para ${para}.`
  return `ERRO: a mensagem não diz qual task. Pergunte ao usuário em qual aplicar ${para}, listando:\n${opcoes.map(linha).join("\n")}`
}

// ---- consultas (RF 7.05) ------------------------------------------------------------------

export function consultarTasks(ctx: Ctx, projetoId: string, situacao?: string, ref?: string): string {
  let ts = ctx.motor.listarTasks(projetoId)
  const contagem: Record<string, number> = {}
  for (const t of ts) contagem[t.situacao] = (contagem[t.situacao] ?? 0) + 1
  if (ref) {
    const t = acharTask(ts, ref)
    if (!t) return `ERRO: não achei a task "${ref}".`
    ts = [t]
  } else if (situacao) ts = ts.filter((t) => t.situacao === situacao)
  const limite = ctx.motor.limiteTokens(projetoId)
  return JSON.stringify({
    totaisPorSituacao: contagem,
    limiteTokens: limite,
    observacao: "situacao 'aguardando' = travada esperando decisão do usuário",
    tasks: ts.map((t) => ({
      id: t.id, numero: t.numero, rotulo: rotuloTask(t), titulo: t.titulo, missao: t.missao, ajustes: t.ajustes,
      situacao: t.situacao, etapa: t.etapa, trabalhando: t.trabalhando, faltam: t.faltam, voltas: t.voltas,
      tokens: t.tokens, decisaoMotivo: t.decisaoMotivo, pr: t.pr, ajusteDe: t.taskOriginalId,
      cartas: t.cartas.map((c) => c.nome),
    })),
  })
}

// ---- propostas (RN 83) --------------------------------------------------------------------

/** RF 7.11 / 6.34-6.36. Só cria o chamado; nada é repassado antes do Confirmar. */
export function proporAjuste(ctx: Ctx, projetoId: string, ref: string | undefined, ajuste: string): string {
  const r = escolher(ctx.motor.listarTasks(projetoId), ref, (s) => s !== "parada", "o ajuste")
  if (typeof r === "string") return r
  const rota = rotaAjuste(r.situacao)
  if (rota === "recusar") return `ERRO: ${rotuloTask(r)} está parada e não recebe ajuste; ela precisa ser reaberta como task nova.`
  const efeito = {
    anotar: "o ajuste fica anotado e entra no plano quando a task começar",
    repassar: "o ajuste vai ao Orquestrador da task e vale a partir da próxima entrega",
    abrir_task: "abre uma task de ajuste nova, pronta para iniciar, ligada à original",
    recusar: "",
  }[rota]
  publicar(ctx, {
    projetoId, autor: "maestro", taskId: r.id, tipo: "info", lida: true, acoes: BOTOES_PROPOSTA,
    propostaTipo: "ajuste", propostaTexto: ajuste,
    texto: `Repassar este ajuste a ${rotuloTask(r)}? ${efeito}.\n\n"${ajuste}"`,
  })
  return `Proposta criada com os botões Confirmar e Não repassar. Nada foi repassado ainda; diga ao usuário para confirmar.`
}

/** RF 7.13: só em task que ainda não começou. */
export function proporTirarCarta(ctx: Ctx, projetoId: string, ref: string | undefined, carta: string): string {
  const r = escolher(ctx.motor.listarTasks(projetoId), ref, (s) => s === "pronta" || s === "fila", "tirar a carta")
  if (typeof r === "string") return r
  if (r.situacao !== "pronta" && r.situacao !== "fila") return `ERRO: só dá para tirar carta de task que não começou; ${rotuloTask(r)} está ${r.situacao}.`
  const c = r.cartas.find((x) => x.id === carta || x.nome.toLowerCase() === carta.trim().toLowerCase())
  if (!c) return `ERRO: carta "${carta}" não está na task. Cartas: ${r.cartas.map((x) => x.nome).join(", ")}`
  publicar(ctx, {
    projetoId, autor: "maestro", taskId: r.id, tipo: "info", lida: true,
    acoes: [{ id: "confirmar", rotulo: "Confirmar" }, { id: "recusar", rotulo: "Não tirar" }],
    propostaTipo: "tirar_carta", propostaCartaId: c.id,
    texto: `Tirar a carta ${c.nome} de ${rotuloTask(r)}?`,
  })
  return "Proposta criada com os botões Confirmar e Não tirar. Nada foi alterado ainda."
}

// ---- ações imediatas (RN 84) --------------------------------------------------------------

export async function iniciar(ctx: Ctx, projetoId: string, ref: string | undefined): Promise<string> {
  const ts = ctx.motor.listarTasks(projetoId)
  const alvo = ref?.toLowerCase() === "todas" ? ts.filter((t) => t.situacao === "pronta") : (() => {
    const r = escolher(ts, ref, (s) => s === "pronta", "o início")
    return typeof r === "string" ? r : [r]
  })()
  if (typeof alvo === "string") return alvo
  if (!alvo.length) return "ERRO: não há task pronta para iniciar."
  const saida: string[] = []
  for (const t of alvo) {
    try {
      await ctx.motor.iniciarTask(t.id)
      saida.push(`${rotuloTask(t)}: iniciada`)
    } catch (e) {
      saida.push(`${rotuloTask(t)}: NÃO iniciou (${(e as Error).message})`)
    }
  }
  return saida.join("\n")
}

export async function novaTask(ctx: Ctx, projetoId: string, missao: string): Promise<string> {
  try {
    const t = await ctx.motor.criarTask(projetoId, missao)
    return `Task criada: ${rotuloTask(t)} (id ${t.id}), pronta para iniciar.`
  } catch (e) {
    return `ERRO: ${(e as Error).message}`
  }
}

export async function liberar(ctx: Ctx, projetoId: string, ref?: string): Promise<string> {
  const r = escolher(ctx.motor.listarTasks(projetoId), ref, (s) => s === "aguardando", "liberar mais uma volta")
  if (typeof r === "string") return r
  try {
    await ctx.motor.liberarTask(r.id)
    return `Mais uma volta liberada em ${rotuloTask(r)}.`
  } catch (e) {
    return `ERRO: ${(e as Error).message}`
  }
}

export async function parar(ctx: Ctx, projetoId: string, ref?: string): Promise<string> {
  const r = escolher(ctx.motor.listarTasks(projetoId), ref, (s) => s === "andamento" || s === "aguardando", "parar")
  if (typeof r === "string") return r
  try {
    await ctx.motor.pararTask(r.id)
    return `${rotuloTask(r)} parada.`
  } catch (e) {
    return `ERRO: ${(e as Error).message}`
  }
}

// ---- botões do chamado (RF 7.20) ----------------------------------------------------------

async function executarProposta(ctx: Ctx, m: MensagemChat): Promise<string> {
  const tipo: TipoProposta | null = m.propostaTipo
  const t = m.taskId ? ctx.motor.listarTasks(m.projetoId).find((x) => x.id === m.taskId) : undefined
  if (!t) throw new Error("A task do chamado não existe mais.")
  if (tipo === "ajuste") {
    const texto = m.propostaTexto ?? ""
    // A situação pode ter mudado desde a proposta: a rota é decidida na hora de confirmar.
    switch (rotaAjuste(t.situacao)) {
      case "anotar": await ctx.motor.anotarAjuste(t.id, texto); return `Ajuste anotado em ${rotuloTask(t)}; entra no plano quando ela começar.`
      case "repassar": await ctx.motor.repassarAjuste(t.id, texto); return `Ajuste repassado a ${rotuloTask(t)}; vale a partir da próxima entrega.`
      case "abrir_task": { const n = await ctx.motor.abrirTaskDeAjuste(t.id, texto); return `Task de ajuste aberta: ${rotuloTask(n)}, pronta para iniciar.` }
      default: throw new Error(`${rotuloTask(t)} está parada e não recebe ajuste.`)
    }
  }
  if (tipo === "tirar_carta") {
    await ctx.motor.tirarCarta(t.id, m.propostaCartaId ?? "")
    return `Carta tirada de ${rotuloTask(t)}.`
  }
  if (tipo === "parar_tokens") {
    await ctx.motor.pararTask(t.id)
    return `${rotuloTask(t)} parada.`
  }
  throw new Error("Chamado sem proposta para confirmar.")
}

/** Executa o botão. Só resolve o chamado se a ação deu certo; se falhar, os botões continuam. */
export async function agirChamado(ctx: Ctx, mensagemId: string, acaoId: string): Promise<{ ok: true; resposta: MensagemChat | null } | { ok: false; erro: string }> {
  const m = buscarMensagem(ctx.db, mensagemId)
  if (!m) return { ok: false, erro: "Chamado não encontrado." }
  if (!podeAgir(m, acaoId)) return { ok: false, erro: "Este chamado já foi resolvido ou não tem esse botão." }
  let texto: string | null = null
  try {
    if (acaoId === "confirmar") texto = await executarProposta(ctx, m)
    else if (acaoId === "parar" || acaoId === "liberar" || acaoId === "seguir") {
      if (!m.taskId) throw new Error("O chamado não aponta uma task.")
      const t = ctx.motor.listarTasks(m.projetoId).find((x) => x.id === m.taskId)
      await (acaoId === "parar" ? ctx.motor.pararTask(m.taskId) : acaoId === "seguir" ? ctx.motor.seguirTask(m.taskId) : ctx.motor.liberarTask(m.taskId))
      texto = `${t ? rotuloTask(t) : "Task"} ${acaoId === "parar" ? "parada" : acaoId === "seguir" ? "segue com pendências" : "liberada para mais uma volta"}.`
    }
  } catch (e) {
    return { ok: false, erro: (e as Error).message }
  }
  const resolvida = resolverMensagem(ctx.db, m.id)!
  ctx.emitir({ tipo: "atualizada", mensagem: resolvida })
  const resposta = texto ? publicar(ctx, { projetoId: m.projetoId, taskId: m.taskId, autor: "maestro", tipo: "ok", texto, lida: true }) : null
  return { ok: true, resposta }
}
