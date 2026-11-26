// Self-check do card legível: node --experimental-strip-types src/main/card.check.ts
import assert from "node:assert/strict"
import { cardLegivel } from "./card.ts"

const demanda = {
  codigo: "PA2-128", titulo: "Corrigir filtro", tipo: "Bug", prioridade: "Alta", status: "Em dev", projeto: { nome: "Painel", chave: "PA2" }, dev: { nome: "Ana", id: 4 }, qa: null,
  sugestao_branch: "fix/pa2-128", descricao: "Ajustar o filtro.\nSenha: abc\nFim.", descricao_rich_json: "{\"type\":\"doc\"}", criterios_aceite: "Filtra por data", imagens: ["http://x/a.png"], anexos: [], link: "http://l/PA2-128",
  comportamento_esperado: "Lista filtrada", figma: "", demanda_pai: { codigo: "PA2-1", titulo: "Épico", descricao: "Pai", criteriosAceite: "ok" },
  bugs: [{ id: 9, codigo: "BUG-1", titulo: "Quebra", descricao: "Detalhe", passosReproducao: "1. abrir", severidade: "alta" }],
  comentarios: [{ autor: "Bia", data: "2026-01-01", texto: "Veja isso" }],
}
const s = cardLegivel(JSON.stringify(demanda))
assert.ok(s.startsWith("# PA2-128 — Corrigir filtro"))
assert.ok(s.includes("Status: Em dev · Tipo: Bug") || s.includes("Status: Em dev"))
assert.ok(s.includes("Projeto: Painel (PA2)") && s.includes("Dev: Ana"))
assert.ok(s.includes("## Descrição") && s.includes("## Critérios aceite") && s.includes("## Comportamento esperado"))
assert.ok(!s.includes("abc") && s.includes("***"), "senha mascarada")
assert.ok(!/rich_json|Descricao rich|imagens|a\.png|Figma/i.test(s))
assert.ok(s.includes("- BUG-1 — Quebra") && s.includes("  Passos reprodução: 1. abrir") && s.includes("- Bia — 2026-01-01"))
assert.ok(s.includes("## Demanda pai") && s.includes("Titulo: Épico"))
assert.equal(cardLegivel("texto simples"), "texto simples")
assert.ok(cardLegivel(JSON.stringify({ descricao: "x".repeat(30_000) })).length <= 16_000)
console.log(s.split("\n").slice(0, 3).join("\n"), "\nOK")
