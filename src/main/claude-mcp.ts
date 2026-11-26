/**
 * Servidores MCP já configurados na Claude Code do usuário: ~/.claude.json no Windows e em cada distro do WSL.
 * Devolve só o que preenche o formulário de fonte (servidor + env). Os valores do env podem ser tokens:
 * nunca são registrados em log nem mostrados em aviso.
 */
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { distrosWsl, LOCAL, rodar as rodarEm } from "./ambiente.ts"
import type { McpDaClaude } from "../shared/fonte.ts"

type Entrada = { type?: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> }

const rodar = (args: string[]) => new Promise<Buffer>((ok, falha) =>
  execFile("wsl.exe", args, { encoding: "buffer", timeout: 8000, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (e, saida) => (e ? falha(e) : ok(saida))))

const aspas = (s: string) => (/[\s"]/.test(s) || !s ? `"${s.replace(/"/g, "")}"` : s)

function converter(json: string, origem: string): McpDaClaude[] {
  let j: any
  try { j = JSON.parse(json) } catch { return [] }
  const wsl = origem.startsWith("wsl:") ? origem.slice(4) : ""
  const lote = (servidores: unknown, projeto?: string) => Object.entries((servidores ?? {}) as Record<string, Entrada>).flatMap(([nome, s]) => {
    if (!s || typeof s !== "object") return []
    const base = { origem, ...(projeto ? { projeto } : {}), nome }
    if (s.url) return [{ ...base, config: { servidor: s.url, env: "" }, ...(s.headers && Object.keys(s.headers).length ? { comHeaders: true } : {}) }]
    if (!s.command) return []
    const vars = Object.entries(s.env ?? {}).map(([k, v]) => `${k}=${v}`)
    // No WSL o env do Windows não atravessa: as variáveis vão como `env K=V` do Linux.
    const servidor = wsl
      ? ["wsl.exe", "-d", wsl, "--", ...(vars.length ? ["env", ...vars] : []), s.command, ...(s.args ?? [])].map(aspas).join(" ")
      : [s.command, ...(s.args ?? [])].map(aspas).join(" ")
    return [{ ...base, config: { servidor, env: wsl ? "" : vars.join("\n") } }]
  })
  return [...lote(j.mcpServers), ...Object.entries(j.projects ?? {}).flatMap(([pasta, p]) => lote((p as any)?.mcpServers, pasta))]
}

// Com CLAUDE_CONFIG_DIR definido, a Claude guarda a config em $CLAUDE_CONFIG_DIR/.claude.json.
async function doWindows(): Promise<McpDaClaude[]> {
  try { return converter(await readFile(join(process.env.CLAUDE_CONFIG_DIR || homedir(), ".claude.json"), "utf8"), "windows") } catch { return [] }
}

/**
 * Conectores do claude.ai (ligados à conta, não a arquivo): só aparecem em `claude mcp list`,
 * linhas "claude.ai <Nome>: <url> - ✔ Connected". Roda no ambiente, com o PATH e o CLAUDE_CONFIG_DIR do usuário.
 * O list confere a saúde de cada servidor (alguns segundos): timeout de 20 s e cache de 5 min por ambiente.
 */
const cacheLista = new Map<string, { em: number; lista: McpDaClaude[] }>() // por ambiente, 5 min
async function conectoresClaudeAi(amb: string, origem: string): Promise<McpDaClaude[]> {
  const k = cacheLista.get(amb)
  if (k && Date.now() - k.em < 300_000) return k.lista
  let saida = ""
  try { saida = await rodarEm(amb, "claude", ["mcp", "list"], { timeout: 20_000, shell: true }) } catch (e) { saida = String((e as { stdout?: string }).stdout ?? "") }
  const lista = saida.split(/\r?\n/).flatMap((l) => {
    const m = /^claude\.ai (.+?): (https?:\/\/\S+)\s+-\s+(.*)$/.exec(l.trim())
    return m ? [{ origem, nome: m[1], claudeAi: true, conectado: /connected/i.test(m[3]) && !/needs|failed/i.test(m[3]), config: { servidor: m[2], env: "" } }] : []
  })
  if (lista.length) cacheLista.set(amb, { em: Date.now(), lista }) // falha/vazio não fica em cache
  return lista
}

async function doWsl(): Promise<McpDaClaude[]> {
  const distros = await distrosWsl()
  const por = await Promise.all(distros.map(async (d) => {
    const locais = await rodar(["-d", d, "-e", "bash", "-lc", 'cat "${CLAUDE_CONFIG_DIR:-$HOME}/.claude.json"']).then((b) => converter(b.toString("utf8"), `wsl:${d}`)).catch(() => []) // sem o arquivo: ignora
    return [...locais, ...(await conectoresClaudeAi(`wsl:${d}`, `wsl:${d}`))]
  }))
  return por.flat()
}

export async function listarMcpsDaClaude(): Promise<McpDaClaude[]> {
  const [a, c, b] = await Promise.all([doWindows(), conectoresClaudeAi(LOCAL, process.platform === "win32" ? "windows" : "local"), process.platform === "win32" ? doWsl() : []])
  // Conectados primeiro; os que pedem login no claude.ai vão para o fim.
  return [...a, ...b.filter((m) => !m.claudeAi), ...[...c, ...b.filter((m) => m.claudeAi)].sort((x, y) => Number(!!y.conectado) - Number(!!x.conectado))]
}
