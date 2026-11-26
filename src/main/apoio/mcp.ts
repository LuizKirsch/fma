/**
 * Cliente MCP (SDK oficial) e config MCP que cada CLI recebe (Decisão: Integrações por MCP).
 *  - listarFerramentas / chamarFerramenta: o FMA conecta no servidor (stdio) da carta de apoio.
 *  - configMcp + paraCli: o que as CLIs (claude, codex, gemini) recebem para usar os servidores durante o trabalho (RF 4.14).
 * Credenciais ficam no `env` do servidor, em texto no banco local (onde guardar melhor está em Pendências do vault).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { join as juntarLocal, posix } from "node:path"
import type { CartaApoio, McpServidor } from "@shared/apoio"
import type { CliId } from "@shared/ia"

export interface FerramentaMcp { nome: string; descricao: string }

/** Conecta num servidor stdio, ou remoto por URL (fontes de tasks), roda `fn` e fecha. */
export async function comCliente<T>(s: McpServidor | { url: string; headers?: Record<string, string> }, fn: (c: Client) => Promise<T>): Promise<T> {
  const transporte = "url" in s
    ? new StreamableHTTPClientTransport(new URL(s.url), { requestInit: { headers: s.headers } })
    : new StdioClientTransport({ command: s.comando, args: s.args, env: { ...getDefaultEnvironment(), ...s.env }, stderr: "ignore" })
  const cliente = new Client({ name: "fma", version: "0.1.0" })
  await cliente.connect(transporte)
  try { return await fn(cliente) } finally { await cliente.close().catch(() => {}) }
}

/** RF 4.12: o que o servidor oferece. */
export const listarFerramentas = (s: McpServidor): Promise<FerramentaMcp[]> =>
  comCliente(s, async (c) => (await c.listTools()).tools.map((t) => ({ nome: t.name, descricao: t.description ?? "" })))

export async function chamarFerramenta(s: McpServidor, nome: string, argumentos: Record<string, unknown>): Promise<string> {
  return comCliente(s, async (c) => {
    const r = await c.callTool({ name: nome, arguments: argumentos })
    const texto = (Array.isArray(r.content) ? r.content : []).map((p: { type: string; text?: string }) => (p.type === "text" ? p.text : `[${p.type}]`)).join("\n")
    if (r.isError) throw new Error(texto || "A ferramenta devolveu erro.")
    return texto
  })
}

/** Nome do servidor na config: slug do nome, único. */
export function configMcp(cartas: CartaApoio[]): Record<string, McpServidor> {
  const out: Record<string, McpServidor> = {}
  for (const c of cartas) {
    if (!c.mcp) continue
    const base = c.nome.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || c.tipo
    let nome = base, i = 2
    while (out[nome]) nome = `${base}_${i++}`
    out[nome] = c.mcp
  }
  return out
}

export interface ConfigCli { args: string[]; arquivos: { caminho: string; conteudo: string }[] }

const toml = (v: string) => JSON.stringify(v) // string TOML básica = string JSON

/** O que passar a cada CLI. `dir` é uma pasta de config da task (fora do worktree, para não sujar o commit). */
export function paraCli(cli: CliId, servidores: Record<string, McpServidor>, dir: string): ConfigCli {
  const nomes = Object.keys(servidores)
  if (!nomes.length) return { args: [], arquivos: [] }
  const join = dir.startsWith("/") ? posix.join : juntarLocal // pasta Linux (projeto no WSL)
  const json = JSON.stringify({ mcpServers: Object.fromEntries(nomes.map((n) => [n, { command: servidores[n].comando, args: servidores[n].args, env: servidores[n].env }])) }, null, 2)
  if (cli === "claude") {
    const caminho = join(dir, "mcp.json")
    return { args: ["--mcp-config", caminho], arquivos: [{ caminho, conteudo: json }] }
  }
  if (cli === "gemini") return { args: [], arquivos: [{ caminho: join(dir, ".gemini", "settings.json"), conteudo: json }] } // rodar com cwd/HOME apontando para `dir`
  const args = nomes.flatMap((n) => {
    const s = servidores[n]
    const env = Object.entries(s.env).map(([k, v]) => `${k}=${toml(v)}`).join(", ")
    return [
      "-c", `mcp_servers.${n}.command=${toml(s.comando)}`,
      "-c", `mcp_servers.${n}.args=[${s.args.map(toml).join(", ")}]`,
      ...(env ? ["-c", `mcp_servers.${n}.env={${env}}`] : []),
    ]
  })
  return { args, arquivos: [] }
}
