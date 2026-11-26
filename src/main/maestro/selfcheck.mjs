// Self-check da lógica pura do Maestro. Rodar: node src/main/maestro/selfcheck.mjs
import assert from "node:assert/strict"
import { contarNaoLidas, chamadosResolvidosFora, deveAvisarTokens, estaAberto, extrairNovaTask, podeAgir, resolver, rotaAjuste, acharTask } from "./chamado.ts"

const base = { projetoId: "p", taskId: "t1", lida: false, resolvida: false, autor: "maestro", acoes: [{ id: "confirmar", rotulo: "Confirmar" }] }

// ciclo de vida do chamado
assert.ok(estaAberto(base) && podeAgir(base, "confirmar") && !podeAgir(base, "parar"))
const feito = resolver(base)
assert.ok(!estaAberto(feito) && feito.acoes.length === 0 && !podeAgir(feito, "confirmar"))
assert.ok(!estaAberto({ ...base, autor: "voce" }))

// não lidas: só Maestro, só do projeto
const ms = [base, { ...base, lida: true }, { ...base, autor: "voce", lida: false }, { ...base, projetoId: "outro" }]
assert.equal(contarNaoLidas(ms, "p"), 1)
assert.equal(contarNaoLidas(ms), 2)

// resolver fora
assert.equal(chamadosResolvidosFora([base, { ...base, taskId: "t2" }, feito], "p", "t1").length, 1)
assert.equal(chamadosResolvidosFora([base, { ...base, taskId: "t2" }], "p").length, 2)

// ajuste por situação
assert.deepEqual(["pronta", "fila", "andamento", "aguardando", "concluida", "parada"].map(rotaAjuste),
  ["anotar", "anotar", "repassar", "repassar", "abrir_task", "recusar"])

// nova task e limite de tokens
assert.equal(extrairNovaTask("Nova task: corrigir login"), "corrigir login")
assert.equal(extrairNovaTask("nova task:  "), null)
assert.equal(extrairNovaTask("crie uma nova task"), null)
assert.ok(deveAvisarTokens(101, 100, false) && !deveAvisarTokens(100, 100, false) && !deveAvisarTokens(500, 100, true) && !deveAvisarTokens(500, null, false))

// busca de task
const ts = [{ id: "a", referencia: "ABC-1", numero: 3 }]
assert.equal(acharTask(ts, "abc-1")?.id, "a")
assert.equal(acharTask(ts, "#3")?.id, "a")
assert.equal(acharTask(ts, "x"), undefined)

console.log("maestro: ok")
