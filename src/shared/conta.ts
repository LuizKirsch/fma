/** Contas de IA (pacote 1, E10). Uma conta = uma pasta de config da CLI; várias por CLI, uma padrão. */
import type { Ambiente } from "./ambiente"
import type { CliId } from "./ia"

export interface Conta {
  id: string
  cli: CliId
  nome: string
  /** Vai para CLAUDE_CONFIG_DIR / CODEX_HOME / home do Gemini ao rodar a CLI. null = config padrão da CLI. */
  pastaConfig: string | null
  padrao: boolean
  criadaEm: number
  /** Onde a CLI roda: "local" ou "wsl:<distro>" (RF 2.37). A padrão é por (CLI, ambiente). */
  ambiente: string
}

/** Uso por conta, somado dos tokens das tasks (não há API de limite do provedor). */
export interface UsoConta {
  contaId: string
  tokens5h: number
  tokensSemana: number
  /** Quando a janela deixa de contar o uso mais antigo (ms); null sem uso. */
  renova5h: number | null
  renovaSemana: number | null
}

/** `ambientes`: onde dá para rodar (o local e, no Windows, as distros do WSL). */
/** Login real da CLI, conferido rodando a própria CLI. logado null = a CLI não informa (Gemini sem credencial salva). */
export interface StatusLogin { logado: boolean | null; email?: string; detalhe?: string }

/** Limite real do provedor numa janela (5 h, semana…): % usado e quando renova. */
export interface LimiteJanela { rotulo: string; usado: number; renovaEm: number | null }
/** fonte "api": consulta da Anthropic (igual ao /usage); "log": lido dos logs do Codex (atualizadoEm = data do log). */
export interface LimiteConta { janelas: LimiteJanela[]; fonte: "api" | "log"; atualizadoEm: number; erro?: string }

export interface EstadoContas { contas: Conta[]; uso: UsoConta[]; limites: Record<string, LimiteConta | null>; ambientes: Ambiente[] }

export type Esforco = "baixo" | "medio" | "alto" | "muito" | "maximo"
export const ESFORCOS: { id: Esforco; nome: string }[] = [
  { id: "baixo", nome: "Baixo" },
  { id: "medio", nome: "Médio" },
  { id: "alto", nome: "Alto" },
  { id: "muito", nome: "Muito alto" },
  { id: "maximo", nome: "Máximo" },
]
