/**
 * Ambientes de execução (RF 2.37): o único lugar que sabe rodar processo e montar caminho em cada um.
 * "local" = o sistema do app (Windows, macOS ou Linux). "wsl:<distro>" = uma distro do WSL, só no Windows.
 * No WSL o programa roda por `wsl.exe -d <distro> --cd <pasta> -e bash -lc '<linha>'`: `bash -lc` pega o PATH do
 * usuário (npm global, nvm) e `-e` (--exec) evita que o wsl.exe reinterprete a linha num shell (o `--` expande
 * `$` e crases, testado). O env do Windows não atravessa, então as variáveis vão na linha. A stdin atravessa.
 */
import { execFile } from "node:child_process"
import path from "node:path"
import { distroDe, ehWsl, LOCAL, rotuloAmbiente, type Ambiente } from "../shared/ambiente.ts"

export { deCaminho, ehWsl, LOCAL } from "../shared/ambiente.ts"

const WIN = process.platform === "win32"

/** Entre aspas simples, escapando as aspas simples do texto. */
export const aspas = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

let cache: Promise<string[]> | undefined
/** Distros do WSL (`wsl.exe -l -q`, saída em UTF-16), sem as do Docker Desktop. Vazio fora do Windows. */
export function distrosWsl(): Promise<string[]> {
  if (!WIN) return Promise.resolve([])
  return (cache ??= new Promise<string[]>((ok) =>
    execFile("wsl.exe", ["-l", "-q"], { encoding: "buffer", timeout: 8000, windowsHide: true }, (e, saida) =>
      ok(e ? [] : saida.toString("utf16le").replace(/[\0﻿]/g, "").split(/\r?\n/).map((d) => d.trim()).filter((d) => d && !/^docker-desktop/i.test(d))))))
}

/** O local primeiro; no Windows, as distros do WSL. */
export async function ambientes(): Promise<Ambiente[]> {
  return [{ id: LOCAL, nome: rotuloAmbiente(LOCAL, process.platform) }, ...(await distrosWsl()).map((d) => ({ id: `wsl:${d}`, nome: rotuloAmbiente(`wsl:${d}`, "win32") }))]
}

/** Pasta do repositório para o `fs` do Node: no WSL, o caminho UNC da distro. */
export const paraFs = (amb: string, caminho: string) =>
  ehWsl(amb) ? `\\\\wsl.localhost\\${distroDe(amb)}${caminho.replace(/\//g, "\\")}` : caminho

/** `path` do ambiente: posix no WSL, o do sistema no local. */
export const caminhos = (amb: string) => (ehWsl(amb) ? path.posix : path)
export const juntar = (amb: string, ...partes: string[]) => caminhos(amb).join(...partes)

export interface OpcoesComando { cwd?: string; env?: Record<string, string>; shell?: boolean }
export interface Alvo { comando: string; args: string[]; cwd?: string; env: NodeJS.ProcessEnv; shell: boolean }

/**
 * O que passar ao `spawn`/`execFile`. Local: o programa como hoje; `shell` (só vale no Windows) é para os `.cmd` das CLIs.
 * WSL: `wsl.exe` com a linha toda entre aspas simples; `cwd` é um caminho Linux.
 */
export function comando(amb: string, cmd: string, args: string[], o: OpcoesComando = {}): Alvo {
  if (!ehWsl(amb)) return { comando: cmd, args, cwd: o.cwd, env: { ...process.env, ...o.env }, shell: !!o.shell && WIN }
  const linha = [...Object.entries(o.env ?? {}).map(([k, v]) => `${k}=${aspas(v)}`), aspas(cmd), ...args.map(aspas)].join(" ")
  return { comando: "wsl.exe", args: ["-d", distroDe(amb), ...(o.cwd ? ["--cd", o.cwd] : []), "-e", "bash", "-lc", linha], env: process.env, shell: false }
}

const SEGREDO = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w+|sk-[A-Za-z0-9_-]{16,}|xox[abp]-[\w-]+|Bearer\s+[\w.~+/=-]{16,})/g
/** Pares "chave: valor" de credencial em texto livre (cards, comentários): mantém a chave, troca o valor. */
const CREDENCIAL = /\b((?:senha|password|pass|pwd|secret|client_?secret|clientsecret|token|api[_-]?key)["']?\s*[:=]\s*)\S+/gi
export const mascarar = (t: string) => t.replace(SEGREDO, "***").replace(CREDENCIAL, "$1***")

/** Roda e devolve a saída; rejeita com a mensagem do stderr (e o início do stdout, onde o git põe "CONFLICT"). `input` vai pela stdin. */
export function rodar(amb: string, cmd: string, args: string[], o: OpcoesComando & { input?: string; timeout?: number } = {}): Promise<string> {
  const a = comando(amb, cmd, args, o)
  return new Promise((ok, falha) => {
    const p = execFile(a.comando, a.args, { cwd: a.cwd, env: a.env, shell: a.shell, timeout: o.timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (erro, saida, err) =>
      erro ? falha(new Error([mascarar(String(err || erro.message).trim()), mascarar(String(saida).trim()).slice(0, 300)].filter(Boolean).join("\n"))) : ok(String(saida).trim()))
    if (o.input !== undefined) p.stdin?.end(o.input)
  })
}
