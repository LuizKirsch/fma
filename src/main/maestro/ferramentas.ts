/**
 * Servidor MCP local do FMA: as ferramentas do Maestro.
 * Transporte: Streamable HTTP em 127.0.0.1 (porta livre) com token. As três CLIs falam MCP por HTTP,
 * e o servidor roda dentro do app, com acesso direto ao banco e ao motor; stdio exigiria um processo
 * filho que voltasse ao app por outro canal. O projeto vai na URL: /mcp/<projetoId>.
 */
import { createServer, type IncomingMessage, type Server } from "node:http"
import { randomBytes } from "node:crypto"
import type { AddressInfo } from "node:net"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { z } from "zod"
import * as acoes from "./acoes"

const texto = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: t.startsWith("ERRO") })

export function criarServidorMcp(ctx: acoes.Ctx, projetoId: string): McpServer {
  const s = new McpServer({ name: "fma", version: "1.0.0" })
  const task = z.string().optional().describe("Referência, número (#n) ou id da task. Omita se o usuário não disse.")
  s.registerTool("listar_tasks", {
    description: "Lista as tasks do projeto com dados reais (situação, quem trabalha, o que falta, tokens, PRs). Use para responder perguntas.",
    inputSchema: { situacao: z.enum(["pronta", "fila", "andamento", "aguardando", "revisao", "concluida", "parada"]).optional(), task },
  }, async (a) => texto(acoes.consultarTasks(ctx, projetoId, a.situacao, a.task)))
  s.registerTool("propor_ajuste", {
    description: "Propõe repassar um ajuste a uma task. Cria um chamado com Confirmar/Não repassar; nada muda antes do usuário confirmar. Se a task não foi dita, não chute: a ferramenta devolve as opções para você perguntar.",
    inputSchema: { task, ajuste: z.string().min(1).describe("O ajuste pedido, com as palavras do usuário") },
  }, async (a) => texto(acoes.proporAjuste(ctx, projetoId, a.task, a.ajuste)))
  s.registerTool("propor_tirar_carta", {
    description: "Propõe tirar uma carta de uma task que ainda não começou (pronta ou na fila), com confirmação do usuário.",
    inputSchema: { task, carta: z.string().min(1).describe("Nome ou id da carta") },
  }, async (a) => texto(acoes.proporTirarCarta(ctx, projetoId, a.task, a.carta)))
  s.registerTool("iniciar_tasks", {
    description: "Inicia na hora uma task pronta, ou todas as prontas (task = 'todas').",
    inputSchema: { task: z.string().optional().describe("Referência/id, ou 'todas'") },
  }, async (a) => texto(await acoes.iniciar(ctx, projetoId, a.task)))
  s.registerTool("nova_task", {
    description: "Abre na hora uma task nova, pronta para iniciar, com a missão dada.",
    inputSchema: { missao: z.string().min(1) },
  }, async (a) => texto(await acoes.novaTask(ctx, projetoId, a.missao)))
  s.registerTool("liberar_task", {
    description: "Libera na hora mais uma volta numa task travada (aguardando decisão).",
    inputSchema: { task },
  }, async (a) => texto(await acoes.liberar(ctx, projetoId, a.task)))
  s.registerTool("parar_task", {
    description: "Para na hora a task citada, ou a única em andamento.",
    inputSchema: { task },
  }, async (a) => texto(await acoes.parar(ctx, projetoId, a.task)))
  return s
}

export interface ServidorMaestro {
  url: (projetoId: string) => string
  token: string
  parar: () => Promise<void>
}

const lerCorpo = (req: IncomingMessage) =>
  new Promise<unknown>((ok, falha) => {
    const partes: Buffer[] = []
    req.on("data", (c: Buffer) => partes.push(c))
    req.on("end", () => { try { ok(JSON.parse(Buffer.concat(partes).toString() || "null")) } catch (e) { falha(e) } })
    req.on("error", falha)
  })

export async function iniciarServidorMaestro(ctx: acoes.Ctx): Promise<ServidorMaestro> {
  const token = randomBytes(24).toString("hex")
  const http: Server = createServer(async (req, res) => {
    const id = /^\/mcp\/([\w-]+)$/.exec(req.url ?? "")?.[1]
    if (!id || req.headers.authorization !== `Bearer ${token}`) { res.writeHead(id ? 401 : 404).end(); return }
    if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }).end(); return }
    try {
      const corpo = await lerCorpo(req)
      // Sem sessão: um servidor por requisição; o estado está no banco, não na conexão.
      const mcp = criarServidorMcp(ctx, id)
      const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      res.on("close", () => { void transporte.close(); void mcp.close() })
      await mcp.connect(transporte)
      await transporte.handleRequest(req, res, corpo)
    } catch {
      if (!res.headersSent) res.writeHead(500).end()
    }
  })
  await new Promise<void>((ok) => http.listen(0, "127.0.0.1", ok))
  const porta = (http.address() as AddressInfo).port
  return {
    url: (projetoId) => `http://127.0.0.1:${porta}/mcp/${projetoId}`,
    token,
    parar: () => new Promise((ok) => { http.close(() => ok()); http.closeAllConnections() }),
  }
}
