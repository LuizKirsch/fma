/**
 * Loja e biblioteca locais (pacote 2): habilidades e memórias (itens que entram no prompt da carta)
 * e agentes da Loja. Tudo no banco local, sem backend: "publicar" só guarda uma cópia aqui.
 */
import { ipcMain } from "electron"
import type { DatabaseSync } from "node:sqlite"
import { transacao } from "./db"
import { listarCartas, salvarCarta } from "./cartas"
import { cartaNova, montarPrompt } from "@shared/carta"
import type { AgenteLoja, ItemBiblioteca, NovoItem, TipoItem } from "@shared/biblioteca"
import type { ClasseId } from "@shared/catalogo"
import type { Carta, Resultado } from "@shared/tipos"

type Semente = [id: string, nome: string, descricao: string, texto: string]

// Textos do protótipo v16 (src/data/library.ts).
const HABILIDADES: Semente[] = [
  ["b:gherkin", "Critérios de aceite (Gherkin)", "Escreve critérios Dado/Quando/Então testáveis.", "Escreva critérios de aceite no formato Dado/Quando/Então, um por regra, cobrindo caminho feliz e exceções."],
  ["b:rn-rf", "Documentação funcional RN/RF", "Separa regras de negócio de requisitos funcionais.", "Separe RN (condições do negócio) de RF (comportamento do sistema). Escreva RF começando com \"O sistema deve...\"."],
  ["b:demanda", "Escrever demandas de melhoria", "Contexto, problema, objetivo, RN, RF, critérios e impactos.", "Estruture a demanda com: contexto, problema, objetivo, regras de negócio, requisitos funcionais, critérios de aceite e impactos em outros módulos."],
  ["b:wcag", "Revisão de acessibilidade (WCAG)", "Contraste, teclado, rótulos e leitor de tela.", "Verifique contraste AA, navegação por teclado, foco visível, rótulos e textos alternativos."],
  ["b:shadcn", "Design system shadcn/ui", "Monta telas com os componentes e tokens do design system.", "Use os componentes do design system (shadcn/ui) e tokens semânticos; não invente estilos fora do padrão."],
  ["b:e2e", "Testes E2E com Playwright", "Fluxos ponta a ponta com evidência.", "Automatize o fluxo principal e as exceções com Playwright, salvando vídeo e trace como evidência."],
  ["b:casos-rf", "Casos de teste a partir de RF", "Um caso por RF, com dados e resultado esperado.", "Para cada RF, gere ao menos um caso de teste com pré-condição, passos, dados e resultado esperado."],
  ["b:code-review", "Revisão de código", "Bugs, segurança e legibilidade antes do PR.", "Revise o diff procurando bugs, problemas de segurança, nomes confusos e falta de testes."],
  ["b:sql-ro", "SQL somente leitura", "Consulta a base sem alterar nada.", "Faça apenas consultas SELECT. Nunca rode UPDATE, DELETE ou DDL."],
  ["b:lgpd", "Checklist LGPD", "Base legal, consentimento, minimização e retenção.", "Para cada dado pessoal, confirme base legal, consentimento quando necessário, minimização e prazo de retenção."],
  ["b:nao-tecnico", "Comunicação para áreas não técnicas", "Linguagem simples e foco no benefício.", "Escreva para quem não é da TI: frases curtas, sem jargão, explicando o benefício para o usuário."],
  ["b:jornal", "Resumo para o jornal de melhorias", "Transforma entregas em notas para o jornal da TI.", "Resuma a entrega em um parágrafo para o jornal de melhorias: o que mudou, para quem e qual o ganho."],
  ["b:estimativa", "Estimativa de esforço", "Quebra em partes e estima com faixa.", "Quebre o trabalho em partes, estime cada uma em faixa (mínimo–máximo) e aponte o maior risco."],
]
const MEMORIAS: Semente[] = [
  ["b:glossario", "Glossário do ERP Lupito", "Termos do ERP: título, baixa, conciliação, alçada…", "Título: obrigação a pagar/receber. Baixa: quitação do título. Conciliação: conferência com o extrato. Alçada: limite de aprovação por valor."],
  ["b:nomes", "Padrão de nomenclatura", "Como nomear telas, campos e status.", "Telas no infinitivo (Cadastrar cliente). Status no particípio (Aprovado, Baixado). Campos sem abreviação."],
  ["b:tom", "Tom de voz Lupito", "Próximo, direto e sem jargão.", "Fale com o usuário de forma próxima e direta. Evite jargão técnico e mensagens que culpam o usuário."],
  ["b:perfis", "Perfis de acesso do ERP", "Quem pode ver e fazer o quê.", "Perfis: Administrador, Financeiro, Compras, Fiscal, Consulta. Toda tela nova precisa definir permissão por perfil."],
  ["b:ambientes", "Ambientes e URLs", "Desenvolvimento, homologação e produção.", "Homologação: homolog.erp.lupito.com.br. Produção só depois do aceite da área. Dados reais nunca em desenvolvimento."],
  ["b:homolog", "Checklist de homologação", "O que conferir antes de liberar.", "Critérios atendidos, evidências anexadas, permissões testadas por perfil, rollback definido e área avisada."],
]

/** Agentes de exemplo (comunidade do protótipo): [id, nome, classe, autor, categoria, descrição, habilidades, memórias, usos, verificado]. */
const AGENTES: [string, string, ClasseId, string, string, string, string[], string[], number, boolean][] = [
  ["c-escopo", "Escopo Certo", "analise", "Time Produto", "Análise", "Transforma um pedido solto em escopo com o que entra, o que fica fora e prazos.", ["b:demanda", "b:rn-rf"], ["b:glossario"], 412, true],
  ["c-revisor", "Revisor de Mudanças", "revisor", "Time Dev", "Desenvolvimento", "Acha bugs num diff antes do PR e explica cada um com o trecho.", ["b:code-review"], ["b:nomes"], 388, true],
  ["c-qa", "Caçador de Bugs", "teste", "QA Lupito", "Qualidade", "Casos de teste a partir dos RF e E2E com Playwright, com evidência.", ["b:casos-rf", "b:e2e", "b:gherkin"], ["b:homolog"], 351, true],
  ["c-ux", "Tela Limpa", "ux", "Design", "Design", "Wireframes no design system e revisão de acessibilidade.", ["b:shadcn", "b:wcag"], ["b:tom"], 290, true],
  ["c-lgpd", "Guardião LGPD", "seguranca", "Segurança", "Qualidade", "Confere dados pessoais, consentimento e permissões por perfil.", ["b:lgpd"], ["b:perfis"], 204, true],
  ["c-jornal", "Redator do Jornal", "pr", "Comunicação TI", "Documentos", "Converte entregas em notas para o jornal de melhorias.", ["b:jornal", "b:nao-tecnico"], ["b:tom"], 167, false],
  ["c-sql", "Detetive de Dados", "custom", "Marina (Financeiro)", "Análise", "Responde perguntas sobre os dados do ERP com SQL só de leitura.", ["b:sql-ro"], ["b:glossario"], 98, false],
  ["c-chefe", "Chefe de Gabinete", "orquestrador", "Time Produto", "Produtividade", "Orquestra o time, estima e manda um resumo do dia.", ["b:estimativa"], [], 143, true],
  ["c-dev", "Construtor Rápido", "dev", "Rafael (Dev)", "Desenvolvimento", "Implementa telas simples com custo baixo.", ["b:shadcn"], ["b:nomes"], 76, false],
]

/** Idempotente: roda na abertura do app. Itens e agentes padrão entram uma vez; o que o usuário criou não é tocado. */
export function semearBiblioteca(db: DatabaseSync) {
  const item = db.prepare("INSERT OR IGNORE INTO biblioteca_item (id, tipo, nome, descricao, texto, padrao, criado_em) VALUES (?, ?, ?, ?, ?, 1, 0)")
  const agente = db.prepare(`INSERT OR IGNORE INTO loja_agente (id, carta_json, autor, descricao, categoria, verificado, meu, instalacoes, publicado_em)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)`)
  transacao(db, () => {
    for (const [id, nome, desc, texto] of HABILIDADES) item.run(id, "habilidade", nome, desc, texto)
    for (const [id, nome, desc, texto] of MEMORIAS) item.run(id, "memoria", nome, desc, texto)
    for (const [id, nome, classe, autor, categoria, desc, habilidades, memorias, usos, verificado] of AGENTES) {
      const c = { ...cartaNova(classe), nome, descricao: desc, habilidades, memorias }
      c.prompt = montarPrompt(c)
      agente.run(id, JSON.stringify(c), autor, desc, categoria, verificado ? 1 : 0, usos)
    }
  })
}

// ---------- itens ----------

interface LinhaItem { id: string; tipo: string; nome: string; descricao: string; texto: string; padrao: number; criado_em: number }
const paraItem = (l: LinhaItem): ItemBiblioteca => ({ id: l.id, tipo: l.tipo as TipoItem, nome: l.nome, descricao: l.descricao, texto: l.texto, padrao: !!l.padrao, criadoEm: l.criado_em })

/** Os seus primeiro (mais novos antes), depois os padrão. */
export function listarItens(db: DatabaseSync, tipo?: TipoItem): ItemBiblioteca[] {
  const linhas = db.prepare("SELECT * FROM biblioteca_item WHERE ? IS NULL OR tipo = ? ORDER BY padrao, criado_em DESC, rowid").all(tipo ?? null, tipo ?? null) as unknown as LinhaItem[]
  return linhas.map(paraItem)
}

export function criarItem(db: DatabaseSync, n: NovoItem): Resultado<ItemBiblioteca> {
  const nome = n.nome.trim(), texto = n.texto.trim()
  if (n.tipo !== "habilidade" && n.tipo !== "memoria") return { ok: false, erro: "Tipo desconhecido." }
  if (!nome) return { ok: false, erro: "Dê um nome." }
  if (!texto) return { ok: false, erro: "Escreva o texto que entra no prompt." }
  const id = `u:${crypto.randomUUID()}`
  db.prepare("INSERT INTO biblioteca_item (id, tipo, nome, descricao, texto, padrao, criado_em) VALUES (?, ?, ?, ?, ?, 0, ?)")
    .run(id, n.tipo, nome.slice(0, 80), (n.descricao.trim() || texto).slice(0, 120), texto, Date.now())
  return { ok: true, valor: paraItem(db.prepare("SELECT * FROM biblioteca_item WHERE id = ?").get(id) as unknown as LinhaItem) }
}

/** As padrão não saem; nas cartas, as ligações saem em cascata. */
export function excluirItem(db: DatabaseSync, id: string): Resultado<null> {
  const l = db.prepare("SELECT padrao FROM biblioteca_item WHERE id = ?").get(id) as { padrao: number } | undefined
  if (!l) return { ok: false, erro: "Esse item não existe mais." }
  if (l.padrao) return { ok: false, erro: "Itens padrão não podem ser excluídos." }
  db.prepare("DELETE FROM biblioteca_item WHERE id = ?").run(id)
  return { ok: true, valor: null }
}

/**
 * Seções de habilidades e memórias que o motor acrescenta ao prompt da carta ao rodar (o prompt salvo da carta não muda).
 * Vazio se a carta não tem itens.
 */
export function secoesBiblioteca(db: DatabaseSync, cartaId: string): string {
  const linhas = db.prepare(`SELECT i.tipo, i.nome, i.texto FROM carta_biblioteca cb JOIN biblioteca_item i ON i.id = cb.item_id
    WHERE cb.carta_id = ? ORDER BY cb.ordem`).all(cartaId) as { tipo: string; nome: string; texto: string }[]
  const secao = (tipo: string, titulo: string) => {
    const ls = linhas.filter((l) => l.tipo === tipo)
    return ls.length ? `## ${titulo}\n${ls.map((l) => `- ${l.nome}: ${l.texto}`).join("\n")}` : ""
  }
  return [secao("habilidade", "Habilidades da biblioteca"), secao("memoria", "Memórias")].filter(Boolean).join("\n\n")
}

// ---------- Loja ----------

interface LinhaLoja { id: string; carta_json: string; autor: string; descricao: string; categoria: string; verificado: number; meu: number; instalacoes: number; publicado_em: number }
const paraAgente = (l: LinhaLoja): AgenteLoja => ({
  id: l.id, carta: JSON.parse(l.carta_json) as Carta, autor: l.autor, descricao: l.descricao, categoria: l.categoria,
  verificado: !!l.verificado, meu: !!l.meu, instalacoes: l.instalacoes, publicadoEm: l.publicado_em,
})

export function listarLoja(db: DatabaseSync): AgenteLoja[] {
  return (db.prepare("SELECT * FROM loja_agente ORDER BY instalacoes DESC, publicado_em DESC").all() as unknown as LinhaLoja[]).map(paraAgente)
}

/** Cria uma cópia na coleção. O nome fica travado, a não ser que o agente seja seu. */
export function adicionarDaLoja(db: DatabaseSync, lojaId: string): Resultado<Carta> {
  const l = db.prepare("SELECT * FROM loja_agente WHERE id = ?").get(lojaId) as unknown as LinhaLoja | undefined
  if (!l) return { ok: false, erro: "Esse agente não está mais na Loja." }
  const a = paraAgente(l)
  const agora = Date.now()
  const r = salvarCarta(db, {
    ...a.carta, id: crypto.randomUUID(), criadaEm: agora, atualizadaEm: agora,
    adicionais: a.carta.adicionais.map((x) => ({ ...x, id: crypto.randomUUID() })),
    origemLoja: { lojaId: a.id, autor: a.meu ? "você" : a.autor, travada: !a.meu },
  })
  if (r.ok) db.prepare("UPDATE loja_agente SET instalacoes = instalacoes + 1 WHERE id = ?").run(lojaId)
  return r
}

/** Guarda uma cópia da carta na Loja local (republicar a mesma carta atualiza a cópia). */
export function publicarCarta(db: DatabaseSync, cartaId: string, descricao: string, categoria: string): Resultado<AgenteLoja> {
  const carta = listarCartas(db).find((c) => c.id === cartaId)
  if (!carta) return { ok: false, erro: "Essa carta não existe mais." }
  if (carta.origemLoja?.travada) return { ok: false, erro: `Esta carta é de ${carta.origemLoja.autor}; só o autor pode publicá-la.` }
  const id = `pub-${cartaId}`
  db.prepare(`INSERT INTO loja_agente (id, carta_json, autor, descricao, categoria, verificado, meu, instalacoes, publicado_em)
    VALUES (?, ?, 'você', ?, ?, 0, 1, 0, ?)
    ON CONFLICT(id) DO UPDATE SET carta_json = excluded.carta_json, descricao = excluded.descricao, categoria = excluded.categoria, publicado_em = excluded.publicado_em`)
    .run(id, JSON.stringify({ ...carta, origemLoja: null }), descricao.trim() || carta.descricao, categoria, Date.now())
  return { ok: true, valor: paraAgente(db.prepare("SELECT * FROM loja_agente WHERE id = ?").get(id) as unknown as LinhaLoja) }
}

export function despublicar(db: DatabaseSync, lojaId: string): Resultado<null> {
  const r = db.prepare("DELETE FROM loja_agente WHERE id = ? AND meu = 1").run(lojaId)
  return r.changes ? { ok: true, valor: null } : { ok: false, erro: "Só dá para despublicar o que você publicou." }
}

export function registrarIpcBiblioteca(db: DatabaseSync) {
  semearBiblioteca(db)
  ipcMain.handle("biblioteca:itens", (_e, tipo?: TipoItem) => listarItens(db, tipo))
  ipcMain.handle("biblioteca:criar-item", (_e, n: NovoItem) => criarItem(db, n))
  ipcMain.handle("biblioteca:excluir-item", (_e, id: string) => excluirItem(db, id))
  ipcMain.handle("biblioteca:loja", () => listarLoja(db))
  ipcMain.handle("biblioteca:adicionar", (_e, lojaId: string) => adicionarDaLoja(db, lojaId))
  ipcMain.handle("biblioteca:publicar", (_e, cartaId: string, d: string, c: string) => publicarCarta(db, cartaId, d, c))
  ipcMain.handle("biblioteca:despublicar", (_e, id: string) => despublicar(db, id))
}
