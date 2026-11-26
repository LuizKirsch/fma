/**
 * Roda uma vez a CLI do Orquestrador (claude, codex ou gemini) em modo não interativo, com o servidor
 * MCP do FMA ligado. O texto do usuário vai pela entrada padrão (nunca na linha de comando, que no
 * Windows passa por um shell). Claude e Codex retomam a sessão; o Gemini não tem retomada estável
 * no modo headless, então o histórico recente vai junto no prompt (sessao = null).
 *
 * ponytail: os argumentos de codex e gemini seguem a documentação das CLIs, mas não foram testados
 * contra as versões instaladas; só o fluxo do claude foi desenhado com certeza. Ajustar em montar().
 */
import { spawn } from "node:child_process"
import { comando as comandoEm, ehWsl, LOCAL, paraFs } from "../ambiente"
import { matar } from "../motor/processo"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliPorId, type CliId } from "@shared/ia"

export interface Execucao {
  cli: CliId
  modelo: string
  pasta: string
  /** Onde a pasta está: "local" ou "wsl:<distro>" (RF 2.37). No WSL, `pasta` é caminho Linux. */
  ambiente?: string
  prompt: string
  sessao: string | null
  mcpUrl: string
  token: string
}

export interface Comando {
  comando: string
  args: string[]
  env: Record<string, string>
  /** Arquivos temporários a apagar depois (caminho para o `fs` do Node). */
  dir: string
}

const SEGURO = /^[\w.:\/-]+$/
/** Só o Windows roda com shell, e lá o argumento com espaço precisa de aspas. */
const aspas = (s: string, wsl = false) => (!wsl && process.platform === "win32" && /\s/.test(s) ? `"${s}"` : s)

export function montar(e: Execucao): Comando {
  if (!SEGURO.test(e.modelo)) throw new Error(`Modelo com caracteres inválidos: ${e.modelo}`)
  if (e.sessao && !SEGURO.test(e.sessao)) throw new Error("Sessão inválida.")
  const amb = e.ambiente ?? LOCAL, wsl = ehWsl(amb)
  // No WSL os arquivos ficam em /tmp da distro: o Node grava pelo UNC e a CLI recebe o caminho Linux.
  const dir = mkdtempSync(wsl ? paraFs(amb, "/tmp/fma-maestro-") : join(tmpdir(), "fma-maestro-"))
  const vista = wsl ? "/tmp/" + dir.split("\\").pop() : dir
  const aq = (s: string) => aspas(s, wsl)
  const comando = cliPorId(e.cli).comando
  const env: Record<string, string> = {}
  let args: string[]
  if (e.cli === "claude") {
    const cfg = join(dir, "mcp.json")
    const cfgCli = wsl ? `${vista}/mcp.json` : cfg
    writeFileSync(cfg, JSON.stringify({ mcpServers: { fma: { type: "http", url: e.mcpUrl, headers: { Authorization: `Bearer ${e.token}` } } } }))
    args = ["-p", "--output-format", "json", "--model", e.modelo, "--mcp-config", aq(cfgCli), "--strict-mcp-config",
      "--allowedTools", "mcp__fma", "--disallowedTools", "Bash,Edit,Write,NotebookEdit"]
    if (e.sessao) args.push("--resume", e.sessao)
  } else if (e.cli === "codex") {
    env.FMA_MCP_TOKEN = e.token
    const cfg = ["-c", `mcp_servers.fma.url=${e.mcpUrl}`, "-c", "mcp_servers.fma.bearer_token_env_var=FMA_MCP_TOKEN"]
    args = e.sessao
      ? ["exec", "resume", "--json", "--skip-git-repo-check", "-m", e.modelo, ...cfg, e.sessao, "-"]
      : ["exec", "--json", "--skip-git-repo-check", "-s", "read-only", "-m", e.modelo, "-C", aq(e.pasta), ...cfg, "-"]
  } else {
    const cfg = join(dir, "settings.json")
    writeFileSync(cfg, JSON.stringify({ mcpServers: { fma: { httpUrl: e.mcpUrl, headers: { Authorization: `Bearer ${e.token}` }, trust: true } } }))
    env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = wsl ? `${vista}/settings.json` : cfg
    args = ["-p", aq("Responda ao pedido recebido."), "--output-format", "json", "-m", e.modelo, "--allowed-mcp-server-names", "fma"]
  }
  return { comando, args, env, dir }
}

/** Extrai o texto final e o id da sessão da saída de cada CLI. */
export function lerSaida(cli: CliId, saida: string): { texto: string; sessao: string | null } {
  if (cli === "claude" || cli === "gemini") {
    const j = JSON.parse(saida.slice(saida.indexOf("{"))) as Record<string, unknown>
    if (j.is_error) throw new Error(String(j.result ?? "Erro na CLI."))
    return { texto: String((cli === "claude" ? j.result : j.response) ?? "").trim(), sessao: cli === "claude" ? ((j.session_id as string) ?? null) : null }
  }
  let sessao: string | null = null
  let texto = ""
  for (const l of saida.split(/\r?\n/)) {
    if (!l.startsWith("{")) continue
    try {
      const ev = JSON.parse(l) as { type?: string; thread_id?: string; item?: { type?: string; text?: string } }
      if (ev.type === "thread.started" && ev.thread_id) sessao = ev.thread_id
      if (ev.type === "item.completed" && ev.item?.type === "agent_message") texto = ev.item.text ?? texto
    } catch { /* linha que não é evento */ }
  }
  return { texto: texto.trim(), sessao }
}

export function executar(e: Execucao, limiteMs = 5 * 60_000): Promise<{ texto: string; sessao: string | null }> {
  const c = montar(e)
  return new Promise((ok, falha) => {
    const a = comandoEm(e.ambiente ?? LOCAL, c.comando, c.args, { cwd: e.pasta, env: c.env, shell: true })
    const filho = spawn(a.comando, a.args, { cwd: a.cwd, env: a.env, shell: a.shell, windowsHide: true })
    let saida = ""
    let erro = ""
    const fim = setTimeout(() => matar(filho), limiteMs)
    filho.stdout.on("data", (d) => (saida += d))
    filho.stderr.on("data", (d) => (erro += d))
    filho.on("error", (x) => { clearTimeout(fim); rmSync(c.dir, { recursive: true, force: true }); falha(x) })
    filho.on("close", (codigo) => {
      clearTimeout(fim)
      rmSync(c.dir, { recursive: true, force: true })
      if (codigo !== 0 && !saida.trim()) return falha(new Error(erro.trim().slice(-400) || `A CLI saiu com código ${codigo}.`))
      try { ok(lerSaida(e.cli, saida)) } catch (x) { falha(x as Error) }
    })
    filho.stdin.end(e.prompt)
  })
}
