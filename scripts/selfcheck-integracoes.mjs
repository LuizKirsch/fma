// Self-check da lógica pura de apoio e monitores. Rodar: node scripts/selfcheck-integracoes.mjs (Node 24 lê .ts direto).
import assert from "node:assert/strict"
import { proximaSituacao, montarCorpoPr, numeroDaUrl, tipoApoio } from "../src/shared/apoio.ts"
import { cardsNovos } from "../src/shared/monitor.ts"
import { parseConsulta, respostaDoCard, motivoSemMesa, MARCADOR } from "../src/main/monitores/puro.ts"

// escrita pendente: só pendente muda; decidida não volta
assert.equal(proximaSituacao("pendente", "confirmar"), "confirmado")
assert.equal(proximaSituacao("pendente", "descartar"), "descartado")
for (const s of ["registrado", "confirmado", "descartado"]) for (const e of ["confirmar", "descartar"]) assert.equal(proximaSituacao(s, e), null)

// dedupe: já visto não entra, repetido na mesma busca entra uma vez
const c = (ref) => ({ ref, titulo: ref, corpo: "", url: "" })
assert.deepEqual(cardsNovos([c("a"), c("b"), c("b"), c("c")], new Set(["a"])).map((x) => x.ref), ["b", "c"])
assert.deepEqual(cardsNovos([c("a")], new Set(["a"])), [])

// consulta, resposta do card, mesa
assert.deepEqual(parseConsulta("acme/3:Pronto para desenvolver"), { dono: "acme", numero: 3, coluna: "Pronto para desenvolver" })
assert.equal(parseConsulta("sem formato"), null)
assert.equal(respostaDoCard(["antigo", `${MARCADOR} dúvida`, "use a opção B", "obrigado"]), "use a opção B\n\nobrigado")
assert.equal(respostaDoCard(["só isto"]), "só isto")
assert.ok(motivoSemMesa({ cartas: 0, fluxoValido: true }, false))
assert.ok(motivoSemMesa({ cartas: 3, fluxoValido: false }, true))
assert.equal(motivoSemMesa({ cartas: 3, fluxoValido: false }, false), null)

// PR
assert.equal(numeroDaUrl("aviso\nhttps://github.com/a/b/pull/42\n").numero, 42)
assert.match(montarCorpoPr({ descricao: "d", comoTestar: "t", checklist: ["x"] }), /- \[ \] x/)
assert.equal(tipoApoio("git").acesso, "escrita")
console.log("selfcheck-integracoes: ok")

// migrações compilam no SQLite
import { DatabaseSync } from "node:sqlite"
import { MIGRACOES_APOIO } from "../src/main/apoio/migracoes.ts"
import { MIGRACOES_MONITOR } from "../src/main/monitores/migracoes.ts"
const db = new DatabaseSync(":memory:")
for (const m of [...MIGRACOES_APOIO, ...MIGRACOES_MONITOR]) db.exec(m)
console.log("migracoes: ok")
