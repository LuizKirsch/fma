// Self-check do gasto por carta. Rodar: node --experimental-strip-types src/shared/gasto.check.ts
import assert from "node:assert/strict"
import { gastoPorCarta, sugestoesDeModelo } from "./gasto.ts"
import type { EventoTask } from "./task.ts"

const ev = (id: string, de: string | null, tokens: number | null, tipo: EventoTask["tipo"] = "entrega"): EventoTask =>
  ({ id, taskId: "t", tipo, deCartaId: de, paraCartaId: null, texto: "", tokens, criadoEm: 0 })

const g = gastoPorCarta([ev("1", "a", 10, "plano"), ev("2", "b", 50), ev("3", "a", 5), ev("4", "b", null), ev("5", "a", 0), ev("6", null, 1, "console")])
assert.deepEqual(g.map((x) => [x.cartaId, x.total]), [["b", 50], ["a", 15], [null, 1]])
assert.deepEqual(g[1].etapas.map((e) => e.id), ["1", "3"]) // ordem de acontecimento; sem tokens fica de fora
assert.deepEqual(gastoPorCarta([]), [])
// Sugestão de modelo mais barato
const tc = (cartaId: string, classe: string, cli: "claude" | "codex" | "gemini", modelo: string) =>
  ({ cartaId, copia: { nome: cartaId, classe, simbolo: "", cor: "", cli, modelo, metodos: [], skills: [], prompt: "" } })
const gs = (...p: [string, number][]) => p.map(([cartaId, total]) => ({ cartaId, total, etapas: [] }))
const cartas = [tc("rev", "revisor", "claude", "claude-opus-5-5"), tc("dev", "dev", "claude", "claude-opus-5-5"), tc("qa", "teste", "claude", "claude-sonnet-5-5"),
  tc("seg", "seguranca", "codex", "gpt-5"), tc("pq", "revisor", "claude", "claude-opus-5-5"), tc("liv", "revisor", "claude", "modelo-livre")]
const s = sugestoesDeModelo(gs(["dev", 600], ["rev", 300], ["qa", 200], ["seg", 250], ["pq", 10], ["liv", 90]), cartas as never)
assert.deepEqual(s.map((x) => [x.cartaId, x.para.id]), [["rev", "claude-sonnet-5-5"], ["seg", "gpt-5-mini"]]) // dev nunca; qa já é intermediário; pq é fatia pequena; modelo livre ignorado
assert.deepEqual([s[0].ecoMin, s[0].ecoMax, s[1].ecoMin, s[1].ecoMax], [15, 35, 30, 70])
assert.equal(sugestoesDeModelo(gs(["pq", 50_000], ["dev", 5_000_000]), cartas as never).length, 1) // >= 50 mil conta mesmo com fatia pequena
assert.deepEqual(sugestoesDeModelo([], []), [])
assert.deepEqual(sugestoesDeModelo(gs(["orq", 900_000]), [tc("orq", "orquestrador", "claude", "claude-opus-5-5")] as never), []) // o Orquestrador planeja tudo: nunca sugerir
console.log("gasto.check ok")
