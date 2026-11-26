/**
 * Contas de IA (pacote 1). Uma conta = uma pasta de config da CLI; o motor roda a CLI da carta com a
 * variável de ambiente apontando para ela. `pasta_config` null = config padrão da CLI (já logada no computador).
 * O uso vem dos tokens que o motor soma por task em `task.conta_tokens` (JSON {contaId: tokens}).
 */
import { app, ipcMain } from "electron"
import { execFile, spawn } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import type { Conta, EstadoContas, StatusLogin, UsoConta } from "@shared/conta"
import type { CliId } from "@shared/ia"
import type { Resultado } from "@shared/tipos"
import { limiteDaConta, limparCacheLimite } from "./limites"
import { ambientes, comando, ehWsl, juntar, LOCAL, paraFs, rodar } from "./ambiente"
import { distroDe } from "@shared/ambiente"

const CLIS_OK: CliId[] = ["claude", "codex", "gemini"]
const H = 3_600_000
/** Variável que aponta a CLI para a pasta de config da conta. */
const VARIAVEL: Record<CliId, string> = { claude: "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME", gemini: "GEMINI_CLI_HOME" }
/** Comando de login de cada CLI. */
const LOGIN: Record<CliId, string[]> = { claude: ["claude", "auth", "login"], codex: ["codex", "login"], gemini: ["gemini"] }

const dirContas = () => join(app.getPath("userData"), "contas")

const linha = (l: any): Conta => ({ id: l.id, cli: l.cli, nome: l.nome, pastaConfig: l.pasta_config, padrao: !!l.padrao, criadaEm: l.criada_em, ambiente: l.ambiente })

export const listarContas = (db: DatabaseSync): Conta[] =>
  (db.prepare("SELECT * FROM conta ORDER BY criada_em").all() as any[]).map(linha)

const buscar = (db: DatabaseSync, id: string) => listarContas(db).find((c) => c.id === id)

/** Conta que a carta usa no ambiente do projeto: a escolhida nela (se é da mesma CLI e do mesmo ambiente) ou a padrão da CLI naquele ambiente. null = nenhuma. */
export function contaDaCarta(db: DatabaseSync, cli: CliId, contaId?: string | null, ambiente = LOCAL): Conta | null {
  const todas = listarContas(db).filter((c) => c.ambiente === ambiente)
  return todas.find((c) => c.id === contaId && c.cli === cli) ?? todas.find((c) => c.cli === cli && c.padrao) ?? null
}

/** Mensagem de quando falta conta para a CLI no ambiente do projeto (RF 2.37). */
export const faltaConta = (nomes: string, ambiente: string) =>
  ehWsl(ambiente)
    ? `Falta conta de IA no WSL (${distroDe(ambiente)}) para: ${nomes}. Conecte uma conta no WSL (${distroDe(ambiente)}) em Conexões.`
    : `Falta conta de IA para: ${nomes}. Conecte uma conta em Conexões.`

/** Variáveis de ambiente que apontam a CLI para a config da conta. Vazio = config padrão. */
export const envDaConta = (c: Conta | null): Record<string, string> => (c?.pastaConfig ? { [VARIAVEL[c.cli]]: c.pastaConfig } : {})

/** Protótipo v15: cartas (ids) sem conta escolhida e sem conta padrão para a CLI delas. Devolve "Nome (cli)". */
export function cartasSemConta(db: DatabaseSync, cartaIds: string[], ambiente = LOCAL): string[] {
  if (!cartaIds.length) return []
  const marcas = cartaIds.map(() => "?").join(",")
  const cartas = db.prepare(`SELECT nome, cli, conta_id FROM carta WHERE id IN (${marcas})`).all(...cartaIds) as { nome: string; cli: CliId; conta_id: string | null }[]
  return cartas.filter((c) => !contaDaCarta(db, c.cli, c.conta_id, ambiente)).map((c) => `${c.nome} (${c.cli})`)
}

/** Soma os tokens de uma execução na task, na conta usada. */
export function somarTokensConta(db: DatabaseSync, taskId: string, contaId: string, tokens: number) {
  const r = db.prepare("SELECT conta_tokens FROM task WHERE id = ?").get(taskId) as { conta_tokens: string | null } | undefined
  const mapa: Record<string, number> = r?.conta_tokens ? JSON.parse(r.conta_tokens) : {}
  mapa[contaId] = (mapa[contaId] ?? 0) + tokens
  db.prepare("UPDATE task SET conta_tokens = ? WHERE id = ?").run(JSON.stringify(mapa), taskId)
}

/**
 * Uso de 5 h e semanal. Não há API de limite do provedor, e os tokens só estão guardados por task:
 * ponytail: cada task conta inteira na janela da sua última atividade (encerrada, ou iniciada se ainda roda);
 * guardar tokens com data por execução se precisar de precisão.
 */
export function usoDasContas(db: DatabaseSync, contas = listarContas(db)): UsoConta[] {
  const agora = Date.now()
  const tasks = db.prepare("SELECT conta_tokens, COALESCE(encerrada_em, iniciada_em) AS quando FROM task WHERE conta_tokens IS NOT NULL AND COALESCE(encerrada_em, iniciada_em) >= ?")
    .all(agora - 7 * 24 * H) as { conta_tokens: string; quando: number }[]
  return contas.map((c) => {
    const u: UsoConta = { contaId: c.id, tokens5h: 0, tokensSemana: 0, renova5h: null, renovaSemana: null }
    for (const t of tasks) {
      const n = (JSON.parse(t.conta_tokens) as Record<string, number>)[c.id] ?? 0
      if (!n) continue
      u.tokensSemana += n
      u.renovaSemana = Math.min(u.renovaSemana ?? Infinity, t.quando + 7 * 24 * H)
      if (t.quando >= agora - 5 * H) { u.tokens5h += n; u.renova5h = Math.min(u.renova5h ?? Infinity, t.quando + 5 * H) }
    }
    return u
  })
}

export const estadoContas = async (db: DatabaseSync): Promise<EstadoContas> => {
  const contas = listarContas(db)
  const limites = Object.fromEntries(await Promise.all(contas.map(async (c) => [c.id, await limiteDaConta(c)] as const)))
  return { contas, uso: usoDasContas(db, contas), limites, ambientes: await ambientes() }
}

/**
 * Cria a conta; a primeira de cada (CLI, ambiente) vira a padrão. `pasta` "" = cria a pasta própria:
 * userData/contas/<id> no local, ~/.fma/contas/<id> dentro do WSL.
 */
async function criar(db: DatabaseSync, cli: CliId, nome: string, pasta: string | null, ambiente = LOCAL): Promise<Resultado<Conta>> {
  if (!CLIS_OK.includes(cli)) return { ok: false, erro: "CLI desconhecida." }
  nome = nome.trim().slice(0, 60)
  if (!nome) return { ok: false, erro: "Dê um nome para a conta (por exemplo, o e-mail)." }
  if (!(await ambientes()).some((a) => a.id === ambiente)) return { ok: false, erro: "Esse ambiente não existe neste computador." }
  const id = crypto.randomUUID()
  if (pasta === "") {
    if (ehWsl(ambiente)) {
      try { pasta = await rodar(ambiente, "sh", ["-c", `d="$HOME/.fma/contas/${id}"; mkdir -p "$d" && echo "$d"`]) }
      catch (e) { return { ok: false, erro: `Não consegui criar a pasta da conta no WSL: ${(e as Error).message}` } }
    } else { pasta = join(dirContas(), id); mkdirSync(pasta, { recursive: true }) }
  }
  const primeira = !listarContas(db).some((c) => c.cli === cli && c.ambiente === ambiente)
  db.prepare("INSERT INTO conta (id, cli, nome, pasta_config, padrao, criada_em, ambiente) VALUES (?,?,?,?,?,?,?)").run(id, cli, nome, pasta, primeira ? 1 : 0, Date.now(), ambiente)
  return { ok: true, valor: buscar(db, id)! }
}

/** Abre um terminal do sistema rodando o login da CLI com a conta apontada, para o usuário logar ali. */
function abrirLogin(c: Conta): Resultado<null> {
  const [cmd, ...args] = LOGIN[c.cli]
  const env = { ...process.env, ...envDaConta(c) }
  try {
    if (ehWsl(c.ambiente)) { // terminal do Windows rodando o login dentro da distro
      const a = comando(c.ambiente, cmd, args, { env: envDaConta(c) })
      spawn("cmd.exe", ["/c", "start", "FMA-login", a.comando, ...a.args], { detached: true, stdio: "ignore" }).unref()
    } else if (process.platform === "win32") spawn("cmd.exe", ["/c", "start", "FMA-login", "cmd", "/k", cmd, ...args], { env, detached: true, stdio: "ignore" }).unref()
    else {
      const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
      const cmdline = `${Object.entries(envDaConta(c)).map(([k, v]) => `export ${k}=${sh(v)};`).join(" ")} ${[cmd, ...args].join(" ")}`
      if (process.platform === "darwin") {
        const as = cmdline.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
        spawn("osascript", ["-e", `tell application "Terminal" to do script "${as}"`, "-e", 'tell application "Terminal" to activate'], { detached: true, stdio: "ignore" }).unref()
      } else spawn("x-terminal-emulator", ["-e", "bash", "-c", `${cmdline}; exec bash`], { env, detached: true, stdio: "ignore" }).unref()
    }
    return { ok: true, valor: null }
  } catch (e) {
    return { ok: false, erro: `Não consegui abrir o terminal: ${(e as Error).message}` }
  }
}

/** Roda e devolve stdout+stderr mesmo com código de saída diferente de 0 (as CLIs saem com 1 quando não há login). */
function saidaDe(amb: string, cmd: string, args: string[], env: Record<string, string>): Promise<{ codigo: number; texto: string; falhou: boolean }> {
  const a = comando(amb, cmd, args, { env, shell: true }) // shell: no Windows, codex/gemini do npm são .cmd
  return new Promise((ok) => execFile(a.comando, a.args, { cwd: a.cwd, env: a.env, shell: a.shell, timeout: 25_000, windowsHide: true }, (e, so, se) => {
    const codigo = e ? (typeof (e as any).code === "number" ? (e as any).code : -1) : 0
    // falhou = a CLI nem respondeu (não achada, timeout): diferente de "respondeu que não há login".
    ok({ codigo, falhou: codigo === -1 || (codigo !== 0 && /not recognized|não é reconhecido|command not found|ENOENT/i.test(`${so}${se}`)), texto: `${so ?? ""}
${se ?? ""}` })
  }))
}

/**
 * Confere o login de verdade, rodando a CLI com a config da conta (ou a padrão, com pastaConfig null):
 * claude → `claude auth status --json`; codex → `codex login status`; gemini não tem comando de status,
 * então olha se há credencial salva (oauth_creds.json) ou GEMINI_API_KEY.
 */
export async function statusLogin(c: Pick<Conta, "cli" | "ambiente" | "pastaConfig">): Promise<StatusLogin> {
  const env = envDaConta(c as Conta)
  try {
    if (c.cli === "claude") {
      const { texto, falhou } = await saidaDe(c.ambiente, "claude", ["auth", "status", "--json"], env)
      if (falhou) return { logado: null, detalhe: `Não consegui conferir: ${texto.trim().split(/\r?\n/)[0] || "a CLI não respondeu."}` }
      const j = JSON.parse(texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1))
      return { logado: !!j.loggedIn, email: j.email ?? undefined, detalhe: j.loggedIn ? (j.orgName ?? j.authMethod) : "Sem login nesta config." }
    }
    if (c.cli === "codex") {
      const { codigo, texto, falhou } = await saidaDe(c.ambiente, "codex", ["login", "status"], env)
      if (falhou) return { logado: null, detalhe: `Não consegui conferir: ${texto.trim().split(/\r?\n/)[0] || "a CLI não respondeu."}` }
      const l = texto.split(/\r?\n/).map((x) => x.trim()).find(Boolean) ?? ""
      return { logado: codigo === 0 && /logged in/i.test(l) && !/not logged in/i.test(l), detalhe: l || "Sem resposta do codex." }
    }
    // gemini
    if (process.env.GEMINI_API_KEY && !ehWsl(c.ambiente)) return { logado: true, detalhe: "GEMINI_API_KEY definida." }
    const home = c.pastaConfig ?? (ehWsl(c.ambiente) ? (await rodar(c.ambiente, "sh", ["-c", "echo $HOME"])).trim() : app.getPath("home"))
    const tem = existsSync(paraFs(c.ambiente, juntar(c.ambiente, home, ".gemini", "oauth_creds.json")))
    return tem ? { logado: true, detalhe: "Credencial do Gemini encontrada." } : { logado: null, detalhe: "O Gemini não informa o login; nenhuma credencial salva encontrada." }
  } catch (e) {
    return { logado: null, detalhe: `Não consegui conferir: ${(e as Error).message.split("\n")[0]}` }
  }
}

/** Cartas (ids) cuja conta, no ambiente do projeto, está comprovadamente sem login. Uma checagem por conta. */
export async function cartasSemLogin(db: DatabaseSync, cartaIds: string[], ambiente = LOCAL): Promise<string[]> {
  if (!cartaIds.length) return []
  const cartas = db.prepare(`SELECT nome, cli, conta_id FROM carta WHERE id IN (${cartaIds.map(() => "?").join(",")})`).all(...cartaIds) as { nome: string; cli: CliId; conta_id: string | null }[]
  const cache = new Map<string, Promise<StatusLogin>>()
  const fora: string[] = []
  for (const k of cartas) {
    const conta = contaDaCarta(db, k.cli, k.conta_id, ambiente)
    if (!conta) continue
    if (!cache.has(conta.id)) cache.set(conta.id, statusLogin(conta))
    if ((await cache.get(conta.id)!).logado === false) fora.push(`${k.nome} (${conta.nome})`)
  }
  return fora
}

const naoExiste = { ok: false, erro: "Essa conta não existe mais." } as const

export function registrarIpcContas(db: DatabaseSync) {
  ipcMain.handle("contas:listar", () => estadoContas(db))
  /** "Conectar conta": pasta nova (userData/contas/<id>, ou ~/.fma/contas/<id> no WSL) + terminal com o login da CLI. */
  ipcMain.handle("contas:conectar", async (_e, cli: CliId, nome: string, ambiente = LOCAL): Promise<Resultado<Conta>> => {
    const r = await criar(db, cli, nome, "", ambiente)
    if (!r.ok) return r
    limparCacheLimite(r.valor.id)
    const t = abrirLogin(r.valor)
    return t.ok ? r : t
  })
  /** Reabre o login de uma conta (a sessão expirou, por exemplo). */
  ipcMain.handle("contas:entrar", (_e, id: string): Resultado<null> => { const c = buscar(db, id); return c ? (limparCacheLimite(id), abrirLogin(c)) : naoExiste })
  /** Registra a config que a CLI já usa no computador (já logada), sem pasta própria. */
  ipcMain.handle("contas:usar-config-padrao", (_e, cli: CliId, nome: string, ambiente = LOCAL) => criar(db, cli, nome, null, ambiente))
  /** Login real de uma conta cadastrada. */
  ipcMain.handle("contas:status", async (_e, id: string): Promise<Resultado<StatusLogin>> => { const c = buscar(db, id); return c ? { ok: true, valor: await statusLogin(c) } : naoExiste })
  /** Login da config padrão da CLI no ambiente (antes de cadastrar), para oferecer "usar este login". */
  ipcMain.handle("contas:status-padrao", async (_e, cli: CliId, ambiente = LOCAL): Promise<StatusLogin> => statusLogin({ cli, ambiente, pastaConfig: null }))
  ipcMain.handle("contas:padrao", (_e, id: string): Resultado<null> => {
    const c = buscar(db, id)
    if (!c) return naoExiste
    db.prepare("UPDATE conta SET padrao = (id = ?) WHERE cli = ? AND ambiente = ?").run(id, c.cli, c.ambiente)
    return { ok: true, valor: null }
  })
  ipcMain.handle("contas:remover", async (_e, id: string): Promise<Resultado<null>> => {
    const c = buscar(db, id)
    if (!c) return naoExiste
    limparCacheLimite(id)
    db.prepare("DELETE FROM conta WHERE id = ?").run(id) // as cartas que a usavam passam a usar a padrão (ON DELETE SET NULL)
    // Só apaga a pasta que o app criou; a config padrão da CLI nunca é tocada.
    if (ehWsl(c.ambiente)) { if (c.pastaConfig?.includes("/.fma/contas/")) await rodar(c.ambiente, "rm", ["-rf", c.pastaConfig]).catch(() => {}) }
    else if (c.pastaConfig && resolve(c.pastaConfig).startsWith(resolve(dirContas()) + sep)) rmSync(c.pastaConfig, { recursive: true, force: true })
    if (c.padrao) { // promove a mais antiga da mesma CLI e ambiente
      const outra = listarContas(db).find((x) => x.cli === c.cli && x.ambiente === c.ambiente)
      if (outra) db.prepare("UPDATE conta SET padrao = 1 WHERE id = ?").run(outra.id)
    }
    return { ok: true, valor: null }
  })
}
