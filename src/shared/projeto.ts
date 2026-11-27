/**
 * Projeto (módulo 2): o que a interface e o núcleo trocam sobre projetos e repositórios.
 * A mesa de cada projeto está em mesa.ts.
 */

export interface Vista { x: number; y: number; z: number }

export interface Projeto {
  id: string
  nome: string
  /** Pasta raiz do repositório git (RN 97). */
  repositorio: string
  branchBase: string
  /** Posição da aba. */
  ordem: number
  /** Tasks ao mesmo tempo (RN 18). */
  vagas: number
  /** Devoluções antes de a task parar (RN 19). */
  limiteDevolucoes: number
  /** Tokens por task (RN 94). */
  limiteTokens: number
  conexoesVisiveis: boolean
  mostrarSugestoes: boolean
  /** Posição e zoom da mesa; null até o usuário mexer. */
  vista: Vista | null
  criadoEm: number
  /** Contexto geral: vale para as tasks que ainda vão começar. */
  contexto: string
  fonteId: string | null
  /** Projeto na fonte (id e título). */
  fonteProjeto: { id: string; titulo: string } | null
  /** Onde o repositório está e onde as CLIs rodam: "local" ou "wsl:<distro>" (RF 2.37). No WSL, `repositorio` é caminho Linux. */
  ambiente: string
  /** Comandos que as cartas rodam sem pedir aprovação (padrões como "npm *"). O resto trava a task e chama o usuário. */
  comandos: string[]
  /** Pastas do repositório que o git não versiona e que o worktree liga por symlink/junção (ex. vendor, node_modules). */
  pastasCompartilhadas: string[]
  /** Comandos rodados no worktree logo depois de criá-lo, antes das cartas (ex. npm install, cp .env.example .env). */
  preparo: string[]
  /** Comando-modelo para rodar os testes da task (ex. docker exec -w /var/www/html/{worktree} app php artisan test {arquivos}); vazio = nenhum. */
  comandoTeste: string
}

export const PASTAS_PADRAO = ["vendor", "node_modules"]

/** Nome relativo, sem "..", sem caminho absoluto e que não seja .env. */
export const pastaValida = (p: string) => !!p && !/^([\\/]|[A-Za-z]:)/.test(p) && !p.split(/[\\/]/).some((s) => s === ".." || s.toLowerCase().startsWith(".env"))

/** Comuns de desenvolvimento; git só leitura (commit e push ficam com o FMA e com você). */
export const COMANDOS_PADRAO = [
  "node *", "npm *", "npx *", "pnpm *", "yarn *", "bun *",
  "python *", "python3 *", "py *", "pip *", "pytest *",
  "dotnet test *", "dotnet build *", "go test *", "go build *", "cargo test *", "cargo build *",
  "git status *", "git diff *", "git log *", "git show *",
]

export type AjustesProjeto = Pick<Projeto, "nome" | "repositorio" | "branchBase" | "vagas" | "limiteDevolucoes" | "limiteTokens" | "comandos" | "pastasCompartilhadas" | "preparo" | "comandoTeste">
export type PreferenciasMesa = Pick<Projeto, "conexoesVisiveis" | "mostrarSugestoes" | "vista">

export interface NovoProjeto {
  nome: string; repositorio: string; branchBase: string; cartaIds: string[]
  ambiente?: string
  contexto?: string
  fonteId?: string
  fonteProjeto?: { id: string; titulo: string }
  /** Tasks marcadas na fonte: viram tasks prontas (RF 2.xx). */
  tasks?: { ref: string; titulo: string; descricao: string }[]
}

/** Resultado de olhar uma pasta: a raiz do repositório e as branches locais. */
export interface Repositorio { raiz: string; branches: string[]; atual: string; ambiente: string }

/** Carta da coleção em uso numa mesa (RF 1.03). */
export interface UsoDaCarta { cartaId: string; projetoId: string }

export const PADRAO_PROJETO = { vagas: 2, limiteDevolucoes: 2, limiteTokens: 20_000 }
export const LIMITES_PROJETO = {
  vagas: { min: 1, max: 8 },
  limiteDevolucoes: { min: 1, max: 10 },
  limiteTokens: { min: 1_000, max: 2_000_000 },
}

const inteiroEm = (n: number, l: { min: number; max: number }) => Number.isInteger(n) && n >= l.min && n <= l.max

/** Primeira regra quebrada dos ajustes, ou null. A pasta e a branch são conferidas no núcleo, com o git. */
export function validarAjustes(a: AjustesProjeto): string | null {
  if (!a.nome.trim()) return "Dê um nome ao projeto."
  if (a.nome.trim().length > 80) return "O nome pode ter até 80 caracteres."
  if (!a.repositorio.trim()) return "Informe a pasta do repositório."
  if (!a.branchBase.trim()) return "Escolha a branch base."
  if (!inteiroEm(a.vagas, LIMITES_PROJETO.vagas)) return `As vagas vão de ${LIMITES_PROJETO.vagas.min} a ${LIMITES_PROJETO.vagas.max}.`
  if (!inteiroEm(a.limiteDevolucoes, LIMITES_PROJETO.limiteDevolucoes)) return `O limite de devoluções vai de ${LIMITES_PROJETO.limiteDevolucoes.min} a ${LIMITES_PROJETO.limiteDevolucoes.max}.`
  if (!inteiroEm(a.limiteTokens, LIMITES_PROJETO.limiteTokens)) return `O limite de tokens vai de ${LIMITES_PROJETO.limiteTokens.min} a ${LIMITES_PROJETO.limiteTokens.max}.`
  const ruim = (a.pastasCompartilhadas ?? []).map((p) => p.trim()).filter(Boolean).find((p) => !pastaValida(p))
  if (ruim) return `Pasta ligada inválida: "${ruim}". Use nomes relativos, sem "..", sem caminho absoluto e sem .env.`
  return null
}

/**
 * Expande o comando-modelo de teste: {worktree} vira o caminho do worktree relativo ao repositório (barras `/`).
 * `liberado` é o comando até antes de {arquivos} (o que vai no --allowedTools); `comando` tira o {arquivos}, para rodar tudo.
 */
export function comandoDeTeste(modelo: string, worktreeRelativo: string): { comando: string; liberado: string; expandido: string } {
  const m = modelo.trim().replace(/\{worktree\}/g, worktreeRelativo.replace(/\\/g, "/"))
  return { comando: m.replace(/\s*\{arquivos\}/g, "").trim(), liberado: m.split("{arquivos}")[0].trim(), expandido: m }
}
