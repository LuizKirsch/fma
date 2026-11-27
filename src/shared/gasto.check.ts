// Self-check do gasto por carta. Rodar: node --experimental-strip-types src/shared/gasto.check.ts
import assert from "node:assert/strict"
import { gastoPorCarta } from "./gasto.ts"
import type { EventoTask } from "./task.ts"

const ev = (id: string, de: string | null, tokens: number | null, tipo: EventoTask["tipo"] = "entrega"): EventoTask =>
  ({ id, taskId: "t", tipo, deCartaId: de, paraCartaId: null, texto: "", tokens, criadoEm: 0 })

const g = gastoPorCarta([ev("1", "a", 10, "plano"), ev("2", "b", 50), ev("3", "a", 5), ev("4", "b", null), ev("5", "a", 0), ev("6", null, 1, "console")])
assert.deepEqual(g.map((x) => [x.cartaId, x.total]), [["b", 50], ["a", 15], [null, 1]])
assert.deepEqual(g[1].etapas.map((e) => e.id), ["1", "3"]) // ordem de acontecimento; sem tokens fica de fora
assert.deepEqual(gastoPorCarta([]), [])
console.log("gasto.check ok")
