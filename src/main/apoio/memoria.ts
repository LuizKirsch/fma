/**
 * Memória do projeto, simples: lista de notas (glossário, regras, decisões) por projeto.
 * Quem tem a carta de apoio Memória ligada recebe as notas no começo do prompt (ferramentas.ts#contexto).
 */
import type { DatabaseSync } from "node:sqlite"

export interface ItemMemoria { id: string; projetoId: string; titulo: string; texto: string; criadoEm: number }

export const listarMemoria = (db: DatabaseSync, projetoId: string): ItemMemoria[] =>
  (db.prepare("SELECT * FROM memoria_item WHERE projeto_id=? ORDER BY criado_em, rowid").all(projetoId) as { id: string; projeto_id: string; titulo: string; texto: string; criado_em: number }[])
    .map((r) => ({ id: r.id, projetoId: r.projeto_id, titulo: r.titulo, texto: r.texto, criadoEm: r.criado_em }))

export function salvarMemoria(db: DatabaseSync, projetoId: string, titulo: string, texto: string, id?: string): ItemMemoria | string {
  if (!titulo.trim() || !texto.trim()) return "Preencha o título e o texto."
  const item: ItemMemoria = { id: id ?? crypto.randomUUID(), projetoId, titulo: titulo.trim(), texto: texto.trim(), criadoEm: Date.now() }
  if (id) db.prepare("UPDATE memoria_item SET titulo=?, texto=? WHERE id=? AND projeto_id=?").run(item.titulo, item.texto, id, projetoId)
  else db.prepare("INSERT INTO memoria_item VALUES (?,?,?,?,?)").run(item.id, projetoId, item.titulo, item.texto, item.criadoEm)
  return item
}

export const excluirMemoria = (db: DatabaseSync, id: string) => void db.prepare("DELETE FROM memoria_item WHERE id=?").run(id)

export const textoMemoria = (db: DatabaseSync, projetoId: string): string =>
  listarMemoria(db, projetoId).map((i) => `### ${i.titulo}\n${i.texto}`).join("\n\n")
