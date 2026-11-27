// Self-check de "Lembrar no projeto". Rodar: node --experimental-strip-types src/shared/regras.check.ts
import assert from "node:assert/strict"
import { acrescentarRegra, motivosParecidos, sugerirRegra, vezesQueApareceu } from "./regras.ts"

assert.ok(motivosParecidos("Teste login falha antes desta branch e está fora do escopo", "O teste de checkout falha antes desta branch, fora do escopo"))
assert.ok(motivosParecidos("Testes não rodaram: container não enxerga o worktree 12", "testes nao rodaram porque o container nao enxerga o worktree 7"))
assert.ok(!motivosParecidos("Testes não rodaram porque o container não enxerga o worktree", "Falta definir a cor do botão primário"))
assert.ok(!motivosParecidos("", "qualquer coisa"))
assert.equal(vezesQueApareceu("container não enxerga o worktree", ["container não enxerga o worktree", "outra coisa totalmente diferente"]), 1)

assert.equal(sugerirRegra("Teste X falha antes da branch. Detalhe longo.", ""), "- Quando Teste X falha antes da branch: siga sem bloquear e registre no relatório.")
assert.equal(sugerirRegra("Falta vendor/", " rode composer install. "), "- Quando Falta vendor/: rode composer install.")

const r = "- Quando A: faça B."
assert.equal(acrescentarRegra("", r), `## Regras aprendidas\n${r}\n`)
assert.equal(acrescentarRegra("Projeto PHP.", r), `Projeto PHP.\n\n## Regras aprendidas\n${r}\n`)
const dois = acrescentarRegra(acrescentarRegra("Projeto.", r), "- Quando C: faça D.")
assert.equal(dois, `Projeto.\n\n## Regras aprendidas\n${r}\n- Quando C: faça D.\n`)
// seção no meio: a regra entra antes do próximo título
assert.equal(acrescentarRegra("## Regras aprendidas\n- x\n\n## Outro\ny", r), `## Regras aprendidas\n- x\n${r}\n\n## Outro\ny\n`)
console.log("regras.check ok")
