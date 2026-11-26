/**
 * O Maestro de um app: conversa (CLI do Orquestrador + ferramentas MCP), chamados e avisos.
 * Quem liga o motor chama `chamar` (RN 81), `avisarLimiteTokens` (RF 6.40) e `resolverFora` (RN 86).
 */
import type { DatabaseSync } from "node:sqlite"
import type { AcaoChamado, EstadoChat, EventoMaestro, MensagemChat, ResultadoMaestro } from "@shared/maestro"
import { PEDIDOS_RAPIDOS } from "@shared/maestro"
import { detectarClis } from "../clis"
import { deveAvisarTokens, extrairNovaTask, rotuloTask } from "./chamado"
import { executar } from "./cli"
import { iniciarServidorMaestro, type ServidorMaestro } from "./ferramentas"
import type { MotorApi, TaskInfo } from "./motor-api"
import * as acoes from "./acoes"
import { gravarMensagem, gravarSessao, lerSessao, listarMensagens, marcarLidas, naoLidas, registrarAviso, resolverForaDoChat } from "./store"

export const SEM_ORQUESTRADOR = "Coloque uma carta de Orquestrador na mesa para conversar com o Maestro."

const SISTEMA = `Você é o Maestro do FMA: o assistente do usuário para as tasks deste projeto. Responda em português do Brasil, curto e direto.
Regras:
- Responda só o que foi perguntado (quem trabalha, o que falta, quantas tasks, travadas, prontas, concluídas, PRs, uma task específica). Use sempre a ferramenta listar_tasks e nunca invente dados.
- Pedido de ajuste: chame propor_ajuste. Tirar carta de task que não começou: propor_tirar_carta. Elas só criam uma proposta com botões; diga que o usuário precisa confirmar. Nunca diga que o ajuste já foi repassado.
- Iniciar, abrir task nova, liberar mais uma volta e parar são feitos na hora com iniciar_tasks, nova_task, liberar_task e parar_task, sem pedir confirmação.
- Se o pedido não diz a task, pergunte em qual, listando as opções (a ferramenta devolve a lista). Chame a task por "<Orquestrador> · <referência>".
- Você não edita arquivos nem roda comandos. Se a ferramenta devolver ERRO, explique ao usuário sem esconder.`

export interface Maestro {
  estado(projetoId: string): EstadoChat
  /** RF 7.01 / 7.04: abre o chat e zera as não lidas. */
  abrir(projetoId: string): EstadoChat
  naoLidas(projetoId: string): number
  enviar(projetoId: string, texto: string): Promise<ResultadoMaestro<MensagemChat[]>>
  agir(mensagemId: string, acaoId: string): ReturnType<typeof acoes.agirChamado>
  /** RN 81: o Maestro escreve sozinho para chamar o usuário. Nasce não lida. */
  chamar(p: { projetoId: string; taskId?: string; texto: string; acoes?: AcaoChamado[]; tipo?: "alerta" | "info" }): MensagemChat
  /** RF 6.40: chamar quando os tokens passam do limite, uma vez por task. Devolve a mensagem ou null. */
  avisarLimiteTokens(task: Pick<TaskInfo, "id" | "projetoId" | "tokens" | "orquestradorNome" | "referencia" | "numero">): MensagemChat | null
  /** RF 7.21: o assunto foi resolvido na trilha, na Entrega ou no board. */
  resolverFora(projetoId: string, taskId?: string): void
  parar(): Promise<void>
}

export function criarMaestro(db: DatabaseSync, motor: MotorApi, emitir: (e: EventoMaestro) => void): Maestro {
  const ctx: acoes.Ctx = { db, motor, emitir }
  let servidor: Promise<ServidorMaestro> | undefined
  const filas = new Map<string, Promise<unknown>>()

  const estado = (projetoId: string): EstadoChat => {
    const o = motor.orquestrador(projetoId)
    return {
      disponivel: !!o, motivo: o ? undefined : SEM_ORQUESTRADOR,
      orquestrador: o ? { nome: o.nome, cli: o.cli, modelo: o.modelo } : undefined,
      mensagens: listarMensagens(db, projetoId), pedidos: PEDIDOS_RAPIDOS,
    }
  }

  const notificarNaoLidas = (projetoId: string) => emitir({ tipo: "nao-lidas", projetoId, total: naoLidas(db, projetoId) })

  /** Sem sessão (Gemini, ou sessão perdida) o contexto vai no prompt. */
  const historico = (projetoId: string) =>
    listarMensagens(db, projetoId).slice(-13, -1).map((m) => `${m.autor === "voce" ? "Usuário" : "Maestro"}: ${m.texto}`).join("\n")

  async function conversar(projetoId: string, texto: string): Promise<string> {
    const o = motor.orquestrador(projetoId)!
    const srv = await (servidor ??= iniciarServidorMaestro(ctx))
    const sessao = lerSessao(db, projetoId, o.cli)
    const prompt = [SISTEMA, !sessao && historico(projetoId) ? `Conversa até aqui:\n${historico(projetoId)}` : "", `Mensagem do usuário:\n${texto}`]
      .filter(Boolean).join("\n\n")
    const r = await executar({ cli: o.cli, modelo: o.modelo, pasta: o.pasta, ambiente: o.ambiente, prompt, sessao, mcpUrl: srv.url(projetoId), token: srv.token })
    if (r.sessao) gravarSessao(db, projetoId, o.cli, r.sessao)
    return r.texto
  }

  async function enviar(projetoId: string, texto: string): Promise<ResultadoMaestro<MensagemChat[]>> {
    texto = texto.trim()
    if (!texto) return { ok: false, erro: "Mensagem vazia." }
    const o = motor.orquestrador(projetoId)
    if (!o) return { ok: false, erro: SEM_ORQUESTRADOR }
    const cli = (await detectarClis()).find((c) => c.id === o.cli && c.ambiente === o.ambiente)
    if (!cli?.instalada) return { ok: false, erro: `A CLI do Orquestrador (${o.cli}) não está instalada${o.ambiente === "local" ? "" : ` no ambiente do projeto (${o.ambiente})`}.` }

    const dela = gravarMensagem(db, { projetoId, autor: "voce", texto })
    emitir({ tipo: "mensagem", mensagem: dela })
    const saida: MensagemChat[] = [dela]
    const responder = (t: string, tipo: "ok" | "alerta" | null, taskId?: string) =>
      acoes.publicar(ctx, { projetoId, autor: "maestro", texto: t, tipo, taskId: taskId ?? null, lida: true })

    // RF 7.15: "nova task: <missão>" abre a task direto, sem passar pela CLI.
    const missao = extrairNovaTask(texto)
    if (missao) {
      try {
        const t = await motor.criarTask(projetoId, missao)
        saida.push(responder(`Task criada: ${rotuloTask(t)}, pronta para iniciar.`, "ok", t.id))
      } catch (e) {
        saida.push(responder(`Não consegui abrir a task: ${(e as Error).message}`, "alerta"))
      }
      return { ok: true, valor: saida }
    }

    // Uma conversa por projeto por vez: a sessão da CLI não aceita duas mensagens ao mesmo tempo.
    const anterior = filas.get(projetoId) ?? Promise.resolve()
    const rodando = anterior.catch(() => {}).then(async () => {
      emitir({ tipo: "digitando", projetoId, ativo: true })
      try {
        const antes = listarMensagens(db, projetoId).length
        const resposta = await conversar(projetoId, texto)
        if (resposta) saida.push(responder(resposta, null))
        // Propostas criadas pelas ferramentas durante a resposta também voltam ao chamador.
        saida.push(...listarMensagens(db, projetoId).slice(antes).filter((m) => !saida.some((s) => s.id === m.id)))
      } catch (e) {
        saida.push(responder(`Não consegui falar com a CLI do Orquestrador: ${(e as Error).message}`, "alerta"))
      } finally {
        emitir({ tipo: "digitando", projetoId, ativo: false })
      }
    })
    filas.set(projetoId, rodando)
    await rodando
    return { ok: true, valor: saida }
  }

  return {
    estado,
    abrir(projetoId) {
      marcarLidas(db, projetoId)
      notificarNaoLidas(projetoId)
      return estado(projetoId)
    },
    naoLidas: (projetoId) => naoLidas(db, projetoId),
    enviar,
    agir: (id, acao) => acoes.agirChamado(ctx, id, acao),
    chamar: (p) => acoes.publicar(ctx, { projetoId: p.projetoId, taskId: p.taskId ?? null, autor: "maestro", texto: p.texto, tipo: p.tipo ?? "alerta", acoes: p.acoes ?? [], lida: false }),
    avisarLimiteTokens(t) {
      const limite = motor.limiteTokens(t.projetoId)
      if (!deveAvisarTokens(t.tokens, limite, false) || !registrarAviso(db, t.id, "tokens")) return null
      return acoes.publicar(ctx, {
        projetoId: t.projetoId, taskId: t.id, autor: "maestro", tipo: "alerta", lida: false, propostaTipo: "parar_tokens",
        texto: `${rotuloTask(t)} passou do limite de tokens do projeto (${t.tokens.toLocaleString("pt-BR")} de ${limite!.toLocaleString("pt-BR")}). Quer parar a task?`,
        acoes: [{ id: "parar", rotulo: "Parar a task" }, { id: "manter", rotulo: "Deixar continuar" }],
      })
    },
    resolverFora(projetoId, taskId) {
      for (const m of resolverForaDoChat(db, projetoId, taskId)) emitir({ tipo: "atualizada", mensagem: m })
    },
    async parar() {
      const s = await servidor
      servidor = undefined
      await s?.parar()
    },
  }
}
