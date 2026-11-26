/**
 * Conectores de board. Interface `Conector` + conector GitHub Projects (v2).
 *
 * Escolha: `gh api graphql` em vez do servidor MCP do GitHub. Uma linha: o `gh` já é exigido para abrir o PR,
 * já guarda a autenticação (o FMA não guarda token) e não precisa subir/manter um servidor; trocar por um
 * conector MCP depois é só implementar `Conector` (o resto do monitor não muda).
 * Precisa do escopo `project` no `gh auth` (gh auth refresh -s project).
 */
import type { DatabaseSync } from "node:sqlite"
import type { Card } from "@shared/monitor"
import type { Fonte } from "@shared/fonte"
import { executar, type Executar } from "../apoio/proc"
import { FECHADA, tasksMcp, usarFerramentaMcp } from "../fontes-mcp"
import { mesmaColuna, parseConsulta } from "./puro"

export interface CardLido { coluna: string; comentarios: string[] }

export interface Conector {
  id: string
  nome: string
  /** Erro de formato da consulta, ou null. */
  validarConsulta(consulta: string): string | null
  buscar(consulta: string): Promise<Card[]>
  lerCard(ref: string): Promise<CardLido>
  mover(ref: string, coluna: string): Promise<void>
  comentar(ref: string, texto: string): Promise<void>
}

/** Uma chamada `gh api graphql` (a autenticação é do gh). Também usada pelas fontes de tasks. */
export async function graphqlGithub(query: string, vars: Record<string, string | number> = {}, rodar: Executar = executar): Promise<any> {
  const args = ["api", "graphql", "-f", `query=${query}`]
  for (const [k, v] of Object.entries(vars)) args.push(typeof v === "number" ? "-F" : "-f", `${k}=${v}`)
  const r = JSON.parse(await rodar("gh", args))
  if (r.errors?.length) throw new Error(r.errors.map((e: { message: string }) => e.message).join("; "))
  return r.data
}

export function conectorGithub(rodar: Executar = executar): Conector {
  const gql = (query: string, vars: Record<string, string | number> = {}) => graphqlGithub(query, vars, rodar)
  const STATUS = `fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }`

  return {
    id: "github-projects",
    nome: "GitHub (gh)",
    validarConsulta: (c) => (parseConsulta(c) ? null : 'Use "dono/número:coluna", ex.: acme/3:Pronto para desenvolver.'),

    async buscar(consulta) {
      const q = parseConsulta(consulta)
      if (!q) throw new Error("Consulta inválida.")
      const cards: Card[] = []
      let depois = ""
      for (let pagina = 0; pagina < 10; pagina++) { // ponytail: até 1000 itens por busca
        const d = await gql(
          `query($dono:String!,$n:Int!,$depois:String){ repositoryOwner(login:$dono){ ... on ProjectV2Owner { projectV2(number:$n){ items(first:100, after:$depois){
            pageInfo{hasNextPage endCursor} nodes{ id ${STATUS} content{ ... on Issue{title body url number repository{nameWithOwner}} ... on PullRequest{title body url number repository{nameWithOwner}} ... on DraftIssue{title body} } } } } } } }`,
          { dono: q.dono, n: q.numero, ...(depois ? { depois } : {}) },
        )
        const itens = d.repositoryOwner?.projectV2?.items
        if (!itens) throw new Error(`Projeto ${q.dono}/${q.numero} não encontrado (ou sem permissão).`)
        for (const n of itens.nodes) {
          if (n.fieldValueByName?.name && mesmaColuna(n.fieldValueByName.name, q.coluna) && n.content?.title)
            cards.push({ ref: n.id, chave: n.content.repository ? `${n.content.repository.nameWithOwner}#${n.content.number}` : n.id, titulo: n.content.title, corpo: n.content.body ?? "", url: n.content.url ?? "" })
        }
        if (!itens.pageInfo.hasNextPage) break
        depois = itens.pageInfo.endCursor
      }
      return cards
    },

    async lerCard(ref) {
      const d = await gql(`query($id:ID!){ node(id:$id){ ... on ProjectV2Item { ${STATUS} content{ ... on Issue{comments(last:30){nodes{body}}} ... on PullRequest{comments(last:30){nodes{body}}} } } } }`, { id: ref })
      const n = d.node
      return { coluna: n?.fieldValueByName?.name ?? "", comentarios: (n?.content?.comments?.nodes ?? []).map((c: { body: string }) => c.body) }
    },

    async mover(ref, coluna) {
      const d = await gql(`query($id:ID!){ node(id:$id){ ... on ProjectV2Item { project{ id field(name:"Status"){ ... on ProjectV2SingleSelectField{ id options{id name} } } } } } }`, { id: ref })
      const p = d.node?.project
      const opcao = p?.field?.options?.find((o: { name: string }) => mesmaColuna(o.name, coluna))
      if (!opcao) throw new Error(`A coluna "${coluna}" não existe no board.`)
      await gql(
        `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{id} } }`,
        { p: p.id, i: ref, f: p.field.id, o: opcao.id },
      )
    },

    async comentar(ref, texto) {
      const d = await gql(`query($id:ID!){ node(id:$id){ ... on ProjectV2Item { content{ ... on Issue{id} ... on PullRequest{id} } } } }`, { id: ref })
      const alvo = d.node?.content?.id
      if (!alvo) throw new Error("Este card não é uma issue ou PR: não dá para comentar.")
      await gql(`mutation($s:ID!,$b:String!){ addComment(input:{subjectId:$s,body:$b}){ clientMutationId } }`, { s: alvo, b: texto })
    },
  }
}

/** Escrita de volta que o conector não faz: o serviço registra como aviso no evento do monitor, sem falhar a task. */
export class AvisoBoard extends Error {}

/**
 * Conector de uma fonte MCP própria cadastrada, id "fonte:<id>".
 * Consulta: com ferramenta de projetos, "<projeto>:<coluna>"; sem, só a coluna (ou status).
 * mover/comentar usam as ferramentas descobertas do servidor (nomes dos argumentos do inputSchema);
 * sem elas, avisam (AvisoBoard). lerCard devolve vazio: a retomada por coluna não dispara em fonte MCP.
 */
export function conectorDeFonte(f: Fonte): Conector {
  const cfg = f.config
  const semEscrita = () => { throw new AvisoBoard(`O servidor da fonte "${f.rotulo}" não tem ferramenta para isso: o card não foi alterado.`) }
  return {
    id: `fonte:${f.id}`,
    nome: f.rotulo,
    validarConsulta: () => null, // vazio: todas as tasks abertas que o filtro da fonte traz
    async buscar(consulta) {
      const coluna = consulta.trim()
      const tasks = await tasksMcp(f.tipo, { ...cfg, colunaPronta: coluna }, "*", coluna.split(",").some((c) => FECHADA.test(c.trim())))
      return (coluna ? tasks.filter((t) => t.pronta) : tasks).map((t) => ({ ref: t.ref, chave: t.ref, titulo: t.titulo, corpo: t.descricao, url: t.url ?? "" }))
    },
    lerCard: async () => ({ coluna: "", comentarios: [] }),
    async mover(ref, coluna) { if ((await usarFerramentaMcp(cfg, "mover", ref, coluna)) === false) semEscrita() },
    async comentar(ref, texto) { if ((await usarFerramentaMcp(cfg, "comentar", ref, texto)) === false) semEscrita() },
  }
}

/** Fontes MCP que servem de conector (o GitHub já tem o conector do gh). */
const TIPOS_CONECTOR = ["mcp"]
const fontesMcp = (db: DatabaseSync) =>
  (db.prepare("SELECT id, tipo, rotulo, config, conectada_em FROM fonte WHERE tipo = 'mcp' ORDER BY conectada_em").all() as any[])
    .map((l): Fonte => ({ id: l.id, tipo: l.tipo, rotulo: l.rotulo, config: JSON.parse(l.config), conectadaEm: l.conectada_em }))
export const conectoresDeFontes = (db: DatabaseSync) => fontesMcp(db).map((f) => ({ id: `fonte:${f.id}`, nome: f.rotulo }))
/** Conector pelo id: o fixo (gh) ou "fonte:<id>". */
export const resolverConector = (db: DatabaseSync, id: string): Conector | undefined => {
  if (!id.startsWith("fonte:")) return conectorPorId(id)
  const f = fontesMcp(db).find((x) => `fonte:${x.id}` === id)
  return f && TIPOS_CONECTOR.includes(f.tipo) ? conectorDeFonte(f) : undefined
}

const registro = new Map<string, Conector>([["github-projects", conectorGithub()]])
export const conectores = () => [...registro.values()]
export const conectorPorId = (id: string) => registro.get(id)
/** Registra outro conector (ex.: um que fale com um servidor MCP de board). */
export const registrarConector = (c: Conector) => void registro.set(c.id, c)
