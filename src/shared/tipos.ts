/**
 * Tipos trocados entre a interface e o núcleo. A API que o preload expõe em `window.fma`
 * é a interface `FmaApi` daqui: a interface chama, o núcleo responde pelo IPC.
 */
import type { ClasseId } from "./catalogo"
import type { CliId, CliInstalada } from "./ia"
import type { Conexao, Mesa, MudancaConexao } from "./mesa"
import type { DetalheTask, DiffTask, EventoMotor, EventoTask, NovaTask, PreviaTask, Task } from "./task"
import type { Artefato, CartaApoio, Ambiente, McpServidor, TipoApoio } from "./apoio"
import type { Monitor } from "./monitor"
import type { Ambiente as AmbienteExec } from "./ambiente"
import type { Conta, Esforco, EstadoContas, StatusLogin } from "./conta"
import type { MensagemDireta } from "./conversa"
import type { ResumoConclusao, ResumoProjeto } from "./geral"
import type { EstadoChat, EventoMaestro, MensagemChat, ResultadoMaestro } from "./maestro"
import type { AgenteLoja, ItemBiblioteca, NovoItem, OrigemLoja, TipoItem } from "./biblioteca"
import type { Fonte, FerramentaDoServidor, MapaMcp, McpDaClaude, NovaFonte, ProjetoDaFonte, TaskDaFonte } from "./fonte"
import type { AjustesProjeto, NovoProjeto, PreferenciasMesa, Projeto, Repositorio, UsoDaCarta } from "./projeto"

export interface PromptAdicional {
  id: string
  titulo: string
  texto: string
  ativo: boolean
}

export interface Carta {
  id: string
  nome: string
  classe: ClasseId
  simbolo: string
  cor: string
  /** Descrição na Coleção. No Coringa, é a missão e entra no prompt. */
  descricao: string
  cli: CliId
  modelo: string
  /** Chaves "<classe>:<id>". Classe fixa: exatamente um, da própria classe. */
  metodos: string[]
  /** Chaves "<classe>:<id>", até MAX_SKILLS. */
  skills: string[]
  prompt: string
  promptEditado: boolean
  adicionais: PromptAdicional[]
  /** Conta de IA da carta (pacote 1); null = a conta padrão da CLI. */
  contaId: string | null
  esforco: Esforco
  /** Ids de itens da biblioteca (habilidades e memórias) que entram no prompt ao rodar. */
  habilidades: string[]
  memorias: string[]
  /** Preenchido quando a carta veio da Loja. */
  origemLoja: OrigemLoja | null
  criadaEm: number
  atualizadaEm: number
}

export type NovaCartaApoio = { projetoId: string; tipo: string; nome?: string; ambiente?: Ambiente; urlBase?: string; x?: number; y?: number; mcp?: McpServidor | null }
export type NovoMonitor = Partial<Omit<Monitor, "id" | "ultimaChecagem" | "proximaChecagem" | "ultimoResultado" | "totalCriadas">> & Pick<Monitor, "projetoId" | "nome" | "conector" | "consulta">
export type EventoApoio =
  | { tipo: "escrita-pendente"; artefato: Artefato; emProducao: boolean }
  | { tipo: "escrita-resolvida"; artefato: Artefato }
  | { tipo: "uso"; artefato: Artefato }
export type EventoMonitor =
  | { tipo: "checagem"; monitor: Monitor; criadas: string[]; retomadas: string[]; resultado: string }
  | { tipo: "erro-board"; monitorId: string; taskId: string; erro: string }

/** Resposta do núcleo: ou deu certo com o valor, ou deu erro com uma mensagem para mostrar. */
export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string }

export interface FmaApi {
  plataforma: string
  /** Terminal de verdade (PTY) no worktree da task; com cartaId, entra na sessão da carta. */
  terminal: {
    abrir(taskId: string, cartaId: string | null, cols: number, rows: number): Promise<Resultado<string>>
    escrever(id: string, dados: string): void
    redimensionar(id: string, cols: number, rows: number): void
    fechar(id: string): void
    aoEvento(cb: (e: { id: string; dados?: string; saiu?: number }) => void): () => void
  }
  /** Barra própria (sem a barra nativa do sistema). */
  janela: {
    acao(a: "minimizar" | "maximizar" | "fechar"): void
    maximizada(): Promise<boolean>
    aoMaximizar(cb: (maximizada: boolean) => void): () => void
  }
  /** Contas de IA e uso (pacote 1). */
  contas: {
    listar(): Promise<EstadoContas>
    /** `ambiente`: "local" (padrão) ou "wsl:<distro>" (RF 2.37). */
    conectar(cli: CliId, nome: string, ambiente?: string): Promise<Resultado<Conta>>
    usarConfigPadrao(cli: CliId, nome: string, ambiente?: string): Promise<Resultado<Conta>>
    entrar(id: string): Promise<Resultado<null>>
    /** Login real (roda a CLI com a config da conta). */
    status(id: string): Promise<Resultado<StatusLogin>>
    /** Login da config padrão da CLI no ambiente, antes de cadastrar. */
    statusPadrao(cli: CliId, ambiente?: string): Promise<StatusLogin>
    padrao(id: string): Promise<Resultado<null>>
    remover(id: string): Promise<Resultado<null>>
  }
  cartas: {
    listar(): Promise<Carta[]>
    salvar(carta: Carta): Promise<Resultado<Carta>>
    duplicar(id: string): Promise<Resultado<Carta>>
    excluir(id: string): Promise<Resultado<null>>
  }
  /** Onde dá para rodar: o local primeiro, depois as distros do WSL (só no Windows). */
  ambientes: {
    listar(): Promise<AmbienteExec[]>
  }
  clis: {
    /** Todas as CLIs em todos os ambientes (cada item traz `ambiente`), ou só as de `ambiente`. */
    detectar(ambiente?: string): Promise<CliInstalada[]>
  }
  projetos: {
    listar(): Promise<Projeto[]>
    /** Em que projetos cada carta está (RF 1.03). */
    usos(): Promise<UsoDaCarta[]>
    criar(novo: NovoProjeto): Promise<Resultado<Projeto>>
    atualizar(id: string, ajustes: AjustesProjeto): Promise<Resultado<Projeto>>
    preferencias(id: string, p: Partial<PreferenciasMesa>): Promise<void>
    reordenar(ids: string[]): Promise<Projeto[]>
    contarTasks(id: string): Promise<number>
    excluir(id: string): Promise<Resultado<null>>
    /** Abre o seletor de pasta do sistema; null se o usuário cancelar. */
    /** Abre o seletor de pasta; com "wsl:<distro>", já na home da distro. */
    escolherPasta(ambiente?: string): Promise<string | null>
    /** `ambiente`: o do projeto, para caminho Linux solto; um \\wsl.localhost\... já diz o ambiente (RF 2.37). */
    inspecionarRepositorio(pasta: string, ambiente?: string): Promise<Resultado<Repositorio>>
  }
  mesa: {
    carregar(projetoId: string): Promise<Mesa>
    colocar(projetoId: string, cartaId: string, x: number, y: number): Promise<Resultado<{ mesa: Mesa; criadas: Conexao[] }>>
    tirar(projetoId: string, cartaId: string): Promise<Mesa>
    mover(projetoId: string, posicoes: { cartaId: string; x: number; y: number }[]): Promise<Mesa>
    ligar(projetoId: string, de: string, para: string): Promise<Resultado<Mesa>>
    atualizarConexao(id: string, mudanca: MudancaConexao): Promise<Resultado<Mesa>>
    moverOrdem(id: string, delta: -1 | 1): Promise<Resultado<Mesa>>
    removerConexao(id: string): Promise<Resultado<Mesa>>
    ligarSequencia(projetoId: string): Promise<Mesa>
    organizar(projetoId: string): Promise<Mesa>
  }
  tasks: {
    criar(nova: NovaTask): Promise<Resultado<Task>>
    iniciar(id: string): Promise<Resultado<Task>>
    parar(id: string): Promise<Resultado<Task>>
    /** RF 6.27: libera mais uma volta na task que espera decisão. */
    liberar(id: string, resposta?: string): Promise<Resultado<Task>>
    /** Carta travada: aceita a entrega como está e segue (concluída com pendências). */
    seguir(id: string): Promise<Resultado<Task>>
    listar(projetoId?: string): Promise<Task[]>
    obter(id: string): Promise<DetalheTask | null>
    /** Crônica; com `console`, também as linhas do console. */
    eventos(id: string, opcoes?: { console?: boolean; depois?: number }): Promise<EventoTask[]>
    /** Erros e avisos do fluxo da mesa (RF 6.18). */
    validar(projetoId: string, taskId?: string): Promise<{ erros: string[]; avisos: string[] }>
    /** RF 6.13: inicia as prontas do projeto na ordem de chegada; as que não cabem vão para a fila. */
    iniciarTodas(projetoId: string): Promise<{ iniciadas: string[]; fila: string[]; erros: { taskId: string; erro: string }[] }>
    /** RF 6.17: descarta uma task pronta. */
    descartar(id: string): Promise<Resultado<Task>>
    /** RF 6.16 */
    tirarDaFila(id: string): Promise<Resultado<Task>>
    /** RF 6.06 e 6.07: só em task que não começou. */
    tirarCarta(taskId: string, cartaId: string): Promise<Resultado<Task>>
    devolverCarta(taskId: string, cartaId: string): Promise<Resultado<Task>>
    /** Task em revisão: arquivos e patch da branch contra a base. */
    diff(taskId: string): Promise<Resultado<DiffTask>>
    /** Task em revisão: abre o PR ("pr") ou faz o merge local ("merge") e conclui. */
    aceitar(taskId: string, modo: "pr" | "merge" | "nada"): Promise<Resultado<Task>>
    /** Task em revisão: volta ao trabalho na mesma branch com o ajuste. */
    pedirAjuste(taskId: string, texto: string): Promise<Resultado<Task>>
    /** Trilha da task antes de iniciar, com o fluxo religado e os erros. */
    previa(taskId: string): Promise<PreviaTask | null>
    /** Task parada com commits na branch: volta para revisão (diff, aceitar, ajuste, descartar). */
    revisar(id: string): Promise<Resultado<Task>>
    /** RF 6.41: reabre uma task parada como task nova e pronta. */
    reabrir(id: string): Promise<Resultado<Task>>
    /** Busca de novo o card da fonte e grava em task.card. */
    atualizarCard(id: string): Promise<Resultado<Task>>
    /** RF 8.06 */
    buscar(projetoId: string, termo: string): Promise<Task[]>
    /** Chame depois de aumentar as vagas do projeto: começa as da fila que passaram a caber. */
    andarFila(projetoId: string): Promise<void>
    pendencias(projetoId?: string): Promise<number>
    /** Recebe tudo que o motor emite; devolve a função que para de escutar. */
    aoEvento(cb: (e: EventoMotor) => void): () => void
  }
  apoio: {
    catalogo(): Promise<TipoApoio[]>
    listar(projetoId: string): Promise<CartaApoio[]>
    criar(n: NovaCartaApoio): Promise<Resultado<CartaApoio>>
    atualizar(id: string, p: Partial<Pick<CartaApoio, "nome" | "ambiente" | "urlBase" | "x" | "y" | "mcp" | "usuarios">>): Promise<Resultado<CartaApoio>>
    remover(id: string): Promise<Resultado<null>>
    ferramentasMcp(id: string): Promise<Resultado<{ nome: string; descricao: string }[]>>
    desligarNaTask(taskId: string, id: string, desligado: boolean): Promise<Resultado<null>>
    daTask(taskId: string): Promise<{ artefatos: Artefato[]; desligadas: string[]; usadas: string[] }>
    pendentes(taskId?: string): Promise<Artefato[]>
    confirmar(id: string): Promise<Resultado<Artefato>>
    descartar(id: string): Promise<Resultado<Artefato>>
    memoriaListar(projetoId: string): Promise<{ id: string; projetoId: string; titulo: string; texto: string; criadoEm: number }[]>
    memoriaSalvar(projetoId: string, titulo: string, texto: string, id?: string): Promise<Resultado<unknown>>
    memoriaExcluir(id: string): Promise<Resultado<null>>
    aoEvento(cb: (e: EventoApoio) => void): () => void
  }
  monitores: {
    conectores(): Promise<{ id: string; nome: string }[]>
    listar(projetoId: string): Promise<Monitor[]>
    criar(n: NovoMonitor): Promise<Resultado<Monitor>>
    atualizar(id: string, p: Partial<Omit<Monitor, "id" | "projetoId">>): Promise<Resultado<Monitor>>
    excluir(id: string): Promise<Resultado<null>>
    buscarAgora(id: string): Promise<Resultado<Monitor>>
    aoEvento(cb: (e: EventoMonitor) => void): () => void
  }
  maestro: {
    abrir(projetoId: string): Promise<EstadoChat>
    estado(projetoId: string): Promise<EstadoChat>
    enviar(projetoId: string, texto: string): Promise<ResultadoMaestro<MensagemChat[]>>
    agir(mensagemId: string, acaoId: string): Promise<ResultadoMaestro<unknown>>
    naoLidas(projetoId: string): Promise<number>
    resolverFora(projetoId: string, taskId?: string): Promise<void>
    aoEvento(cb: (e: EventoMaestro) => void): () => void
  }
  /** E10: Loja e biblioteca locais. */
  biblioteca: {
    itens(tipo?: TipoItem): Promise<ItemBiblioteca[]>
    criarItem(n: NovoItem): Promise<Resultado<ItemBiblioteca>>
    excluirItem(id: string): Promise<Resultado<null>>
    loja(): Promise<AgenteLoja[]>
    /** Copia o agente para a coleção. */
    adicionar(lojaId: string): Promise<Resultado<Carta>>
    publicar(cartaId: string, descricao: string, categoria: string): Promise<Resultado<AgenteLoja>>
    despublicar(lojaId: string): Promise<Resultado<null>>
  }
  /** Conversa direta com a carta, sem o Maestro. */
  conversa: {
    listar(cartaId: string): Promise<MensagemDireta[]>
    enviar(cartaId: string, projetoId: string, texto: string): Promise<Resultado<MensagemDireta[]>>
  }
  /** E8: visão geral e acabamento. */
  fontes: {
    listar(): Promise<Fonte[]>
    criar(n: NovaFonte): Promise<Resultado<Fonte>>
    atualizar(id: string, n: Partial<NovaFonte>): Promise<Resultado<Fonte>>
    remover(id: string): Promise<Resultado<null>>
    /** Confere a conexão; o valor é uma frase curta do que foi encontrado. */
    testar(id: string): Promise<Resultado<string>>
    /** Ferramentas (com o schema dos argumentos) de um servidor MCP ainda não salvo e o mapeamento automático (formulário do MCP próprio). */
    ferramentas(config: Record<string, unknown>): Promise<Resultado<{ tools: FerramentaDoServidor[]; mapa: MapaMcp }>>
    projetos(id: string): Promise<Resultado<ProjetoDaFonte[]>>
    tasks(id: string, projetoId: string): Promise<Resultado<TaskDaFonte[]>>
    /** Traz as tasks abertas do projeto da fonte que ainda não viraram task; o valor é quantas vieram. */
    buscar(projetoId: string): Promise<Resultado<number>>
    /** Servidores MCP configurados na Claude Code (Windows e WSL), para preencher o formulário da fonte. */
    mcpsClaude(): Promise<McpDaClaude[]>
  }
  contexto: {
    projeto(id: string, texto: string): Promise<Resultado<null>>
    task(id: string, texto: string): Promise<Resultado<null>>
  }
  geral: {
    /** RF 2.16 e 2.18: time e fluxo de cada projeto. */
    resumo(): Promise<ResumoProjeto[]>
    /** RF 6.39: notificação do sistema; devolve o resumo para o toast. */
    concluida(taskId: string): Promise<ResumoConclusao | null>
    /** A task precisa de você: notificação do sistema se a janela estiver em segundo plano. */
    pendencia(taskId: string, tipo: "decisao" | "revisao"): Promise<void>
    /** Clique numa notificação: abrir esta task. */
    aoAbrirTask(cb: (taskId: string) => void): () => void
    /** RF 2.21: true só no primeiro acesso. */
    boasVindas(): Promise<boolean>
    concluirBoasVindas(): Promise<void>
    /** RF 2.33: o tutorial já foi visto (ou pulado)? */
    tutorialVisto(): Promise<boolean>
    concluirTutorial(): Promise<void>
    /** RF 2.23 */
    apagarTudo(): Promise<Resultado<null>>
  }
}
