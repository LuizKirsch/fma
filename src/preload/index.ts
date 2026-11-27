/**
 * Preload: a ponte entre a interface e o núcleo.
 * Expõe em `window.fma` só as chamadas da FmaApi; cada uma vira um pedido IPC ao processo principal.
 */
import { contextBridge, ipcRenderer } from "electron"
import type { FmaApi } from "@shared/tipos"
import { CANAL_MOTOR, type EventoMotor } from "@shared/task"
import { CANAL_EVENTO_MAESTRO, type EventoMaestro } from "@shared/maestro"

const escutar = <T,>(canal: string) => (cb: (e: T) => void) => {
  const f = (_e: unknown, ev: T) => cb(ev)
  ipcRenderer.on(canal, f)
  return () => void ipcRenderer.removeListener(canal, f)
}

const api: FmaApi = {
  plataforma: process.platform,
  terminal: {
    abrir: (taskId, cartaId, cols, rows) => ipcRenderer.invoke("pty:abrir", taskId, cartaId, cols, rows),
    escrever: (id, dados) => ipcRenderer.send("pty:escrever", id, dados),
    redimensionar: (id, cols, rows) => ipcRenderer.send("pty:redimensionar", id, cols, rows),
    fechar: (id) => ipcRenderer.send("pty:fechar", id),
    aoEvento: escutar("pty:evento"),
  },
  janela: {
    acao: (a) => ipcRenderer.send("janela:acao", a),
    maximizada: () => ipcRenderer.invoke("janela:maximizada"),
    aoMaximizar: (cb) => { const f = (_e: unknown, m: boolean) => cb(m); ipcRenderer.on("janela:maximizada", f); return () => { ipcRenderer.removeListener("janela:maximizada", f) } },
  },
  contas: {
    listar: () => ipcRenderer.invoke("contas:listar"),
    conectar: (cli, nome, ambiente) => ipcRenderer.invoke("contas:conectar", cli, nome, ambiente),
    usarConfigPadrao: (cli, nome, ambiente) => ipcRenderer.invoke("contas:usar-config-padrao", cli, nome, ambiente),
    entrar: (id) => ipcRenderer.invoke("contas:entrar", id),
    status: (id) => ipcRenderer.invoke("contas:status", id),
    statusPadrao: (cli, ambiente) => ipcRenderer.invoke("contas:status-padrao", cli, ambiente),
    padrao: (id) => ipcRenderer.invoke("contas:padrao", id),
    remover: (id) => ipcRenderer.invoke("contas:remover", id),
  },
  cartas: {
    listar: () => ipcRenderer.invoke("cartas:listar"),
    salvar: (carta) => ipcRenderer.invoke("cartas:salvar", carta),
    duplicar: (id) => ipcRenderer.invoke("cartas:duplicar", id),
    excluir: (id) => ipcRenderer.invoke("cartas:excluir", id),
  },
  ambientes: {
    listar: () => ipcRenderer.invoke("ambientes:listar"),
  },
  clis: {
    detectar: (ambiente) => ipcRenderer.invoke("clis:detectar", ambiente),
  },
  projetos: {
    listar: () => ipcRenderer.invoke("projetos:listar"),
    usos: () => ipcRenderer.invoke("projetos:usos"),
    criar: (novo) => ipcRenderer.invoke("projetos:criar", novo),
    atualizar: (id, ajustes) => ipcRenderer.invoke("projetos:atualizar", id, ajustes),
    preferencias: (id, p) => ipcRenderer.invoke("projetos:preferencias", id, p),
    reordenar: (ids) => ipcRenderer.invoke("projetos:reordenar", ids),
    contarTasks: (id) => ipcRenderer.invoke("projetos:contarTasks", id),
    excluir: (id) => ipcRenderer.invoke("projetos:excluir", id),
    escolherPasta: (ambiente) => ipcRenderer.invoke("projetos:escolherPasta", ambiente),
    inspecionarRepositorio: (pasta, ambiente) => ipcRenderer.invoke("projetos:inspecionarRepositorio", pasta, ambiente),
  },
  mesa: {
    carregar: (projetoId) => ipcRenderer.invoke("mesa:carregar", projetoId),
    colocar: (projetoId, cartaId, x, y) => ipcRenderer.invoke("mesa:colocar", projetoId, cartaId, x, y),
    tirar: (projetoId, cartaId) => ipcRenderer.invoke("mesa:tirar", projetoId, cartaId),
    mover: (projetoId, posicoes) => ipcRenderer.invoke("mesa:mover", projetoId, posicoes),
    ligar: (projetoId, de, para) => ipcRenderer.invoke("mesa:ligar", projetoId, de, para),
    atualizarConexao: (id, mudanca) => ipcRenderer.invoke("mesa:atualizarConexao", id, mudanca),
    moverOrdem: (id, delta) => ipcRenderer.invoke("mesa:moverOrdem", id, delta),
    removerConexao: (id) => ipcRenderer.invoke("mesa:removerConexao", id),
    ligarSequencia: (projetoId) => ipcRenderer.invoke("mesa:ligarSequencia", projetoId),
    organizar: (projetoId) => ipcRenderer.invoke("mesa:organizar", projetoId),
  },
  tasks: {
    criar: (nova) => ipcRenderer.invoke("tasks:criar", nova),
    iniciar: (id) => ipcRenderer.invoke("tasks:iniciar", id),
    parar: (id) => ipcRenderer.invoke("tasks:parar", id),
    liberar: (id, resposta) => ipcRenderer.invoke("tasks:liberar", id, resposta),
    seguir: (id) => ipcRenderer.invoke("tasks:seguir", id),
    listar: (projetoId) => ipcRenderer.invoke("tasks:listar", projetoId),
    obter: (id) => ipcRenderer.invoke("tasks:obter", id),
    eventos: (id, opcoes) => ipcRenderer.invoke("tasks:eventos", id, opcoes),
    validar: (projetoId, taskId) => ipcRenderer.invoke("tasks:validar", projetoId, taskId),
    iniciarTodas: (projetoId) => ipcRenderer.invoke("tasks:iniciar-todas", projetoId),
    descartar: (id) => ipcRenderer.invoke("tasks:descartar", id),
    tirarDaFila: (id) => ipcRenderer.invoke("tasks:tirar-da-fila", id),
    tirarCarta: (taskId, cartaId) => ipcRenderer.invoke("tasks:tirar-carta", taskId, cartaId),
    devolverCarta: (taskId, cartaId) => ipcRenderer.invoke("tasks:devolver-carta", taskId, cartaId),
    diff: (taskId) => ipcRenderer.invoke("tasks:diff", taskId),
    aceitar: (taskId, modo) => ipcRenderer.invoke("tasks:aceitar", taskId, modo),
    pedirAjuste: (taskId, texto) => ipcRenderer.invoke("tasks:pedir-ajuste", taskId, texto),
    previa: (taskId) => ipcRenderer.invoke("tasks:previa", taskId),
    reabrir: (id) => ipcRenderer.invoke("tasks:reabrir", id),
    atualizarCard: (id) => ipcRenderer.invoke("tasks:atualizar-card", id),
    revisar: (id) => ipcRenderer.invoke("tasks:revisar", id),
    buscar: (projetoId, termo) => ipcRenderer.invoke("tasks:buscar", projetoId, termo),
    andarFila: (projetoId) => ipcRenderer.invoke("tasks:andar-fila", projetoId),
    pendencias: (projetoId) => ipcRenderer.invoke("tasks:pendencias", projetoId),
    aoEvento: (cb) => {
      const f = (_e: unknown, ev: EventoMotor) => cb(ev)
      ipcRenderer.on(CANAL_MOTOR, f)
      return () => void ipcRenderer.removeListener(CANAL_MOTOR, f)
    },
  },
  apoio: {
    catalogo: () => ipcRenderer.invoke("apoio:catalogo"),
    listar: (projetoId) => ipcRenderer.invoke("apoio:listar", projetoId),
    criar: (n) => ipcRenderer.invoke("apoio:criar", n),
    atualizar: (id, p) => ipcRenderer.invoke("apoio:atualizar", id, p),
    remover: (id) => ipcRenderer.invoke("apoio:remover", id),
    ferramentasMcp: (id) => ipcRenderer.invoke("apoio:ferramentas-mcp", id),
    desligarNaTask: (taskId, id, d) => ipcRenderer.invoke("apoio:desligar-na-task", taskId, id, d),
    daTask: (taskId) => ipcRenderer.invoke("apoio:da-task", taskId),
    pendentes: (taskId) => ipcRenderer.invoke("apoio:pendentes", taskId),
    confirmar: (id) => ipcRenderer.invoke("apoio:confirmar", id),
    descartar: (id) => ipcRenderer.invoke("apoio:descartar", id),
    memoriaListar: (projetoId) => ipcRenderer.invoke("apoio:memoria-listar", projetoId),
    memoriaSalvar: (projetoId, titulo, texto, id) => ipcRenderer.invoke("apoio:memoria-salvar", projetoId, titulo, texto, id),
    memoriaExcluir: (id) => ipcRenderer.invoke("apoio:memoria-excluir", id),
    aoEvento: escutar("apoio:evento"),
  },
  monitores: {
    conectores: () => ipcRenderer.invoke("monitores:conectores"),
    listar: (projetoId) => ipcRenderer.invoke("monitores:listar", projetoId),
    criar: (n) => ipcRenderer.invoke("monitores:criar", n),
    atualizar: (id, p) => ipcRenderer.invoke("monitores:atualizar", id, p),
    excluir: (id) => ipcRenderer.invoke("monitores:excluir", id),
    buscarAgora: (id) => ipcRenderer.invoke("monitores:buscar-agora", id),
    aoEvento: escutar("monitores:evento"),
  },
  maestro: {
    abrir: (projetoId) => ipcRenderer.invoke("maestro:abrir", projetoId),
    estado: (projetoId) => ipcRenderer.invoke("maestro:estado", projetoId),
    enviar: (projetoId, texto) => ipcRenderer.invoke("maestro:enviar", projetoId, texto),
    agir: (mensagemId, acaoId) => ipcRenderer.invoke("maestro:agir", mensagemId, acaoId),
    naoLidas: (projetoId) => ipcRenderer.invoke("maestro:nao-lidas", projetoId),
    resolverFora: (projetoId, taskId) => ipcRenderer.invoke("maestro:resolver-fora", projetoId, taskId),
    aoEvento: escutar<EventoMaestro>(CANAL_EVENTO_MAESTRO),
  },
  conversa: {
    listar: (cartaId) => ipcRenderer.invoke("conversa:listar", cartaId),
    enviar: (cartaId, projetoId, texto) => ipcRenderer.invoke("conversa:enviar", cartaId, projetoId, texto),
  },
  biblioteca: {
    itens: (tipo) => ipcRenderer.invoke("biblioteca:itens", tipo),
    criarItem: (n) => ipcRenderer.invoke("biblioteca:criar-item", n),
    excluirItem: (id) => ipcRenderer.invoke("biblioteca:excluir-item", id),
    loja: () => ipcRenderer.invoke("biblioteca:loja"),
    adicionar: (lojaId) => ipcRenderer.invoke("biblioteca:adicionar", lojaId),
    publicar: (cartaId, d, c) => ipcRenderer.invoke("biblioteca:publicar", cartaId, d, c),
    despublicar: (id) => ipcRenderer.invoke("biblioteca:despublicar", id),
  },
  fontes: {
    listar: () => ipcRenderer.invoke("fontes:listar"),
    criar: (n) => ipcRenderer.invoke("fontes:criar", n),
    atualizar: (id, n) => ipcRenderer.invoke("fontes:atualizar", id, n),
    remover: (id) => ipcRenderer.invoke("fontes:remover", id),
    testar: (id) => ipcRenderer.invoke("fontes:testar", id),
    ferramentas: (config) => ipcRenderer.invoke("fontes:ferramentas", config),
    projetos: (id) => ipcRenderer.invoke("fontes:projetos", id),
    tasks: (id, projetoId) => ipcRenderer.invoke("fontes:tasks", id, projetoId),
    buscar: (projetoId) => ipcRenderer.invoke("fontes:buscar", projetoId),
    mcpsClaude: () => ipcRenderer.invoke("fontes:mcps-claude"),
  },
  contexto: {
    projeto: (id, texto) => ipcRenderer.invoke("contexto:projeto", id, texto),
    task: (id, texto) => ipcRenderer.invoke("contexto:task", id, texto),
  },
  geral: {
    resumo: () => ipcRenderer.invoke("geral:resumo"),
    concluida: (taskId) => ipcRenderer.invoke("geral:concluida", taskId),
    pendencia: (taskId, tipo) => ipcRenderer.invoke("geral:pendencia", taskId, tipo),
    aoAbrirTask: escutar<string>("geral:abrir-task"),
    boasVindas: () => ipcRenderer.invoke("geral:boas-vindas"),
    concluirBoasVindas: () => ipcRenderer.invoke("geral:concluir-boas-vindas"),
    tutorialVisto: () => ipcRenderer.invoke("geral:tutorial-visto"),
    concluirTutorial: () => ipcRenderer.invoke("geral:concluir-tutorial"),
    apagarTudo: () => ipcRenderer.invoke("geral:apagar-tudo"),
  },
}

contextBridge.exposeInMainWorld("fma", api)
