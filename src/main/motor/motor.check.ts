// Self-check do fluxo puro: node --experimental-strip-types src/main/motor/motor.check.ts
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
// @ts-ignore TS5097: a extensão .ts só é necessária para rodar direto com node
import * as f from "./fluxo.ts"
// @ts-ignore TS5097
import { lerSaida, extrairJson, statusDaEntrega, semLinhaStatus, decisaoResposta, decisaoSeguir, secaoDecisoes } from "./cli-parse.ts"
// @ts-ignore TS5097
import { buscarTasks, cartaEmUso, listarTasks, mensagemCartaEmUso } from "./dados.ts"
// @ts-ignore TS5097
import { MIGRACOES_MOTOR } from "./migracoes.ts"

const c = (id: string, orquestrador = false) => ({ id, nome: id, orquestrador })
const cartas = [c("orq", true), c("analise"), c("ux"), c("dev"), c("revisor")]
const cx = (de: string, para: string, tipo: "entrega" | "questiona", ordem = 0) => ({ de, para, tipo, ordem })
const con = [cx("analise", "dev", "entrega"), cx("ux", "dev", "entrega", 1), cx("dev", "revisor", "entrega"), cx("revisor", "dev", "questiona")]

// validação
assert.deepEqual(f.validarFluxo(cartas, con).erros, [])
assert.deepEqual(f.comecoNatural(cartas, con).sort(), ["analise", "ux"])
assert.ok(f.validarFluxo(cartas, [...con, cx("revisor", "analise", "entrega")]).erros.length) // círculo
assert.ok(f.validarFluxo([c("orq", true), c("a"), c("b")], [cx("a", "b", "entrega"), cx("b", "a", "entrega")]).erros.length)
assert.ok(f.validarFluxo([c("a")], []).erros.length) // sem Orquestrador

// ordem + fan-in: dev só começa com analise E ux concluídas
const e = f.estadoInicial(cartas, con, ["analise", "ux"])
assert.deepEqual(f.prontas(e, con).sort(), ["analise", "ux"])
e.analise = "concluida"
e.ux = "trabalhando"
assert.deepEqual(f.prontas(e, con), [])
e.ux = "concluida"
assert.deepEqual(f.prontas(e, con), ["dev"])
assert.deepEqual(f.quemEntrega("dev", con), ["analise", "ux"])

// começo escolhido: quem não está depois dos começos conta como concluído (RN 64)
const e2 = f.estadoInicial(cartas, con, ["dev"])
assert.equal(e2.analise, "concluida")
assert.equal(e2.dev, "pronta")
assert.equal(e2.revisor, "espera")

// devolução: revisor devolve dev -> dev e revisor refazem, analise/ux ficam
e.dev = "concluida"
e.revisor = "concluida"
assert.ok(f.terminou(e))
assert.deepEqual(f.devolver(e, con, "dev", "revisor").sort(), ["dev", "revisor"])
assert.equal(e.analise, "concluida")
assert.deepEqual(f.prontas(e, con), ["dev"])

// limite de devoluções e liberar mais uma volta
const voltas: Record<string, number> = { revisor: 2 }
assert.ok(f.noLimite(voltas.revisor, 2))
assert.ok(!f.noLimite(1, 2))
f.liberarVolta(voltas, "revisor")
assert.ok(!f.noLimite(voltas.revisor, 2))

// leitura da saída das CLIs
const claude = [
  JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "oi" }] } }),
  JSON.stringify({ type: "result", result: "feito", is_error: false, usage: { input_tokens: 10, output_tokens: 5 } }),
].join("\n")
assert.deepEqual(lerSaida("claude", claude), { texto: "feito", tokens: 15, erro: null })
const codex = [
  JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "ok" } }),
  JSON.stringify({ type: "turn.completed", usage: { input_tokens: 7, output_tokens: 3 } }),
].join("\n")
assert.deepEqual(lerSaida("codex", codex), { texto: "ok", tokens: 10, erro: null })
assert.equal(lerSaida("gemini", "resposta").texto, "resposta")
assert.deepEqual(extrairJson('blá ```json\n{"a":1}\n``` fim'), { a: 1 })


// ---------- E4: religar o fluxo sem a carta tirada (RN 60) ----------
const cx2 = (de: string, para: string, tipo: "entrega" | "questiona", ordem = 0) => ({ de, para, tipo, ordem })
const r1 = f.religar(con, ["dev"]).map((k) => `${k.de}>${k.para}:${k.tipo}`).sort()
assert.deepEqual(r1, ["analise>revisor:entrega", "ux>revisor:entrega"]) // quem entregava ao dev entrega ao revisor; Questiona do dev some
// sem conexão repetida nem para si mesma
assert.deepEqual(f.religar([cx2("a", "b", "entrega"), cx2("b", "c", "entrega"), cx2("a", "c", "entrega")], ["b"]).length, 1)
assert.deepEqual(f.religar([cx2("a", "b", "entrega"), cx2("b", "a", "entrega")], ["b"]), [])
// tirar duas em sequência: a>b>c>d tirando b e c liga a>d
assert.deepEqual(f.religar([cx2("a", "b", "entrega"), cx2("b", "c", "entrega"), cx2("c", "d", "entrega")], ["b", "c"]).map((k) => `${k.de}>${k.para}`), ["a>d"])
// o fluxo religado continua válido e a ordem do fan-in segue a conexão original
const semDev = f.religar(con, ["dev"])
assert.deepEqual(f.validarFluxo(cartas.filter((k) => k.id !== "dev"), semDev).erros, [])
assert.deepEqual(f.quemEntrega("revisor", semDev), ["analise", "ux"])

// ---------- E4: fila, busca e carta em uso no banco (SQLite em memória) ----------
{
  const db = new DatabaseSync(":memory:")
  db.exec("PRAGMA foreign_keys = ON; CREATE TABLE projeto (id TEXT PRIMARY KEY); CREATE TABLE carta (id TEXT PRIMARY KEY); CREATE TABLE carta_mesa (projeto_id TEXT, carta_id TEXT);")
  for (const m of MIGRACOES_MOTOR) db.exec(m)
  db.exec("INSERT INTO projeto VALUES ('p'), ('q'); INSERT INTO carta VALUES ('a'), ('b'), ('c'); INSERT INTO carta_mesa VALUES ('p','a'), ('p','b'), ('q','c');")
  const nova = (n: number, proj: string, sit: string, ref: string | null, titulo: string | null, filaEm: number | null = null) =>
    db.prepare("INSERT INTO task (id, numero, projeto_id, referencia, titulo, missao, situacao, criada_em, fila_em) VALUES (?,?,?,?,?,'m',?,1,?)").run(`t${n}`, n, proj, ref, titulo, sit, filaEm)
  nova(1, "p", "andamento", "FMA-1", "Login")
  nova(2, "p", "fila", "FMA-2", "Tela de cadastro", 200)
  nova(3, "p", "fila", null, "Relatório 100%", 100) // chegou antes da 2
  nova(4, "q", "fila", null, null, 50) // outro projeto: tem a própria fila
  // posição na fila (RF 8.07): por ordem de chegada, por projeto
  const pos = Object.fromEntries(listarTasks(db).map((t) => [t.numero, t.posicaoFila]))
  assert.deepEqual(pos, { 1: null, 2: 2, 3: 1, 4: 1 })
  // busca (RF 8.06)
  assert.deepEqual(buscarTasks(db, "p", "fma-2").map((t) => t.numero), [2])
  assert.deepEqual(buscarTasks(db, "p", "cadastro").map((t) => t.numero), [2])
  assert.deepEqual(buscarTasks(db, "p", "#3").map((t) => t.numero), [3])
  assert.deepEqual(buscarTasks(db, "p", "100%").map((t) => t.numero), [3]) // % é literal
  assert.deepEqual(buscarTasks(db, "p", "xyz"), [])
  assert.equal(buscarTasks(db, "p", "  ").length, 3)
  // carta em uso (RF 1.34): andamento pelas cartas da task; fila pela mesa, menos as tiradas
  db.prepare("INSERT INTO task_carta (id, task_id, carta_id) VALUES ('x1','t1','a')").run()
  assert.deepEqual(cartaEmUso(db, "a").map((t) => t.numero), [1, 2, 3]) // t1 (andamento) e as duas da fila, que seguem a mesa
  db.prepare("INSERT INTO task_carta (id, task_id, carta_id, retirada) VALUES ('x2','t2','a',1)").run()
  assert.deepEqual(cartaEmUso(db, "a").map((t) => t.numero), [1, 3]) // t2 tirou a carta
  assert.deepEqual(cartaEmUso(db, "c").map((t) => t.numero), [4])
  db.prepare("UPDATE task SET situacao = 'concluida' WHERE id = 't1'").run()
  assert.deepEqual(cartaEmUso(db, "a").map((t) => t.numero), [3])
  assert.ok(mensagemCartaEmUso(db, "a")!.includes("#3"))
  assert.equal(mensagemCartaEmUso(db, "nao-existe"), null)
}

// status da carta (FMA-STATUS)
assert.deepEqual(statusDaEntrega("Feito.\nFMA-STATUS: ok"), { status: "ok" })
assert.deepEqual(statusDaEntrega("Feito, sem linha."), { status: "ok" })
assert.deepEqual(statusDaEntrega("x\nFMA-STATUS: bloqueado: npm pediu aprovação\n"), { status: "bloqueado", motivo: "npm pediu aprovação" })
assert.equal(statusDaEntrega("Não consegui rodar o node aqui.").status, "bloqueado")
assert.equal(statusDaEntrega("A suíte não foi testada.").motivo, "A suíte não foi testada.")
assert.equal(statusDaEntrega("EACCES: Permission denied").status, "bloqueado")
assert.equal(statusDaEntrega("Isso precisa de decisão sua.").status, "bloqueado")
assert.equal(semLinhaStatus("Resumo\nFMA-STATUS: bloqueado: x"), "Resumo")

// decisões do usuário entram na seção de todas as cartas
const dec = [decisaoResposta("testes não rodaram: sem vendor/", "valido depois"), decisaoSeguir("testes não rodaram")].join("\n")
assert.match(dec, /^- Sobre "testes não rodaram: sem vendor\/": valido depois\n- O usuário aceitou seguir sem resolver: "testes não rodaram"\. Não trave de novo/)
assert.match(secaoDecisoes(dec), /Decisões do usuário nesta task \(valem para todas as cartas\)[\s\S]*Não use FMA-STATUS: bloqueado[\s\S]*Revisor não devolve/)
assert.equal(secaoDecisoes(""), "")

console.log("motor.check: ok")
