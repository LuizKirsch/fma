/**
 * Limite real das contas de IA (o mesmo que o /usage mostra).
 * - Claude: lê o token de login da própria CLI (<config>/.credentials.json; no macOS, o Keychain) e consulta
 *   GET api.anthropic.com/api/oauth/usage. O token só vai para a Anthropic e nunca é gravado nem registrado.
 *   ponytail: endpoint não documentado (é o que o /usage usa); se mudar, o FMA cai no uso por tokens das tasks.
 * - Codex: o próprio Codex grava `rate_limits` nos logs de sessão (<CODEX_HOME>/sessions/**.jsonl); lê o último.
 * - Gemini: não expõe limite.
 * Cache de 60 s por conta (10 s se deu erro), para o anel e a tela de Conexões poderem atualizar a cada minuto.
 */
import { execFile } from "node:child_process"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { app } from "electron"
import type { Conta, LimiteConta, LimiteJanela } from "@shared/conta"
import { ehWsl, juntar, paraFs, rodar } from "./ambiente"

const cache = new Map<string, { em: number; valor: LimiteConta | null }>()
/** Esquece o limite guardado da conta (após login ou remoção). */
export const limparCacheLimite = (contaId: string) => void cache.delete(contaId)

/** Pasta de config efetiva da CLI: a da conta, ou a padrão (respeitando CLAUDE_CONFIG_DIR / CODEX_HOME do usuário). */
async function pastaDe(c: Conta, variavel: string, padrao: string): Promise<string> {
  if (c.pastaConfig) return c.pastaConfig
  if (ehWsl(c.ambiente)) return (await rodar(c.ambiente, "sh", ["-c", `echo "\${${variavel}:-$HOME/${padrao}}"`], { timeout: 8000 })).trim()
  return process.env[variavel] || juntar(c.ambiente, app.getPath("home"), padrao)
}

const keychain = () => new Promise<string>((ok, falha) =>
  execFile("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { timeout: 8000 }, (e, so) => (e ? falha(e) : ok(so))))

async function tokenClaude(c: Conta): Promise<string> {
  const bruto = process.platform === "darwin" && !c.pastaConfig && !ehWsl(c.ambiente)
    ? await keychain()
    : readFileSync(paraFs(c.ambiente, juntar(c.ambiente, await pastaDe(c, "CLAUDE_CONFIG_DIR", ".claude"), ".credentials.json")), "utf8")
  const t = JSON.parse(bruto)?.claudeAiOauth?.accessToken
  if (!t) throw new Error("Essa conta não tem login da Claude (assinatura). Contas por chave de API não têm limite de 5 h.")
  return t
}

async function limiteClaude(c: Conta): Promise<LimiteConta> {
  const r = await fetch("https://api.anthropic.com/api/oauth/usage", { headers: { Authorization: `Bearer ${await tokenClaude(c)}`, "anthropic-beta": "oauth-2025-04-20" }, signal: AbortSignal.timeout(10_000) })
  if (r.status === 401) throw new Error("Login expirado. Use a Claude uma vez (ou Entrar) para renovar.")
  if (!r.ok) throw new Error(`A Anthropic respondeu ${r.status}.`)
  const j = (await r.json()) as Record<string, { utilization?: number; resets_at?: string } | null>

  const janela = (k: string, rotulo: string): LimiteJanela | null =>
    j[k] && typeof j[k].utilization === "number" ? { rotulo, usado: j[k].utilization, renovaEm: j[k].resets_at ? Date.parse(j[k].resets_at) : null } : null
  const janelas = [janela("five_hour", "5 horas"), janela("seven_day", "Semana"), janela("seven_day_opus", "Semana · Opus")].filter((x): x is LimiteJanela => !!x)
  return { janelas, fonte: "api", atualizadoEm: Date.now() }
}

const rotuloMinutos = (m: number) => (m === 300 ? "5 horas" : m === 10080 ? "Semana" : m % 1440 === 0 ? `${m / 1440} dias` : `${Math.round(m / 60)} h`)

/** O .jsonl de sessão mais recente (busca recursiva simples). */
function maisRecente(dir: string): string | null {
  let melhor: { f: string; t: number } | null = null
  const andar = (d: string) => {
    let itens: string[] = []
    try { itens = readdirSync(d) } catch { return }
    for (const n of itens) {
      const p = `${d}/${n}`
      const s = statSync(p, { throwIfNoEntry: false })
      if (!s) continue
      if (s.isDirectory()) andar(p)
      else if (n.endsWith(".jsonl") && (!melhor || s.mtimeMs > melhor.t)) melhor = { f: p, t: s.mtimeMs }
    }
  }
  andar(dir)
  return melhor ? (melhor as { f: string }).f : null
}

async function limiteCodex(c: Conta): Promise<LimiteConta | null> {
  const arq = maisRecente(paraFs(c.ambiente, juntar(c.ambiente, await pastaDe(c, "CODEX_HOME", ".codex"), "sessions")))
  if (!arq) return null
  const linhas = readFileSync(arq, "utf8").trimEnd().split("\n").reverse()
  for (const l of linhas) {
    if (!l.includes('"rate_limits"')) continue
    let j: any
    try { j = JSON.parse(l) } catch { continue } // última linha pode estar cortada: tenta as anteriores
    const rl = j?.payload?.rate_limits ?? j?.rate_limits
    if (!rl) continue
    const janelas = [rl.primary, rl.secondary].filter(Boolean).map((p: any): LimiteJanela => ({
      rotulo: rotuloMinutos(p.window_minutes), usado: p.used_percent, renovaEm: p.resets_at ? p.resets_at * 1000 : null,
    }))
    return { janelas, fonte: "log", atualizadoEm: statSync(arq).mtimeMs }
  }
  return null
}

/** Limite real da conta, ou null quando a CLI não expõe (Gemini) ou não há dado ainda. Erros viram `erro`. */
export async function limiteDaConta(c: Conta): Promise<LimiteConta | null> {
  const k = cache.get(c.id)
  if (k && Date.now() - k.em < (k.valor?.erro ? 10_000 : 60_000)) return k.valor
  let valor: LimiteConta | null
  try {
    valor = c.cli === "claude" ? await limiteClaude(c) : c.cli === "codex" ? await limiteCodex(c) : null
  } catch (e) {
    valor = { janelas: [], fonte: "api", atualizadoEm: Date.now(), erro: (e as Error).message.split("\n")[0] }
  }
  cache.set(c.id, { em: Date.now(), valor })
  return valor
}
