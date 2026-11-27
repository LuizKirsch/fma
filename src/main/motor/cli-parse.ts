/**
 * Lê a saída das CLIs (sem processos, sem imports: testável direto).
 * - claude -p --output-format stream-json --verbose: linhas JSON; a última `result` traz o texto e o uso.
 * - codex exec --json: linhas JSON; `item.completed` com agent_message e `turn.completed` com o uso.
 * - gemini -p: texto puro; sem contagem de tokens, então estimamos (1 token ~ 4 caracteres).
 */
export interface Saida { texto: string; tokens: number; erro: string | null; sessao?: string }

const json = (l: string): any => { try { return JSON.parse(l) } catch { return null } }

export function lerSaida(cli: string, bruto: string, entrada = ""): Saida {
  const linhas = bruto.split(/\r?\n/).filter((l) => l.trim())
  if (cli === "claude") {
    const r = linhas.map(json).reverse().find((j) => j?.type === "result")
    if (!r) return { texto: "", tokens: 0, erro: "A CLI não devolveu resultado." }
    const u = r.usage ?? {}
    const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
    return { texto: String(r.result ?? ""), tokens, ...(r.session_id ? { sessao: String(r.session_id) } : {}), erro: r.is_error ? String(r.result || "Erro na CLI.") : null }
  }
  if (cli === "codex") {
    let texto = "", tokens = 0, erro: string | null = null
    for (const j of linhas.map(json)) {
      if (j?.type === "item.completed" && j.item?.type === "agent_message") texto = String(j.item.text ?? "")
      else if (j?.type === "turn.completed") tokens += (j.usage?.input_tokens ?? 0) + (j.usage?.output_tokens ?? 0)
      else if (j?.type === "error" || j?.type === "turn.failed") erro = String(j.message ?? j.error?.message ?? "Erro na CLI.")
    }
    return { texto, tokens, erro: texto ? null : erro ?? "A CLI não devolveu resposta." }
  }
  const texto = bruto.trim()
  return { texto, tokens: Math.ceil((entrada.length + texto.length) / 4), erro: texto ? null : "A CLI não devolveu resposta." }
}

/** O primeiro texto da entrada da ferramenta (command, file_path, pattern...) em vez do JSON escapado. */
const resumoFerramenta = (input: unknown): string => {
  const v = Object.values(input ?? {}).find((x) => typeof x === "string") as string | undefined
  return (v ?? JSON.stringify(input) ?? "").replace(/\s+/g, " ").slice(0, 200)
}

/** Uma linha de console legível a partir de uma linha da saída em streaming. */
export function linhaDeConsole(cli: string, linha: string): string | null {
  if (cli === "gemini") return linha
  const j = json(linha)
  if (!j) return linha
  if (cli === "claude") {
    if (j.type === "assistant") {
      return (j.message?.content ?? [])
        .map((b: any) => (b.type === "text" ? b.text : b.type === "tool_use" ? `[${b.name}] ${resumoFerramenta(b.input)}` : ""))
        .filter(Boolean).join("\n") || null
    }
    return null
  }
  if (j.type === "item.completed") return j.item?.text ?? (j.item?.command ? `[${j.item.type}] ${j.item.command}` : null)
  return null
}

const LINHA_STATUS = /^[ \t]*FMA-STATUS:[ \t]*(ok|bloqueado)(?:[ \t]*:[ \t]*(.*))?$/gim
const SINAIS = /não consegui rodar|pediu aprovação|requires? approval|permission denied|não foi testad|precisa de decisão|decisão sua/i

/** Protocolo de status da carta: linha FMA-STATUS (a última vale) ou, sem ela, sinais claros no texto. */
export function statusDaEntrega(texto: string): { status: "ok" | "bloqueado"; motivo?: string } {
  const m = [...texto.matchAll(LINHA_STATUS)].pop()
  if (m?.[1].toLowerCase() === "bloqueado") return { status: "bloqueado", motivo: m[2]?.trim() || "sem motivo informado" }
  const linha = semLinhaStatus(texto).split(/\r?\n/).find((l) => SINAIS.test(l))
  return linha ? { status: "bloqueado", motivo: linha.trim().slice(0, 200) } : { status: "ok" } // ponytail: heurística pode dar falso positivo; o usuário escolhe "seguir"
}

/** O texto sem a linha FMA-STATUS (é o que vai para a próxima carta e para a Crônica). */
export const semLinhaStatus = (texto: string) => texto.replace(LINHA_STATUS, "").trimEnd()

/** Primeiro objeto JSON de um texto (com ou sem cerca de código). */
export function extrairJson(texto: string): any | null {
  const cerca = texto.match(/```(?:json)?\s*([\s\S]*?)```/)
  for (const candidato of [cerca?.[1], texto]) {
    if (!candidato) continue
    const ini = candidato.indexOf("{")
    for (let fim = candidato.lastIndexOf("}"); fim > ini && ini >= 0; fim = candidato.lastIndexOf("}", fim - 1)) {
      const j = json(candidato.slice(ini, fim + 1))
      if (j) return j
    }
  }
  return null
}

/** Decisões do usuário nas travas: uma linha cada; entram no prompt de todas as cartas da task. */
const resumo = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 160)
export const decisaoResposta = (motivo: string, resposta: string) => `- Sobre "${resumo(motivo)}": ${resposta.trim()}`
export const decisaoSeguir = (motivo: string) => `- O usuário aceitou seguir sem resolver: "${resumo(motivo)}". Não trave de novo por isso; entregue com a ressalva.`
export const secaoDecisoes = (decisoes: string) => decisoes.trim()
  ? `## Decisões do usuário nesta task (valem para todas as cartas)\n${decisoes.trim()}\nNão use FMA-STATUS: bloqueado por motivo já decidido aqui (entregue com a ressalva). O Revisor não devolve a entrega por isso.`
  : ""
