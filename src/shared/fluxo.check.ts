// Self-check das regras da mesa. Rodar: node --experimental-strip-types src/shared/fluxo.check.ts
import assert from "node:assert/strict"
import { validarFluxo } from "./fluxo.ts"
import { ligarEmSequencia, ligarNova, mesaInicial, organizar, tipoPadrao, validarLigacao } from "./mesa.ts"
import type { ClasseId } from "./catalogo.ts"

const time: ClasseId[] = ["orquestrador", "analise", "ux", "dev", "teste", "seguranca", "revisor", "pr"]
const cartas = time.map((classe) => ({ id: classe, classe }))
const { nos, ligacoes } = mesaInicial(cartas)
const nomes = cartas.map((c) => ({ ...c, nome: c.classe }))

// Mesa nova: cadeia Análise → ... → Revisor → PR e o Revisor questionando as cinco anteriores.
assert.equal(ligacoes.filter((l) => l.tipo === "entrega").length, 6)
assert.deepEqual(ligacoes.filter((l) => l.tipo === "questiona").map((l) => l.paraCartaId), ["analise", "ux", "dev", "teste", "seguranca"])
assert.ok(ligacoes.some((l) => l.deCartaId === "revisor" && l.paraCartaId === "pr" && l.tipo === "entrega"))
const ok = validarFluxo(nomes, ligacoes)
assert.deepEqual([ok.pronto, ok.erros.length, ok.avisos.length, ok.comeco], [true, 0, 0, ["analise"]])

// Círculo é erro; sem começo também.
const circ = validarFluxo(nomes, [...ligacoes, { deCartaId: "pr", paraCartaId: "analise", tipo: "entrega" }])
assert.deepEqual(circ.erros.map((e) => e.codigo).sort(), ["circulo", "sem-comeco"])
// Questiona de volta não é círculo.
assert.equal(validarFluxo(nomes, [...ligacoes, { deCartaId: "revisor", paraCartaId: "ux", tipo: "questiona" }]).erros.length, 0)
// Avisos: carta solta, vários começos, Revisor mudo.
const av = validarFluxo(nomes, ligacoes.filter((l) => l.tipo === "entrega" && l.paraCartaId !== "teste"))
assert.ok(av.avisos.some((a) => a.codigo === "varios-comecos"))
assert.ok(validarFluxo(nomes, []).avisos.some((a) => a.codigo === "revisor-sem-pergunta"))
assert.equal(validarFluxo([], []).pronto, false)

// Regras de ligação.
assert.equal(tipoPadrao("revisor", "dev"), "questiona")
assert.equal(tipoPadrao("revisor", "pr"), "entrega")
assert.ok(validarLigacao(nos, ligacoes, "dev", "dev"))
assert.ok(validarLigacao(nos, ligacoes, "analise", "ux"))
assert.ok(validarLigacao(nos, ligacoes, "orquestrador", "ux"))
assert.equal(validarLigacao(nos, ligacoes, "ux", "analise"), null)

// Carta nova entre UX e Dev entra no meio da cadeia e o Revisor passa a questioná-la.
const x = (id: string) => nos.find((n) => n.id === id)!.x
const comNova = [...nos, { id: "coringa", classe: "custom" as ClasseId, x: (x("ux") + x("dev")) / 2, y: nos[0].y }]
const r = ligarNova(comNova, ligacoes, "coringa")
assert.deepEqual(r.remover.map((l) => `${l.deCartaId}>${l.paraCartaId}`), ["ux>dev"])
assert.deepEqual(r.criar.map((l) => `${l.deCartaId}>${l.paraCartaId}:${l.tipo}`), ["ux>coringa:entrega", "coringa>dev:entrega", "revisor>coringa:questiona"])

// Organizar: uma coluna por nível, Orquestrador acima.
const org = organizar(nos, ligacoes)
assert.equal(org.find((p) => p.id === "orquestrador")!.y, 0)
assert.ok(org.find((p) => p.id === "pr")!.x > org.find((p) => p.id === "revisor")!.x)
assert.equal(ligarEmSequencia(nos).length, ligacoes.length)
console.log("fluxo.check: ok")
