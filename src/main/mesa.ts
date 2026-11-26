/**
 * Mesa no banco (módulo 3): cartas na mesa, conexões, skills e as ligações automáticas.
 * As regras de ligação são puras e ficam em @shared/mesa; aqui só se aplica o resultado no banco.
 * Toda operação devolve a mesa inteira do projeto, e a interface troca o que tinha por ela.
 */
import type { DatabaseSync } from "node:sqlite"
import { transacao } from "./db"
import { ligarEmSequencia, ligarNova, mesaInicial, organizar, skillConexao, tipoPadrao, validarLigacao, type CartaNaMesa, type Conexao, type Ligacao, type MudancaConexao, type Mesa, type No, type TipoConexao } from "@shared/mesa"
import type { ClasseId } from "@shared/catalogo"
import type { Resultado } from "@shared/tipos"

export function carregarMesa(db: DatabaseSync, projetoId: string): Mesa {
  const cartas = (db.prepare("SELECT id, carta_id, x, y FROM carta_mesa WHERE projeto_id = ? ORDER BY rowid").all(projetoId) as { id: string; carta_id: string; x: number; y: number }[])
    .map((r): CartaNaMesa => ({ id: r.id, cartaId: r.carta_id, x: r.x, y: r.y }))
  const skills = db.prepare("SELECT chave FROM conexao_skill WHERE conexao_id = ? ORDER BY ordem")
  const conexoes = (db.prepare("SELECT * FROM conexao WHERE projeto_id = ? ORDER BY de_carta_id, tipo, ordem").all(projetoId) as {
    id: string; de_carta_id: string; para_carta_id: string; tipo: TipoConexao; ordem: number; curva_x: number | null; curva_y: number | null
  }[]).map((r): Conexao => ({
    id: r.id, deCartaId: r.de_carta_id, paraCartaId: r.para_carta_id, tipo: r.tipo, ordem: r.ordem, curvaX: r.curva_x, curvaY: r.curva_y,
    skills: (skills.all(r.id) as { chave: string }[]).map((s) => s.chave),
  }))
  return { projetoId, cartas, conexoes }
}

/** Cartas da mesa com a classe, no formato das regras puras (o id do nó é o da carta da coleção). */
function nosDa(db: DatabaseSync, mesa: Mesa): No[] {
  const classe = db.prepare("SELECT classe FROM carta WHERE id = ?")
  return mesa.cartas.map((c) => ({ id: c.cartaId, classe: (classe.get(c.cartaId) as { classe: ClasseId }).classe, x: c.x, y: c.y }))
}

function inserirConexao(db: DatabaseSync, projetoId: string, l: Ligacao): Conexao {
  const id = crypto.randomUUID()
  const { prox } = db.prepare("SELECT COALESCE(MAX(ordem) + 1, 0) AS prox FROM conexao WHERE projeto_id = ? AND de_carta_id = ? AND tipo = ?").get(projetoId, l.deCartaId, l.tipo) as { prox: number }
  db.prepare("INSERT INTO conexao (id, projeto_id, de_carta_id, para_carta_id, tipo, ordem) VALUES (?, ?, ?, ?, ?, ?)").run(id, projetoId, l.deCartaId, l.paraCartaId, l.tipo, prox)
  return { ...l, id, ordem: prox, curvaX: null, curvaY: null, skills: [] }
}

/** RN 31: depois de remover ou trocar o tipo, a ordem de cada carta e tipo volta a ser 0, 1, 2... */
function renumerar(db: DatabaseSync, projetoId: string) {
  const cont = new Map<string, number>()
  for (const r of db.prepare("SELECT id, de_carta_id, tipo FROM conexao WHERE projeto_id = ? ORDER BY de_carta_id, tipo, ordem, rowid").all(projetoId) as { id: string; de_carta_id: string; tipo: string }[]) {
    const k = `${r.de_carta_id}|${r.tipo}`, n = cont.get(k) ?? 0
    cont.set(k, n + 1)
    db.prepare("UPDATE conexao SET ordem = ? WHERE id = ?").run(n, r.id)
  }
}

/** RF 3.04 e 3.05: coloca a carta na mesa e liga pela posição. `criadas` alimenta o aviso do RF 3.06. */
export function colocarCarta(db: DatabaseSync, projetoId: string, cartaId: string, x: number, y: number): Resultado<{ mesa: Mesa; criadas: Conexao[] }> {
  if (!db.prepare("SELECT 1 FROM carta WHERE id = ?").get(cartaId)) return { ok: false, erro: "Essa carta não existe mais." }
  if (db.prepare("SELECT 1 FROM carta_mesa WHERE projeto_id = ? AND carta_id = ?").get(projetoId, cartaId)) return { ok: false, erro: "Essa carta já está na mesa." }
  const criadas: Conexao[] = []
  transacao(db, () => {
    db.prepare("INSERT INTO carta_mesa (id, projeto_id, carta_id, x, y) VALUES (?, ?, ?, ?, ?)").run(crypto.randomUUID(), projetoId, cartaId, Math.round(x), Math.round(y))
    const mesa = carregarMesa(db, projetoId)
    const { criar, remover } = ligarNova(nosDa(db, mesa), mesa.conexoes, cartaId)
    for (const r of remover) db.prepare("DELETE FROM conexao WHERE projeto_id = ? AND de_carta_id = ? AND para_carta_id = ?").run(projetoId, r.deCartaId, r.paraCartaId)
    for (const l of criar) criadas.push(inserirConexao(db, projetoId, l))
    renumerar(db, projetoId)
  })
  return { ok: true, valor: { mesa: carregarMesa(db, projetoId), criadas } }
}

/** RF 3.07 e RN 32: a carta sai da mesa e as conexões dela saem junto. */
export function tirarCarta(db: DatabaseSync, projetoId: string, cartaId: string): Mesa {
  transacao(db, () => {
    db.prepare("DELETE FROM conexao WHERE projeto_id = ? AND (de_carta_id = ? OR para_carta_id = ?)").run(projetoId, cartaId, cartaId)
    db.prepare("DELETE FROM carta_mesa WHERE projeto_id = ? AND carta_id = ?").run(projetoId, cartaId)
    renumerar(db, projetoId)
  })
  return carregarMesa(db, projetoId)
}

export function moverCartas(db: DatabaseSync, projetoId: string, posicoes: { cartaId: string; x: number; y: number }[]): Mesa {
  transacao(db, () => {
    for (const p of posicoes) db.prepare("UPDATE carta_mesa SET x = ?, y = ? WHERE projeto_id = ? AND carta_id = ?").run(Math.round(p.x), Math.round(p.y), projetoId, p.cartaId)
  })
  return carregarMesa(db, projetoId)
}

/** RF 3.11 a 3.13: liga puxando o conector. O tipo começa pelo padrão (RN 26). */
export function ligar(db: DatabaseSync, projetoId: string, de: string, para: string): Resultado<Mesa> {
  const mesa = carregarMesa(db, projetoId)
  const nos = nosDa(db, mesa)
  const erro = validarLigacao(nos, mesa.conexoes, de, para)
  if (erro) return { ok: false, erro }
  const classe = (id: string) => nos.find((n) => n.id === id)!.classe
  inserirConexao(db, projetoId, { deCartaId: de, paraCartaId: para, tipo: tipoPadrao(classe(de), classe(para)) })
  return { ok: true, valor: carregarMesa(db, projetoId) }
}

/** RF 3.12, 3.15 e 3.17. Trocar o tipo põe a conexão no fim da fila do novo tipo e tira as skills que não valem nele. */
export function atualizarConexao(db: DatabaseSync, id: string, m: MudancaConexao): Resultado<Mesa> {
  const c = db.prepare("SELECT projeto_id, tipo FROM conexao WHERE id = ?").get(id) as { projeto_id: string; tipo: TipoConexao } | undefined
  if (!c) return { ok: false, erro: "Essa conexão não existe mais." }
  const tipo = m.tipo ?? c.tipo
  if (m.tipo && m.tipo !== "entrega" && m.tipo !== "questiona") return { ok: false, erro: "Tipo de conexão desconhecido." }
  if (m.skills?.some((k) => skillConexao(k)?.tipo !== tipo)) return { ok: false, erro: "Há uma skill que não vale para esse tipo de conexão." }
  transacao(db, () => {
    if (tipo !== c.tipo) {
      const de = (db.prepare("SELECT de_carta_id FROM conexao WHERE id = ?").get(id) as { de_carta_id: string }).de_carta_id
      const { prox } = db.prepare("SELECT COALESCE(MAX(ordem) + 1, 0) AS prox FROM conexao WHERE projeto_id = ? AND de_carta_id = ? AND tipo = ?").get(c.projeto_id, de, tipo) as { prox: number }
      db.prepare("UPDATE conexao SET tipo = ?, ordem = ? WHERE id = ?").run(tipo, prox, id)
      if (!m.skills) m = { ...m, skills: [] } // as skills do tipo antigo não valem no novo
      renumerar(db, c.projeto_id)
    }
    if (m.skills) {
      db.prepare("DELETE FROM conexao_skill WHERE conexao_id = ?").run(id)
      m.skills.forEach((k, i) => db.prepare("INSERT OR IGNORE INTO conexao_skill (conexao_id, chave, ordem) VALUES (?, ?, ?)").run(id, k, i))
    }
    if (m.curva !== undefined) db.prepare("UPDATE conexao SET curva_x = ?, curva_y = ? WHERE id = ?").run(m.curva && Math.round(m.curva.x), m.curva && Math.round(m.curva.y), id)
  })
  return { ok: true, valor: carregarMesa(db, c.projeto_id) }
}

/** RF 3.14: sobe (-1) ou desce (+1) a conexão entre as de mesmo tipo que saem da mesma carta. */
export function moverOrdem(db: DatabaseSync, id: string, delta: -1 | 1): Resultado<Mesa> {
  const c = db.prepare("SELECT projeto_id, de_carta_id, tipo, ordem FROM conexao WHERE id = ?").get(id) as { projeto_id: string; de_carta_id: string; tipo: string; ordem: number } | undefined
  if (!c) return { ok: false, erro: "Essa conexão não existe mais." }
  const vizinha = db.prepare("SELECT id FROM conexao WHERE projeto_id = ? AND de_carta_id = ? AND tipo = ? AND ordem = ?").get(c.projeto_id, c.de_carta_id, c.tipo, c.ordem + delta) as { id: string } | undefined
  if (vizinha) transacao(db, () => {
    db.prepare("UPDATE conexao SET ordem = ? WHERE id = ?").run(c.ordem + delta, id)
    db.prepare("UPDATE conexao SET ordem = ? WHERE id = ?").run(c.ordem, vizinha.id)
  })
  return { ok: true, valor: carregarMesa(db, c.projeto_id) }
}

export function removerConexao(db: DatabaseSync, id: string): Resultado<Mesa> {
  const c = db.prepare("SELECT projeto_id FROM conexao WHERE id = ?").get(id) as { projeto_id: string } | undefined
  if (!c) return { ok: false, erro: "Essa conexão não existe mais." }
  transacao(db, () => {
    db.prepare("DELETE FROM conexao WHERE id = ?").run(id)
    renumerar(db, c.projeto_id)
  })
  return { ok: true, valor: carregarMesa(db, c.projeto_id) }
}

/** RF 3.18 e RN 33: apaga todas as conexões (com as skills) e liga de novo em sequência. A confirmação é da interface. */
export function ligarSequencia(db: DatabaseSync, projetoId: string): Mesa {
  transacao(db, () => {
    db.prepare("DELETE FROM conexao WHERE projeto_id = ?").run(projetoId)
    for (const l of ligarEmSequencia(nosDa(db, carregarMesa(db, projetoId)))) inserirConexao(db, projetoId, l)
  })
  return carregarMesa(db, projetoId)
}

/** RF 3.19. */
export function organizarMesa(db: DatabaseSync, projetoId: string): Mesa {
  const mesa = carregarMesa(db, projetoId)
  return moverCartas(db, projetoId, organizar(nosDa(db, mesa), mesa.conexoes).map((p) => ({ cartaId: p.id, x: p.x, y: p.y })))
}

/** Mesa do projeto novo (RN 16): cartas em linha, Orquestrador acima, ligadas em sequência. */
export function montarMesaInicial(db: DatabaseSync, projetoId: string, time: { id: string; classe: ClasseId }[]) {
  const { nos, ligacoes } = mesaInicial(time)
  for (const n of nos) db.prepare("INSERT INTO carta_mesa (id, projeto_id, carta_id, x, y) VALUES (?, ?, ?, ?, ?)").run(crypto.randomUUID(), projetoId, n.id, Math.round(n.x), Math.round(n.y))
  for (const l of ligacoes) inserirConexao(db, projetoId, l)
}
