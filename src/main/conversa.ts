/**
 * Conversa direta com a carta (sem o Maestro). A carta responde pela própria CLI, em modo não interativo.
 * - Task em andamento com a carta: nada roda; o pedido vira apontamento dela e entra na Crônica.
 * - Senão: roda no worktree de uma task dela, se existir; sem worktree, no repositório do projeto, só leitura.
 * Registre com `registrarIpcConversa(db)`: canais conversa:listar(cartaId), conversa:enviar(cartaId, projetoId, texto).
 */
import { ipcMain } from "electron"
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { LOCAL, paraFs } from "./ambiente"
import type { DatabaseSync } from "node:sqlite"
import type { MensagemDireta } from "@shared/conversa"
import type { Resultado } from "@shared/tipos"
import { listarCartas } from "./cartas"
import { apontarParaCarta } from "./motor/motor"
import { contaDaCarta, envDaConta, faltaConta } from "./contas"
import { rodarCli } from "./motor/processo"

const listar = (db: DatabaseSync, cartaId: string): MensagemDireta[] =>
  (db.prepare("SELECT * FROM conversa_direta WHERE carta_id = ? ORDER BY criada_em, rowid").all(cartaId) as any[])
    .map((l) => ({ id: l.id, cartaId: l.carta_id, taskId: l.task_id, de: l.de, texto: l.texto, criadaEm: l.criada_em }))

const guardar = (db: DatabaseSync, cartaId: string, taskId: string | null, de: "voce" | "carta", texto: string) =>
  db.prepare("INSERT INTO conversa_direta (id, carta_id, task_id, de, texto, criada_em) VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), cartaId, taskId, de, texto, Date.now())

export async function enviarParaCarta(db: DatabaseSync, cartaId: string, projetoId: string, texto: string): Promise<Resultado<MensagemDireta[]>> {
  texto = texto.trim()
  const carta = listarCartas(db).find((c) => c.id === cartaId)
  if (!carta) return { ok: false, erro: "Carta não encontrada." }
  if (!texto) return { ok: false, erro: "Escreva uma mensagem." }
  const doProjeto = (situacoes: string) => db.prepare(
    `SELECT t.id, t.numero, t.worktree FROM task t JOIN task_carta tc ON tc.task_id = t.id AND tc.carta_id = ? AND tc.retirada = 0
     WHERE t.projeto_id = ? AND t.situacao IN (${situacoes}) ORDER BY t.numero DESC`).all(cartaId, projetoId) as { id: string; numero: number; worktree: string | null }[]

  const ativa = doProjeto("'andamento','aguardando'")[0]
  guardar(db, cartaId, ativa?.id ?? null, "voce", texto)
  if (ativa) {
    apontarParaCarta(db, ativa.id, cartaId, texto)
    guardar(db, cartaId, ativa.id, "carta", `Estou na Task #${ativa.numero}. Anotei seu pedido como apontamento e levo em conta na minha próxima volta.`)
    return { ok: true, valor: listar(db, cartaId) }
  }

  const p = db.prepare("SELECT repositorio, ambiente FROM projeto WHERE id = ?").get(projetoId) as { repositorio: string; ambiente: string } | undefined
  const amb = p?.ambiente ?? LOCAL
  const comTree = doProjeto("'pronta','parada','concluida'").find((t) => t.worktree && existsSync(paraFs(amb, t.worktree)))
  const cwd = comTree?.worktree ?? p?.repositorio
  if (!cwd || !existsSync(paraFs(amb, cwd))) return { ok: false, erro: "Não achei a pasta do projeto para a carta trabalhar." }

  const historico = listar(db, cartaId).slice(-21, -1).map((m) => `${m.de === "voce" ? "Usuário" : "Você"}: ${m.texto}`).join("\n")
  const prompt = [
    carta.prompt,
    `---\n# Conversa direta\nO usuário fala com você fora de qualquer task. Responda de forma curta e direta.${comTree ? "" : " Você está no repositório do projeto, só para leitura: não altere arquivos."}`,
    historico && `## Conversa até aqui\n${historico}`,
    `## Mensagem do usuário\n${texto}`,
  ].filter(Boolean).join("\n\n")
  const conta = contaDaCarta(db, carta.cli, carta.contaId, amb)
  if (!conta && amb !== LOCAL) return { ok: false, erro: faltaConta(`${carta.nome} (${carta.cli})`, amb) }
  const r = await rodarCli(carta.cli, carta.modelo, prompt, cwd, () => {}, [], !comTree, { env: envDaConta(conta), esforco: carta.esforco, ambiente: amb }).resultado
  guardar(db, cartaId, null, "carta", r.erro ? `Não consegui responder: ${r.erro}` : r.texto.trim() || "(sem resposta)")
  return { ok: true, valor: listar(db, cartaId) }
}

export function registrarIpcConversa(db: DatabaseSync) {
  ipcMain.handle("conversa:listar", (_e, cartaId: string) => listar(db, cartaId))
  ipcMain.handle("conversa:enviar", (_e, cartaId: string, projetoId: string, texto: string) => enviarParaCarta(db, cartaId, projetoId, texto))
}
