/**
 * Processo principal do FMA: o núcleo.
 * Abre o banco, registra a API que a interface chama (IPC) e abre a janela.
 * A interface nunca toca no banco nem no sistema: tudo passa por aqui.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { abrirBanco, fecharBanco } from "./db"
import { duplicarCarta, excluirCarta, listarCartas, salvarCarta } from "./cartas"
import { detectarClis } from "./clis"
import { ambientes, ehWsl, paraFs, rodar } from "./ambiente"
import { atualizarProjeto, contarTasks, criarProjeto, excluirProjeto, inspecionarRepositorio, listarProjetos, reordenarProjetos, salvarPreferencias, usosDasCartas } from "./projetos"
import { atualizarConexao, carregarMesa, colocarCarta, ligar, ligarSequencia, moverCartas, moverOrdem, organizarMesa, removerConexao, tirarCarta } from "./mesa"
import type { Carta } from "@shared/tipos"
import { registrarIpcContas } from "./contas"
import { registrarIpcBiblioteca } from "./biblioteca"
import { registrarIpcMotor } from "./motor/ipc"
import { registrarIpcFontes } from "./fontes"
import { registrarIpcConversa } from "./conversa"
import { andarFila, pararProcessos, pararTask, retomarAoAbrir } from "./motor/motor"
import { criarDepsApoio, criarDepsMonitor, criarMotorApi, ligarIntegracoes } from "./motor/adaptadores"
import { configurarApoio } from "./apoio/ports"
import { registrarIpcApoio } from "./apoio/ipc"
import { configurarMonitores } from "./monitores/ports"
import { registrarIpcMonitores } from "./monitores/ipc"
import { iniciarAgendador } from "./monitores/servico"
import { registrarIpcMaestro } from "./maestro/ipc"
import { listarTasks } from "./motor/dados"
import { iniciarAtualizacao } from "./atualizacao"
import { apagarTudo, avisarConclusao, concluirBoasVindas, concluirTutorial, tutorialVisto, mostrarBoasVindas, resumoDosProjetos } from "./geral"

let janelaAtual: BrowserWindow | null = null

function registrarApi(db: DatabaseSync) {
  ipcMain.handle("cartas:listar", () => listarCartas(db))
  ipcMain.handle("cartas:salvar", (_e, carta: Carta) => salvarCarta(db, carta))
  ipcMain.handle("cartas:duplicar", (_e, id: string) => duplicarCarta(db, id))
  ipcMain.handle("cartas:excluir", (_e, id: string) => excluirCarta(db, id))
  ipcMain.handle("clis:detectar", async (_e, ambiente?: string) => (await detectarClis()).filter((c) => !ambiente || c.ambiente === ambiente))
  ipcMain.handle("ambientes:listar", () => ambientes())

  ipcMain.handle("projetos:listar", () => listarProjetos(db))
  ipcMain.handle("projetos:usos", () => usosDasCartas(db))
  ipcMain.handle("projetos:criar", (_e, novo) => criarProjeto(db, novo))
  ipcMain.handle("projetos:atualizar", async (_e, id, ajustes) => {
    const r = await atualizarProjeto(db, id, ajustes)
    if (r.ok) void andarFila(db, id) // vagas maiores deixam a fila andar
    return r
  })
  ipcMain.handle("projetos:preferencias", (_e, id, p) => salvarPreferencias(db, id, p))
  ipcMain.handle("projetos:reordenar", (_e, ids) => reordenarProjetos(db, ids))
  ipcMain.handle("projetos:contarTasks", (_e, id) => contarTasks(db, id))
  ipcMain.handle("projetos:excluir", async (_e, id: string) => {
    // RF 2.12: para as tasks em andamento antes de apagar o projeto.
    for (const t of listarTasks(db, id)) if (["andamento", "aguardando"].includes(t.situacao)) await pararTask(db, t.id)
    return excluirProjeto(db, id)
  })
  ipcMain.handle("projetos:escolherPasta", async (_e, ambiente?: string) => {
    // No WSL, o diálogo do Windows abre direto na home da distro (\wsl.localhost<distro>home<usuário>).
    let defaultPath: string | undefined
    if (ambiente && ehWsl(ambiente)) {
      const home = (await rodar(ambiente, "sh", ["-c", "echo $HOME"], { timeout: 8000 }).catch(() => "")).trim()
      defaultPath = paraFs(ambiente, home || "/")
    }
    const r = await dialog.showOpenDialog({ title: "Pasta do repositório", defaultPath, properties: ["openDirectory"] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle("projetos:inspecionarRepositorio", (_e, pasta: string, ambiente?: string) => inspecionarRepositorio(pasta, ambiente))

  registrarIpcContas(db)
  registrarIpcMotor(db, () => janelaAtual)
  registrarIpcFontes(db)
  registrarIpcConversa(db)

  ipcMain.handle("geral:resumo", () => resumoDosProjetos(db))
  ipcMain.handle("geral:concluida", (_e, taskId: string) => avisarConclusao(db, taskId, () => janelaAtual))
  ipcMain.handle("geral:boas-vindas", () => mostrarBoasVindas(db))
  ipcMain.handle("geral:concluir-boas-vindas", () => concluirBoasVindas(db))
  ipcMain.handle("geral:tutorial-visto", () => tutorialVisto(db))
  ipcMain.handle("geral:concluir-tutorial", () => concluirTutorial(db))
  ipcMain.handle("geral:apagar-tudo", () => apagarTudo(db))

  ipcMain.handle("mesa:carregar", (_e, projetoId) => carregarMesa(db, projetoId))
  ipcMain.handle("mesa:colocar", (_e, projetoId, cartaId, x, y) => colocarCarta(db, projetoId, cartaId, x, y))
  ipcMain.handle("mesa:tirar", (_e, projetoId, cartaId) => tirarCarta(db, projetoId, cartaId))
  ipcMain.handle("mesa:mover", (_e, projetoId, posicoes) => moverCartas(db, projetoId, posicoes))
  ipcMain.handle("mesa:ligar", (_e, projetoId, de, para) => ligar(db, projetoId, de, para))
  ipcMain.handle("mesa:atualizarConexao", (_e, id, mudanca) => atualizarConexao(db, id, mudanca))
  ipcMain.handle("mesa:moverOrdem", (_e, id, delta) => moverOrdem(db, id, delta))
  ipcMain.handle("mesa:removerConexao", (_e, id) => removerConexao(db, id))
  ipcMain.handle("mesa:ligarSequencia", (_e, projetoId) => ligarSequencia(db, projetoId))
  ipcMain.handle("mesa:organizar", (_e, projetoId) => organizarMesa(db, projetoId))
}

function criarJanela() {
  const janela = janelaAtual = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1024,
    minHeight: 640,
    title: "FMA",
    backgroundColor: "#11131f", // fundo da mesa, evita o clarão branco ao abrir
    show: false,
    autoHideMenuBar: true,
    // Barra própria do FMA: no Windows e no Linux os botões são da interface (ControlesJanela); no macOS ficam os semáforos nativos.
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 18, y: 22 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  janela.once("ready-to-show", () => janela.show())
  const avisarMaximizada = () => janela.webContents.send("janela:maximizada", janela.isMaximized())
  janela.on("maximize", avisarMaximizada)
  janela.on("unmaximize", avisarMaximizada)
  // Link externo abre no navegador do sistema.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })
  // Em `npm run dev` a interface vem do servidor do Vite, com recarga automática.
  if (process.env.ELECTRON_RENDERER_URL) janela.loadURL(process.env.ELECTRON_RENDERER_URL)
  else janela.loadFile(join(__dirname, "../renderer/index.html"))
}

ipcMain.on("janela:acao", (e, acao: "minimizar" | "maximizar" | "fechar") => {
  const j = BrowserWindow.fromWebContents(e.sender)
  if (!j) return
  if (acao === "minimizar") j.minimize()
  else if (acao === "maximizar") (j.isMaximized() ? j.unmaximize() : j.maximize())
  else j.close()
})
ipcMain.handle("janela:maximizada", (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false)

/** Janela "sempre atual" para os módulos que guardam a referência (o macOS pode recriar a janela). */
const janelaViva = {
  isDestroyed: () => !janelaAtual || janelaAtual.isDestroyed(),
  webContents: { send: (canal: string, ...a: unknown[]) => janelaAtual?.webContents.send(canal, ...a) },
} as unknown as BrowserWindow

let maestro: ReturnType<typeof registrarIpcMaestro> | undefined

app.whenReady().then(async () => {
  const db = abrirBanco()
  registrarApi(db)
  criarJanela()
  configurarApoio(criarDepsApoio(db))
  configurarMonitores(criarDepsMonitor(db))
  registrarIpcApoio(db, janelaViva)
  registrarIpcMonitores(db, janelaViva)
  registrarIpcBiblioteca(db)
  maestro = registrarIpcMaestro(db, janelaViva, criarMotorApi(db))
  ligarIntegracoes(db, maestro)
  iniciarAgendador(db)
  await retomarAoAbrir(db)
  iniciarAtualizacao()
  // macOS: clicar no ícone do dock sem janela aberta cria uma nova.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela()
  })
})

// Windows e Linux fecham o app com a última janela; no macOS ele continua no dock.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
app.on("before-quit", () => { pararProcessos(); void maestro?.parar() })
app.on("will-quit", () => fecharBanco())
