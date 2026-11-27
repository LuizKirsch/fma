/**
 * Terminal de verdade da task (estilo Orca): um PTY (node-pty) no worktree da task, local ou no WSL.
 * Com `cartaId`, usa a conta da carta e já entra na sessão dela (`claude --resume`), a mesma conversa que o motor usou.
 * Canais: "pty:abrir|escrever|redimensionar|fechar" (invoke/send) e "pty:evento" (main -> janela).
 */
import type { BrowserWindow } from "electron"
import { ipcMain } from "electron"
import type { DatabaseSync } from "node:sqlite"
import { spawn, type IPty } from "node-pty"
import { aspas, caminhos, ehWsl, LOCAL } from "./ambiente"
import { contaDaCarta, envDaConta } from "./contas"
import type { Resultado } from "@shared/tipos"
import type { CopiaCarta } from "@shared/task"
import { comandoDeTeste } from "@shared/projeto"

const ptys = new Map<string, IPty>()
const WIN = process.platform === "win32"

/** O shell interativo no ambiente do projeto, já na pasta e com as variáveis da conta. */
function shell(amb: string, cwd: string, env: Record<string, string>): { arquivo: string; args: string[]; cwd?: string; env: Record<string, string> } {
  const base = { ...process.env, ...env } as Record<string, string>
  if (ehWsl(amb)) {
    const exports = Object.entries(env).map(([k, v]) => `export ${k}=${aspas(v)}; `).join("")
    return { arquivo: "wsl.exe", args: ["-d", amb.slice(4), "--cd", cwd, "-e", "bash", "-lc", `${exports}exec bash -l`], env: process.env as Record<string, string> }
  }
  if (WIN) return { arquivo: "powershell.exe", args: ["-NoLogo"], cwd, env: base }
  return { arquivo: process.env.SHELL || "/bin/bash", args: ["-l"], cwd, env: base }
}

export function abrirTerminal(db: DatabaseSync, janela: BrowserWindow, taskId: string, cartaId: string | null, cols: number, rows: number, testar = false): Resultado<string> {
  const t = db.prepare("SELECT t.worktree, p.ambiente, p.repositorio, p.comando_teste FROM task t JOIN projeto p ON p.id = t.projeto_id WHERE t.id = ?").get(taskId) as { worktree: string | null; ambiente: string; repositorio: string; comando_teste: string | null } | undefined
  if (!t) return { ok: false, erro: "Essa task não existe mais." }
  if (!t.worktree) return { ok: false, erro: "A task não tem worktree aberto (ainda não começou ou já foi entregue)." }
  const amb = t.ambiente || LOCAL
  const teste = testar && t.comando_teste?.trim() ? comandoDeTeste(t.comando_teste, caminhos(amb).relative(t.repositorio, t.worktree)).comando : null
  if (testar && !teste) return { ok: false, erro: "Este projeto não tem comando de teste (Ajustes do projeto)." }
  let env: Record<string, string> = {}, retomar: string | null = null
  if (cartaId) {
    const l = db.prepare("SELECT copia_carta, sessao FROM task_carta WHERE task_id = ? AND carta_id = ?").get(taskId, cartaId) as { copia_carta: string | null; sessao: string | null } | undefined
    const copia = l?.copia_carta ? (JSON.parse(l.copia_carta) as CopiaCarta) : null
    if (!copia) return { ok: false, erro: "Essa carta não está na task." }
    if (copia.cli !== "claude") return { ok: false, erro: "Só dá para entrar na sessão de cartas do Claude." }
    const s = l?.sessao ? (JSON.parse(l.sessao) as { id: string; cwd: string }) : null
    if (!s || s.cwd !== t.worktree || !/^[\w-]+$/.test(s.id)) return { ok: false, erro: "Essa carta ainda não tem sessão para retomar." }
    env = envDaConta(contaDaCarta(db, copia.cli, copia.contaId, amb))
    retomar = s.id
  }
  try {
    const sh = shell(amb, t.worktree, env)
    const p = spawn(sh.arquivo, sh.args, { name: "xterm-256color", cols, rows, cwd: sh.cwd, env: sh.env })
    const id = crypto.randomUUID()
    ptys.set(id, p)
    const enviar = (e: unknown) => { if (!janela.isDestroyed()) janela.webContents.send("pty:evento", e) }
    p.onData((dados) => enviar({ id, dados }))
    p.onExit(({ exitCode }) => { ptys.delete(id); enviar({ id, saiu: exitCode }) })
    if (retomar) p.write(`claude --resume ${retomar}\r`) // dentro do shell: ao sair do claude, o terminal continua no worktree
    if (teste) p.write(`${teste}\r`) // roda no shell: terminado o teste, o terminal continua no worktree
    return { ok: true, valor: id }
  } catch (e) {
    return { ok: false, erro: `Não consegui abrir o terminal: ${(e as Error).message}` }
  }
}

export const fecharTerminais = () => { for (const p of ptys.values()) try { p.kill() } catch { /* já saiu */ } ptys.clear() }

export function registrarIpcTerminal(db: DatabaseSync, janela: BrowserWindow) {
  ipcMain.handle("pty:abrir", (_e, taskId: string, cartaId: string | null, cols: number, rows: number, testar?: boolean) => abrirTerminal(db, janela, taskId, cartaId, cols, rows, testar))
  ipcMain.on("pty:escrever", (_e, id: string, dados: string) => ptys.get(id)?.write(dados))
  ipcMain.on("pty:redimensionar", (_e, id: string, cols: number, rows: number) => { try { ptys.get(id)?.resize(Math.max(cols, 2), Math.max(rows, 2)) } catch { /* saiu */ } })
  ipcMain.on("pty:fechar", (_e, id: string) => { const p = ptys.get(id); ptys.delete(id); try { p?.kill() } catch { /* já saiu */ } })
}
