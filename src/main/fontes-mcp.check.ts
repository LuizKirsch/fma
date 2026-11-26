// Self-check da descoberta de ferramentas: node --experimental-strip-types src/main/fontes-mcp.check.ts
import assert from "node:assert/strict"
import { argumentosDe, camposDeFiltro, mapearFerramentas, type FerramentaDoServidor } from "../shared/fonte.ts"

const str = { type: "string" }, opc = { anyOf: [{ type: "string" }, { type: "null" }] }
const t = (name: string, properties: Record<string, object> = {}, required?: string[]): FerramentaDoServidor => ({ name, inputSchema: { properties, required } })
// Servidor Lupito-Tools (recorte do tools/list real)
const lupito = [
  t("ping"), t("obter_anexo", { anexo_id: str }, ["anexo_id"]), t("obter_demanda", { referencia: str }, ["referencia"]),
  t("criar_demanda", { titulo: str }, ["titulo"]), t("mover_demanda_kanban", { demanda_id: str, coluna: opc }, ["demanda_id"]),
  t("historico_movimentacoes", { movido_por: opc }), t("buscar_bugs", { dev: opc }),
  t("buscar_demandas", { pessoa: opc, dev: opc, qa: opc, analista: opc, projeto: opc, data_inicio: opc, limite: { type: "integer" }, pagina: { type: "integer" } }),
  t("comentar_demanda", { referencia: str, corpo: str }, ["referencia", "corpo"]), t("comentar_melhoria", { melhoria_id: str, corpo: str }, ["melhoria_id", "corpo"]),
] as FerramentaDoServidor[]
const m = mapearFerramentas(lupito)
assert.deepEqual(m, { lista: "buscar_demandas", detalhe: "obter_demanda", mover: "mover_demanda_kanban", comentar: "comentar_demanda" })
const by = (n: string) => lupito.find((x) => x.name === n)
assert.deepEqual(argumentosDe(by("obter_demanda")), { id: "referencia", coluna: undefined, texto: undefined })
assert.deepEqual(argumentosDe(by("mover_demanda_kanban")), { id: "demanda_id", coluna: "coluna", texto: undefined })
assert.deepEqual(argumentosDe(by("comentar_demanda")), { id: "referencia", coluna: undefined, texto: "corpo" })
assert.deepEqual(camposDeFiltro(by("buscar_demandas")).map((c) => c.nome), ["pessoa", "dev", "qa", "analista", "projeto", "data_inicio"])
// Outros nomes: Jira-like em inglês; sem ferramenta, "—" (undefined)
assert.deepEqual(mapearFerramentas([t("list_projects"), t("search_issues"), t("get_issue", { issueKey: str }, ["issueKey"]), t("transition_issue"), t("add_comment")]),
  { lista: "search_issues", detalhe: "get_issue", mover: "transition_issue", comentar: "add_comment" })
assert.deepEqual(mapearFerramentas([t("ping")]), {})
console.log("fontes-mcp.check: ok")
