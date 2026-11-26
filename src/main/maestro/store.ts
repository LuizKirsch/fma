/** Persistência do chat do Maestro (tabela mensagem_chat). */
import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"
import type { AcaoChamado, MensagemChat, TipoMensagem, TipoProposta } from "@shared/maestro"
import { chamadosResolvidosFora } from "./chamado"

type Linha = Record<string, unknown>

const deLinha = (l: Linha): MensagemChat => ({
  id: l.id as string,
  projetoId: l.projeto_id as string,
  taskId: (l.task_id as string) ?? null,
  autor: l.autor as "voce" | "maestro",
  texto: l.texto as string,
  tipo: (l.tipo as TipoMensagem) ?? null,
  acoes: JSON.parse(l.acoes as string) as AcaoChamado[],
  resolvida: !!l.resolvida,
  propostaTipo: (l.proposta_tipo as TipoProposta) ?? null,
  propostaTexto: (l.proposta_texto as string) ?? null,
  propostaCartaId: (l.proposta_carta_id as string) ?? null,
  artefatoId: (l.artefato_id as string) ?? null,
  lida: !!l.lida,
  criadoEm: l.criado_em as number,
})

export type NovaMensagem = Partial<Omit<MensagemChat, "id" | "criadoEm" | "projetoId" | "autor" | "texto">> &
  Pick<MensagemChat, "projetoId" | "autor" | "texto">

export function gravarMensagem(db: DatabaseSync, n: NovaMensagem): MensagemChat {
  const m: MensagemChat = {
    taskId: null, tipo: null, acoes: [], resolvida: false, propostaTipo: null, propostaTexto: null,
    propostaCartaId: null, artefatoId: null,
    lida: n.autor === "voce", // do Maestro nasce não lida; quem responde ao vivo passa lida: true
    ...n, id: randomUUID(), criadoEm: Date.now(),
  }
  db.prepare(
    `INSERT INTO mensagem_chat (id, projeto_id, task_id, autor, texto, tipo, acoes, resolvida, proposta_tipo,
       proposta_texto, proposta_carta_id, artefato_id, lida, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(m.id, m.projetoId, m.taskId, m.autor, m.texto, m.tipo, JSON.stringify(m.acoes), m.resolvida ? 1 : 0,
    m.propostaTipo, m.propostaTexto, m.propostaCartaId, m.artefatoId, m.lida ? 1 : 0, m.criadoEm)
  return m
}

export const buscarMensagem = (db: DatabaseSync, id: string): MensagemChat | undefined => {
  const l = db.prepare("SELECT * FROM mensagem_chat WHERE id = ?").get(id) as Linha | undefined
  return l && deLinha(l)
}

export const listarMensagens = (db: DatabaseSync, projetoId: string): MensagemChat[] =>
  (db.prepare("SELECT * FROM mensagem_chat WHERE projeto_id = ? ORDER BY criado_em, rowid").all(projetoId) as Linha[]).map(deLinha)

/** Tira os botões do chamado e marca como resolvido. */
export function resolverMensagem(db: DatabaseSync, id: string): MensagemChat | undefined {
  db.prepare("UPDATE mensagem_chat SET resolvida = 1, acoes = '[]' WHERE id = ?").run(id)
  return buscarMensagem(db, id)
}

/** RF 7.21: resolve os chamados abertos do projeto (ou só da task) e devolve os alterados. */
export function resolverForaDoChat(db: DatabaseSync, projetoId: string, taskId?: string): MensagemChat[] {
  return chamadosResolvidosFora(listarMensagens(db, projetoId), projetoId, taskId).map((m) => resolverMensagem(db, m.id)!)
}

export function naoLidas(db: DatabaseSync, projetoId: string): number {
  return Number((db.prepare("SELECT COUNT(*) n FROM mensagem_chat WHERE projeto_id = ? AND autor = 'maestro' AND lida = 0").get(projetoId) as { n: number }).n)
}

export const marcarLidas = (db: DatabaseSync, projetoId: string) =>
  void db.prepare("UPDATE mensagem_chat SET lida = 1 WHERE projeto_id = ? AND lida = 0").run(projetoId)

export const apagarChatDoProjeto = (db: DatabaseSync, projetoId: string) => {
  db.prepare("DELETE FROM mensagem_chat WHERE projeto_id = ?").run(projetoId)
  db.prepare("DELETE FROM maestro_sessao WHERE projeto_id = ?").run(projetoId)
}

/** Task excluída: as mensagens ficam, sem a ligação (SET NULL do vault). */
export const desligarTask = (db: DatabaseSync, taskId: string) => {
  db.prepare("UPDATE mensagem_chat SET task_id = NULL WHERE task_id = ?").run(taskId)
  db.prepare("DELETE FROM maestro_aviso WHERE task_id = ?").run(taskId)
}

/** Registra um aviso; true só na primeira vez (RF 6.40: avisar uma vez). */
export const registrarAviso = (db: DatabaseSync, taskId: string, tipo: string): boolean =>
  Number(db.prepare("INSERT OR IGNORE INTO maestro_aviso (task_id, tipo) VALUES (?, ?)").run(taskId, tipo).changes) > 0

export const lerSessao = (db: DatabaseSync, projetoId: string, cli: string): string | null => {
  const l = db.prepare("SELECT cli, sessao FROM maestro_sessao WHERE projeto_id = ?").get(projetoId) as { cli: string; sessao: string } | undefined
  return l && l.cli === cli ? l.sessao : null
}

export const gravarSessao = (db: DatabaseSync, projetoId: string, cli: string, sessao: string) =>
  void db.prepare("INSERT OR REPLACE INTO maestro_sessao (projeto_id, cli, sessao) VALUES (?,?,?)").run(projetoId, cli, sessao)
