/**
 * Motor de tasks (E2 a E4): criar, iniciar (vagas e fila), preparar (tirar e devolver cartas), rodar o fluxo da mesa,
 * questionar, devolver, parar, liberar mais uma volta e retomar ao abrir o app. A ordem do fluxo vem de fluxo.ts (puro);
 * aqui ficam banco, git, CLIs e eventos. O estado de cada carta é gravado no banco; a execução (processos) fica em memória.
 * As integrações (monitores, apoio, Maestro) entram por `ligarGanchos`, sem o motor importar nenhuma delas.
 */
import type { DatabaseSync } from "node:sqlite"
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { caminhos, ehWsl, LOCAL, paraFs, rodar } from "../ambiente"
import { promptFinal } from "@shared/carta"
import { pastaValida } from "@shared/projeto"
import { cliPorId, type CliId } from "@shared/ia"
import type { Resultado } from "@shared/tipos"
import type { CopiaCarta, DecisaoPendente, DiffTask, EstadoCarta, EventoMotor, NovaTask, PreviaTask, Task, TipoEvento } from "@shared/task"
import { detectarClis } from "../clis"
import { secoesBiblioteca } from "../biblioteca"
import { decisaoResposta, decisaoSeguir, extrairJson, secaoDecisoes, semLinhaStatus, statusDaEntrega } from "./cli-parse"
import { emTransacao, inserirEvento, lerEventos, lerTask, lerTaskCartas, lerTaskConexoes } from "./dados"
import * as fx from "./fluxo"
import { lerCartasDaMesa, lerConexoes, lerProjeto, perguntaDaSkill, type ProjetoLido } from "./leitura-mesa"
import { git, rodarCli, type Execucao } from "./processo"
import { cartasSemConta, cartasSemLogin, contaDaCarta, envDaConta, faltaConta, somarTokensConta } from "../contas"

let enviar: (e: EventoMotor) => void = () => {}
/** A janela (ou um teste) recebe os eventos do motor por aqui. */
export const aoEmitir = (fn: (e: EventoMotor) => void) => { enviar = fn }

/** Ganchos que as integrações registram na inicialização (ver adaptadores.ts). Falha num gancho nunca derruba o motor. */
export interface Ganchos {
  /** RF 5.16: a task começou. */
  aoComecar(taskId: string): unknown
  /** RF 5.17: a task concluiu. */
  aoConcluir(taskId: string): unknown
  /** RF 5.18/5.19: a task travou esperando decisão. */
  aoTravar(taskId: string, duvida: string): unknown
  /** RF 4.14: config MCP e contexto da carta; o motor grava os arquivos, acrescenta os args à CLI e o contexto ao prompt. */
  ferramentasDaCarta(p: { taskId: string; projetoId: string; cartaId: string; cli: CliId; dirConfig: string }): { config: { args: string[]; arquivos: { caminho: string; conteudo: string }[] }; contexto: string }
  /** RF 6.40: os tokens passaram do limite do projeto (uma vez por task). */
  avisarLimiteTokens(task: Task): unknown
  /** RN 81: o Maestro chama o usuário (limite de devoluções, task que não conseguiu iniciar). */
  chamar(p: { projetoId: string; taskId: string; texto: string; acoes?: { id: "liberar" | "seguir" | "parar"; rotulo: string }[] }): unknown
  /** Busca de novo o card da fonte e grava em task.card, antes das cartas rodarem. Falha ou demora (>15 s) são ignoradas. */
  atualizarCard?(taskId: string): Promise<void>
  /** A task parou (pelo usuário, erro do motor ou commit que falhou). */
  aoParar?(taskId: string, motivo: string): unknown
  /** RN 86: o assunto da task foi resolvido fora do chat. */
  resolverFora(projetoId: string, taskId: string): unknown
}
const ganchos: Partial<Ganchos> = {}
export const ligarGanchos = (g: Partial<Ganchos>) => void Object.assign(ganchos, g)
const seguro = (fn: () => unknown) => { try { void Promise.resolve(fn()).catch(() => {}) } catch { /* integração fora do ar não para a task */ } }
/** Chamado do Maestro para o usuário (RN 81). */
export const chamarUsuario = (p: Parameters<Ganchos["chamar"]>[0]) => seguro(() => ganchos.chamar?.(p))
const rotuloTask = (t: Task) => `Task #${t.numero}${t.referencia ? ` (${t.referencia})` : ""}`

type Fim = { t: "ok" } | { t: "erro"; alvo: string; msg: string } | { t: "devolve"; alvo: string; q: string } | { t: "trava"; alvo: string; q: string; motivo?: string }

interface Ctx {
  db: DatabaseSync
  task: Task
  projeto: ProjetoLido
  copias: Map<string, CopiaCarta>
  tarefas: Map<string, string>
  entregas: Map<string, string>
  apontamentos: Map<string, string[]>
  voltas: Record<string, number>
  skills: Map<string, string[]> // "de>para" -> chaves das skills
  semPergunta?: Set<string> // entregas aceitas com "Seguir mesmo assim": ninguém as questiona
  cartas: fx.CartaFluxo[]
  con: fx.ConexaoFluxo[]
  orq: string
  estado: fx.Estado
  geracao: Record<string, number>
  ativas: Map<string, Promise<void>>
  execs: Map<string, Execucao[]>
  parada: boolean
  travada: boolean
}
const ctxs = new Map<string, Ctx>()

// ---------- utilitários ----------

const salvarTask = (ctx: Ctx, campos: Record<string, unknown>) => {
  const cols = Object.keys(campos)
  ctx.db.prepare(`UPDATE task SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(...(Object.values(campos) as any[]), ctx.task.id)
  ctx.task = lerTask(ctx.db, ctx.task.id)!
  enviar({ tipo: "task", task: ctx.task })
}

/** Grava o evento na Crônica, avisa a janela e soma os tokens da task (RF 6.33). */
function registrar(ctx: Ctx, tipo: TipoEvento, texto: string, de: string | null = null, para: string | null = null, tokens: number | null = null) {
  enviar({ tipo: "evento", evento: inserirEvento(ctx.db, { taskId: ctx.task.id, tipo, deCartaId: de, paraCartaId: para, texto, tokens }) })
  if (tokens) {
    salvarTask(ctx, { tokens: ctx.task.tokens + tokens })
    // RN 95: avisa uma única vez por task
    if (!ctx.task.alertaOrcamento && ctx.projeto.limiteTokens > 0 && ctx.task.tokens > ctx.projeto.limiteTokens) {
      salvarTask(ctx, { alerta_orcamento: 1 })
      seguro(() => ganchos.avisarLimiteTokens?.(ctx.task))
    }
  }
}

/** Evento na Crônica de uma task sem execução em memória (fila, retomada, descarte). */
export function registrarEvento(db: DatabaseSync, taskId: string, tipo: TipoEvento, texto: string) {
  enviar({ tipo: "evento", evento: inserirEvento(db, { taskId, tipo, deCartaId: null, paraCartaId: null, texto, tokens: null }) })
}

function marcar(ctx: Ctx, id: string, estado: EstadoCarta, atividade: string) {
  if (id in ctx.estado && estado !== "trabalhando" && estado !== "questionando") ctx.estado[id] = estado
  ctx.db.prepare("UPDATE task_carta SET estado = ?, atividade = ?, concluida = ? WHERE task_id = ? AND carta_id = ?")
    .run(estado, atividade, estado === "concluida" ? 1 : 0, ctx.task.id, id)
  enviar({ tipo: "carta", taskId: ctx.task.id, cartaId: id, estado, atividade })
}
const nome = (ctx: Ctx, id: string) => ctx.copias.get(id)?.nome ?? id
const curto = (t: string, n = 80) => (t.length > n ? t.slice(0, n - 1) + "…" : t).replace(/\s+/g, " ")

/** Flags de identidade para o git quando o usuário não configurou nome (commit e merge feitos pelo FMA). */
const identidade = async (cwd: string, amb: string) =>
  (await git(cwd, ["config", "user.name"], amb).catch(() => "")) ? [] : ["-c", "user.name=FMA", "-c", "user.email=fma@local"]

/** Commita o que há no worktree. Lança se o commit falhar (quem chama decide: nunca remover o worktree sem commit). */
/** Worktree de verdade (tem o .git dele). Pasta vazia que o Windows não deixou apagar não conta. */
const wtVivo = (amb: string, wt: string) => existsSync(paraFs(amb, `${wt}/.git`))

/** Remove o worktree. Se o git já o soltou e só sobrou a pasta (Windows segura logo após matar o processo), conta como removido. */
async function removerWorktree(repo: string, wt: string, amb: string): Promise<void> {
  try {
    await git(repo, ["worktree", "remove", "--force", wt], amb)
    rmSync(paraFs(amb, wt), { recursive: true, force: true }) // sobra a pasta com a junção das pastas ligadas; rmSync solta o link sem apagar o alvo
  } catch (e) {
    if (wtVivo(amb, wt)) throw e
    await git(repo, ["worktree", "prune"], amb).catch(() => {})
    try { rmSync(paraFs(amb, wt), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* ponytail: sobra pasta vazia; inofensiva */ }
  }
}

async function commitar(cwd: string, msg: string, amb: string) {
  await git(cwd, ["add", "-A"], amb)
  const mesclando = await git(cwd, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], amb).then(() => true, () => false)
  if (mesclando) {
    // Merge da base em andamento (conflito na entrega): não deixa commitar marcadores <<<<<<< esquecidos.
    const marcadores = await git(cwd, ["diff", "--cached", "--check"], amb).then(() => "", (e: Error) => (/conflict marker/i.test(e.message) ? e.message : ""))
    if (marcadores) throw new Error(`Ainda há marcadores de conflito (<<<<<<< ======= >>>>>>>) nestes arquivos; resolva todos antes de terminar:\n${marcadores.slice(0, 1500)}`)
  }
  if (!(await git(cwd, ["status", "--porcelain"], amb))) {
    // Merge sem nada a mudar (a carta resolveu igual ao que já estava): ainda precisa do commit de merge.
    if (mesclando) await git(cwd, [...(await identidade(cwd, amb)), "commit", "--no-edit"], amb)
    return
  }
  await git(cwd, [...(await identidade(cwd, amb)), "commit", "-m", msg], amb)
}

const HOOK = "O commit foi recusado pelo hook do projeto. Corrija o que ele aponta:"
/** Começo do ajuste automático quando o merge local dá conflito: voltarComAjuste traz a base para o worktree antes das cartas. */
const AJUSTE_CONFLITO = "Resolver conflitos com a branch base:"
const motivoHook = (saida: string) => {
  const ls = saida.split("\n").map((l) => l.trim()).filter(Boolean)
  return `O hook de commit do projeto recusou o trabalho: ${curto(ls.find((l) => /error|fail|erro|✖|✗/i.test(l)) ?? ls[0] ?? "sem detalhes", 200)}`
}

/** Commita o trabalho de uma carta. Se o hook recusar, a carta roda de novo UMA vez com a saída dele como apontamento. Devolve o motivo se falhar de novo. */
async function commitarCarta(ctx: Ctx, id: string, msg: string): Promise<string | null> {
  const amb = ctx.projeto.ambiente
  try { await commitar(ctx.task.worktree!, msg, amb); return null } catch (e) {
    const saida = (e as Error).message.slice(0, 4000)
    registrar(ctx, "aviso", `O hook de commit recusou o trabalho de ${nome(ctx, id)}; a carta vai corrigir.`, id)
    const antes = ctx.apontamentos.get(id) ?? []
    guardarApontamentos(ctx, id, [...antes, `${HOOK}
${saida}`])
    const s = await rodarCarta(ctx, id, entrada(ctx, id), "Corrigindo o que o hook do commit apontou")
    if (ctx.parada || ctx.travada) return null
    if (s.erro) return `${nome(ctx, id)}: ${s.erro}`
    try { await commitar(ctx.task.worktree!, msg, amb); guardarApontamentos(ctx, id, antes); return null } catch (e2) { return motivoHook((e2 as Error).message) }
  }
}

/** Conta e login das cartas (protótipo v15): vale ao começar, na fila, ao pedir ajuste e ao retomar. */
async function faltaContaDe(db: DatabaseSync, ids: string[], amb: string): Promise<string | null> {
  const semConta = cartasSemConta(db, ids, amb)
  if (semConta.length) return faltaConta(semConta.join(", "), amb)
  const semLogin = await cartasSemLogin(db, ids, amb)
  return semLogin.length ? `Conta sem login na CLI: ${semLogin.join(", ")}. Entre de novo em Conexões.` : null
}

const caminhoWorktree = (p: ProjetoLido, numero: number) => {
  const P = caminhos(p.ambiente)
  return P.join(p.repositorio, ".fma", "worktrees", `task-${numero}`) // dentro do repositório: um container que monta o repo enxerga a task; o git ignora via info/exclude
}

/** Garante `.fma/` (e as pastas ligadas) em info/exclude do repositório e liga no worktree as pastas que existem no principal e faltam nele. Falha só avisa. */
async function prepararWorktree(projeto: ProjetoLido, wt: string, aviso: (t: string) => void) {
  const amb = projeto.ambiente, P = caminhos(amb), repo = projeto.repositorio
  const ligadas: string[] = []
  for (const pasta of projeto.pastasCompartilhadas.filter(pastaValida)) {
    const alvo = P.join(repo, pasta), link = P.join(wt, pasta)
    try {
      if (!existsSync(paraFs(amb, alvo)) || existsSync(paraFs(amb, link))) continue
      mkdirSync(paraFs(amb, P.dirname(link)), { recursive: true })
      const rel = P.relative(P.dirname(link), alvo)
      if (amb === "local") symlinkSync(process.platform === "win32" ? alvo : rel, paraFs(amb, link), "junction") // junção do Windows pede alvo absoluto e não exige admin
      else await rodar(amb, "ln", ["-s", rel, link])
      ligadas.push(pasta)
    } catch (e) { aviso(`Não consegui ligar a pasta ${pasta} no worktree: ${(e as Error).message}`) }
  }
  try {
    const comum = P.resolve(repo, (await git(repo, ["rev-parse", "--git-common-dir"], amb)).trim())
    const arq = paraFs(amb, P.join(comum, "info", "exclude"))
    const atual = existsSync(arq) ? readFileSync(arq, "utf8") : ""
    const tem = new Set(atual.split(/\r?\n/).map((l) => l.trim()))
    const falta = [".fma/", ...ligadas.map((p) => `/${p.replace(/\\/g, "/")}`)].filter((l) => !tem.has(l)) // symlink não casa com "vendor/" do .gitignore: sem isso o git add -A o versionaria
    if (falta.length) { mkdirSync(paraFs(amb, P.dirname(arq)), { recursive: true }); writeFileSync(arq, `${atual && !atual.endsWith("\n") ? "\n" : ""}${falta.join("\n")}\n`) }
  } catch (e) { aviso(`Não consegui atualizar o info/exclude do repositório: ${(e as Error).message}`) }
  // Comandos de preparo do projeto (npm install, cp .env...), na ordem. Falha só avisa: as cartas ainda podem corrigir.
  for (const linha of projeto.preparo.map((c) => c.trim()).filter(Boolean)) {
    try {
      // ponytail: 10 min por comando; um install maior que isso vira aviso e as cartas seguem.
      if (amb === "local" && process.platform === "win32") await rodar(amb, linha, [], { cwd: wt, shell: true, timeout: 600_000 })
      else await rodar(amb, "bash", ["-lc", linha], { cwd: wt, timeout: 600_000 })
    } catch (e) { aviso(`O preparo do worktree falhou em "${linha}": ${(e as Error).message.slice(0, 600)}`) }
  }
}

/** Roda uma carta na CLI dela (RF 6.44), com stdout em streaming para o console. */
async function rodarCarta(ctx: Ctx, id: string, prompt: string, atividade: string) {
  const c = ctx.copias.get(id)!
  let extras: string[] = []
  const amb = ctx.projeto.ambiente, P = caminhos(amb)
  try {
    const dir = P.join(P.dirname(ctx.task.worktree!), `.fma-config-task-${ctx.task.numero}`) // fora do worktree: não entra no commit; no WSL é caminho Linux
    const f = ganchos.ferramentasDaCarta?.({ taskId: ctx.task.id, projetoId: ctx.task.projetoId, cartaId: id, cli: c.cli, dirConfig: dir })
    if (f) {
      for (const a of f.config.arquivos) { const fs = paraFs(amb, a.caminho); mkdirSync(caminhos("local").dirname(fs), { recursive: true }); writeFileSync(fs, a.conteudo) }
      extras = f.config.args
      if (f.contexto) prompt = `${prompt}

${f.contexto}`
    }
  } catch (e) { registrar(ctx, "aviso", `Não consegui preparar as ferramentas de ${c.nome}: ${(e as Error).message}`, id) }
  // Comandos liberados do projeto. Só a Claude pede aprovação por comando; o codex roda no sandbox do worktree.
  if (c.cli === "claude" && ctx.projeto.comandos.length) extras = [...extras, "--allowedTools", ...ctx.projeto.comandos.map((k) => `Bash(${k})`)]
  const conta = contaDaCarta(ctx.db, c.cli, c.contaId, amb) // a da carta (se é do ambiente do projeto), ou a padrão da CLI nele
  if (ctx.parada || ctx.travada || ctxs.get(ctx.task.id) !== ctx) return { texto: "", tokens: 0, erro: "Interrompida." } // a task parou durante a preparação
  const wt = ctx.task.worktree!
  const lerSessao = () => { try { const s = JSON.parse((ctx.db.prepare("SELECT sessao FROM task_carta WHERE task_id = ? AND carta_id = ?").get(ctx.task.id, id) as { sessao: string | null } | undefined)?.sessao ?? "null") as { id: string; cwd: string } | null; return s?.cwd === wt ? s.id : undefined } catch { return undefined } } // sessão do claude é por diretório
  const gravarSessao = (v: string | null) => ctx.db.prepare("UPDATE task_carta SET sessao = ? WHERE task_id = ? AND carta_id = ?").run(v, ctx.task.id, id)
  const rodar1 = async (retomar?: string) => {
    const exec = rodarCli(c.cli, c.modelo, prompt, wt, (linha, canal) => {
      enviar({ tipo: "console", taskId: ctx.task.id, cartaId: id, canal, linha })
      inserirEvento(ctx.db, { taskId: ctx.task.id, tipo: "console", deCartaId: id, paraCartaId: null, texto: linha, tokens: null })
    }, extras, false, { env: envDaConta(conta), esforco: c.esforco, ambiente: amb, retomar })
    ctx.execs.set(id, [...(ctx.execs.get(id) ?? []), exec])
    enviar({ tipo: "carta", taskId: ctx.task.id, cartaId: id, estado: ctx.estado[id] ?? "trabalhando", atividade })
    const s = await exec.resultado
    ctx.execs.set(id, (ctx.execs.get(id) ?? []).filter((e) => e !== exec))
    if (conta && s.tokens) seguro(() => somarTokensConta(ctx.db, ctx.task.id, conta.id, s.tokens)) // uso por conta
    return s
  }
  const antes = c.cli === "claude" ? lerSessao() : undefined
  let saida = await rodar1(antes)
  if (antes && saida.erro && /conversation|session/i.test(saida.erro) && !ctx.parada) { seguro(() => gravarSessao(null)); saida = await rodar1() } // retomada falhou: uma vez sem --resume
  if (saida.sessao) seguro(() => gravarSessao(JSON.stringify({ id: saida.sessao, cwd: wt })))
  return saida
}

/** Contextos do projeto (fixado ao iniciar a task: vale para as que ainda vão começar) e da task, para o plano e o prompt de cada carta. */
function blocoContexto(ctx: Ctx): string {
  const p = ctx.projeto.contexto.trim(), t = ctx.task.contexto.trim(), c = ctx.task.card?.trim()
  return [p && `## Contexto do projeto\n${p}`, t && `## Contexto desta task\n${t}`, c && `## Card da fonte (spec)\n${c}`].filter(Boolean).join("\n\n")
}

/** Contexto da task: só antes de iniciar (pronta ou na fila). */
export function definirContextoTask(db: DatabaseSync, id: string, texto: string): Resultado<null> {
  const t = lerTask(db, id)
  if (!t) return { ok: false, erro: "Essa task não existe mais." }
  if (t.situacao !== "pronta" && t.situacao !== "fila") return { ok: false, erro: "O contexto só muda antes de a task começar." }
  db.prepare("UPDATE task SET contexto = ? WHERE id = ?").run(texto.trim(), id)
  enviar({ tipo: "task", task: lerTask(db, id)! })
  return { ok: true, valor: null }
}

function entrada(ctx: Ctx, id: string): string {
  const c = ctx.copias.get(id)!
  const t = ctx.task
  const recebido = fx.quemEntrega(id, ctx.con).filter((de) => ctx.entregas.has(de))
  const dev = ctx.apontamentos.get(id) ?? []
  return [
    c.prompt,
    `---\n# Task #${t.numero}${t.titulo ? `: ${t.titulo}` : ""}\n## Missão\n${t.missao}${t.ajustes ? `\n## Ajustes pedidos\n${t.ajustes}` : ""}`,
    blocoContexto(ctx),
    secaoDecisoes(t.decisoes),
    `## Sua tarefa no plano\n${ctx.tarefas.get(id) ?? t.missao}`,
    recebido.length ? `## O que você recebeu\n${recebido.map((de) => `### De ${nome(ctx, de)}\n${ctx.entregas.get(de)}`).join("\n\n")}` : "",
    dev.length ? `## Devolução: refaça levando isto em conta\n${dev.map((d) => `- ${d}`).join("\n")}` : "",
    "## Como entregar\nTrabalhe nos arquivos do repositório atual (é o worktree da task). Ao terminar, responda com um resumo claro do que fez e do que o próximo precisa saber.",
    "## Status obrigatório\nA ÚLTIMA linha da sua resposta deve ser exatamente uma destas:\nFMA-STATUS: ok\nFMA-STATUS: bloqueado: <motivo curto>\nUse bloqueado se não conseguiu executar algo necessário (comando negado ou que pediu aprovação, dependência ausente, teste que não rodou), se falta informação ou decisão do usuário, ou se a premissa da tarefa está errada ou conflita com as regras. Não marque ok com trabalho não verificado que a tarefa pedia para verificar.",
  ].filter(Boolean).join("\n\n")
}

// ---------- criar ----------

/** RF 6.01, 6.02, 6.05: cria a task pronta, com o número único e crescente (RN 63). */
export function criarTask(db: DatabaseSync, n: NovaTask): Resultado<Task> {
  if (!n.missao?.trim()) return { ok: false, erro: "Escreva a missão da task." }
  const projeto = lerProjeto(db, n.projetoId)
  if (!projeto) return { ok: false, erro: "Esse projeto não existe mais." }
  const mesa = new Set(lerCartasDaMesa(db, n.projetoId).map((c) => c.id))
  const comeca = (n.comecaPor ?? []).filter((id) => mesa.has(id))
  const id = crypto.randomUUID()
  emTransacao(db, () => {
    const numero = Number((db.prepare("SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM task").get() as { n: number }).n)
    db.prepare("INSERT INTO task (id, numero, projeto_id, referencia, titulo, missao, situacao, criada_em, contexto) VALUES (?,?,?,?,?,?, 'pronta', ?, ?)")
      .run(id, numero, n.projetoId, n.referencia?.trim() || null, n.titulo?.trim() || null, n.missao.trim(), Date.now(), n.contexto?.trim() ?? "")
    for (const cartaId of comeca)
      db.prepare("INSERT INTO task_carta (id, task_id, carta_id, comeca) VALUES (?,?,?,1)").run(crypto.randomUUID(), id, cartaId)
  })
  const criada = lerTask(db, id)!
  enviar({ tipo: "task", task: criada }) // a lista da janela já mostra a nova task (manual, da fonte ou do projeto novo)
  return { ok: true, valor: criada }
}

// ---------- time da task (RN 58 a 60) ----------

/** Time e fluxo da task antes de iniciar: a mesa do projeto menos as cartas tiradas, com o fluxo religado (RF 6.08). */
function timeDaTask(db: DatabaseSync, task: Task) {
  const linhas = lerTaskCartas(db, task.id)
  const retiradas = linhas.filter((c) => c.retirada).map((c) => c.cartaId)
  const escolhidas = linhas.filter((c) => c.comeca).map((c) => c.cartaId)
  const todas = lerCartasDaMesa(db, task.projetoId)
  const cartas = todas.filter((c) => !retiradas.includes(c.id))
  const ids = new Set(cartas.map((c) => c.id))
  const conexoes = fx.religar(
    lerConexoes(db, task.projetoId).map((c) => ({ de: c.deCartaId, para: c.paraCartaId, tipo: c.tipo, ordem: c.ordem, skills: c.skills })),
    retiradas,
  ).filter((c) => ids.has(c.de) && ids.has(c.para))
  const cartasFx = cartas.map((c) => ({ id: c.id, nome: c.nome, orquestrador: c.classe === "orquestrador" }))
  return { todas, cartas, cartasFx, conexoes, retiradas, escolhidas }
}

/** Erros e avisos do fluxo (RF 6.18), para mostrar antes de iniciar. Com `taskId`, vale o time daquela task (sem as cartas tiradas). */
export function validarMesa(db: DatabaseSync, projetoId: string, taskId?: string) {
  const task = taskId ? lerTask(db, taskId) : null
  if (task) { const t = timeDaTask(db, task); return fx.validarFluxo(t.cartasFx, t.conexoes) }
  const cartas = lerCartasDaMesa(db, projetoId)
  return fx.validarFluxo(
    cartas.map((c) => ({ id: c.id, nome: c.nome, orquestrador: c.classe === "orquestrador" })),
    lerConexoes(db, projetoId).map((c) => ({ de: c.deCartaId, para: c.paraCartaId, tipo: c.tipo, ordem: c.ordem })),
  )
}

/** Trilha da task antes de iniciar: quem está, quem foi tirado e o fluxo religado (RF 6.06 a 6.08). */
export function previaDaTask(db: DatabaseSync, taskId: string): PreviaTask | null {
  const task = lerTask(db, taskId)
  if (!task) return null
  const t = timeDaTask(db, task)
  return {
    cartas: t.todas.map((c) => ({ id: c.id, nome: c.nome, classe: c.classe, orquestrador: c.classe === "orquestrador", retirada: t.retiradas.includes(c.id) })),
    conexoes: t.conexoes.map(({ de, para, tipo, ordem }) => ({ de, para, tipo, ordem })),
    ...fx.validarFluxo(t.cartasFx, t.conexoes),
  }
}

/** Cartas da task: o time fixado se ela já começou, senão o time atual da mesa sem as tiradas. */
export function cartasDaTask(db: DatabaseSync, task: Task): { id: string; nome: string; classe: string }[] {
  const fixas = lerTaskCartas(db, task.id).filter((c) => c.copia && !c.retirada)
  if (fixas.length) return fixas.map((c) => ({ id: c.cartaId, nome: c.copia!.nome, classe: c.copia!.classe }))
  return timeDaTask(db, task).cartas.map((c) => ({ id: c.id, nome: c.nome, classe: c.classe }))
}

const aindaNaoComecou = (t: Task) => t.situacao === "pronta" || t.situacao === "fila"

/** RF 6.06, 6.09, 6.10: tira uma carta de uma task que não começou. O fluxo é religado ao iniciar (RF 6.08). */
export function tirarCarta(db: DatabaseSync, taskId: string, cartaId: string): Resultado<Task> {
  const task = lerTask(db, taskId)
  if (!task) return { ok: false, erro: "Essa task não existe mais." }
  if (!aindaNaoComecou(task)) return { ok: false, erro: "Só dá para tirar carta de uma task que ainda não começou." }
  const { cartas } = timeDaTask(db, task)
  const carta = cartas.find((c) => c.id === cartaId)
  if (!carta) return { ok: false, erro: "Essa carta não está no time da task." }
  if (carta.classe === "orquestrador") return { ok: false, erro: "O Orquestrador não pode sair da task." }
  if (cartas.filter((c) => c.classe !== "orquestrador").length <= 1) return { ok: false, erro: "A task precisa de pelo menos uma carta além do Orquestrador." }
  db.prepare("INSERT INTO task_carta (id, task_id, carta_id, retirada) VALUES (?,?,?,1) ON CONFLICT (task_id, carta_id) DO UPDATE SET retirada = 1, comeca = 0")
    .run(crypto.randomUUID(), taskId, cartaId)
  return { ok: true, valor: avisarTask(db, taskId) }
}

/** RF 6.07: devolve à task a carta que tinha sido tirada. */
export function devolverCarta(db: DatabaseSync, taskId: string, cartaId: string): Resultado<Task> {
  const task = lerTask(db, taskId)
  if (!task) return { ok: false, erro: "Essa task não existe mais." }
  if (!aindaNaoComecou(task)) return { ok: false, erro: "Só dá para devolver carta a uma task que ainda não começou." }
  const r = db.prepare("UPDATE task_carta SET retirada = 0 WHERE task_id = ? AND carta_id = ? AND retirada = 1").run(taskId, cartaId)
  if (!r.changes) return { ok: false, erro: "Essa carta não foi tirada da task." }
  db.prepare("DELETE FROM task_carta WHERE task_id = ? AND carta_id = ? AND comeca = 0 AND copia_carta IS NULL").run(taskId, cartaId)
  return { ok: true, valor: avisarTask(db, taskId) }
}

function avisarTask(db: DatabaseSync, taskId: string): Task {
  const t = lerTask(db, taskId)!
  enviar({ tipo: "task", task: t })
  return t
}

// ---------- ajustes e novas tasks a partir de outra ----------

/** RF 6.36 e RN 79: ajuste numa task pronta ou na fila; acumula no texto, na ordem pedida. Entra no plano ao começar. */
export function anotarAjuste(db: DatabaseSync, taskId: string, texto: string): Resultado<Task> {
  const task = lerTask(db, taskId)
  if (!task) return { ok: false, erro: "Essa task não existe mais." }
  if (!aindaNaoComecou(task)) return { ok: false, erro: "Essa task já começou: o ajuste é repassado ao Orquestrador." }
  if (!texto.trim()) return { ok: false, erro: "Escreva o ajuste." }
  db.prepare("UPDATE task SET ajustes = CASE WHEN ajustes = '' THEN ?1 ELSE ajustes || char(10) || ?1 END WHERE id = ?2").run(texto.trim(), taskId)
  return { ok: true, valor: avisarTask(db, taskId) }
}

/** RF 6.35 e RN 77: ajuste numa task em andamento; vale a partir da próxima entrega (o texto entra no prompt de cada carta). */
export function repassarAjuste(_db: DatabaseSync, taskId: string, texto: string): Resultado<Task> {
  const ctx = ctxs.get(taskId)
  if (!ctx) return { ok: false, erro: "Essa task não está rodando." }
  if (!texto.trim()) return { ok: false, erro: "Escreva o ajuste." }
  salvarTask(ctx, { ajustes: ctx.task.ajustes ? `${ctx.task.ajustes}\n${texto.trim()}` : texto.trim() })
  registrar(ctx, "aviso", `Ajuste repassado ao Orquestrador: ${texto.trim()}`, ctx.orq)
  return { ok: true, valor: ctx.task }
}

/** RF 6.34 e RN 78: task de ajuste nova, pronta, ligada à original, com a mesma missão e referência. */
export function abrirTaskDeAjuste(db: DatabaseSync, originalId: string, ajuste: string): Resultado<Task> {
  const o = lerTask(db, originalId)
  if (!o) return { ok: false, erro: "A task original não existe mais." }
  if (!ajuste.trim()) return { ok: false, erro: "Escreva o ajuste." }
  const r = criarTask(db, { projetoId: o.projetoId, missao: o.missao, titulo: o.titulo ?? undefined, referencia: o.referencia ?? undefined })
  if (!r.ok) return r
  db.prepare("UPDATE task SET task_original_id = ?, ajustes = ? WHERE id = ?").run(originalId, ajuste.trim(), r.valor.id)
  return { ok: true, valor: avisarTask(db, r.valor.id) }
}

/** RF 6.41 e RN 78: reabre uma task parada como task nova, pronta, com a mesma missão e referência. */
export function reabrirTask(db: DatabaseSync, taskId: string): Resultado<Task> {
  const t = lerTask(db, taskId)
  if (!t) return { ok: false, erro: "Essa task não existe mais." }
  if (t.situacao !== "parada") return { ok: false, erro: "Só uma task parada pode ser reaberta." }
  const r = criarTask(db, { projetoId: t.projetoId, missao: t.missao, titulo: t.titulo ?? undefined, referencia: t.referencia ?? undefined })
  if (r.ok) enviar({ tipo: "task", task: r.valor })
  return r
}

// ---------- iniciar, vagas e fila ----------

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)

/** Tasks que estão preparando o começo (git e CLIs são assíncronos): já seguram a vaga antes de aparecerem como em andamento. */
const iniciando = new Map<string, string>() // taskId -> projetoId

/** Vagas livres do projeto (RF 2.13): em andamento e aguardando decisão ocupam vaga (RN 62). */
function vagasLivres(db: DatabaseSync, projeto: ProjetoLido): number {
  const ocupam = new Set((db.prepare("SELECT id FROM task WHERE projeto_id = ? AND situacao IN ('andamento','aguardando')").all(projeto.id) as { id: string }[]).map((r) => r.id))
  for (const [id, p] of iniciando) if (p === projeto.id) ocupam.add(id)
  return projeto.vagas - ocupam.size
}

function emitirFila(db: DatabaseSync, projetoId: string) {
  const l = db.prepare("SELECT id FROM task WHERE projeto_id = ? AND situacao = 'fila' ORDER BY fila_em, numero").all(projetoId) as { id: string }[]
  enviar({ tipo: "fila", projetoId, posicoes: l.map((r, i) => ({ taskId: r.id, posicao: i + 1 })) })
}

/** RF 6.14: sem vaga, a task entra no fim da fila. */
function enfileirar(db: DatabaseSync, task: Task): Resultado<Task> {
  db.prepare("UPDATE task SET situacao = 'fila', fila_em = ? WHERE id = ?").run(Date.now(), task.id)
  const t = avisarTask(db, task.id)
  registrarEvento(db, task.id, "aviso", `Sem vaga no projeto: a task entrou na fila (posição ${t.posicaoFila}).`)
  emitirFila(db, task.projetoId)
  return { ok: true, valor: t }
}

/** RF 6.12, 6.14, 6.18: valida o fluxo e começa a task, ou a põe na fila se as vagas do projeto estão ocupadas (RN 61). */
export async function iniciarTask(db: DatabaseSync, taskId: string): Promise<Resultado<Task>> {
  const task = lerTask(db, taskId)
  if (!task) return { ok: false, erro: "Essa task não existe mais." }
  if (task.situacao === "fila") return { ok: true, valor: task }
  if (task.situacao !== "pronta") return { ok: false, erro: "Só uma task pronta pode ser iniciada." }
  if (ctxs.has(taskId) || iniciando.has(taskId)) return { ok: false, erro: "Essa task já está começando." }
  const projeto = lerProjeto(db, task.projetoId)
  if (!projeto) return { ok: false, erro: "O projeto da task não existe mais." }
  const { erros } = validarMesa(db, projeto.id, taskId) // o erro aparece já, mesmo que ela fosse para a fila
  if (erros.length) return { ok: false, erro: `O fluxo tem erro: ${erros.join(" ")}` }
  return vagasLivres(db, projeto) > 0 ? comecar(db, taskId) : enfileirar(db, task)
}

/** RF 6.13: inicia as tasks prontas do projeto, na ordem de chegada; as que não cabem nas vagas vão para a fila. */
export async function iniciarTodas(db: DatabaseSync, projetoId: string): Promise<{ iniciadas: string[]; fila: string[]; erros: { taskId: string; erro: string }[] }> {
  const saida = { iniciadas: [] as string[], fila: [] as string[], erros: [] as { taskId: string; erro: string }[] }
  for (const { id } of db.prepare("SELECT id FROM task WHERE projeto_id = ? AND situacao = 'pronta' ORDER BY numero").all(projetoId) as { id: string }[]) {
    const r = await iniciarTask(db, id)
    if (!r.ok) saida.erros.push({ taskId: id, erro: r.erro })
    else (r.valor.situacao === "fila" ? saida.fila : saida.iniciadas).push(id)
  }
  return saida
}

const andandoFila = new Set<string>()

/**
 * RF 6.15 e RN 62: enquanto houver vaga, começa a próxima da fila, na ordem de chegada. Chamada quando uma vaga abre
 * (task concluída ou parada), ao abrir o app e quando o projeto ganha vagas. Task da fila que não consegue iniciar
 * volta a ficar pronta e o Maestro chama o usuário (RN 81).
 */
export async function andarFila(db: DatabaseSync, projetoId: string): Promise<void> {
  if (andandoFila.has(projetoId)) return // o laço em curso reavalia as vagas a cada volta
  andandoFila.add(projetoId)
  try {
    for (;;) {
      const projeto = lerProjeto(db, projetoId)
      if (!projeto || vagasLivres(db, projeto) <= 0) return
      const prox = db.prepare("SELECT id FROM task WHERE projeto_id = ? AND situacao = 'fila' ORDER BY fila_em, numero LIMIT 1").get(projetoId) as { id: string } | undefined
      if (!prox) return
      const r = await comecar(db, prox.id)
      if (!r.ok) {
        db.prepare("UPDATE task SET situacao = 'pronta', fila_em = NULL WHERE id = ? AND situacao = 'fila'").run(prox.id)
        const t = avisarTask(db, prox.id)
        registrarEvento(db, prox.id, "aviso", `Não consegui iniciar a task que estava na fila: ${r.erro}`)
        chamarUsuario({ projetoId, taskId: prox.id, texto: `${rotuloTask(t)} não conseguiu iniciar: ${r.erro}` })
      }
      emitirFila(db, projetoId)
    }
  } finally {
    andandoFila.delete(projetoId)
  }
}

/** RF 6.11, 6.43, 6.47 e 6.18: confere tudo, fixa o time, cria o worktree e começa a rodar. Segura a vaga enquanto prepara. */
async function comecar(db: DatabaseSync, taskId: string): Promise<Resultado<Task>> {
  const task = lerTask(db, taskId)
  if (!task) return { ok: false, erro: "Essa task não existe mais." }
  if (!aindaNaoComecou(task)) return { ok: false, erro: "Só uma task pronta pode ser iniciada." }
  if (ctxs.has(taskId) || iniciando.has(taskId)) return { ok: false, erro: "Essa task já está começando." }
  const projeto = lerProjeto(db, task.projetoId)
  if (!projeto) return { ok: false, erro: "O projeto da task não existe mais." }
  iniciando.set(taskId, projeto.id)
  try {
    return await comecarReservado(db, task, projeto)
  } finally {
    iniciando.delete(taskId)
  }
}

async function comecarReservado(db: DatabaseSync, task: Task, projeto: ProjetoLido): Promise<Resultado<Task>> {
  if (task.branch) return voltarComAjuste(db, task, projeto) // pedido de ajuste que esperou vaga na fila
  const taskId = task.id
  const { cartas, cartasFx, conexoes: con, escolhidas } = timeDaTask(db, task)
  const ids = new Set(cartas.map((c) => c.id))
  const semConta = await faltaContaDe(db, [...ids], projeto.ambiente)
  if (semConta) return { ok: false, erro: semConta }

  // RF 6.18: fluxo com erro não começa
  const { erros } = fx.validarFluxo(cartasFx, con)
  if (erros.length) return { ok: false, erro: `O fluxo tem erro: ${erros.join(" ")}` }

  // RF 6.47: toda CLI das cartas instalada
  const amb = projeto.ambiente, P = caminhos(amb)
  const instaladas = new Map((await detectarClis(true)).filter((c) => c.ambiente === amb).map((c) => [c.id, c.instalada]))
  const faltam = cartas.filter((c) => !instaladas.get(c.cli))
  if (faltam.length) {
    const f = faltam[0], cli = cliPorId(f.cli)
    return { ok: false, erro: `A CLI ${cli.nome}, da carta ${f.nome}, não está instalada${amb === "local" ? "" : ` no ${amb.replace("wsl:", "WSL (")})`}. Instale com: ${cli.instalar}` }
  }

  // repositório e branch base
  try {
    await git(projeto.repositorio, ["rev-parse", "--git-dir"], amb)
    await git(projeto.repositorio, ["rev-parse", "--verify", `${projeto.branchBase}^{commit}`], amb)
  } catch (e) {
    return { ok: false, erro: `Repositório ou branch base inválidos (${projeto.repositorio}, ${projeto.branchBase}): ${(e as Error).message}` }
  }
  const agora = lerTask(db, taskId)
  if (!agora || !aindaNaoComecou(agora)) return { ok: false, erro: "A task foi parada antes de começar." }

  const orq = cartas.find((c) => c.classe === "orquestrador")!.id
  const comecos = escolhidas.filter((id) => ids.has(id) && id !== orq)
  const iniciais = comecos.length ? comecos : fx.comecoNatural(cartasFx, con)

  // RF 6.43: worktree e branch da task, a partir da branch base
  const branch = `fma/task-${task.numero}-${slug(task.titulo || task.missao) || "task"}`
  const worktree = caminhoWorktree(projeto, task.numero)
  try {
    mkdirSync(caminhos("local").dirname(paraFs(amb, worktree)), { recursive: true })
    await git(projeto.repositorio, ["worktree", "add", "-b", branch, worktree, projeto.branchBase], amb)
    await prepararWorktree(projeto, worktree, (t) => registrarEvento(db, taskId, "aviso", t))
  } catch (e) {
    return { ok: false, erro: `Não consegui criar o worktree: ${(e as Error).message}` }
  }
  const limpar = async () => {
    await git(projeto.repositorio, ["worktree", "remove", "--force", worktree], amb).catch(() => {})
    await git(projeto.repositorio, ["branch", "-D", branch], amb).catch(() => {})
  }
  const ainda = lerTask(db, taskId) // o git é assíncrono: a task pode ter sido parada enquanto o worktree nascia
  if (!ainda || !aindaNaoComecou(ainda)) { await limpar(); return { ok: false, erro: "A task foi parada antes de começar." } }

  // RF 6.11 e RF 1.33: fixa o time (cópia das cartas) e as conexões
  const copias = new Map<string, CopiaCarta>()
  try {
  emTransacao(db, () => {
    db.prepare("DELETE FROM task_carta WHERE task_id = ?").run(taskId)
    db.prepare("DELETE FROM task_conexao WHERE task_id = ?").run(taskId)
    for (const c of cartas) {
      const copia: CopiaCarta = { nome: c.nome, classe: c.classe, simbolo: c.simbolo, cor: c.cor, cli: c.cli, modelo: c.modelo, metodos: c.metodos, skills: c.skills, prompt: [promptFinal(c), secoesBiblioteca(db, c.id)].filter(Boolean).join("\n\n"), contaId: c.contaId, esforco: c.esforco }
      copias.set(c.id, copia)
      db.prepare("INSERT INTO task_carta (id, task_id, carta_id, comeca, concluida, copia_carta, estado) VALUES (?,?,?,?,?,?,?)")
        .run(crypto.randomUUID(), taskId, c.id, iniciais.includes(c.id) ? 1 : 0, 0, JSON.stringify(copia), "espera")
    }
    for (const c of con)
      db.prepare("INSERT INTO task_conexao (id, task_id, de_carta_id, para_carta_id, tipo, ordem, skills) VALUES (?,?,?,?,?,?,?)")
        .run(crypto.randomUUID(), taskId, c.de, c.para, c.tipo, c.ordem, JSON.stringify(c.skills))
    db.prepare("UPDATE task SET situacao = 'andamento', fila_em = NULL, branch = ?, worktree = ?, iniciada_em = ? WHERE id = ?").run(branch, worktree, Date.now(), taskId)
  })
  } catch (e) {
    await limpar()
    return { ok: false, erro: `Não consegui gravar o começo da task: ${(e as Error).message}` }
  }

  const ctx: Ctx = {
    db, task: lerTask(db, taskId)!, projeto, copias, tarefas: new Map(), entregas: new Map(), apontamentos: new Map(), voltas: {},
    skills: new Map(con.map((c) => [`${c.de}>${c.para}`, c.skills])), cartas: cartasFx, con, orq,
    estado: fx.estadoInicial(cartasFx, con, iniciais), geracao: {}, ativas: new Map(), execs: new Map(), parada: false, travada: false,
  }
  ctxs.set(taskId, ctx)
  enviar({ tipo: "task", task: ctx.task })
  emitirFila(db, projeto.id)
  for (const [id, e] of Object.entries(ctx.estado)) marcar(ctx, id, e, e === "concluida" ? "Fora do caminho desta task" : e === "pronta" ? "Esperando o plano" : "Esperando entregas")
  registrar(ctx, "missao", ctx.task.missao)
  seguro(() => ganchos.aoComecar?.(taskId))
  void (async () => {
    await Promise.race([Promise.resolve(ganchos.atualizarCard?.(taskId)), new Promise((r) => setTimeout(r, 15_000))]).catch(() => {})
    ctx.task.card = lerTask(db, taskId)?.card ?? ctx.task.card
    await rodarTask(ctx, iniciais)
  })()
  return { ok: true, valor: ctx.task }
}

// ---------- rodar ----------

async function rodarTask(ctx: Ctx, iniciais: string[]) {
  try {
    await planejar(ctx, iniciais)
    if (!ctx.parada) await laco(ctx)
  } catch (e) {
    await encerrar(ctx, "parada", `Erro no motor: ${(e as Error).message}`)
  }
}

/** RF 6.19 e 6.20: o Orquestrador monta o plano (JSON) e passa a tarefa às cartas de começo. */
async function planejar(ctx: Ctx, iniciais: string[]) {
  const lista = ctx.cartas.filter((c) => !c.orquestrador).map((c) => {
    const k = ctx.copias.get(c.id)!
    return `- id: ${c.id} | ${k.nome} (${k.classe})`
  }).join("\n")
  const pedido = [
    ctx.copias.get(ctx.orq)!.prompt,
    `---\n# Task #${ctx.task.numero}\n## Missão\n${ctx.task.missao}${ctx.task.ajustes ? `\n## Ajustes\n${ctx.task.ajustes}` : ""}`,
    blocoContexto(ctx),
    `## Cartas do time\n${lista}`,
    'Monte o plano: uma tarefa objetiva por carta, conforme a classe e a missão. Não edite arquivos. Responda SOMENTE com JSON no formato {"tarefas": {"<id da carta>": "<tarefa>"}}.',
  ].join("\n\n")
  marcar(ctx, ctx.orq, "trabalhando", "Montando o plano")
  const s = await rodarCarta(ctx, ctx.orq, pedido, "Montando o plano")
  if (ctx.parada) return
  const plano = extrairJson(s.texto)?.tarefas as Record<string, string> | undefined
  if (s.erro && !plano) registrar(ctx, "aviso", `O Orquestrador não montou o plano (${s.erro}). Cada carta recebe a missão inteira.`, ctx.orq)
  for (const c of ctx.cartas) if (!c.orquestrador) ctx.tarefas.set(c.id, typeof plano?.[c.id] === "string" ? plano[c.id] : ctx.task.missao)
  for (const [id, t] of ctx.tarefas) ctx.db.prepare("UPDATE task_carta SET tarefa = ? WHERE task_id = ? AND carta_id = ?").run(t, ctx.task.id, id)
  registrar(ctx, "plano", [...ctx.tarefas].map(([id, t]) => `${nome(ctx, id)}: ${t}`).join("\n"), ctx.orq, null, s.tokens)
  for (const id of iniciais) registrar(ctx, "entrega", `Tarefa: ${ctx.tarefas.get(id)}`, ctx.orq, id)
  marcar(ctx, ctx.orq, "concluida", "Acompanhando a task")
  for (const [id, e] of Object.entries(ctx.estado)) if (e === "pronta") marcar(ctx, id, "pronta", "Pronta para começar")
}

/** Agenda quem está pronto, espera alguém terminar, repete; fecha quando não sobra ninguém (RN 74). */
async function laco(ctx: Ctx) {
  while (!ctx.parada && !ctx.travada) {
    for (const id of fx.prontas(ctx.estado, ctx.con).filter((i) => !ctx.ativas.has(i))) {
      const gen = (ctx.geracao[id] = (ctx.geracao[id] ?? 0) + 1)
      ctx.estado[id] = "trabalhando"
      ctx.ativas.set(id, executar(ctx, id).then((fim) => aoTerminar(ctx, id, gen, fim)).finally(() => ctx.ativas.delete(id)))
    }
    if (!ctx.ativas.size) break
    await Promise.race(ctx.ativas.values())
  }
  if (ctx.parada || ctx.travada) return
  if (!fx.terminou(ctx.estado)) {
    const pend = ctx.cartas.filter((c) => ctx.estado[c.id] && ctx.estado[c.id] !== "concluida")
    const id = pend[0]?.id ?? ctx.orq
    return esperarDecisao(ctx, { cartaId: id, questionadorId: id, motivo: `Nenhuma carta pode continuar: ${pend.map((c) => c.nome).join(", ") || "fluxo incompleto"} não concluiu.` })
  }
  await fechar(ctx)
}

async function executar(ctx: Ctx, id: string): Promise<Fim> {
  try {
    const c = ctx.copias.get(id)!
    const gen = ctx.geracao[id]
    const valido = () => !ctx.parada && !ctx.travada && ctx.geracao[id] === gen
    // trabalho próprio (o Revisor só questiona, RN 68)
    if (c.classe !== "revisor") {
      ctx.semPergunta?.delete(id)
      marcar(ctx, id, "trabalhando", `Trabalhando: ${curto(ctx.tarefas.get(id) ?? "")}`)
      registrar(ctx, "trabalho", ctx.tarefas.get(id) ?? "", id)
      const s = await rodarCarta(ctx, id, entrada(ctx, id), `Trabalhando: ${curto(ctx.tarefas.get(id) ?? "")}`)
      if (!valido()) return { t: "ok" }
      if (s.erro) return { t: "erro", alvo: id, msg: `${c.nome}: ${s.erro}` }
      const st = statusDaEntrega(s.texto)
      s.texto = semLinhaStatus(s.texto)
      ctx.entregas.set(id, s.texto) // RF 6.45
      ctx.db.prepare("UPDATE task_carta SET entrega = ? WHERE task_id = ? AND carta_id = ?").run(s.texto, ctx.task.id, id)
      const hook = await commitarCarta(ctx, id, `fma(task ${ctx.task.numero}): ${c.nome}`)
      if (!valido()) return { t: "ok" }
      if (hook) return { t: "trava", alvo: id, q: id, motivo: hook }
      const proximas = ctx.con.filter((x) => x.tipo === "entrega" && x.de === id).sort((a, b) => a.ordem - b.ordem)
      if (proximas.length) for (const p of proximas) registrar(ctx, "entrega", s.texto, id, p.para, p === proximas[0] ? s.tokens : null)
      else registrar(ctx, "entrega", s.texto, id, null, s.tokens)
      if (st.status === "bloqueado") return { t: "trava", alvo: id, q: id, motivo: `${c.nome} travou: ${st.motivo}` } // a task chama o usuário
    }
    // RF 6.23: questiona cada carta ligada, na ordem
    for (const q of fx.quemQuestiona(id, ctx.con)) {
      if (!ctx.entregas.has(q.para)) { registrar(ctx, "aviso", `${nome(ctx, q.para)} não entregou nada para ${c.nome} questionar.`, id, q.para); continue }
      if (ctx.semPergunta?.has(q.para)) { ctx.semPergunta.delete(q.para); registrar(ctx, "aviso", `${c.nome} não questiona a entrega de ${nome(ctx, q.para)}: você escolheu seguir mesmo assim.`, id, q.para); continue }
      const chaves = ctx.skills.get(`${q.de}>${q.para}`) ?? []
      const alvo = ctx.copias.get(q.para)!
      // Com skills há pergunta específica (RF 6.24); sem elas o questionador julga a entrega direto, sem rodada extra de pergunta/resposta (economiza uma chamada por carta).
      let r: { texto: string; tokens: number } | null = null, texto = ""
      if (chaves.length) {
        marcar(ctx, id, "questionando", `Perguntando a ${nome(ctx, q.para)}`)
        texto = chaves.map((k, i) => `${i + 1}. ${perguntaDaSkill(k)}`).join("\n")
        registrar(ctx, "pergunta", texto, id, q.para)
        const rr = await rodarCarta(ctx, q.para, [
          alvo.prompt,
          `---
## Sua entrega anterior
${ctx.entregas.get(q.para)}`,
          `## Perguntas de ${c.nome}
${texto}`,
          "Responda de forma objetiva. Se encontrar uma falha, diga qual e corrija nos arquivos.",
        ].join("\n\n"), `Respondendo a ${c.nome}`)
        if (!valido()) return { t: "ok" }
        if (rr.erro) return { t: "erro", alvo: q.para, msg: `${alvo.nome}: ${rr.erro}` }
        r = rr
        registrar(ctx, "resposta", r.texto, q.para, id, r.tokens)
        const hook = await commitarCarta(ctx, q.para, `fma(task ${ctx.task.numero}): ${alvo.nome} responde a ${c.nome}`)
        if (!valido()) return { t: "ok" }
        if (hook) return { t: "trava", alvo: q.para, q: q.para, motivo: hook }
      } else marcar(ctx, id, "questionando", `Avaliando a entrega de ${nome(ctx, q.para)}`)
      const j = await rodarCarta(ctx, id, [
        c.prompt,
        `---
## Entrega de ${alvo.nome}
${ctx.entregas.get(q.para)}`,
        ...(r ? [`## Suas perguntas
${texto}`, `## Resposta de ${alvo.nome}
${r.texto}`] : []),
        `${r ? "A resposta se sustenta?" : "A entrega atende ao pedido?"} Responda SOMENTE com JSON: {"veredito": "aprovado" | "devolver", "apontamentos": "o que corrigir, se devolver"}.`,
      ].join("\n\n"), `Julgando ${r ? "a resposta" : "a entrega"} de ${alvo.nome}`)
      if (!valido()) return { t: "ok" }
      if (j.erro) return { t: "erro", alvo: id, msg: `${c.nome}: ${j.erro}` }
      const v = extrairJson(j.texto)
      const devolve = v?.veredito === "devolver"
      if (!v) registrar(ctx, "aviso", `${c.nome} não respondeu em JSON; resposta tratada como aprovada.`, id, q.para)
      if (!devolve) { registrar(ctx, "aprovacao", String(v?.apontamentos || "Resposta aprovada."), id, q.para, j.tokens); continue }
      // RN 69 e 70
      const apont = String(v.apontamentos || "Revise o trabalho.")
      guardarApontamentos(ctx, q.para, [...(ctx.apontamentos.get(q.para) ?? []), apont])
      if (fx.noLimite(ctx.voltas[id] ?? 0, ctx.projeto.limiteDevolucoes)) {
        registrar(ctx, "devolucao", apont, id, q.para, j.tokens)
        return { t: "trava", alvo: q.para, q: id }
      }
      ctx.voltas[id] = (ctx.voltas[id] ?? 0) + 1
      ctx.db.prepare("UPDATE task_carta SET voltas = ? WHERE task_id = ? AND carta_id = ?").run(ctx.voltas[id], ctx.task.id, id)
      salvarTask(ctx, { voltas: Math.max(...Object.values(ctx.voltas)) })
      registrar(ctx, "devolucao", `${apont}\n(volta ${ctx.voltas[id]} de ${ctx.projeto.limiteDevolucoes})`, id, q.para, j.tokens)
      return { t: "devolve", alvo: q.para, q: id }
    }
    return { t: "ok" }
  } catch (e) {
    return { t: "erro", alvo: id, msg: (e as Error).message }
  }
}

function guardarApontamentos(ctx: Ctx, cartaId: string, lista: string[]) {
  ctx.apontamentos.set(cartaId, lista)
  ctx.db.prepare("UPDATE task_carta SET apontamentos = ? WHERE task_id = ? AND carta_id = ?").run(JSON.stringify(lista), ctx.task.id, cartaId)
}

/** Conversa direta: o pedido do usuário vira apontamento da carta na task e entra na Crônica. */
export function apontarParaCarta(db: DatabaseSync, taskId: string, cartaId: string, texto: string) {
  const ctx = ctxs.get(taskId)
  const atuais = ctx?.apontamentos.get(cartaId) ?? (JSON.parse((db.prepare("SELECT apontamentos FROM task_carta WHERE task_id = ? AND carta_id = ?").get(taskId, cartaId) as { apontamentos: string | null } | undefined)?.apontamentos ?? "[]") as string[])
  const lista = [...atuais, `Pedido direto do usuário: ${texto}`]
  if (ctx) guardarApontamentos(ctx, cartaId, lista)
  else db.prepare("UPDATE task_carta SET apontamentos = ? WHERE task_id = ? AND carta_id = ?").run(JSON.stringify(lista), taskId, cartaId)
  registrarEvento(db, taskId, "aviso", `Pedido direto a ${ctx ? nome(ctx, cartaId) : "uma carta"}, anotado como apontamento: ${curto(texto, 140)}`)
}

async function aoTerminar(ctx: Ctx, id: string, gen: number, fim: Fim) {
  if (ctx.parada || ctx.geracao[id] !== gen) return // foi parada ou refeita no meio
  if (fim.t === "ok") {
    marcar(ctx, id, "concluida", "Concluída")
  } else if (fim.t === "erro") {
    // erro de uma carta não derruba a task: ela espera o usuário (Responder e reenviar roda a carta de novo)
    esperarDecisao(ctx, { cartaId: fim.alvo, questionadorId: fim.alvo, motivo: motivoDeErro(ctx, fim.alvo, fim.msg) })
  } else if (fim.t === "devolve") {
    for (const r of fx.devolver(ctx.estado, ctx.con, fim.alvo, fim.q)) {
      ctx.geracao[r] = (ctx.geracao[r] ?? 0) + 1 // resultado de quem estava rodando passa a ser ignorado
      if (r !== id) for (const e of ctx.execs.get(r) ?? []) e.parar()
      marcar(ctx, r, "espera", r === fim.alvo ? `Refazendo: ${nome(ctx, fim.q)} devolveu` : "Esperando entregas")
    }
  } else {
    // RF 6.26: limite de devoluções, task espera a decisão
    esperarDecisao(ctx, {
      cartaId: fim.alvo, questionadorId: fim.q,
      motivo: fim.motivo ?? `${nome(ctx, fim.q)} devolveu o trabalho de ${nome(ctx, fim.alvo)} ${ctx.voltas[fim.q] ?? 0} vez(es), o limite do projeto, e ainda encontra problema.`,
    })
  }
}

const LIMITE_USO = /429|rate.?limit|usage limit|hit your limit|limit reached|quota/i
function motivoDeErro(ctx: Ctx, id: string, msg: string) {
  const c = ctx.copias.get(id)
  if (!c || !LIMITE_USO.test(msg)) return msg
  const conta = contaDaCarta(ctx.db, c.cli, c.contaId, ctx.projeto.ambiente)
  return `A conta ${conta?.nome ?? c.cli} bateu o limite de uso. Espere renovar ou troque a conta da carta e reenvie.`
}

/** A task para e espera o usuário (limite de devoluções, carta travada, erro de carta, carta que não rodou). Cartas iguais: "Responder e reenviar". */
function esperarDecisao(ctx: Ctx, decisao: DecisaoPendente) {
  const travou = decisao.cartaId === decisao.questionadorId
  ctx.travada = true
  for (const outro of [...ctx.ativas.keys()]) {
    ctx.geracao[outro] = (ctx.geracao[outro] ?? 0) + 1 // o resultado de quem estava rodando passa a ser ignorado
    ;(ctx.execs.get(outro) ?? []).forEach((e) => e.parar())
    marcar(ctx, outro, "pronta", "Esperando sua decisão")
  }
  registrar(ctx, "decisao", decisao.motivo, decisao.questionadorId, decisao.cartaId)
  salvarTask(ctx, { situacao: "aguardando", decisao_motivo: decisao.motivo, decisao_carta_id: decisao.cartaId, decisao_questionador_id: decisao.questionadorId })
  enviar({ tipo: "decisao", taskId: ctx.task.id, projetoId: ctx.task.projetoId, decisao })
  seguro(() => ganchos.aoTravar?.(ctx.task.id, decisao.motivo))
  chamarUsuario({ projetoId: ctx.task.projetoId, taskId: ctx.task.id, texto: `${rotuloTask(ctx.task)} parou esperando sua decisão: ${decisao.motivo}`,
    acoes: [{ id: "liberar", rotulo: travou ? "Reenviar a carta" : "Liberar mais uma volta" }, ...(travou ? [{ id: "seguir" as const, rotulo: "Seguir mesmo assim" }] : []), { id: "parar", rotulo: "Parar a task" }] })
}

// ---------- fim ----------

/** RF 6.32: o Orquestrador fecha com o relatório; a task vai para revisão (o usuário aceita, pede ajuste ou descarta) e o worktree sai. */
async function fechar(ctx: Ctx) {
  const resumo = lerEventos(ctx.db, ctx.task.id).filter((e) => e.tipo !== "console")
    .map((e) => `[${e.tipo}] ${e.deCartaId ? nome(ctx, e.deCartaId) : ""}: ${curto(e.texto, 300)}`).join("\n")
  const pend = lerEventos(ctx.db, ctx.task.id).filter((e) => e.tipo === "aviso" && e.texto.startsWith("Pendência:")).map((e) => e.texto.slice(10).trim())
  marcar(ctx, ctx.orq, "trabalhando", "Escrevendo o relatório")
  const s = await rodarCarta(ctx, ctx.orq, [
    ctx.copias.get(ctx.orq)!.prompt,
    `---\n## Missão\n${ctx.task.missao}\n## O que aconteceu\n${resumo}`,
    "Escreva o relatório final para o usuário: cartas envolvidas, devoluções, PR (se houver) e pendências. Não edite arquivos.",
    pend.length ? `Há pendências aceitas pelo usuário (eventos "Pendência"): a task NÃO está limpa, diga "concluída com pendências" e liste-as.` : "",
  ].filter(Boolean).join("\n\n"), "Escrevendo o relatório")
  if (ctx.parada) return
  const voltas = Object.entries(ctx.voltas).map(([id, v]) => `${nome(ctx, id)}: ${v}`).join(", ") || "nenhuma"
  const relatorio = s.erro || !s.texto
    ? `Task ${pend.length ? "concluída com pendências" : "concluída"}. Cartas: ${ctx.cartas.filter((c) => !c.orquestrador).map((c) => c.nome).join(", ")}. Devoluções: ${voltas}. Sem PR.`
    : s.texto
  const final = pend.length ? `**Concluída com pendências**\n${pend.map((p) => `- ${p}`).join("\n")}\n\n${relatorio}` : relatorio
  marcar(ctx, ctx.orq, "concluida", pend.length ? "Task concluída com pendências" : "Task concluída")
  registrar(ctx, "fim", final, ctx.orq, null, s.tokens)
  await encerrar(ctx, "revisao")
}

/** RF 6.46: commit do que sobrou, remove o worktree e mantém a branch. A vaga abre e a fila anda (RN 62). Sem commit, o worktree fica. */
async function encerrar(ctx: Ctx, situacao: "revisao" | "parada", motivo?: string) {
  if (!ctxs.has(ctx.task.id)) return
  if (situacao === "revisao" && ctx.task.worktree) { // hook recusou o commit final: espera o usuário, com o worktree e a task viva (Responder e reenviar roda a última carta de novo)
    try { await commitar(ctx.task.worktree, `fma(task ${ctx.task.numero}): trabalho até aqui`, ctx.projeto.ambiente) } catch (e) {
      const saida = (e as Error).message.slice(0, 4000)
      const nao = ctx.cartas.filter((c) => !c.orquestrador)
      const alvo = (nao.filter((c) => ctx.copias.get(c.id)?.classe !== "revisor").at(-1) ?? nao.at(-1))?.id ?? ctx.orq
      guardarApontamentos(ctx, alvo, [...(ctx.apontamentos.get(alvo) ?? []), `${HOOK}
${saida}`])
      return esperarDecisao(ctx, { cartaId: alvo, questionadorId: alvo, motivo: motivoHook(saida) })
    }
  }
  ctxs.delete(ctx.task.id)
  for (const es of ctx.execs.values()) es.forEach((e) => e.parar())
  const wt = ctx.task.worktree
  let manter = false, ficou = false // manter: commit falhou; ficou: o worktree continua no disco
  if (wt) {
    const amb = ctx.projeto.ambiente, P = caminhos(amb)
    try { await commitar(wt, `fma(task ${ctx.task.numero}): trabalho até aqui`, amb) } catch (e) {
      manter = true
      registrar(ctx, "aviso", `Não consegui commitar o trabalho (${(e as Error).message}). O worktree foi mantido em ${wt}.`)
    }
    ficou = manter
    if (!manter) await removerWorktree(ctx.projeto.repositorio, wt, amb).catch((e) => { ficou = true; registrar(ctx, "aviso", `Não consegui remover o worktree: ${e.message}`) })
    rmSync(paraFs(amb, P.join(P.dirname(wt), `.fma-config-task-${ctx.task.numero}`)), { recursive: true, force: true }) // config MCP leva credenciais
  }
  if (manter && situacao === "revisao") { situacao = "parada"; motivo = "Não consegui commitar o trabalho; o worktree foi mantido para você recuperar." }
  if (situacao === "parada") registrar(ctx, "fim", motivo ?? "Task parada.")
  salvarTask(ctx, {
    situacao, ...(ficou ? {} : { worktree: null }), encerrada_em: Date.now(),
    ...(situacao === "parada" ? { decisao_motivo: motivo ?? null } : { decisao_motivo: null, decisao_carta_id: null, decisao_questionador_id: null }),
  })
  if (situacao === "parada") seguro(() => ganchos.aoParar?.(ctx.task.id, motivo ?? "Task parada."))
  seguro(() => ganchos.resolverFora?.(ctx.task.projetoId, ctx.task.id))
  void andarFila(ctx.db, ctx.task.projetoId)
}

// ---------- revisão: mudanças, aceitar, pedir ajuste ----------

const MAX_PATCH = 400_000

/** Mudanças da branch da task contra a base, para a aba Mudanças. */
export async function diffDaTask(db: DatabaseSync, taskId: string): Promise<Resultado<DiffTask>> {
  const task = lerTask(db, taskId)
  const projeto = task && lerProjeto(db, task.projetoId)
  if (!task || !projeto || !task.branch) return { ok: false, erro: "Essa task não tem branch." }
  const faixa = `${projeto.branchBase}...${task.branch}`
  try {
    const stat = await git(projeto.repositorio, ["diff", "--numstat", faixa], projeto.ambiente)
    const patch = await git(projeto.repositorio, ["diff", faixa], projeto.ambiente)
    const arquivos = stat.split("\n").filter(Boolean).map((l) => {
      const [a, r, ...c] = l.split("\t")
      return { caminho: c.join("\t"), adicionadas: Number(a) || 0, removidas: Number(r) || 0 } // binário vem como "-"
    })
    return { ok: true, valor: { arquivos, patch: patch.length > MAX_PATCH ? `${patch.slice(0, MAX_PATCH)}\n… patch truncado em ${MAX_PATCH / 1000} KB` : patch } }
  } catch (e) { return { ok: false, erro: `Não consegui ler as mudanças: ${(e as Error).message}` } }
}

const aceitando = new Set<string>()

/** Task em revisão: "nada" conclui sem PR nem merge (diff vazio); "pr" faz push e abre o PR com o relatório; "merge" funde na base do repositório principal. Depois a task conclui. */
export async function aceitarTask(db: DatabaseSync, taskId: string, modo: "pr" | "merge" | "nada"): Promise<Resultado<Task>> {
  const task = lerTask(db, taskId)
  if (!task || task.situacao !== "revisao" || !task.branch) return { ok: false, erro: "Só uma task em revisão pode ser aceita." }
  const projeto = lerProjeto(db, task.projetoId)
  if (!projeto) return { ok: false, erro: "O projeto da task não existe mais." }
  if (aceitando.has(taskId)) return { ok: false, erro: "Essa task já está sendo aceita." }
  aceitando.add(taskId)
  const { ambiente: amb, repositorio: repo, branchBase: base } = projeto, branch = task.branch
  try {
    let prUrl: string | null = null
    if (modo === "pr") {
      const relatorio = lerEventos(db, taskId).filter((e) => e.tipo === "fim").pop()?.texto ?? task.missao
      const titulo = `${task.referencia ? `${task.referencia}: ` : ""}${task.titulo || task.missao.split("\n")[0].slice(0, 80)}`.slice(0, 200)
      await git(repo, ["push", "-u", "origin", branch], amb)
      let saida: string
      const args = ["pr", "create", "--base", base, "--head", branch, "--title", titulo, "--body-file", "-"]
      // Projeto WSL sem gh no WSL: usa o gh do Windows apontando o repositório (owner/repo do remote origin).
      const criarPr = () => rodar(amb, "gh", args, { cwd: repo, input: relatorio, timeout: 60_000 }).catch(async (e: Error) => {
        if (!ehWsl(amb) || !/gh: (command )?not found|command not found: gh/i.test(e.message)) throw e
        const remoto = await git(repo, ["remote", "get-url", "origin"], amb)
        const dono = /github\.com[:/]([^/]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(remoto.trim())?.[1]
        if (!dono) throw new Error(`O gh não está instalado no WSL e o remote não é do GitHub (${remoto.trim()}). Instale com: sudo apt install gh && gh auth login`)
        return rodar(LOCAL, "gh", [...args, "--repo", dono], { input: relatorio, timeout: 60_000 })
      })
      try { saida = await criarPr() } catch (e) {
        if (!/already exists/i.test((e as Error).message) || !/https:\/\/\S+\/pull\/\d+/.test((e as Error).message)) throw e
        saida = (e as Error).message // já há PR desta branch: segue com a URL dele
      }
      prUrl = /https:\/\/\S+\/pull\/\d+/.exec(saida)?.[0] ?? /https?:\/\/\S+/.exec(saida)?.[0] ?? null
    } else if (modo === "nada") {
      const d = await diffDaTask(db, taskId)
      if (d.ok && d.valor.arquivos.length) return { ok: false, erro: "A task tem mudanças: use Abrir PR ou Merge local." }
    } else {
      const atual = await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"], amb)
      if (atual !== base) return { ok: false, erro: `O repositório principal está na branch "${atual}", não em "${base}". Troque para "${base}" e tente de novo.` }
      if (await git(repo, ["status", "--porcelain", "-uno"], amb)) return { ok: false, erro: "O repositório principal tem alterações não commitadas. Commite ou guarde (stash) e tente de novo." }
      try { await git(repo, [...(await identidade(repo, amb)), "merge", "--no-ff", "-m", `Merge da task #${task.numero} (${branch})`, branch], amb) } catch (e) {
        await git(repo, ["merge", "--abort"], amb).catch(() => {})
        if (!/conflict/i.test((e as Error).message)) throw e
        // Conflito: a base vai para o worktree da task (voltarComAjuste) e o time resolve; depois a task volta para revisão.
        aceitando.delete(taskId)
        registrarEvento(db, taskId, "aviso", `O merge com ${base} deu conflito: a task voltou ao trabalho para as cartas resolverem.`)
        const r = await pedirAjuste(db, taskId, `${AJUSTE_CONFLITO} o FMA trouxe ${base} para este worktree e alguns arquivos ficaram com marcadores de conflito (<<<<<<< ======= >>>>>>>). Resolva todos mantendo o que a ${base} trouxe e o que esta task fez; não apague o trabalho de nenhum dos lados. Depois rode os testes que cobrem esses arquivos. Não rode git merge, git commit nem git rebase: o FMA commita.`)
        return r.ok ? r : { ok: false, erro: `Conflito ao fundir com ${base}, e não consegui mandar a task resolver: ${r.erro}` }
      }
    }
    if (task.worktree) await removerWorktree(repo, task.worktree, amb).catch(() => {})
    db.prepare("UPDATE task SET situacao = 'concluida', pr_url = ?, encerrada_em = ? WHERE id = ?").run(prUrl, Date.now(), taskId)
    registrarEvento(db, taskId, "aviso", modo === "pr" ? `Task aceita: PR aberto${prUrl ? ` (${prUrl})` : ""}.` : modo === "nada" ? "Task concluída sem mudanças (sem PR)." : `Task aceita: ${branch} entrou em ${base} (merge local).`)
    const nova = avisarTask(db, taskId)
    seguro(() => ganchos.aoConcluir?.(taskId))
    seguro(() => ganchos.resolverFora?.(task.projetoId, taskId))
    return { ok: true, valor: nova }
  } catch (e) {
    return { ok: false, erro: `Não consegui aceitar a task: ${(e as Error).message}` }
  } finally {
    aceitando.delete(taskId)
  }
}

/** Task em revisão (ou parada com branch): recria o worktree na mesma branch, anota o ajuste e roda o time de novo. Sem vaga, entra na fila com o ajuste anotado. */
export async function pedirAjuste(db: DatabaseSync, taskId: string, texto: string): Promise<Resultado<Task>> {
  const task = lerTask(db, taskId)
  if (!task || !task.branch || (task.situacao !== "revisao" && task.situacao !== "parada")) return { ok: false, erro: "Só uma task em revisão aceita pedido de ajuste." }
  if (!texto.trim()) return { ok: false, erro: "Escreva o ajuste." }
  const projeto = lerProjeto(db, task.projetoId)
  if (!projeto) return { ok: false, erro: "O projeto da task não existe mais." }
  if (ctxs.has(taskId) || iniciando.has(taskId)) return { ok: false, erro: "Essa task já está voltando ao trabalho." }
  const anotar = () => db.prepare("UPDATE task SET ajustes = CASE WHEN ajustes = '' THEN ?1 ELSE ajustes || char(10) || ?1 END WHERE id = ?2").run(texto.trim(), taskId)
  if (vagasLivres(db, projeto) <= 0) { anotar(); return enfileirar(db, task) } // voltarComAjuste roda quando a fila chegar nela
  iniciando.set(taskId, projeto.id) // segura a vaga enquanto prepara
  try {
    anotar()
    const r = await voltarComAjuste(db, lerTask(db, taskId)!, projeto)
    if (!r.ok) db.prepare("UPDATE task SET ajustes = ? WHERE id = ?").run(task.ajustes, taskId) // não duplica no reenvio
    return r
  } finally {
    iniciando.delete(taskId)
  }
}

/** Recria o worktree na branch da task e a retoma do começo; o ajuste (última linha de `ajustes`) já está anotado. */
async function voltarComAjuste(db: DatabaseSync, task: Task, projeto: ProjetoLido): Promise<Resultado<Task>> {
  const taskId = task.id, amb = projeto.ambiente
  const falta = await faltaContaDe(db, lerTaskCartas(db, taskId).filter((c) => c.copia && !c.retirada).map((c) => c.cartaId), amb)
  if (falta) return { ok: false, erro: falta }
  const wt = task.worktree ?? caminhoWorktree(projeto, task.numero)
  try {
    if (!task.worktree || !wtVivo(amb, wt)) {
      mkdirSync(caminhos("local").dirname(paraFs(amb, wt)), { recursive: true })
      await git(projeto.repositorio, ["worktree", "prune"], amb).catch(() => {})
      await git(projeto.repositorio, ["worktree", "add", wt, task.branch!], amb)
      await prepararWorktree(projeto, wt, (t) => registrarEvento(db, taskId, "aviso", t))
    }
  } catch (e) { return { ok: false, erro: `Não consegui recriar o worktree: ${(e as Error).message}` } }
  // Ajuste de conflito (veio do merge recusado): traz a base para o worktree; os conflitos ficam nos arquivos para a carta resolver.
  if (task.ajustes.split("\n").pop()!.startsWith(AJUSTE_CONFLITO)) {
    try {
      const conflitos = await git(wt, [...(await identidade(wt, amb)), "merge", "--no-ff", "--no-commit", projeto.branchBase], amb).then(() => "", async (e: Error) => {
        const arquivos = (await git(wt, ["diff", "--name-only", "--diff-filter=U"], amb).catch(() => "")).trim()
        if (!arquivos) throw e // falhou por outro motivo
        return arquivos
      })
      registrarEvento(db, taskId, "aviso", conflitos ? `Conflitos com ${projeto.branchBase} para a carta resolver: ${conflitos.split("\n").join(", ")}` : `${projeto.branchBase} entrou no worktree sem conflito.`)
    } catch (e) { return { ok: false, erro: `Não consegui trazer ${projeto.branchBase} para o worktree: ${(e as Error).message}` } }
  }
  emTransacao(db, () => {
    db.prepare("UPDATE task SET situacao = 'andamento', fila_em = NULL, worktree = ?, encerrada_em = NULL WHERE id = ?").run(wt, taskId)
    db.prepare("UPDATE task_carta SET estado = 'espera', atividade = 'Refazendo com o ajuste', concluida = 0, tarefa = NULL, voltas = 0, sessao = NULL WHERE task_id = ?").run(taskId)
  })
  await retomar(db, avisarTask(db, taskId), task.ajustes.split("\n").pop()!)
  emitirFila(db, projeto.id)
  return { ok: true, valor: lerTask(db, taskId)! }
}

/** Task parada com commits à frente da base: volta para revisão (sem worktree; diff, aceitar, ajuste e descarte trabalham sobre a branch). */
export async function revisarTask(db: DatabaseSync, taskId: string): Promise<Resultado<Task>> {
  const task = lerTask(db, taskId)
  const projeto = task && lerProjeto(db, task.projetoId)
  if (!task || !projeto || task.situacao !== "parada" || !task.branch) return { ok: false, erro: "Só uma task parada com branch pode voltar para revisão." }
  const ahead = await git(projeto.repositorio, ["rev-list", "--count", `${projeto.branchBase}..${task.branch}`], projeto.ambiente).catch(() => "0")
  if (!Number(ahead) && !task.worktree) return { ok: false, erro: "A branch da task não tem commits à frente da base. Use Reabrir." }
  if (task.worktree && !wtVivo(projeto.ambiente, task.worktree)) await removerWorktree(projeto.repositorio, task.worktree, projeto.ambiente).catch(() => {})
  if (task.worktree && wtVivo(projeto.ambiente, task.worktree)) { // trabalho não commitado (hook recusou): commita e tira o worktree, para diff, PR e merge levarem tudo
    try { await commitar(task.worktree, `fma(task ${task.numero}): trabalho até aqui`, projeto.ambiente) } catch (e) { return { ok: false, erro: `Não consegui commitar o trabalho: ${(e as Error).message}` } }
    try { await removerWorktree(projeto.repositorio, task.worktree, projeto.ambiente) } catch (e) { return { ok: false, erro: `Não consegui remover o worktree ${task.worktree}: ${(e as Error).message}` } }
  }
  db.prepare("UPDATE task SET worktree = NULL WHERE id = ?").run(taskId)
  db.prepare("UPDATE task SET situacao = 'revisao', decisao_motivo = NULL WHERE id = ?").run(taskId)
  registrarEvento(db, taskId, "aviso", `Task parada voltou para revisão (${ahead} commit(s) em ${task.branch}).`)
  return { ok: true, valor: avisarTask(db, taskId) }
}

// ---------- parar, descartar e liberar ----------

/** Fecha uma task sem execução em memória (pronta, na fila, ou em andamento com o app recém-aberto): vira parada. */
async function fecharRegistro(db: DatabaseSync, task: Task, motivo: string) {
  const projeto = lerProjeto(db, task.projetoId)
  if (task.worktree && projeto) await removerWorktree(projeto.repositorio, task.worktree, projeto.ambiente).catch(() => {})
  db.prepare("UPDATE task SET situacao = 'parada', worktree = NULL, fila_em = NULL, encerrada_em = ?, decisao_motivo = NULL, decisao_carta_id = NULL, decisao_questionador_id = NULL WHERE id = ?")
    .run(Date.now(), task.id)
  registrarEvento(db, task.id, "fim", motivo)
  avisarTask(db, task.id)
  emitirFila(db, task.projetoId)
  seguro(() => ganchos.aoParar?.(task.id, motivo))
  seguro(() => ganchos.resolverFora?.(task.projetoId, task.id))
  void andarFila(db, task.projetoId)
}

/** RF 6.29, 6.28, 6.16 e 6.17: para a task (também a travada, a da fila e a pronta); a vaga abre. */
export async function pararTask(db: DatabaseSync, taskId: string): Promise<Resultado<Task>> {
  const task = lerTask(db, taskId)
  if (!task) return { ok: false, erro: "Essa task não existe mais." }
  const ctx = ctxs.get(taskId)
  if (ctx) {
    ctx.parada = true
    await encerrar(ctx, "parada", "Task parada pelo usuário.")
  } else if (["pronta", "fila", "andamento", "aguardando"].includes(task.situacao)) {
    await fecharRegistro(db, task, task.situacao === "pronta" ? "Task descartada pelo usuário." : task.situacao === "fila" ? "Task tirada da fila pelo usuário." : "Task parada pelo usuário.")
  } else return { ok: false, erro: "Essa task já terminou." }
  return { ok: true, valor: lerTask(db, taskId)! }
}

const soSe = (situacao: "pronta" | "fila", erro: string) => async (db: DatabaseSync, taskId: string): Promise<Resultado<Task>> => {
  const t = lerTask(db, taskId)
  if (!t) return { ok: false, erro: "Essa task não existe mais." }
  return t.situacao === situacao ? pararTask(db, taskId) : { ok: false, erro }
}
const descartarPronta = soSe("pronta", "Só dá para descartar uma task pronta que não começou.")
/** RF 6.17: descarta uma task que ainda não começou (fica parada, RN 57). Em revisão: apaga a branch e marca parada como "Descartada". */
export async function descartarTask(db: DatabaseSync, taskId: string): Promise<Resultado<Task>> {
  const task = lerTask(db, taskId)
  if (!task || task.situacao !== "revisao") return descartarPronta(db, taskId)
  const projeto = lerProjeto(db, task.projetoId)
  if (projeto && task.branch) {
    const wt = task.worktree ?? caminhoWorktree(projeto, task.numero)
    try { await removerWorktree(projeto.repositorio, wt, projeto.ambiente) } catch (e) {
      if (wtVivo(projeto.ambiente, wt)) return { ok: false, erro: `Feche programas usando a pasta ${wt} e tente de novo.` }
    }
    await git(projeto.repositorio, ["worktree", "prune"], projeto.ambiente).catch(() => {})
    db.prepare("UPDATE task SET worktree = NULL WHERE id = ?").run(taskId)
    try { await git(projeto.repositorio, ["branch", "-D", task.branch], projeto.ambiente) } catch (e) { return { ok: false, erro: `Não consegui apagar a branch ${task.branch}: ${(e as Error).message}` } }
  }
  db.prepare("UPDATE task SET situacao = 'parada', encerrada_em = ?, decisao_motivo = 'Descartada' WHERE id = ?").run(Date.now(), taskId)
  registrarEvento(db, taskId, "fim", `Descartada: a branch ${task.branch ?? ""} foi apagada.`)
  const t = avisarTask(db, taskId)
  seguro(() => ganchos.aoParar?.(taskId, "Descartada"))
  seguro(() => ganchos.resolverFora?.(task.projetoId, taskId))
  return { ok: true, valor: t }
}
/** RF 6.16: tira uma task da fila (fica parada, RN 57). */
export const tirarDaFila = soSe("fila", "Essa task não está na fila.")

/** RF 6.27: zera as voltas de quem devolveu, devolve o trabalho à carta com problema e segue. Com `resposta`, ela entra nos apontamentos (RF 5.20). */
export function liberarMaisUmaVolta(db: DatabaseSync, taskId: string, resposta?: string): Resultado<Task> {
  const ctx = ctxs.get(taskId)
  const task = lerTask(db, taskId)
  if (!task || task.situacao !== "aguardando" || !task.decisao) return { ok: false, erro: "Essa task não está esperando decisão." }
  if (!ctx) return { ok: false, erro: "A execução dessa task não está em memória. Pare a task e reabra." }
  const { cartaId, questionadorId } = task.decisao
  if (cartaId !== questionadorId) { // (carta travada não devolveu nada: não há volta a zerar)
    fx.liberarVolta(ctx.voltas, questionadorId)
    db.prepare("UPDATE task_carta SET voltas = 0 WHERE task_id = ? AND carta_id = ?").run(taskId, questionadorId)
  }
  const decisao = resposta?.trim() ? decisaoResposta(task.decisao.motivo, resposta) : ""
  if (resposta?.trim()) guardarApontamentos(ctx, cartaId, [...(ctx.apontamentos.get(cartaId) ?? []), `Resposta do usuário: ${resposta.trim()}`])
  for (const [id, copia] of ctx.copias) { // "troque a conta da carta e reenvie": vale a conta atual da carta
    const k = db.prepare("SELECT conta_id FROM carta WHERE id = ?").get(id) as { conta_id: string | null } | undefined
    if (!k || k.conta_id === copia.contaId) continue
    copia.contaId = k.conta_id
    db.prepare("UPDATE task_carta SET copia_carta = ? WHERE task_id = ? AND carta_id = ?").run(JSON.stringify(copia), taskId, id)
  }
  for (const r of fx.devolver(ctx.estado, ctx.con, cartaId, questionadorId)) {
    ctx.geracao[r] = (ctx.geracao[r] ?? 0) + 1
    marcar(ctx, r, "espera", r === cartaId ? `Refazendo: ${nome(ctx, questionadorId)} devolveu` : "Esperando entregas")
  }
  ctx.travada = false
  salvarTask(ctx, { situacao: "andamento", decisao_motivo: null, decisao_carta_id: null, decisao_questionador_id: null, decisoes: [task.decisoes, decisao].filter(Boolean).join("\n") })
  registrar(ctx, "aviso", `Você liberou mais uma volta para ${nome(ctx, questionadorId)}.`)
  seguro(() => ganchos.resolverFora?.(ctx.task.projetoId, taskId))
  void laco(ctx).catch((e) => encerrar(ctx, "parada", `Erro no motor: ${(e as Error).message}`))
  return { ok: true, valor: ctx.task }
}

/** Carta travada (FMA-STATUS: bloqueado): aceita a entrega como está, anota a pendência e segue o fluxo. */
export function seguirMesmoAssim(db: DatabaseSync, taskId: string): Resultado<Task> {
  const ctx = ctxs.get(taskId)
  const task = lerTask(db, taskId)
  if (!task || task.situacao !== "aguardando" || !task.decisao) return { ok: false, erro: "Essa task não está esperando decisão." }
  if (!ctx) return { ok: false, erro: "A execução dessa task não está em memória. Pare a task e reabra." }
  const { cartaId, questionadorId, motivo } = task.decisao
  if (cartaId !== questionadorId) return { ok: false, erro: "Só dá para seguir quando uma carta travou." }
  registrar(ctx, "aviso", `Pendência: ${motivo} Você escolheu seguir mesmo assim.`, cartaId)
  ;(ctx.semPergunta ??= new Set()).add(cartaId)
  marcar(ctx, cartaId, "concluida", "Concluída com pendência")
  ctx.travada = false
  salvarTask(ctx, { situacao: "andamento", decisao_motivo: null, decisao_carta_id: null, decisao_questionador_id: null, decisoes: [task.decisoes, decisaoSeguir(motivo)].filter(Boolean).join("\n") })
  seguro(() => ganchos.resolverFora?.(ctx.task.projetoId, taskId))
  void laco(ctx).catch((e) => encerrar(ctx, "parada", `Erro no motor: ${(e as Error).message}`))
  return { ok: true, valor: ctx.task }
}

// ---------- retomada ao abrir o app (RF 6.38, 6.42, RN 96) ----------

/**
 * Remonta a execução de uma task a partir do banco: time fixado, plano, entregas, voltas e devoluções pendentes ficam como estavam.
 * Quem estava rodando recomeça do início da carta (o que já foi entregue por outras cartas fica). Task esperando decisão
 * volta a esperar, e "liberar mais uma volta" funciona. Sem plano gravado, o plano é refeito.
 */
async function retomar(db: DatabaseSync, task: Task, ajuste?: string) {
  const refazer = ajuste !== undefined // pedir ajuste: o time roda de novo do começo, na mesma branch
  const projeto = lerProjeto(db, task.projetoId)
  const linhas = lerTaskCartas(db, task.id).filter((l) => l.copia)
  const orq = linhas.find((l) => l.copia!.classe === "orquestrador")?.cartaId
  if (!projeto || !orq || !task.worktree || !task.branch) return fecharRegistro(db, task, "Não consegui retomar a task: faltam dados dela. Reabra como task nova.")
  const apont = new Map((db.prepare("SELECT carta_id, apontamentos FROM task_carta WHERE task_id = ?").all(task.id) as { carta_id: string; apontamentos: string | null }[])
    .map((r) => [r.carta_id, r.apontamentos ? (JSON.parse(r.apontamentos) as string[]) : []]))
  const conexoes = lerTaskConexoes(db, task.id)
  const cartasFx = linhas.map((l) => ({ id: l.cartaId, nome: l.copia!.nome, orquestrador: l.cartaId === orq }))
  const con = conexoes.map((c) => ({ de: c.deCartaId, para: c.paraCartaId, tipo: c.tipo, ordem: c.ordem }))
  const comecos = linhas.filter((l) => l.comeca && l.cartaId !== orq).map((l) => l.cartaId)
  const estado: fx.Estado = refazer ? fx.estadoInicial(cartasFx, con, comecos.length ? comecos : fx.comecoNatural(cartasFx, con)) : {}
  if (!refazer) for (const l of linhas) if (l.cartaId !== orq) estado[l.cartaId] = l.estado === "concluida" ? "concluida" : l.estado === "espera" ? "espera" : "pronta"
  const ctx: Ctx = {
    db, task, projeto, copias: new Map(linhas.map((l) => [l.cartaId, l.copia!])),
    tarefas: new Map(linhas.filter((l) => l.tarefa).map((l) => [l.cartaId, l.tarefa!])),
    entregas: new Map(refazer ? [] : linhas.filter((l) => l.entrega).map((l) => [l.cartaId, l.entrega!])),
    apontamentos: new Map([...apont].filter(([, v]) => v.length)),
    voltas: Object.fromEntries(linhas.filter((l) => l.voltas).map((l) => [l.cartaId, l.voltas])),
    skills: new Map(conexoes.map((c) => [`${c.deCartaId}>${c.paraCartaId}`, c.skills])),
    cartas: cartasFx, con,
    orq, estado, geracao: {}, ativas: new Map(), execs: new Map(), parada: false, travada: task.situacao === "aguardando",
  }
  ctxs.set(task.id, ctx)
  try {
    if (!wtVivo(projeto.ambiente, task.worktree)) { // a pasta sumiu: recria o worktree na branch que já existe
      await git(projeto.repositorio, ["worktree", "prune"], projeto.ambiente).catch(() => {})
      await git(projeto.repositorio, ["worktree", "add", task.worktree, task.branch], projeto.ambiente)
    }
  } catch (e) {
    return encerrar(ctx, "parada", `Não consegui retomar: o worktree da task não existe mais (${(e as Error).message}).`)
  }
  for (const l of linhas) if (l.cartaId !== orq && (l.estado === "trabalhando" || l.estado === "questionando")) marcar(ctx, l.cartaId, "pronta", "Retomando")
  registrar(ctx, "aviso", refazer ? `Ajuste pedido: ${ajuste}` : ctx.travada ? "O app foi reaberto: a task continua esperando sua decisão." : "O app foi reaberto: a task foi retomada a partir das cartas que não tinham concluído.")
  if (ctx.travada) return
  const semConta = await faltaContaDe(db, linhas.map((l) => l.cartaId), projeto.ambiente)
  if (semConta) return esperarDecisao(ctx, { cartaId: orq, questionadorId: orq, motivo: semConta }) // Responder e reenviar segue depois de conectar a conta
  const planejada = !refazer && linhas.every((l) => l.cartaId === orq || l.tarefa)
  if (planejada) void laco(ctx).catch((e) => encerrar(ctx, "parada", `Erro no motor: ${(e as Error).message}`))
  else void rodarTask(ctx, comecos.length ? comecos : fx.comecoNatural(cartasFx, con))
}

/** Chame ao abrir o app, depois de ligar as integrações: retoma as tasks em andamento e esperando decisão e começa a fila onde houver vaga. */
export async function retomarAoAbrir(db: DatabaseSync): Promise<{ retomadas: string[] }> {
  const retomadas: string[] = []
  for (const { id } of db.prepare("SELECT id FROM task WHERE situacao IN ('andamento','aguardando') ORDER BY numero").all() as { id: string }[]) {
    const t = lerTask(db, id)
    if (!t || ctxs.has(id)) continue
    try { await retomar(db, t); retomadas.push(id) } catch (e) { await fecharRegistro(db, t, `Não consegui retomar a task: ${(e as Error).message}`) }
  }
  for (const { projeto_id } of db.prepare("SELECT DISTINCT projeto_id FROM task WHERE situacao = 'fila'").all() as { projeto_id: string }[]) await andarFila(db, projeto_id)
  return { retomadas }
}

/**
 * Chame ao fechar o app: mata as CLIs sem mexer no banco, para a retomada reiniciar as cartas que estavam rodando.
 * (Sem isto, processos soltos continuariam editando o worktree enquanto a task é retomada.)
 */
export function pararProcessos() {
  for (const ctx of ctxs.values()) {
    ctx.parada = true
    for (const es of ctx.execs.values()) es.forEach((e) => e.parar())
  }
}
