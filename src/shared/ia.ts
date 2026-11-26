/**
 * As IAs que as cartas usam. Cada carta roda numa CLI de código instalada no computador
 * (decisão de 24/11): a CLI trabalha na pasta da task, lê e edita arquivos.
 * A lista de modelos é uma sugestão; a carta aceita qualquer modelo pelo nome (RF 1.12).
 */

export type CliId = "claude" | "codex" | "gemini"
export type Raridade = "comum" | "rara" | "epica" | "lendaria"

export interface Modelo {
  id: string
  nome: string
  raridade: Raridade
  poder: number
  velocidade: number
  custo: number
  dica: string
}

export interface Cli {
  id: CliId
  nome: string
  /** Nome curto que aparece na carta. */
  curto: string
  /** Comando procurado no PATH. */
  comando: string
  provedor: string
  instalar: string
  modelos: Modelo[]
}

export const CLIS: Cli[] = [
  {
    id: "claude", nome: "Claude Code", curto: "Claude", comando: "claude", provedor: "Anthropic",
    instalar: "npm install -g @anthropic-ai/claude-code",
    modelos: [
      { id: "claude-fable-5-2", nome: "Fable 5.2", raridade: "lendaria", poder: 5, velocidade: 2, custo: 5, dica: "O mais capaz. Para problemas muito difíceis." },
      { id: "claude-opus-5-5", nome: "Opus 5.5", raridade: "epica", poder: 5, velocidade: 3, custo: 4, dica: "Raciocínio profundo. Ótimo para análise, código e revisão." },
      { id: "claude-sonnet-5-5", nome: "Sonnet 5.5", raridade: "rara", poder: 4, velocidade: 4, custo: 3, dica: "Equilibrado. Bom padrão para quase todos os papéis." },
      { id: "claude-haiku-5-5", nome: "Haiku 5.5", raridade: "comum", poder: 3, velocidade: 5, custo: 1, dica: "Rápido e barato. Tarefas simples e repetitivas." },
    ],
  },
  {
    id: "codex", nome: "Codex CLI", curto: "Codex", comando: "codex", provedor: "OpenAI",
    instalar: "npm install -g @openai/codex",
    modelos: [
      { id: "gpt-5", nome: "GPT-5", raridade: "epica", poder: 5, velocidade: 3, custo: 4, dica: "Modelo principal da OpenAI." },
      { id: "gpt-5-mini", nome: "GPT-5 mini", raridade: "rara", poder: 3, velocidade: 5, custo: 2, dica: "Versão menor e mais rápida." },
    ],
  },
  {
    id: "gemini", nome: "Gemini CLI", curto: "Gemini", comando: "gemini", provedor: "Google",
    instalar: "npm install -g @google/gemini-cli",
    modelos: [
      { id: "gemini-2.5-pro", nome: "Gemini 2.5 Pro", raridade: "epica", poder: 5, velocidade: 3, custo: 4, dica: "Contextos longos e documentos grandes." },
      { id: "gemini-2.5-flash", nome: "Gemini 2.5 Flash", raridade: "rara", poder: 3, velocidade: 5, custo: 2, dica: "Rápido, para volume alto." },
    ],
  },
]

export const RARIDADE: Record<Raridade, { nome: string; estrelas: number }> = {
  comum: { nome: "Comum", estrelas: 1 },
  rara: { nome: "Rara", estrelas: 2 },
  epica: { nome: "Épica", estrelas: 3 },
  lendaria: { nome: "Lendária", estrelas: 4 },
}

export const cliPorId = (id: string): Cli => CLIS.find((c) => c.id === id) ?? CLIS[0]

/** A CLI dona de um modelo da lista, se houver. */
export const cliDoModelo = (modelo: string): Cli | undefined => CLIS.find((c) => c.modelos.some((m) => m.id === modelo))

/** O modelo da lista ou, para um nome livre, um modelo com atributos medianos (RN 11). */
export function modeloPorId(cli: CliId, id: string): Modelo {
  const m = cliPorId(cli).modelos.find((x) => x.id === id)
  return m ?? { id, nome: id, raridade: "rara", poder: 3, velocidade: 3, custo: 3, dica: "Modelo informado por você." }
}

/** Situação de uma CLI no computador, descoberta pelo núcleo. */
export interface CliInstalada {
  id: CliId
  instalada: boolean
  versao?: string
  /** Em que ambiente foi procurada: "local" ou "wsl:<distro>". */
  ambiente: string
}
