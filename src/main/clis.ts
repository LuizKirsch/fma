/**
 * Descobre quais CLIs de IA estão instaladas no computador (Claude Code, Codex, Gemini).
 *
 * No Windows, o app aberto pelo menu herda o PATH do usuário, então basta perguntar ao `where`.
 * No macOS e no Linux, um app gráfico não herda o PATH do terminal (nvm, ~/.npm-global...),
 * então a busca roda dentro de um shell de login do usuário, como se fosse no terminal.
 */
import { execFile } from "node:child_process"
import { CLIS, type CliInstalada } from "@shared/ia"
import { ambientes, ehWsl, rodar as rodarEm } from "./ambiente"

function rodar(cmd: string, args: string[], timeout = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true, shell: process.platform === "win32" }, (erro, saida) => {
      resolve(erro ? null : String(saida).trim())
    })
  })
}

async function versaoDe(amb: string, comando: string): Promise<string | null> {
  // No WSL: shell de login da distro (PATH do usuário: npm global, nvm), pelo ambiente.ts.
  if (ehWsl(amb)) return rodarEm(amb, "sh", ["-c", `command -v ${comando} >/dev/null 2>&1 && ${comando} --version`], { timeout: 15_000 }).catch(() => null)
  if (process.platform === "win32") {
    if (!(await rodar("where", [comando]))) return null
    return rodar(comando, ["--version"])
  }
  const shell = process.env.SHELL || "/bin/bash"
  return rodar(shell, ["-lc", `command -v ${comando} >/dev/null 2>&1 && ${comando} --version`])
}

/** Primeira linha da saída de `--version`, sem o nome do programa quando ele vem junto. */
function limparVersao(saida: string): string {
  const linha = saida.split(/\r?\n/).find((l) => l.trim()) ?? ""
  return (linha.match(/\d+\.\d+(\.\d+)?([-.\w]*)?/)?.[0] ?? linha).slice(0, 40)
}

let cache: { quando: number; valor: CliInstalada[] } | undefined

/** Consulta as três CLIs em paralelo, em cada ambiente (o local e as distros do WSL). Guarda o resultado por 1 minuto. */
export async function detectarClis(forcar = false): Promise<CliInstalada[]> {
  if (!forcar && cache && Date.now() - cache.quando < 60_000) return cache.valor
  const valor = (await Promise.all(
    (await ambientes()).flatMap((a) => CLIS.map(async (c): Promise<CliInstalada> => {
      const saida = await versaoDe(a.id, c.comando)
      return saida === null ? { id: c.id, instalada: false, ambiente: a.id } : { id: c.id, instalada: true, versao: limparVersao(saida), ambiente: a.id }
    })),
  ))
  cache = { quando: Date.now(), valor }
  return valor
}
