/**
 * Regras da carta que valem nos dois lados (interface e núcleo):
 * montar o prompt (RN 7 a 9), atributos (RN 10), padrão da classe (RN 2) e validação (RN 3 a 5).
 * O núcleo valida de novo antes de gravar; a interface usa para mostrar o erro na hora.
 */
import { CLASSES, MAX_SKILLS, type ClasseId, type Metodo, type Skill } from "./catalogo"
import { cliDoModelo, modeloPorId } from "./ia"
import type { Carta } from "./tipos"

/** Separa "dev:tdd" em classe e id. */
export function partes(chave: string): { classe: ClasseId; id: string } {
  const [classe, id] = chave.split(":")
  return { classe: classe as ClasseId, id }
}
export const chave = (classe: ClasseId, id: string) => `${classe}:${id}`

export function metodoPorChave(k: string): (Metodo & { classe: ClasseId }) | undefined {
  const { classe, id } = partes(k)
  const m = CLASSES[classe]?.metodos.find((x) => x.id === id)
  return m && { ...m, classe }
}
export function skillPorChave(k: string): (Skill & { classe: ClasseId }) | undefined {
  const { classe, id } = partes(k)
  const s = CLASSES[classe]?.skills.find((x) => x.id === id)
  return s && { ...s, classe }
}

type Base = Pick<Carta, "nome" | "classe" | "descricao" | "metodos" | "skills">
export const metodosDa = (c: Base) => c.metodos.map(metodoPorChave).filter((m) => !!m)
export const skillsDa = (c: Base) => c.skills.map(skillPorChave).filter((s) => !!s)

/** RN 7: título, prompt base (no Coringa com a missão), métodos, skills e trabalho em equipe. */
export function montarPrompt(c: Base): string {
  const classe = CLASSES[c.classe]
  const partesPrompt: string[] = [`# ${c.nome || classe.nome}`]
  partesPrompt.push(c.classe === "custom" ? `${classe.promptBase} ${c.descricao || "(descreva a missão deste agente)"}` : classe.promptBase)
  const ms = metodosDa(c).filter((m) => m.prompt)
  if (ms.length === 1) partesPrompt.push(`## Método de atuação: ${ms[0].nome}\n${ms[0].prompt}`)
  else if (ms.length > 1) partesPrompt.push(`## Métodos de atuação (combine conforme a tarefa pedir)\n${ms.map((m) => `- ${m.nome}: ${m.prompt}`).join("\n")}`)
  const ss = skillsDa(c)
  if (ss.length) partesPrompt.push(`## Habilidades\n${ss.map((s) => `- ${s.prompt}`).join("\n")}`)
  partesPrompt.push(
    "## Como trabalhar em equipe\n- Leia o que o agente anterior entregou antes de começar.\n- Entregue um resultado que o próximo agente consiga usar sem adivinhar.\n- Se o Revisor fizer uma pergunta, responda de forma objetiva e, se houver falha, corrija.\n- Responda em português do Brasil."
  )
  return partesPrompt.join("\n\n")
}

/** RN 9: prompt principal + adicionais ligados e com texto, cada um como seção. */
export function promptFinal(c: Pick<Carta, "prompt" | "adicionais">): string {
  const extras = c.adicionais.filter((e) => e.ativo && e.texto.trim())
  if (!extras.length) return c.prompt
  return `${c.prompt}\n\n${extras.map((e) => `## ${e.titulo.trim() || "Instrução adicional"}\n${e.texto.trim()}`).join("\n\n")}`
}

/** RN 10: Poder e Velocidade vêm do modelo; Foco do método, +1 com 4 skills ou mais. */
export function atributos(c: Pick<Carta, "cli" | "modelo" | "metodos" | "skills" | "nome" | "classe" | "descricao">) {
  const modelo = modeloPorId(c.cli, c.modelo)
  const ms = metodosDa(c)
  const base = ms.length ? Math.max(...ms.map((m) => m.foco)) : 3
  return { modelo, poder: modelo.poder, velocidade: modelo.velocidade, foco: Math.min(5, base + (c.skills.length >= 4 ? 1 : 0)) }
}

export function rotuloMetodo(c: Base): string {
  const ms = metodosDa(c)
  return !ms.length ? "Livre" : ms.length === 1 ? ms[0].nome : `${ms.length} métodos`
}

const novoId = () => crypto.randomUUID()

/** Carta nova com o padrão da classe (RN 2). */
export function cartaNova(classe: ClasseId = "analise"): Carta {
  const c = CLASSES[classe]
  const agora = Date.now()
  const carta: Carta = {
    id: novoId(), nome: c.nomes[0], classe, simbolo: c.simbolo, cor: c.cor,
    descricao: classe === "custom" ? "" : c.descricao,
    cli: cliDoModelo(c.modeloSugerido)?.id ?? "claude", modelo: c.modeloSugerido,
    metodos: classe === "custom" ? [] : [chave(classe, c.metodos[0].id)],
    skills: classe === "custom" ? [] : c.skills.slice(0, 3).map((s) => chave(classe, s.id)),
    prompt: "", promptEditado: false, adicionais: [], contaId: null, esforco: "alto", habilidades: [], memorias: [], origemLoja: null, criadaEm: agora, atualizadaEm: agora,
  }
  carta.prompt = montarPrompt(carta)
  return carta
}

/** Troca a classe mantendo o nome se ele não for um nome sugerido (RN 2). */
export function trocarClasse(atual: Carta, classe: ClasseId): Carta {
  const padrao = cartaNova(classe)
  const nomeSugerido = !atual.nome || Object.values(CLASSES).some((x) => x.nomes.includes(atual.nome))
  const prox: Carta = {
    ...padrao, id: atual.id, criadaEm: atual.criadaEm, adicionais: atual.adicionais, contaId: atual.contaId, esforco: atual.esforco,
    habilidades: atual.habilidades, memorias: atual.memorias, origemLoja: atual.origemLoja,
    nome: nomeSugerido ? padrao.nome : atual.nome,
    descricao: classe === "custom" && atual.classe === "custom" ? atual.descricao : padrao.descricao,
    prompt: atual.prompt, promptEditado: atual.promptEditado,
  }
  return prox.promptEditado ? prox : { ...prox, prompt: montarPrompt(prox) }
}

/** RN 3 a 5. Devolve a primeira regra quebrada, ou null. */
export function validarCarta(c: Carta): string | null {
  if (!CLASSES[c.classe]) return "Classe desconhecida."
  if (!c.nome.trim()) return "Dê um nome para a carta."
  if (c.nome.trim().length > 60) return "O nome pode ter até 60 caracteres."
  if (c.classe === "custom" && !c.descricao.trim()) return "Escreva a missão do Coringa."
  if (!c.modelo.trim()) return "Escolha o modelo da IA."
  if (c.skills.length > MAX_SKILLS) return `Uma carta pode ter até ${MAX_SKILLS} skills.`
  if (c.metodos.some((k) => !metodoPorChave(k))) return "Há um método que não existe no catálogo."
  if (c.skills.some((k) => !skillPorChave(k))) return "Há uma skill que não existe no catálogo."
  if (c.classe !== "custom") {
    if (c.metodos.length !== 1) return "Escolha um método."
    if (partes(c.metodos[0]).classe !== c.classe) return "O método precisa ser da classe da carta."
    if (c.skills.some((k) => partes(k).classe !== c.classe)) return "As skills precisam ser da classe da carta."
  }
  return null
}
