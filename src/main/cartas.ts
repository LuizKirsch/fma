/**
 * Coleção de cartas no banco (módulo 1): listar, salvar, duplicar e excluir.
 * Toda gravação passa pela mesma validação da interface (validarCarta) antes de ir para o banco.
 */
import type { DatabaseSync } from "node:sqlite"
import { transacao } from "./db"
import { mensagemCartaEmUso } from "./motor/dados"
import { montarPrompt, validarCarta } from "@shared/carta"
import { ESFORCOS } from "@shared/conta"
import type { Carta, Resultado } from "@shared/tipos"
import type { ClasseId } from "@shared/catalogo"
import type { CliId } from "@shared/ia"

interface LinhaCarta {
  id: string; nome: string; classe: string; simbolo: string; cor: string; descricao: string
  cli: string; modelo: string; prompt: string; prompt_editado: number; criada_em: number; atualizada_em: number
  conta_id: string | null; esforco: string; loja_origem: string | null
}

export function listarCartas(db: DatabaseSync): Carta[] {
  const linhas = db.prepare("SELECT * FROM carta ORDER BY criada_em").all() as unknown as LinhaCarta[]
  const chaves = (tabela: string) => {
    const mapa = new Map<string, string[]>()
    for (const r of db.prepare(`SELECT carta_id, chave FROM ${tabela} ORDER BY ordem`).all() as { carta_id: string; chave: string }[]) {
      mapa.set(r.carta_id, [...(mapa.get(r.carta_id) ?? []), r.chave])
    }
    return mapa
  }
  const metodos = chaves("carta_metodo")
  const skills = chaves("carta_skill")
  const adicionais = new Map<string, Carta["adicionais"]>()
  for (const r of db.prepare("SELECT * FROM prompt_adicional ORDER BY ordem").all() as { id: string; carta_id: string; titulo: string; texto: string; ativo: number }[]) {
    adicionais.set(r.carta_id, [...(adicionais.get(r.carta_id) ?? []), { id: r.id, titulo: r.titulo, texto: r.texto, ativo: !!r.ativo }])
  }
  const itens = { habilidade: new Map<string, string[]>(), memoria: new Map<string, string[]>() }
  for (const r of db.prepare("SELECT cb.carta_id, cb.item_id, i.tipo FROM carta_biblioteca cb JOIN biblioteca_item i ON i.id = cb.item_id ORDER BY cb.ordem").all() as { carta_id: string; item_id: string; tipo: "habilidade" | "memoria" }[]) {
    itens[r.tipo].set(r.carta_id, [...(itens[r.tipo].get(r.carta_id) ?? []), r.item_id])
  }
  return linhas.map((l) => ({
    id: l.id, nome: l.nome, classe: l.classe as ClasseId, simbolo: l.simbolo, cor: l.cor, descricao: l.descricao,
    cli: l.cli as CliId, modelo: l.modelo, prompt: l.prompt, promptEditado: !!l.prompt_editado,
    metodos: metodos.get(l.id) ?? [], skills: skills.get(l.id) ?? [], adicionais: adicionais.get(l.id) ?? [],
    contaId: l.conta_id, esforco: l.esforco as Carta["esforco"],
    habilidades: itens.habilidade.get(l.id) ?? [], memorias: itens.memoria.get(l.id) ?? [],
    origemLoja: l.loja_origem ? (JSON.parse(l.loja_origem) as Carta["origemLoja"]) : null,
    criadaEm: l.criada_em, atualizadaEm: l.atualizada_em,
  }))
}

function buscar(db: DatabaseSync, id: string): Carta | undefined {
  return listarCartas(db).find((c) => c.id === id)
}

/** Cria ou atualiza a carta inteira (com métodos, skills e prompts adicionais). */
export function salvarCarta(db: DatabaseSync, entrada: Carta): Resultado<Carta> {
  const carta: Carta = { ...entrada, nome: entrada.nome.trim(), descricao: entrada.descricao.trim(), modelo: entrada.modelo.trim() }
  // Prompt não editado sempre acompanha as escolhas (RN 8), mesmo que a interface mande outro.
  if (!carta.promptEditado) carta.prompt = montarPrompt(carta)
  if (!ESFORCOS.some((e) => e.id === carta.esforco)) carta.esforco = "alto"
  if (carta.contaId && !db.prepare("SELECT 1 FROM conta WHERE id = ? AND cli = ?").get(carta.contaId, carta.cli)) carta.contaId = null // conta sumiu ou é de outra CLI: usa a padrão
  const erro = validarCarta(carta)
  if (erro) return { ok: false, erro }

  const existente = db.prepare("SELECT criada_em, nome, loja_origem FROM carta WHERE id = ?").get(carta.id) as { criada_em: number; nome: string; loja_origem: string | null } | undefined
  if (existente) { // a origem não muda por edição; o nome da carta travada é do autor
    carta.origemLoja = existente.loja_origem ? JSON.parse(existente.loja_origem) : null
    if (carta.origemLoja?.travada && carta.nome !== existente.nome) return { ok: false, erro: `O nome desta carta é de ${carta.origemLoja.autor} e não pode ser mudado.` }
  }
  const idsValidos = (ids: string[]) => ids.filter((id) => db.prepare("SELECT 1 FROM biblioteca_item WHERE id = ?").get(id))
  const agora = Date.now()
  transacao(db, () => {
    db.prepare(`
      INSERT INTO carta (id, nome, classe, simbolo, cor, descricao, cli, modelo, prompt, prompt_editado, criada_em, atualizada_em, conta_id, esforco, loja_origem)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nome = excluded.nome, classe = excluded.classe, simbolo = excluded.simbolo, cor = excluded.cor,
        descricao = excluded.descricao, cli = excluded.cli, modelo = excluded.modelo, prompt = excluded.prompt,
        prompt_editado = excluded.prompt_editado, atualizada_em = excluded.atualizada_em,
        conta_id = excluded.conta_id, esforco = excluded.esforco
    `).run(carta.id, carta.nome, carta.classe, carta.simbolo, carta.cor, carta.descricao, carta.cli, carta.modelo,
      carta.prompt, carta.promptEditado ? 1 : 0, existente?.criada_em ?? agora, agora, carta.contaId, carta.esforco, carta.origemLoja ? JSON.stringify(carta.origemLoja) : null)

    db.prepare("DELETE FROM carta_biblioteca WHERE carta_id = ?").run(carta.id)
    ;[...new Set(idsValidos([...(carta.habilidades ?? []), ...(carta.memorias ?? [])]))]
      .forEach((item, i) => db.prepare("INSERT INTO carta_biblioteca (carta_id, item_id, ordem) VALUES (?, ?, ?)").run(carta.id, item, i))
    for (const tabela of ["carta_metodo", "carta_skill", "prompt_adicional"]) db.prepare(`DELETE FROM ${tabela} WHERE carta_id = ?`).run(carta.id)
    carta.metodos.forEach((k, i) => db.prepare("INSERT INTO carta_metodo (carta_id, chave, ordem) VALUES (?, ?, ?)").run(carta.id, k, i))
    carta.skills.forEach((k, i) => db.prepare("INSERT INTO carta_skill (carta_id, chave, ordem) VALUES (?, ?, ?)").run(carta.id, k, i))
    carta.adicionais.forEach((a, i) => db.prepare("INSERT INTO prompt_adicional (id, carta_id, titulo, texto, ativo, ordem) VALUES (?, ?, ?, ?, ?, ?)")
      .run(a.id, carta.id, a.titulo, a.texto, a.ativo ? 1 : 0, i))
  })
  return { ok: true, valor: buscar(db, carta.id)! }
}

/** RN 14: cópia com " II" no fim do nome (cortando para caber em 60 caracteres). Carta travada da Loja mantém o nome do autor. */
export function duplicarCarta(db: DatabaseSync, id: string): Resultado<Carta> {
  const original = buscar(db, id)
  if (!original) return { ok: false, erro: "Essa carta não existe mais." }
  const agora = Date.now()
  const copia: Carta = {
    ...original, id: crypto.randomUUID(), nome: original.origemLoja?.travada ? original.nome : `${original.nome.slice(0, 57)} II`, criadaEm: agora, atualizadaEm: agora,
    adicionais: original.adicionais.map((a) => ({ ...a, id: crypto.randomUUID() })),
  }
  return salvarCarta(db, copia)
}

/**
 * RN 13: excluir tira a carta da coleção, e as ligações saem em cascata.
 * RF 1.34: carta em task na fila ou em andamento não sai.
 */
export function excluirCarta(db: DatabaseSync, id: string): Resultado<null> {
  const uso = mensagemCartaEmUso(db, id)
  if (uso) return { ok: false, erro: uso }
  const r = db.prepare("DELETE FROM carta WHERE id = ?").run(id)
  return r.changes ? { ok: true, valor: null } : { ok: false, erro: "Essa carta não existe mais." }
}
