/**
 * Processos do motor: git (worktree) e as CLIs das cartas em modo não interativo.
 *
 * Windows: as CLIs instaladas por npm são `.cmd`, que o Node só abre com shell. Como o shell
 * junta os argumentos sem escapar, os argumentos são fixos e o modelo é validado; o prompt
 * (texto livre) vai sempre pela entrada padrão, nunca na linha de comando.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process"
import type { Esforco } from "@shared/conta"
import { comando as comandoEm, ehWsl, LOCAL, rodar } from "../ambiente"
import { lerSaida, linhaDeConsole, type Saida } from "./cli-parse"

const WIN = process.platform === "win32"
/** Esforço da carta nas flags das CLIs: `claude --effort` (low a max) e `codex -c model_reasoning_effort=`. */
const ESFORCO_CLAUDE: Record<Esforco, string> = { baixo: "low", medio: "medium", alto: "high", muito: "xhigh", maximo: "max" }
const ESFORCO_CODEX: Record<Esforco, string> = { baixo: "low", medio: "medium", alto: "high", muito: "high", maximo: "xhigh" }
const MODELO_OK = /^[\w.:/-]{1,80}$/

/** git no ambiente do projeto (RF 2.37); `cwd` é caminho daquele ambiente. */
export const git = (cwd: string, args: string[], ambiente = LOCAL): Promise<string> => rodar(ambiente, "git", args, { cwd })

/**
 * Mata o processo e os filhos dele. No WSL o filho direto é o wsl.exe: `taskkill /T` o encerra e a CLI do Linux
 * morre junto (testado com `sleep` num `wsl.exe -e bash -lc`: 0 processos depois).
 */
export function matar(p: ChildProcess) {
  if (!p.pid || p.exitCode !== null) return
  if (WIN) execFile("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true }, () => {})
  else try { process.kill(-p.pid, "SIGKILL") } catch { p.kill("SIGKILL") }
}

/** Linha de comando de cada CLI (RF 6.44). O prompt vai pela entrada padrão. */
export function argsDaCli(cli: string, modelo: string, leitura = false, esforco: Esforco = "alto"): { comando: string; args: string[] } {
  if (!MODELO_OK.test(modelo)) throw new Error(`Nome de modelo inválido: "${modelo}".`)
  switch (cli) {
    // acceptEdits: a CLI edita arquivos no worktree sem perguntar; comandos fora disso são recusados.
    case "claude": return { comando: "claude", args: ["-p", "--output-format", "stream-json", "--verbose", "--model", modelo, "--permission-mode", leitura ? "plan" : "acceptEdits", "--effort", ESFORCO_CLAUDE[esforco]] }
    case "codex": return { comando: "codex", args: ["exec", "--json", "--skip-git-repo-check", "--sandbox", leitura ? "read-only" : "workspace-write", "-m", modelo, "-c", `model_reasoning_effort=${ESFORCO_CODEX[esforco]}`, "-"] }
    // ponytail: a CLI do gemini não tem flag de esforço na linha de comando; o esforço da carta não vale para ela.
    case "gemini": return { comando: "gemini", args: ["-m", modelo, "--approval-mode", leitura ? "default" : "auto_edit", "-p", "Execute"] }
    default: throw new Error(`CLI desconhecida: ${cli}`)
  }
}

export interface Execucao {
  /** Mata o processo (parar a task). */
  parar(): void
  resultado: Promise<Saida>
}

/**
 * Roda a CLI no `cwd`, com stdout em streaming (cada linha vai para `aoConsole`).
 * Nunca rejeita: falhas viram `erro` no resultado.
 */
/** Argumentos extras (config MCP, RF 4.14): no Windows o shell junta sem escapar, então cita o que tem espaço ou aspas. */
const citar = (a: string) => (WIN && /[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)

export function rodarCli(cli: string, modelo: string, prompt: string, cwd: string, aoConsole: (linha: string, canal: "stdout" | "stderr") => void, extras: string[] = [], leitura = false, conta: { env?: Record<string, string>; esforco?: Esforco; ambiente?: string } = {}): Execucao {
  let filho: ChildProcess | undefined
  let parado = false
  const resultado = new Promise<Saida>((ok) => {
    const falha = (erro: string) => ok({ texto: "", tokens: 0, erro })
    try {
      const { comando, args } = argsDaCli(cli, modelo, leitura, conta.esforco)
      const amb = conta.ambiente ?? LOCAL
      const a = comandoEm(amb, comando, [...args, ...extras.map((x) => (ehWsl(amb) ? x : citar(x)))], { cwd, env: conta.env, shell: true })
      filho = spawn(a.comando, a.args, { cwd: a.cwd, env: a.env, shell: a.shell, windowsHide: true, detached: !WIN, stdio: ["pipe", "pipe", "pipe"] })
    } catch (e) {
      return falha((e as Error).message)
    }
    const p = filho
    let saida = "", sobra = "", errTexto = ""
    const linhas = (texto: string) => {
      sobra += texto
      const partes = sobra.split(/\r?\n/)
      sobra = partes.pop() ?? ""
      for (const l of partes) if (l.trim()) { const v = linhaDeConsole(cli, l); if (v) aoConsole(v, "stdout") }
    }
    p.stdout!.setEncoding("utf8").on("data", (d: string) => { saida += d; linhas(d) })
    p.stderr!.setEncoding("utf8").on("data", (d: string) => { errTexto += d; aoConsole(d.trimEnd(), "stderr") })
    p.stdin!.on("error", () => {}) // EPIPE se a CLI fechar antes de ler tudo
    p.stdin!.end(prompt)
    p.on("error", (e) => falha(`Não consegui abrir a CLI ${cli}: ${e.message}`))
    p.on("close", (codigo) => {
      if (sobra.trim()) { const v = linhaDeConsole(cli, sobra); if (v) aoConsole(v, "stdout") }
      if (parado) return falha("Interrompida.")
      const r = lerSaida(cli, saida, prompt)
      ok(codigo !== 0 && !r.erro ? { ...r, erro: errTexto.trim().slice(-500) || `A CLI saiu com código ${codigo}.` } : r)
    })
  })
  return { parar: () => { parado = true; if (filho) matar(filho) }, resultado }
}
