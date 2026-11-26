/**
 * Confirmar uma escrita pendente (RF 4.17): executa a ação e só então marca "confirmado".
 * Se a execução falhar, a escrita continua pendente (o usuário pode tentar de novo ou descartar).
 * Descartar e propor ficam em artefatos.ts.
 */
import type { DatabaseSync } from "node:sqlite"
import { proximaSituacao, type Artefato } from "@shared/apoio"
import { artefatoPorId, mudarSituacao } from "./artefatos"
import { cartaApoioPorId } from "./repo"
import { chamarFerramenta } from "./mcp"
import { depsApoio, emitirApoio } from "./ports"

const emExecucao = new Set<string>()

export async function confirmar(db: DatabaseSync, id: string): Promise<{ ok: true; valor: Artefato } | { ok: false; erro: string }> {
  const a = artefatoPorId(db, id)
  if (!a) return { ok: false, erro: "Escrita não encontrada." }
  if (!proximaSituacao(a.situacao, "confirmar")) return { ok: false, erro: "Esta escrita já foi decidida." }
  if (emExecucao.has(id)) return { ok: false, erro: "Esta escrita já está sendo executada." }
  emExecucao.add(id)
  try {
    let resultado: string
    const acao = a.acao
    if (!acao) throw new Error("A escrita não tem ação para executar.")
    if (acao.tipo === "mcp_chamar") {
      const mcp = cartaApoioPorId(db, a.cartaApoioId)?.mcp
      if (!mcp) throw new Error("A carta de apoio não tem servidor MCP configurado.")
      resultado = await chamarFerramenta(mcp, acao.ferramenta, acao.argumentos)
    } else throw new Error("Ação de escrita desconhecida.")
    mudarSituacao(db, id, "confirmado", `${a.texto}\n\n${resultado}`.trim())
    const r = artefatoPorId(db, id)!
    depsApoio().cronica(a.taskId, `Escrita confirmada: ${a.titulo}`)
    emitirApoio({ tipo: "escrita-resolvida", artefato: r })
    return { ok: true, valor: r }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  } finally {
    emExecucao.delete(id)
  }
}
