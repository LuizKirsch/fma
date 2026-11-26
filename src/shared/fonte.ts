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
  mcp: { nome: "MCP próprio", desc: "Qualquer servidor MCP (Jira, Azure DevOps...): você diz qual ferramenta lista as tasks e, se quiser, os projetos e as que movem/comentam o card." },
  lupito: { nome: "MCP Lupito", desc: "Projetos, demandas, bugs e casos de teste do Lupito.", emBreve: true },
}

/** Coluna (status) que marca a task como pronta para desenvolver, quando a fonte não diz outra. */
export const COLUNA_PRONTA = "Pronta para desenvolver"
