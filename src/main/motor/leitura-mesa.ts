/**
 * Único ponto onde o motor lê projeto, mesa e conexões (módulos 2 e 3, feitos na E1).
 * Nomes de tabela e coluna seguem as entidades do vault: projeto, carta_mesa, conexao,
 * conexao_skill (conexao_id, chave); o catálogo de skills de conexão vem de shared/mesa.ts.
 * Se a E1 nomeou algo diferente, só este arquivo muda.
 */
import { COMANDOS_PADRAO } from "@shared/projeto"
import type { DatabaseSync } from "node:sqlite"
import { listarCartas } from "../cartas"
import type { Carta } from "@shared/tipos"
import { skillConexao } from "@shared/mesa"

export interface ProjetoLido {
  id: string
  nome: string
  repositorio: string
  ambiente: string
  comandos: string[]
  branchBase: string
  limiteDevolucoes: number
  limiteTokens: number
  vagas: number
  contexto: string
}
export interface ConexaoLida {
  deCartaId: string
  paraCartaId: string
  tipo: "entrega" | "questiona"
  ordem: number
  /** Chaves das skills da conexão. */
  skills: string[]
}

export function lerProjeto(db: DatabaseSync, id: string): ProjetoLido | null {
  const p = db.prepare("SELECT id, nome, repositorio, ambiente, branch_base, limite_devolucoes, limite_tokens, vagas, contexto, comandos FROM projeto WHERE id = ?").get(id) as
    | { id: string; nome: string; repositorio: string; ambiente: string; branch_base: string; limite_devolucoes: number; limite_tokens: number; vagas: number; contexto: string; comandos: string | null }
    | undefined
  return p ? { id: p.id, nome: p.nome, repositorio: p.repositorio, ambiente: p.ambiente, branchBase: p.branch_base, limiteDevolucoes: p.limite_devolucoes, limiteTokens: p.limite_tokens, vagas: p.vagas, contexto: p.contexto, comandos: p.comandos ? JSON.parse(p.comandos) : COMANDOS_PADRAO } : null
}

/** Cartas na mesa do projeto, na ordem da coleção. */
export function lerCartasDaMesa(db: DatabaseSync, projetoId: string): Carta[] {
  const ids = new Set((db.prepare("SELECT carta_id FROM carta_mesa WHERE projeto_id = ?").all(projetoId) as { carta_id: string }[]).map((r) => r.carta_id))
  return listarCartas(db).filter((c) => ids.has(c.id))
}

export function lerConexoes(db: DatabaseSync, projetoId: string): ConexaoLida[] {
  const linhas = db.prepare("SELECT id, de_carta_id, para_carta_id, tipo, ordem FROM conexao WHERE projeto_id = ? ORDER BY ordem").all(projetoId) as {
    id: string; de_carta_id: string; para_carta_id: string; tipo: string; ordem: number
  }[]
  const skills = db.prepare("SELECT chave FROM conexao_skill WHERE conexao_id = ?")
  return linhas.map((l) => ({
    deCartaId: l.de_carta_id, paraCartaId: l.para_carta_id, tipo: l.tipo as "entrega" | "questiona", ordem: l.ordem,
    skills: (skills.all(l.id) as { chave: string }[]).map((s) => s.chave),
  }))
}

/** A pergunta de uma skill de conexão Questiona (catálogo em shared/mesa.ts, RF 6.24). */
export function perguntaDaSkill(chave: string): string {
  const k = skillConexao(chave)
  return k?.pergunta ?? (k ? `${k.nome}: ${k.descricao}` : `Sobre "${chave}": o que foi feito atende a isto? Explique.`)
}
