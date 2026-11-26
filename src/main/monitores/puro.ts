/** Lógica pura dos monitores (sem banco, sem rede): testada em scripts/selfcheck-integracoes.mjs. */

/** Marca que o FMA põe nos comentários que escreve no card, para separar a resposta do usuário. */
export const MARCADOR = "[FMA]"

/** Consulta do GitHub Projects: "<dono>/<número do projeto>:<coluna>". */
export function parseConsulta(consulta: string): { dono: string; numero: number; coluna: string } | null {
  const m = consulta.trim().match(/^([\w.-]+)\/(\d+):\s*(.+)$/)
  return m ? { dono: m[1], numero: Number(m[2]), coluna: m[3].trim() } : null
}

export const mesmaColuna = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** RF 5.20: a resposta é o que foi escrito no card depois do último comentário do FMA (ou tudo, se o FMA não comentou). */
export function respostaDoCard(comentarios: string[]): string {
  const i = comentarios.map((c) => c.includes(MARCADOR)).lastIndexOf(true)
  return comentarios.slice(i + 1).map((c) => c.trim()).filter(Boolean).join("\n\n")
}

/** RF 5.21 / RN 51: motivo para não criar tasks, ou null se pode. */
export function motivoSemMesa(mesa: { cartas: number; fluxoValido: boolean; erro?: string }, inicioAutomatico: boolean): string | null {
  if (mesa.cartas === 0) return "A mesa do projeto está sem cartas: nenhuma task foi criada."
  if (inicioAutomatico && !mesa.fluxoValido) return `O fluxo da mesa tem erro${mesa.erro ? ` (${mesa.erro})` : ""}: com início automático, nenhuma task foi criada.`
  return null
}
