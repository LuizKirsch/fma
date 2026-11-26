/**
 * Sugestões de métodos e skills para o Coringa, a partir da missão (RN 6).
 * Sem IA: compara as palavras da missão com o catálogo e com palavras de cada área.
 * São só sugestões; nada entra na carta sem o usuário marcar.
 */
import { CLASSES, type ClasseId, type Metodo, type Skill } from "@shared/catalogo"
import { chave } from "@shared/carta"

const PALAVRAS_DA_AREA: Partial<Record<ClasseId, string[]>> = {
  orquestrador: ["coorden", "planej", "prioriz", "gerenc", "acompanh", "distribu", "orquestr", "delega"],
  analise: ["requisit", "regra", "negocio", "processo", "escopo", "histori", "criterio", "levantament", "demanda", "erp", "financeir", "document"],
  ux: ["tela", "interface", "usuario", "layout", "jornada", "acessib", "figma", "prototip", "usabil", "design", "fluxo de tela", "visual"],
  dev: ["codigo", "implement", "api", "integra", "banco", "sql", "backend", "frontend", "refator", "automa", "script", "desenvolv", "endpoint"],
  teste: ["teste", "testar", "qa", "bug", "cenari", "valid", "regress", "homolog", "caso de teste"],
  seguranca: ["segur", "lgpd", "senha", "token", "vulnerab", "permiss", "perfil de acesso", "autentic", "criptograf", "dados pessoais", "auditor"],
  revisor: ["revis", "question", "qualidade", "critic", "consist", "evidenc", "aprova"],
  pr: ["pull request", " pr ", "deploy", "release", "commit", "changelog", "publica", "entrega final", "versao"],
}

export interface Sugestao<T> { item: T; chave: string; classe: ClasseId; pontos: number; motivo: string[] }

/** Sem acento e em minúsculas, com espaço nas pontas para casar palavras inteiras. */
const normal = (s: string) => ` ${s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")} `
const COMUNS = new Set(["para", "como", "com", "que", "uma", "dos", "das", "por", "sem", "mais", "cada", "antes", "depois", "sobre", "quando", "este", "esta", "deve", "agente", "seja", "ser", "ter", "tudo"])
const palavras = (s: string) => normal(s).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !COMUNS.has(w))

/** Todos os métodos (com texto de prompt) e todas as skills do catálogo, com a classe de origem. */
export function catalogoCompleto() {
  const metodos: { item: Metodo; chave: string; classe: ClasseId }[] = []
  const skills: { item: Skill; chave: string; classe: ClasseId }[] = []
  for (const classe of Object.keys(CLASSES) as ClasseId[]) {
    CLASSES[classe].metodos.forEach((m) => { if (m.prompt) metodos.push({ item: m, chave: chave(classe, m.id), classe }) })
    CLASSES[classe].skills.forEach((s) => skills.push({ item: s, chave: chave(classe, s.id), classe }))
  }
  return { metodos, skills }
}

export function sugerir(missao: string) {
  const texto = normal(missao)
  const doTexto = new Set(palavras(missao))
  const areas = (Object.keys(PALAVRAS_DA_AREA) as ClasseId[])
    .map((classe) => ({ classe, achadas: PALAVRAS_DA_AREA[classe]!.filter((w) => texto.includes(w)) }))
    .filter((a) => a.achadas.length)
    .sort((a, b) => b.achadas.length - a.achadas.length)
  const pesoArea = (c: ClasseId) => areas.find((a) => a.classe === c)?.achadas.length ?? 0

  function pontuar<T extends { nome: string; descricao: string; prompt: string }>(x: { item: T; chave: string; classe: ClasseId }): Sugestao<T> {
    const proprias = palavras(`${x.item.nome} ${x.item.descricao} ${x.item.prompt}`)
    const diretas = [...new Set(proprias.filter((w) => doTexto.has(w) || [...doTexto].some((u) => u.length > 5 && w.length > 5 && u.slice(0, 6) === w.slice(0, 6))))]
    const area = pesoArea(x.classe)
    const motivo: string[] = []
    if (diretas.length) motivo.push(`você citou "${diretas.slice(0, 2).join('", "')}"`)
    if (area) motivo.push(`o tema é de ${CLASSES[x.classe].nome}`)
    return { ...x, pontos: diretas.length * 3 + area * 2, motivo }
  }
  const melhores = <T,>(lista: Sugestao<T>[], n: number) => lista.filter((s) => s.pontos > 0).sort((a, b) => b.pontos - a.pontos).slice(0, n)
  const { metodos, skills } = catalogoCompleto()
  return { areas, metodos: melhores(metodos.map(pontuar), 6), skills: melhores(skills.map(pontuar), 10) }
}
