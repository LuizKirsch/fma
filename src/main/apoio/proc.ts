/** Roda um programa (git, gh) sem shell, no ambiente do projeto (RF 2.37). Devolve a saída ou lança Error com a mensagem do stderr. */
import { LOCAL, rodar } from "../ambiente"

export type Executar = (cmd: string, args: string[], opcoes?: { cwd?: string; input?: string; ambiente?: string }) => Promise<string>

export const executar: Executar = (cmd, args, opcoes = {}) => rodar(opcoes.ambiente ?? LOCAL, cmd, args, { cwd: opcoes.cwd, input: opcoes.input, timeout: 60_000 })
