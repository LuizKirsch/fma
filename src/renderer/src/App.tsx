/**
 * Casca do app: cabeçalho com a marca e a navegação, a tela atual e a forja.
 * Áreas: Projetos (abas com a mesa de cada um) e Coleção. O Histórico entra com as tasks.
 */
import { ControlesJanela } from "@/components/ControlesJanela"
import { useEffect, useState } from "react"
import { FolderGit2, Layers, Plug, Settings } from "lucide-react"
import { ORDEM_SUGERIDA } from "@shared/catalogo"
import { cartaNova } from "@shared/carta"
import type { Carta } from "@shared/tipos"
import { useCartas } from "@/data/cartas"
import { Colecao } from "@/views/Colecao"
import { Conexoes } from "@/views/Conexoes"
// MVP: Loja desligada por enquanto
// import { Loja } from "@/views/Loja"
import { AnelDeUso } from "@/components/UsoContas"
import { useContas } from "@/data/contas"
import { ApagarTudo } from "@/components/ApagarTudo"
import { Configuracoes } from "@/components/Configuracoes"
import { Tour, type PassoTour } from "@/components/Tour"
import { GERAL, Projetos } from "@/views/Projetos"
import { useProjetos } from "@/data/projetos"
import { pendenciasDe, usePedidoAbrir, useTasks } from "@/data/tasks"
import { Forja, type Forjar } from "@/components/Forja"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

function Logo() {
  return (
    <svg viewBox="0 0 40 40" className="size-9" aria-hidden>
      <rect x="6" y="8" width="18" height="25" rx="4" transform="rotate(-12 15 20)" fill="oklch(0.72 0.14 245)" opacity=".85" />
      <rect x="12" y="6" width="18" height="25" rx="4" transform="rotate(4 21 18)" fill="oklch(0.68 0.17 295)" opacity=".9" />
      <rect x="17" y="8" width="18" height="25" rx="4" transform="rotate(16 26 20)" fill="oklch(0.83 0.14 82)" />
      <path d="M26 15l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="oklch(0.2 0.04 70)" transform="rotate(16 26 20)" />
    </svg>
  )
}

type PedidoForja = { carta: Carta; nova: boolean; primeira?: boolean; aoSalvar?: (c: Carta) => void }

export default function App() {
  const { cartas } = useCartas()
  const { projetos } = useProjetos()
  const pendencias = pendenciasDe(useTasks())
  const [forja, setForja] = useState<PedidoForja | null>(null)
  const [area, setArea] = useState<"projetos" | "colecao" | "conexoes">("projetos")
  const contas = useContas()
  const [apagando, setApagando] = useState(false)
  const [aba, setAba] = useState(GERAL)
  // Notificação ou toast pediu uma task: vai para o projeto dela (o ProjetoAberto escolhe a task).
  const pedido = usePedidoAbrir()
  useEffect(() => { if (pedido) { setArea("projetos"); setAba(pedido.projetoId) } }, [pedido])
  const [config, setConfig] = useState(false)
  const [tour, setTour] = useState(false)
  const [tourPendente, setTourPendente] = useState(false) // carta forjada dentro do "Novo projeto": o tour espera o projeto
  const abrirTour = () => window.setTimeout(() => setTour(true), 450)
  const fecharFicha = () => document.querySelector<HTMLElement>('[data-slot="sheet-close"]')?.click()
  const ir = (a: typeof area) => () => { fecharFicha(); setArea(a) }
  const abrirFicha = () => { setArea("colecao"); if (!document.querySelector('[data-tour="ficha-abas"]')) document.querySelector<HTMLElement>('[data-tour="carta"]')?.click() }
  // RF 2.34: os oito passos; a ficha abre clicando na primeira carta da Coleção
  const passos: PassoTour[] = [
    { alvo: "nav-colecao", antes: ir("colecao"), titulo: "Sua carta está na Coleção", texto: "Toda carta que você forja fica aqui, e a mesma carta pode jogar em vários projetos." },
    { alvo: "carta", antes: ir("colecao"), titulo: "Clique na carta para abrir a ficha", texto: "Na ficha você troca a conta, o modelo e o esforço, e cuida das habilidades e memórias da carta." },
    { alvo: "ficha-abas", antes: abrirFicha, titulo: "Habilidades e memórias", texto: "Use estas abas para ligar ou tirar itens da biblioteca e criar novos ali mesmo. Memória é o que a carta consulta antes de agir: glossário, regras, padrões." },
    // MVP: Loja desligada por enquanto
    // { alvo: "publicar", antes: abrirFicha, titulo: "Publique para outras pessoas", texto: "Este botão coloca a carta na Loja. Quem adicionar recebe uma cópia com o nome que você deu, e esse nome não pode ser trocado." },
    // { alvo: "nav-loja", antes: ir("loja"), titulo: "Loja", texto: "Cartas prontas de outras pessoas, habilidades e memórias. Crie as suas aqui para reaproveitar em várias cartas." },
    { alvo: "nav-conexoes", antes: ir("conexoes"), titulo: "Conexões", texto: "Contas de IA (mais de uma por CLI) e fontes de tasks. Cada carta usa a conta escolhida na forja." },
    { alvo: "uso", antes: fecharFicha, titulo: "Uso das contas", texto: "Quanto cada conta já gastou nas últimas 5 horas e na semana. Clique para ver o detalhe." },
    { alvo: "nav-projetos", antes: ir("projetos"), titulo: "Pronto para começar", texto: "Crie um projeto, escolha a fonte e as tasks, monte o time na mesa e inicie. Você pode rever este tutorial em Configurações." },
  ]

  /** Abre a forja: com uma carta para editar, ou nova (da classe pedida ou da próxima que falta no time). */
  const forjar: Forjar = ({ carta, classe, aoSalvar }) => {
    if (carta) return setForja({ carta, nova: false, aoSalvar })
    const falta = ORDEM_SUGERIDA.find((k) => !cartas.some((c) => c.classe === k)) ?? "custom"
    setForja({ carta: cartaNova(classe ?? falta), nova: true, primeira: !cartas.length, aoSalvar })
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="grid h-full grid-rows-[60px_1fr]">
        <header className={cn("regiao-arrasto flex items-center gap-4 border-b bg-background/80 pl-5 backdrop-blur", window.fma.plataforma === "darwin" ? "pl-[88px] pr-5" : "pr-0")}>
          <div className="flex items-center gap-2.5">
            <Logo />
            <div className="flex flex-col leading-none">
              <span className="font-display text-[15px] font-semibold tracking-wide">FMA</span>
              <span className="text-[11px] text-muted-foreground">Fantasy Multi Agents</span>
            </div>
          </div>
          <nav className="ml-4 flex items-center gap-1 rounded-xl bg-muted/50 p-1">
            <Button data-tour="nav-projetos" variant={area === "projetos" ? "secondary" : "ghost"} size="sm" onClick={() => setArea("projetos")} className={cn("gap-2", area === "projetos" && "bg-card shadow-sm")}>
              <FolderGit2 data-icon="inline-start" />Projetos
              {projetos.length > 0 && <Badge variant="secondary" className="h-5 min-w-5 px-1.5 tabular">{projetos.length}</Badge>}
              {/* RF 8.21: tasks esperando você */}
              {pendencias > 0 && <Badge className="h-5 min-w-5 bg-warning px-1.5 text-primary-foreground tabular" title={`${pendencias} ${pendencias === 1 ? "task espera" : "tasks esperam"} sua decisão`}>{pendencias}</Badge>}
            </Button>
            <Button data-tour="nav-colecao" variant={area === "colecao" ? "secondary" : "ghost"} size="sm" onClick={() => setArea("colecao")} className={cn("gap-2", area === "colecao" && "bg-card shadow-sm")}>
              <Layers data-icon="inline-start" />Coleção
              {cartas.length > 0 && <Badge variant="secondary" className="h-5 min-w-5 px-1.5 tabular">{cartas.length}</Badge>}
            </Button>
            {/* MVP: Loja desligada por enquanto; Histórico agora fica dentro de cada task */}
            <Button data-tour="nav-conexoes" variant={area === "conexoes" ? "secondary" : "ghost"} size="sm" onClick={() => setArea("conexoes")} className={cn("gap-2", area === "conexoes" && "bg-card shadow-sm")}>
              <Plug data-icon="inline-start" />Conexões
              {/* Sem conta de IA nenhuma carta consegue trabalhar */}
              {contas.carregado && !contas.contas.length && <span className="size-2 rounded-full bg-warning" title="Nenhuma conta de IA conectada" />}
            </Button>
          </nav>
          <div data-tour="uso" className="ml-auto"><AnelDeUso aoGerenciar={() => setArea("conexoes")} /></div>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" title="Configurações" aria-label="Configurações" onClick={() => setConfig(true)}><Settings /></Button>
          <ControlesJanela />
        </header>
        <main className="min-h-0">
          {area === "projetos" ? <Projetos aba={aba} setAba={setAba} forjar={forjar} irColecao={() => setArea("colecao")} aoCriar={() => { if (tourPendente) { setTourPendente(false); abrirTour() } }} /> : area === "conexoes" ? <Conexoes /> : <Colecao forjar={forjar} />}
        </main>
      </div>

      {forja && (
        <Forja aberta={!!forja} aoMudar={(o) => !o && setForja(null)} inicial={forja.carta} nova={forja.nova} aoSalvar={(c) => {
          forja.aoSalvar?.(c)
          if (forja.nova && forja.primeira) void window.fma.geral.tutorialVisto().then((visto) => { if (!visto) { if (forja.aoSalvar) setTourPendente(true); else abrirTour() } })
        }} irConexoes={() => { setForja(null); setArea("conexoes") }} />
      )}
      <Configuracoes aberto={config} aoMudar={setConfig} temCartas={cartas.length > 0} reverTutorial={abrirTour} apagarTudo={() => setApagando(true)} />
      <Tour passos={passos} aberto={tour} aoFechar={() => { setTour(false); fecharFicha(); void window.fma.geral.concluirTutorial() }} />
      <ApagarTudo aberto={apagando} aoMudar={setApagando} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
