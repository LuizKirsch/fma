/**
 * Cartas de apoio (módulo 4): catálogo de tipos, carta no projeto, escrita pendente e PR.
 * Tipos e regras puras, usados pelo núcleo e pela interface. Catálogo: vault "Catálogo de Cartas de Apoio".
 */
import type { ClasseId } from "./catalogo"

export type Ambiente = "desenvolvimento" | "homologacao" | "producao"
export const AMBIENTES: Ambiente[] = ["desenvolvimento", "homologacao", "producao"]
export const AMBIENTE_PADRAO: Ambiente = "homologacao" // RN 45

export interface TipoApoio {
  chave: string
  nome: string
  grupo: string
  descricao: string
  gera: string
  acesso: "leitura" | "escrita"
  usaAmbiente: boolean
  /** Classes que costumam usar (RN 39) e, nas de escrita, as únicas que escrevem (RN 42; vazio = qualquer). */
  usuarios: ClasseId[]
  escrevem: ClasseId[]
  /** "nativo": o FMA entrega (Git, Memória). "mcp": precisa de um servidor MCP configurado na carta. */
  origem: "nativo" | "mcp"
}

const t = (
  chave: string, nome: string, grupo: string, descricao: string, gera: string,
  acesso: TipoApoio["acesso"], usaAmbiente: boolean, usuarios: ClasseId[], origem: TipoApoio["origem"] = "mcp", escrevem: ClasseId[] = [],
): TipoApoio => ({ chave, nome, grupo, descricao, gera, acesso, usaAmbiente, usuarios, escrevem, origem })

const T = "Teste e evidência", F = "Fontes e integrações"
export const TIPOS_APOIO: TipoApoio[] = [
  t("git", "Repositório Git", "Desenvolvimento e segurança", "Cria branch, mostra o diff e abre o PR.", "branch, diff, PR", "escrita", false, ["dev", "pr"], "nativo", ["dev", "pr"]),
  t("memoria", "Memória do projeto", "Gestão", "Glossário, regras e decisões que todos consultam antes de agir.", "contexto", "leitura", false, ["analise", "ux", "dev", "teste", "seguranca", "revisor", "pr"], "nativo"),
  t("orcamento", "Orçamento", "Gestão", "Limite de tokens por task. Estourou, o Maestro chama você.", "alerta", "leitura", false, ["orquestrador"], "nativo"),
  t("navegador", "Navegador", T, "Executa o fluxo da tela com Playwright, grava vídeo e trace.", "vídeo, trace, passos", "leitura", true, ["teste"]),
  t("camera", "Câmera antes/depois", T, "Print antes e depois do desenvolvimento, lado a lado.", "prints, comparação", "leitura", true, ["dev", "teste"]),
  t("regressao", "Regressão visual", T, "Compara a tela com a referência aprovada.", "diferenças", "leitura", true, ["teste"]),
  t("dossie", "Dossiê de evidências", T, "Junta prints, passos e resultado num PDF.", "PDF", "leitura", false, ["teste"]),
  t("massa", "Massa de dados", T, "Gera dados fictícios válidos.", "dados de teste", "leitura", true, ["teste", "dev"]),
  t("acessibilidade", "Auditor de acessibilidade", T, "Contraste, teclado e rótulos (WCAG).", "relatório", "leitura", true, ["ux", "teste"]),
  t("board", "MCP do board", F, "Lê demandas e casos de teste; registra a execução e comenta no card.", "registro de teste, comentário", "escrita", false, ["analise", "teste"], "mcp", ["teste"]),
  t("banco", "Consulta ao banco", F, "Confere regra e dado na base, só leitura.", "consulta", "leitura", true, ["analise", "teste"]),
  t("api", "Cliente de API", F, "Chama endpoints e valida as respostas.", "chamadas", "leitura", true, ["dev", "teste"]),
  t("figma", "Figma", F, "Lê o frame aprovado e compara com a tela.", "aderência", "leitura", false, ["ux", "revisor"]),
  t("seguranca", "Scanner de segurança", "Desenvolvimento e segurança", "Dependências vulneráveis, segredos e dados pessoais.", "achados", "leitura", false, ["seguranca"]),
  t("mensageiro", "Mensageiro", "Comunicação e documentação", "Avisa o responsável ou envia o resumo da entrega.", "mensagem", "escrita", false, ["pr"]),
  t("redator", "Redator de documentação", "Comunicação e documentação", "Documentação funcional e texto do jornal de melhorias.", "documento", "leitura", false, ["analise", "pr"]),
]
export const tipoApoio = (chave: string) => TIPOS_APOIO.find((x) => x.chave === chave)

/** Config de servidor MCP (stdio) guardada na carta de apoio de origem "mcp". */
export interface McpServidor { comando: string; args: string[]; env: Record<string, string> }

export interface CartaApoio {
  id: string
  projetoId: string
  tipo: string
  nome: string
  ambiente: Ambiente
  urlBase: string
  x: number
  y: number
  mcp: McpServidor | null
  /** Ids das cartas (do time) que usam esta ferramenta. */
  usuarios: string[]
}

export type SituacaoArtefato = "registrado" | "pendente" | "confirmado" | "descartado"

/** Ação de escrita que só roda depois da confirmação. */
export type AcaoEscrita =
  | { tipo: "pr_abrir"; branch: string; base: string; titulo: string; corpo: string; repo: string; ambiente?: string }
  | { tipo: "pr_atualizar"; branch: string; numero: number; corpo: string; repo: string; ambiente?: string }
  | { tipo: "mcp_chamar"; ferramenta: string; argumentos: Record<string, unknown> }

export interface Artefato {
  id: string
  taskId: string
  cartaApoioId: string
  cartaId: string
  titulo: string
  texto: string
  ambiente: Ambiente | null
  situacao: SituacaoArtefato
  /** RF 4.23: antes/depois, quando a escrita muda algo que já existe. */
  antes: string | null
  depois: string | null
  acao: AcaoEscrita | null
  criadoEm: number
}

export interface PullRequest { id: string; taskId: string; numero: number; titulo: string; corpo: string; branch: string; url: string }

/** Máquina de estados da escrita (RF 4.16 a 4.18): só "pendente" muda, para confirmado ou descartado. Falha na execução mantém pendente. */
export function proximaSituacao(atual: SituacaoArtefato, evento: "confirmar" | "descartar"): SituacaoArtefato | null {
  return atual === "pendente" ? (evento === "confirmar" ? "confirmado" : "descartado") : null
}

/** Corpo do PR: descrição, como testar e checklist (RF 6.30). */
export function montarCorpoPr(p: { descricao: string; comoTestar: string; checklist: string[] }): string {
  return [
    `## Descrição\n${p.descricao.trim()}`,
    `## Como testar\n${p.comoTestar.trim()}`,
    `## Checklist\n${p.checklist.map((i) => `- [ ] ${i}`).join("\n")}`,
  ].join("\n\n")
}

/** Número do PR na URL que o `gh pr create` imprime. */
export const numeroDaUrl = (saida: string): { url: string; numero: number } | null => {
  const url = saida.split(/\s+/).reverse().find((s) => /\/pull\/\d+/.test(s))
  return url ? { url, numero: Number(url.match(/\/pull\/(\d+)/)![1]) } : null
}
