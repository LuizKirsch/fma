/** "Lembrar no projeto": transforma uma decisão numa regra do contexto do projeto e reconhece travas repetidas. */

const SECAO = "## Regras aprendidas"

const palavras = (t: string) =>
  new Set(t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\d+/g, " ").split(/[^a-z]+/).filter((p) => p.length > 2))

/** Dois motivos de trava são "o mesmo" quando ≥ 60% das palavras do menor aparecem no outro. */
export function motivosParecidos(a: string, b: string): boolean {
  const pa = palavras(a), pb = palavras(b)
  const menor = Math.min(pa.size, pb.size)
  if (!menor) return false
  let comum = 0
  for (const p of pa) if (pb.has(p)) comum++
  return comum / menor >= 0.6
}

/** Quantos dos motivos antigos são parecidos com o atual. */
export const vezesQueApareceu = (motivo: string, antigos: string[]) => antigos.filter((m) => motivosParecidos(motivo, m)).length

/** Linha sugerida; sem resposta, assume "Seguir mesmo assim". */
export function sugerirRegra(motivo: string, resposta: string): string {
  const resumo = motivo.trim().split(/(?<=[.!?])\s/)[0].replace(/[.:;\s]+$/, "").slice(0, 160)
  const fazer = resposta.trim().replace(/[.\s]+$/, "") || "siga sem bloquear e registre no relatório"
  return `- Quando ${resumo}: ${fazer}.`
}

/** Acrescenta a regra ao fim da seção "Regras aprendidas" (cria a seção se faltar). */
export function acrescentarRegra(contexto: string, regra: string): string {
  const base = contexto.trimEnd()
  const i = base.indexOf(SECAO)
  if (i < 0) return `${base}${base ? "\n\n" : ""}${SECAO}\n${regra.trim()}\n`
  // a seção vai até o próximo título "## "; a regra entra no fim dela
  const fim = base.slice(i + SECAO.length).search(/\n## /)
  const corte = fim < 0 ? base.length : i + SECAO.length + fim
  return `${base.slice(0, corte).trimEnd()}\n${regra.trim()}\n${base.slice(corte)}`.trimEnd() + "\n"
}
