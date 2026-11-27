/**
 * Projetos no banco (módulo 2): criar com a mesa montada, ajustes, abas (ordem), exclusão,
 * e a conferência do repositório git. Toda gravação valida de novo o que a interface já validou.
 */
import type { DatabaseSync } from "node:sqlite"
import { existsSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { transacao } from "./db"
import { git } from "./motor/processo"
import { deCaminho, LOCAL, paraFs } from "./ambiente"
import { montarMesaInicial } from "./mesa"
import { criarTask } from "./motor/motor"
import { cardsEmSegundoPlano } from "./fontes"
import { apagarChatDoProjeto } from "./maestro/store"
import { listarCartasApoio, removerCartaApoio } from "./apoio/repo"
import { COMANDOS_PADRAO, PASTAS_PADRAO, validarAjustes, type AjustesProjeto, type NovoProjeto, type PreferenciasMesa, type Projeto, type Repositorio, type UsoDaCarta } from "@shared/projeto"
import type { Resultado } from "@shared/tipos"
import type { ClasseId } from "@shared/catalogo"

/**
 * RF 2.25, 2.26 e 2.37: a pasta precisa ser (ou estar dentro de) um repositório git com ao menos uma branch.
 * Um caminho \\wsl.localhost\<distro>\... vira o ambiente WSL com o caminho Linux; `ambienteAtual` vale para caminho Linux solto.
 */
export async function inspecionarRepositorio(pasta: string, ambienteAtual = LOCAL): Promise<Resultado<Repositorio>> {
  const dado = deCaminho(pasta.trim())
  const ambiente = dado.ambiente !== LOCAL ? dado.ambiente : ambienteAtual
  const caminho = dado.caminho
  if (!caminho) return { ok: false, erro: "Informe a pasta do repositório." }
  const fs = paraFs(ambiente, caminho)
  if (!existsSync(fs) || !statSync(fs).isDirectory()) return { ok: false, erro: "Essa pasta não existe." }
  try {
    const topo = await git(caminho, ["rev-parse", "--show-toplevel"], ambiente)
    const raiz = ambiente === LOCAL ? resolve(topo) : topo
    const branches = (await git(raiz, ["branch", "--format=%(refname:short)"], ambiente)).split(/\r?\n/).map((b) => b.trim()).filter(Boolean)
    if (!branches.length) return { ok: false, erro: "O repositório ainda não tem nenhuma branch: faça o primeiro commit." }
    const atual = await git(raiz, ["branch", "--show-current"], ambiente).catch(() => "")
    return { ok: true, valor: { raiz, ambiente, branches, atual: branches.includes(atual) ? atual : branches.find((b) => b === "main" || b === "master") ?? branches[0] } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    const onde = ambiente === LOCAL ? "neste computador" : "nesse WSL"
    return { ok: false, erro: /ENOENT|not recognized|não é reconhecido|not found/i.test(msg) ? `O git não está instalado ${onde}.` : "Essa pasta não é um repositório git." }
  }
}

interface Linha {
  id: string; nome: string; repositorio: string; branch_base: string; ordem: number; vagas: number; limite_devolucoes: number
  limite_tokens: number; conexoes_visiveis: number; mostrar_sugestoes: number; vista: string | null; criado_em: number
  contexto: string; fonte_id: string | null; fonte_projeto: string | null; ambiente: string; comandos: string | null; pastas_compartilhadas: string | null; preparo: string | null; comando_teste: string | null
}
const paraProjeto = (l: Linha): Projeto => ({
  id: l.id, nome: l.nome, repositorio: l.repositorio, branchBase: l.branch_base, ordem: l.ordem, vagas: l.vagas,
  limiteDevolucoes: l.limite_devolucoes, limiteTokens: l.limite_tokens, conexoesVisiveis: !!l.conexoes_visiveis,
  mostrarSugestoes: !!l.mostrar_sugestoes, vista: l.vista ? JSON.parse(l.vista) : null, criadoEm: l.criado_em,
  contexto: l.contexto, fonteId: l.fonte_id, fonteProjeto: l.fonte_projeto ? JSON.parse(l.fonte_projeto) : null, ambiente: l.ambiente,
  comandos: l.comandos ? JSON.parse(l.comandos) : COMANDOS_PADRAO,
  pastasCompartilhadas: l.pastas_compartilhadas ? JSON.parse(l.pastas_compartilhadas) : PASTAS_PADRAO,
  preparo: l.preparo ? JSON.parse(l.preparo) : [],
  comandoTeste: l.comando_teste ?? "",
})

export const listarProjetos = (db: DatabaseSync): Projeto[] =>
  (db.prepare("SELECT * FROM projeto ORDER BY ordem, criado_em").all() as unknown as Linha[]).map(paraProjeto)

const buscar = (db: DatabaseSync, id: string) => listarProjetos(db).find((p) => p.id === id)

/** Confere pasta e branch com o git; devolve a raiz normalizada do repositório e o ambiente dela. */
async function conferirRepositorio(pasta: string, branch: string, ambienteAtual = LOCAL): Promise<Resultado<{ raiz: string; ambiente: string }>> {
  const r = await inspecionarRepositorio(pasta, ambienteAtual)
  if (!r.ok) return r
  if (!r.valor.branches.includes(branch)) return { ok: false, erro: `A branch "${branch}" não existe nesse repositório.` }
  return { ok: true, valor: { raiz: r.valor.raiz, ambiente: r.valor.ambiente } }
}

/** RF 2.01 a 2.06 e RN 15, 16: cria o projeto e já monta a mesa com o time. */
export async function criarProjeto(db: DatabaseSync, entrada: NovoProjeto): Promise<Resultado<Projeto>> {
  const nome = entrada.nome.trim()
  const erro = validarAjustes({ nome, repositorio: entrada.repositorio, branchBase: entrada.branchBase, vagas: 2, limiteDevolucoes: 2, limiteTokens: 150_000, comandos: [], pastasCompartilhadas: [], preparo: [], comandoTeste: "" })
  if (erro) return { ok: false, erro }
  const time = [...new Set(entrada.cartaIds)].map((id) => db.prepare("SELECT id, classe FROM carta WHERE id = ?").get(id) as { id: string; classe: ClasseId } | undefined)
  if (time.some((c) => !c)) return { ok: false, erro: "Uma das cartas do time não existe mais." }
  if (!time.some((c) => c!.classe === "orquestrador")) return { ok: false, erro: "O time precisa de uma carta de Orquestrador." }
  const repo = await conferirRepositorio(entrada.repositorio, entrada.branchBase, entrada.ambiente)
  if (!repo.ok) return repo

  const id = crypto.randomUUID()
  transacao(db, () => {
    const { prox } = db.prepare("SELECT COALESCE(MAX(ordem) + 1, 0) AS prox FROM projeto").get() as { prox: number }
    const fonte = entrada.fonteId && db.prepare("SELECT 1 FROM fonte WHERE id = ?").get(entrada.fonteId) ? entrada.fonteId : null
    db.prepare("INSERT INTO projeto (id, nome, repositorio, branch_base, ordem, criado_em, contexto, fonte_id, fonte_projeto, ambiente, limite_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 150000)")
      .run(id, nome, repo.valor.raiz, entrada.branchBase, prox, Date.now(), (entrada.contexto ?? "").trim(), fonte, fonte && entrada.fonteProjeto ? JSON.stringify(entrada.fonteProjeto) : null, repo.valor.ambiente)
    montarMesaInicial(db, id, time as { id: string; classe: ClasseId }[])
  })
  // As tasks marcadas na fonte viram tasks prontas, com a referência da fonte.
  const novas: string[] = []
  for (const t of entrada.tasks ?? []) { const r = criarTask(db, { projetoId: id, missao: t.descricao.trim() || t.titulo, titulo: t.titulo, referencia: t.ref }); if (r.ok) novas.push(r.valor.id) }
  cardsEmSegundoPlano(db, novas)
  return { ok: true, valor: buscar(db, id)! }
}

/** RF 2.10, 2.13, 2.14, 2.24 a 2.26. */
export async function atualizarProjeto(db: DatabaseSync, id: string, a: AjustesProjeto): Promise<Resultado<Projeto>> {
  const atual = buscar(db, id)
  if (!atual) return { ok: false, erro: "Esse projeto não existe mais." }
  const ajustes = { ...a, nome: a.nome.trim() }
  const erro = validarAjustes(ajustes)
  if (erro) return { ok: false, erro }
  let repositorio = atual.repositorio, ambiente = atual.ambiente
  // Só volta a falar com o git se a pasta ou a branch mudaram.
  if (ajustes.repositorio !== atual.repositorio || ajustes.branchBase !== atual.branchBase) {
    const repo = await conferirRepositorio(ajustes.repositorio, ajustes.branchBase, atual.ambiente)
    if (!repo.ok) return repo
    repositorio = repo.valor.raiz
    ambiente = repo.valor.ambiente
  }
  const comandos = (ajustes.comandos ?? atual.comandos).map((c) => c.trim()).filter(Boolean)
  db.prepare("UPDATE projeto SET nome = ?, repositorio = ?, ambiente = ?, branch_base = ?, vagas = ?, limite_devolucoes = ?, limite_tokens = ?, comandos = ?, pastas_compartilhadas = ?, preparo = ?, comando_teste = ? WHERE id = ?")
    .run(ajustes.nome, repositorio, ambiente, ajustes.branchBase, ajustes.vagas, ajustes.limiteDevolucoes, ajustes.limiteTokens, JSON.stringify(comandos), JSON.stringify((ajustes.pastasCompartilhadas ?? atual.pastasCompartilhadas).map((p) => p.trim().replace(/[\\/]+$/, "")).filter(Boolean)), JSON.stringify((ajustes.preparo ?? atual.preparo).map((c) => c.trim()).filter(Boolean)), (ajustes.comandoTeste ?? atual.comandoTeste).trim(), id)
  return { ok: true, valor: buscar(db, id)! }
}

/** Preferências da mesa: conexões visíveis, espaços sugeridos, posição e zoom. */
export function salvarPreferencias(db: DatabaseSync, id: string, p: Partial<PreferenciasMesa>): void {
  const atual = buscar(db, id)
  if (!atual) return
  const n = { ...atual, ...p }
  db.prepare("UPDATE projeto SET conexoes_visiveis = ?, mostrar_sugestoes = ?, vista = ? WHERE id = ?")
    .run(n.conexoesVisiveis ? 1 : 0, n.mostrarSugestoes ? 1 : 0, n.vista ? JSON.stringify(n.vista) : null, id)
}

/** RF 2.11: a nova ordem das abas, pelos ids. */
export function reordenarProjetos(db: DatabaseSync, ids: string[]): Projeto[] {
  transacao(db, () => ids.forEach((id, i) => db.prepare("UPDATE projeto SET ordem = ? WHERE id = ?").run(i, id)))
  return listarProjetos(db)
}

/** RF 2.12: quantas tasks do histórico saem junto com o projeto. */
export const contarTasks = (db: DatabaseSync, id: string): number =>
  (db.prepare("SELECT COUNT(*) AS n FROM task WHERE projeto_id = ?").get(id) as { n: number }).n

/**
 * RN 20: some o projeto com a mesa, conexões, tasks (cascata do banco), cartas de apoio e chat.
 * As cartas continuam na coleção. Parar as tasks em andamento é do motor, quando houver o que parar.
 */
export function excluirProjeto(db: DatabaseSync, id: string): Resultado<null> {
  if (!buscar(db, id)) return { ok: false, erro: "Esse projeto não existe mais." }
  transacao(db, () => {
    for (const c of listarCartasApoio(db, id)) removerCartaApoio(db, c.id)
    apagarChatDoProjeto(db, id)
    db.prepare("DELETE FROM monitor WHERE projeto_id = ?").run(id) // o monitor não tem FK para o projeto
    db.prepare("DELETE FROM projeto WHERE id = ?").run(id)
  })
  return { ok: true, valor: null }
}

/** RF 1.03 e 1.31: em que projetos cada carta está. */
export const usosDasCartas = (db: DatabaseSync): UsoDaCarta[] =>
  (db.prepare("SELECT carta_id, projeto_id FROM carta_mesa").all() as { carta_id: string; projeto_id: string }[]).map((r) => ({ cartaId: r.carta_id, projetoId: r.projeto_id }))
