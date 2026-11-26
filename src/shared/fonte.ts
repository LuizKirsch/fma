/** Fontes de tasks (pacote 3, E10). GitHub via gh; Jira e Azure via servidor MCP; Lupito quando houver spec. */

export type TipoFonte = "github" | "mcp" | "lupito"

export interface Fonte {
  id: string
  tipo: TipoFonte
  rotulo: string
  /** Servidor MCP, organização, etc. Formato livre por tipo. */
  config: Record<string, unknown>
  conectadaEm: number
}

export interface ProjetoDaFonte {
  id: string
  titulo: string
  totalTasks: number
  prontas: number
}

export interface TaskDaFonte {
  ref: string
  titulo: string
  descricao: string
  url?: string
  pronta: boolean
}

/** Um servidor MCP já configurado na Claude Code do usuário (Windows ou WSL). */
export interface McpDaClaude {
  origem: string // "windows" | "wsl:<distro>"
  projeto?: string
  /** Conector do claude.ai (vem da conta, não de arquivo local): a autenticação é feita pelo claude.ai. */
  claudeAi?: boolean
  /** Estado que a própria Claude mostra em `claude mcp list` (só para conectores do claude.ai). */
  conectado?: boolean
  nome: string
  config: { servidor: string; env: string }
  /** O servidor usa headers (ex.: token), que o FMA ainda não envia. */
  comHeaders?: boolean
}

export interface NovaFonte { tipo: TipoFonte; rotulo: string; config: Record<string, unknown> }

export const FONTES: Record<TipoFonte, { nome: string; desc: string; emBreve?: boolean }> = {
  github: { nome: "GitHub", desc: "GitHub Projects, pelo gh instalado e autenticado (precisa do escopo project)." },
  mcp: { nome: "MCP próprio", desc: "Qualquer servidor MCP (Jira, Azure DevOps, Lupito...): o FMA descobre sozinho as ferramentas que leem, movem e comentam o card." },
  lupito: { nome: "MCP Lupito", desc: "Projetos, demandas, bugs e casos de teste do Lupito.", emBreve: true },
}

/** Coluna (status) que marca a task como pronta para desenvolver, quando a fonte não diz outra. */
export const COLUNA_PRONTA = "Pronta para desenvolver"

// ---------- Descoberta das ferramentas de um servidor MCP próprio (puro: o formulário e o backend usam o mesmo) ----------

export interface PropMcp { type?: string; anyOf?: { type?: string }[]; description?: string }
export interface FerramentaDoServidor { name: string; description?: string; inputSchema?: { properties?: Record<string, PropMcp>; required?: string[] } }
export type PapelMcp = "lista" | "detalhe" | "mover" | "comentar"
export type MapaMcp = Partial<Record<PapelMcp, string>>
export interface ArgsMcp { id?: string; coluna?: string; texto?: string }

const ALVO = /demanda|task|issue|card|ticket/i
const PAPEIS: Record<PapelMcp, RegExp> = {
  lista: /^(buscar|listar|list|search|find)_?/i,
  detalhe: /^(obter|get|ler|read|fetch)_?/i,
  mover: /^(mover|move|transition|transicionar)/i,
  comentar: /^(comentar|comment|add_comment)/i,
}
/** A primeira ferramenta de cada papel, preferindo as cujo nome fala de demanda/task/issue/card/ticket. */
export function mapearFerramentas(tools: FerramentaDoServidor[]): MapaMcp {
  const mapa: MapaMcp = {}
  for (const p of Object.keys(PAPEIS) as PapelMcp[]) {
    const c = tools.filter((t) => PAPEIS[p].test(t.name))
    const t = c.find((x) => ALVO.test(x.name)) ?? c[0]
    if (t) mapa[p] = t.name
  }
  return mapa
}

/** Nomes dos argumentos de uma ferramenta, lidos do inputSchema. O id é a propriedade obrigatória que parece um id. */
export function argumentosDe(t?: FerramentaDoServidor): ArgsMcp {
  const props = Object.keys(t?.inputSchema?.properties ?? {}), obrig = t?.inputSchema?.required ?? []
  const ID = /id|chave|key|codigo|numero|demanda|issue|card|ref/i
  return {
    id: obrig.find((k) => ID.test(k)) ?? props.find((k) => ID.test(k)),
    coluna: props.find((k) => /coluna|column|status|estado|destino/i.test(k)),
    texto: props.find((k) => /texto|text|comentario|comment|body|mensagem|corpo/i.test(k)),
  }
}

/** Propriedades de texto/número NÃO obrigatórias da ferramenta de lista: viram o "Filtro" do formulário. */
export function camposDeFiltro(t?: FerramentaDoServidor): { nome: string; descricao: string }[] {
  const obrig = t?.inputSchema?.required ?? []
  const simples = (p: PropMcp) => [p.type, ...(p.anyOf ?? []).map((a) => a.type)].some((x) => x === "string" || x === "number" || x === "integer")
  return Object.entries(t?.inputSchema?.properties ?? {})
    .filter(([k, p]) => !obrig.includes(k) && simples(p) && !/^(limite?|limit|pagina|page|offset)$/i.test(k))
    .map(([k, p]) => ({ nome: k, descricao: p.description ?? "" }))
}
