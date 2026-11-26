/**
 * Mesa do projeto (T03, RF 3.01 a 3.27): mundo sem limite em SVG + divs com transform.
 * Mover o fundo e a roda do mouse dão pan e zoom; a mão fica embaixo; o conector dourado de cada carta
 * puxa conexões; o painel mostra a validação do fluxo e edita as conexões.
 * O núcleo guarda tudo e devolve a mesa inteira a cada mudança; aqui só se desenha e se pergunta.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as PE } from "react"
import { toast } from "sonner"
import { ok } from "@/data/tasks"
import { LayoutGrid, Maximize, MoreVertical, PanelRightClose, PanelRightOpen, Pencil, Play, Route, Spline, SquareDashed, Undo2, ZoomIn, ZoomOut, MessageCircle, Plug } from "lucide-react"
import { cn } from "@/lib/utils"
import { icone } from "@/lib/icones"
import { CLASSES } from "@shared/catalogo"
import { CARTA_H, CARTA_W, espacosSugeridos, type Conexao, type Mesa as MesaT, type MudancaConexao, type No } from "@shared/mesa"
import { validarFluxo } from "@shared/fluxo"
import type { Resultado } from "@shared/tipos"
import type { Projeto, Vista } from "@shared/projeto"
import type { EstadoCarta } from "@shared/task"
import { useCartas } from "@/data/cartas"
import { recarregarProjetos } from "@/data/projetos"
import { CartaVisual } from "@/components/CartaVisual"
import { PainelMesa } from "@/components/PainelMesa"
import { APOIO_H, APOIO_W, CartaApoioVisual, CatalogoApoio, corApoio, EditorApoio } from "@/components/CartaApoio"
import { useApoio } from "@/data/apoio"
import type { CartaApoio, TipoApoio } from "@shared/apoio"
import type { Forjar } from "@/components/Forja"
import { FichaCarta, type AlvoFicha } from "@/components/FichaCarta"
import { ConversaCarta } from "@/components/ConversaCarta"
import { MenuCartaMesa } from "@/components/MenuCartaMesa"
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

const ZOOM = { min: 0.2, max: 2 }
const limitar = (z: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, z))
const COR = { entrega: "var(--primary)", questiona: "var(--warning)" }
type Pt = { x: number; y: number }

/** Arrasto por ponteiro com limiar de 4px: chama `mover` com o deslocamento e `fim` ao soltar. */
function arrastar(e: PE, mover: (dx: number, dy: number, ev: PointerEvent) => void, fim: (moveu: boolean, ev: PointerEvent) => void) {
  e.stopPropagation()
  const x0 = e.clientX, y0 = e.clientY
  let moveu = false
  const mv = (ev: PointerEvent) => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0
    if (!moveu && Math.hypot(dx, dy) < 4) return
    moveu = true
    mover(dx, dy, ev)
  }
  const up = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", mv)
    window.removeEventListener("pointerup", up)
    fim(moveu, ev)
  }
  window.addEventListener("pointermove", mv)
  window.addEventListener("pointerup", up)
}
const sobreAMao = (ev: PointerEvent) => !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-mao]")

function BotaoBarra({ rotulo, onClick, ativo, children }: { rotulo: string; onClick: () => void; ativo?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon-sm" variant={ativo ? "secondary" : "ghost"} aria-label={rotulo} aria-pressed={ativo} onClick={onClick}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{rotulo}</TooltipContent>
    </Tooltip>
  )
}

export function Mesa({ projeto, forjar, avisoMaestro, atividades }: { projeto: Projeto; forjar: Forjar; avisoMaestro: () => void; atividades?: Map<string, { estado: EstadoCarta; atividade: string }> }) {
  const { cartas } = useCartas()
  const porId = useMemo(() => new Map(cartas.map((c) => [c.id, c])), [cartas])
  const raiz = useRef<HTMLDivElement>(null)
  const [ficha, setFicha] = useState<AlvoFicha | null>(null)
  const [conversa, setConversa] = useState<string | null>(null)
  const [mesa, setMesa] = useState<MesaT | null>(null)
  const [vista, setVista] = useState<Vista>(projeto.vista ?? { x: 60, y: 40, z: 0.6 })
  const [arrasto, setArrasto] = useState<Record<string, Pt>>({})
  const [curvando, setCurvando] = useState<Record<string, Pt>>({})
  const [ligando, setLigando] = useState<{ de: string; x: number; y: number } | null>(null)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [sobreMao, setSobreMao] = useState(false)
  const [painel, setPainel] = useState(true)
  const [pedeSequencia, setPedeSequencia] = useState(false)
  const [conexoesVisiveis, setConexoesVisiveis] = useState(projeto.conexoesVisiveis)
  const [sugestoes, setSugestoes] = useState(projeto.mostrarSugestoes)

  useEffect(() => { void window.fma.mesa.carregar(projeto.id).then(setMesa) }, [projeto.id])

  /* ---------- cartas de apoio (módulo 4) ---------- */
  const apoio = useApoio(projeto.id)
  const [catalogo, setCatalogo] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [apoioSel, setApoioSel] = useState<string | null>(null)
  const [sobreApoio, setSobreApoio] = useState<string | null>(null)
  const [plugue, setPlugue] = useState<{ id: string; x: number; y: number } | null>(null)
  const tipoDe = (c: CartaApoio) => apoio.tipos.find((t) => t.chave === c.tipo)
  const posApoio = (c: CartaApoio): Pt => arrasto[c.id] ?? c
  const time = mesa ? mesa.cartas.flatMap((m) => porId.get(m.cartaId) ?? []) : []
  // RF 3.29: carta de PR sem a carta de apoio Git.
  const avisoGit = time.some((c) => c.classe === "pr") && !apoio.cartas.some((c) => c.tipo === "git")
    ? "A carta de Pull Request precisa da carta de apoio Repositório Git para abrir o PR." : null

  /* ---------- dados derivados ---------- */
  const nome = (cartaId: string) => porId.get(cartaId)?.nome ?? "?"
  const nos: No[] = useMemo(() => !mesa ? [] : mesa.cartas.flatMap((m) => {
    const k = porId.get(m.cartaId), p = arrasto[m.cartaId] ?? m
    return k ? [{ id: m.cartaId, classe: k.classe, x: p.x, y: p.y }] : []
  }), [mesa, porId, arrasto])
  const fluxo = useMemo(() => validarFluxo(nos.map((n) => ({ id: n.id, nome: nome(n.id), classe: n.classe })), mesa?.conexoes ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nos, mesa, porId])
  const pos = (id: string): Pt => nos.find((n) => n.id === id) ?? { x: 0, y: 0 }
  const espacos = useMemo(() => espacosSugeridos(nos), [nos])
  const mao = cartas.filter((c) => !mesa?.cartas.some((m) => m.cartaId === c.id))
  const doCirculo = new Set(fluxo.erros.flatMap((e) => e.cartaIds))

  /* ---------- vista: pan, zoom, enquadrar ---------- */
  const tamanho = () => { const r = raiz.current!.getBoundingClientRect(); return { w: r.width, h: r.height } }
  const zoomEm = (px: number, py: number, fator: number) =>
    setVista((v) => { const z = limitar(v.z * fator), k = z / v.z; return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k } })
  const zoomCentro = (fator: number) => { const { w, h } = tamanho(); zoomEm(w / 2, h / 2, fator) }

  function enquadrar(m: MesaT | null = mesa, comEspacos = sugestoes) {
    if (!raiz.current) return
    const { w, h } = tamanho()
    if (!w || !h) return // sem tamanho ainda: enquadrar agora geraria uma vista inútil (e ela seria salva)
    const pts =[...(m?.cartas ?? []).map((c) => ({ x: c.x, y: c.y })), ...(comEspacos ? espacos : [])]
    if (!pts.length) return setVista({ x: w / 2, y: h / 3, z: 1 })
    const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x)) + CARTA_W
    const y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y)) + CARTA_H
    const z = limitar(Math.min((w - 120) / (x1 - x0), (h - 200) / (y1 - y0), 1))
    setVista({ z, x: (w - (x1 - x0) * z) / 2 - x0 * z, y: (h - 150 - (y1 - y0) * z) / 2 - y0 * z + 20 })
  }

  // Projeto sem vista salva: enquadra tudo quando a mesa chega.
  const enquadrou = useRef(false)
  useEffect(() => {
    if (mesa && !projeto.vista && !enquadrou.current) { enquadrou.current = true; enquadrar(mesa) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesa])

  // Roda do mouse = zoom no ponto do cursor. Precisa ser nativo para poder cancelar a rolagem.
  useEffect(() => {
    const el = raiz.current
    if (!el) return // a mesa ainda está carregando (o div com a ref só aparece depois)
    const f = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-sem-zoom]")) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomEm(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015))
    }
    el.addEventListener("wheel", f, { passive: false })
    return () => el.removeEventListener("wheel", f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!mesa])

  // Guarda posição e zoom um instante depois de o usuário parar de mexer.
  const primeira = useRef(true)
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return }
    const t = setTimeout(() => void window.fma.projetos.preferencias(projeto.id, { vista }).then(recarregarProjetos), 700)
    return () => clearTimeout(t)
  }, [vista, projeto.id])

  function preferencia(p: { conexoesVisiveis?: boolean; mostrarSugestoes?: boolean }) {
    void window.fma.projetos.preferencias(projeto.id, p).then(recarregarProjetos)
  }

  const paraMundo = (cx: number, cy: number): Pt => {
    const r = raiz.current!.getBoundingClientRect()
    return { x: (cx - r.left - vista.x) / vista.z, y: (cy - r.top - vista.y) / vista.z }
  }

  /* ---------- ações no núcleo ---------- */
  const tratar = (r: Resultado<MesaT>) => (r.ok ? setMesa(r.valor) : toast.error(r.erro))

  async function colocar(cartaId: string, x: number, y: number) {
    const r = await window.fma.mesa.colocar(projeto.id, cartaId, x, y)
    if (!r.ok) return toast.error(r.erro)
    setMesa(r.valor.mesa)
    void recarregarProjetos()
    void apoio.recarregar()
    const { criadas } = r.valor
    // RF 3.06: avisa o que foi ligado sozinho.
    if (criadas.length) toast.success("Ligadas sozinhas", {
      description: <ul>{criadas.map((c) => <li key={c.id}>{nome(c.deCartaId)} → {nome(c.paraCartaId)} ({c.tipo === "entrega" ? "Entrega" : "Questiona"})</li>)}</ul>,
    })
  }
  async function tirar(cartaId: string) {
    setMesa(await window.fma.mesa.tirar(projeto.id, cartaId))
    void recarregarProjetos()
    void apoio.recarregar()
  }
  function mover(cartaId: string, p: Pt) {
    setMesa((m) => m && { ...m, cartas: m.cartas.map((c) => (c.cartaId === cartaId ? { ...c, x: Math.round(p.x), y: Math.round(p.y) } : c)) })
    void window.fma.mesa.mover(projeto.id, [{ cartaId, x: p.x, y: p.y }])
  }
  async function colocarApoio(t: TipoApoio) {
    const p = centro()
    const c = ok(await window.fma.apoio.criar({ projetoId: projeto.id, tipo: t.chave, x: Math.round(p.x - APOIO_W / 2), y: Math.round(p.y - APOIO_H / 2) }))
    if (!c) return
    await apoio.recarregar()
    if (t.origem === "mcp" || t.usaAmbiente) setEditando(c.id) // falta configurar o servidor ou conferir o ambiente
  }
  async function removerApoio(c: CartaApoio) {
    ok(await window.fma.apoio.remover(c.id))
    void apoio.recarregar()
  }
  function arrastarApoio(e: PE, c: CartaApoio) {
    if (e.button !== 0) return
    const base = { x: c.x, y: c.y }
    let ultimo = base
    setApoioSel(c.id)
    arrastar(e, (dx, dy) => { ultimo = { x: base.x + dx / vista.z, y: base.y + dy / vista.z }; setArrasto({ [c.id]: ultimo }) }, async (moveu) => {
      setArrasto({})
      if (!moveu) return setEditando(c.id)
      const novo = { x: Math.round(ultimo.x), y: Math.round(ultimo.y) }
      apoio.setCartas((l) => l.map((o) => (o.id === c.id ? { ...o, ...novo } : o)))
      await window.fma.apoio.atualizar(c.id, novo)
    })
  }
  /** RF 4.04: puxar o plugue até uma carta liga ou desliga o uso. */
  function puxarPlugue(e: PE, c: CartaApoio) {
    if (e.button !== 0) return
    const o = posApoio(c)
    setPlugue({ id: c.id, x: o.x + APOIO_W, y: o.y + APOIO_H / 2 })
    arrastar(e, (_dx, _dy, ev) => setPlugue({ id: c.id, ...paraMundo(ev.clientX, ev.clientY) }), async (_m, ev) => {
      setPlugue(null)
      const alvo = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-carta]")?.dataset.carta
      if (!alvo) return
      const usuarios = c.usuarios.includes(alvo) ? c.usuarios.filter((x) => x !== alvo) : [...c.usuarios, alvo]
      const r = ok(await window.fma.apoio.atualizar(c.id, { usuarios }))
      if (r) { apoio.setCartas((l) => l.map((x) => (x.id === c.id ? r : x))); toast(`${nome(alvo)} ${usuarios.includes(alvo) ? "passa a usar" : "deixa de usar"} ${c.nome}`) }
    })
  }
  const atualizar = async (id: string, m: MudancaConexao) => tratar(await window.fma.mesa.atualizarConexao(id, m))

  /* ---------- gestos ---------- */
  function arrastarCarta(e: PE, cartaId: string, orquestrador: boolean) {
    if (e.button !== 0) return
    const base = pos(cartaId)
    let ultimo = base
    arrastar(e, (dx, dy, ev) => {
      ultimo = { x: base.x + dx / vista.z, y: base.y + dy / vista.z }
      setArrasto({ [cartaId]: ultimo })
      setSobreMao(sobreAMao(ev))
    }, (moveu, ev) => {
      setSobreMao(false)
      if (!moveu) return orquestrador ? avisoMaestro() : undefined
      if (sobreAMao(ev)) void tirar(cartaId) // RF 3.07: soltar na mão tira da mesa
      else mover(cartaId, ultimo)
      setArrasto({})
    })
  }

  function puxarConector(e: PE, de: string) {
    if (e.button !== 0) return
    const origem = pos(de)
    setLigando({ de, x: origem.x + CARTA_W, y: origem.y + CARTA_H / 2 })
    arrastar(e, (_dx, _dy, ev) => setLigando({ de, ...paraMundo(ev.clientX, ev.clientY) }), async (_m, ev) => {
      setLigando(null)
      const alvo = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-carta]")?.dataset.carta
      if (alvo && alvo !== de) tratar(await window.fma.mesa.ligar(projeto.id, de, alvo))
    })
  }

  function puxarLinha(e: PE, c: Conexao, mid: Pt) {
    setSelecionada(c.id)
    let ultimo: Pt | null = null
    arrastar(e, (_dx, _dy, ev) => {
      const p = paraMundo(ev.clientX, ev.clientY)
      ultimo = { x: p.x - mid.x, y: p.y - mid.y }
      setCurvando({ [c.id]: ultimo })
    }, async () => {
      if (ultimo) { setMesa((m) => m && { ...m, conexoes: m.conexoes.map((x) => (x.id === c.id ? { ...x, curvaX: Math.round(ultimo!.x), curvaY: Math.round(ultimo!.y) } : x)) }); await atualizar(c.id, { curva: ultimo }) }
      setCurvando({})
    })
  }

  function fundo(e: PE) {
    if (e.target !== e.currentTarget) return
    setSelecionada(null)
    const base = vista
    arrastar(e, (dx, dy) => setVista({ ...base, x: base.x + dx, y: base.y + dy }), () => {})
  }

  /* ---------- geometria das conexões ---------- */
  /**
   * Linhas como no protótipo v16 (Board.tsx):
   * - Entrega: borda direita → borda esquerda, curva com saídas horizontais; destino à esquerda contorna por baixo.
   * - Questiona: arco por cima, de topo a topo, mais alto quanto mais longe e escalonado pela ordem.
   * O desvio guardado (curvaX/Y) desloca os dois pontos de controle; o ponto de arrastar fica no meio da curva
   * (t = 0,5), então ele acompanha o mouse.
   */
  function geometria(c: Conexao) {
    const pa = pos(c.deCartaId), pb = pos(c.paraCartaId)
    const guardada = c.curvaX !== null && c.curvaY !== null ? { x: c.curvaX, y: c.curvaY } : null
    const desvio = curvando[c.id] ?? guardada ?? { x: 0, y: 0 }
    const k = { x: desvio.x / 0.75, y: desvio.y / 0.75 } // deslocar os 2 controles em k move o meio da curva em 0,75k
    let a: Pt, b: Pt, c1: Pt, c2: Pt
    if (c.tipo === "questiona") {
      a = { x: pa.x + CARTA_W / 2, y: pa.y - 6 }; b = { x: pb.x + CARTA_W / 2, y: pb.y - 6 }
      const topo = Math.min(a.y, b.y) - (46 + Math.abs(a.x - b.x) * 0.12 + c.ordem * 8)
      c1 = { x: a.x, y: topo }; c2 = { x: b.x, y: topo }
    } else {
      a = { x: pa.x + CARTA_W, y: pa.y + CARTA_H / 2 }; b = { x: pb.x, y: pb.y + CARTA_H / 2 }
      if (b.x >= a.x - 10) {
        const dx = Math.max(40, (b.x - a.x) / 2)
        c1 = { x: a.x + dx, y: a.y }; c2 = { x: b.x - dx, y: b.y }
      } else { // destino à esquerda: sai e entra por baixo das cartas
        a = { x: pa.x + CARTA_W / 2, y: pa.y + CARTA_H }; b = { x: pb.x + CARTA_W / 2, y: pb.y + CARTA_H }
        const fundo = Math.max(a.y, b.y) + 90
        c1 = { x: a.x, y: fundo }; c2 = { x: b.x, y: fundo }
      }
    }
    const mid = { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 }
    const d = `M${a.x} ${a.y} C${c1.x + k.x} ${c1.y + k.y} ${c2.x + k.x} ${c2.y + k.y} ${b.x} ${b.y}`
    return { a, b, mid, ponto: { x: mid.x + desvio.x, y: mid.y + desvio.y }, d }
  }

  if (!mesa) return <div className="table-felt h-full" />
  const editada = apoio.cartas.find((c) => c.id === editando)
  const visiveis = (mesa.conexoes).filter((c) => conexoesVisiveis || c.id === selecionada || (sobre && (c.deCartaId === sobre || c.paraCartaId === sobre)))
  const lista = [...mesa.conexoes].sort((a, b) => pos(a.deCartaId).x - pos(b.deCartaId).x || a.tipo.localeCompare(b.tipo) || a.ordem - b.ordem)
  const centro = () => { const { w, h } = tamanho(); return paraMundo(raiz.current!.getBoundingClientRect().left + w / 2, raiz.current!.getBoundingClientRect().top + (h - 150) / 2) }

  return (
    <div className="relative h-full overflow-hidden">
      <div
        ref={raiz}
        className="table-felt relative h-full touch-none overflow-hidden"
        onPointerDown={fundo}
        onDragOver={(e) => e.dataTransfer.types.includes("text/fma-carta") && e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("text/fma-carta")
          if (!id) return
          const p = paraMundo(e.clientX, e.clientY)
          void colocar(id, p.x - CARTA_W / 2, p.y - CARTA_H / 2)
        }}
      >
        <div className="pointer-events-none absolute top-0 left-0 size-0" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})`, transformOrigin: "0 0" }}>
          {/* espaços sugeridos (RF 3.08 a 3.10) */}
          {sugestoes && espacos.map((s) => {
            const classe = CLASSES[s.classe], I = icone(classe.simbolo)
            return (
              <button key={s.classe} className="ghost-slot pointer-events-auto absolute flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground" aria-label={`Forjar ${classe.nome}`}
                style={{ left: s.x, top: s.y, width: CARTA_W, height: CARTA_H, "--c": classe.cor } as React.CSSProperties}
                onClick={() => forjar({ classe: s.classe, aoSalvar: (c) => void colocar(c.id, s.x, s.y) })}>
                <I className="size-9" style={{ color: classe.cor }} strokeWidth={1.4} />
                <span className="font-display text-xs uppercase tracking-wider" style={{ color: classe.cor }}>{classe.nome}</span>
                <span className="text-xs">Forjar e colocar aqui</span>
              </button>
            )
          })}

          <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1">
            <defs>
              <marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="context-stroke" /></marker>
            </defs>
            {visiveis.map((c) => {
              const g = geometria(c), sel = c.id === selecionada
              const grupo = mesa.conexoes.filter((o) => o.deCartaId === c.deCartaId && o.tipo === c.tipo).length
              return (
                <g key={c.id}>
                  <path d={g.d} fill="none" stroke={COR[c.tipo]} strokeWidth={sel ? 3.5 : 2} strokeDasharray={c.tipo === "questiona" ? "8 6" : undefined} markerEnd="url(#seta)" opacity={sel || !selecionada ? 0.95 : 0.45} />
                  <path d={g.d} fill="none" stroke="transparent" strokeWidth={16} className="pointer-events-auto cursor-pointer" style={{ pointerEvents: "stroke" }} onPointerDown={(e) => { e.stopPropagation(); setSelecionada(c.id) }} />
                  <g className="cursor-grab" style={{ pointerEvents: "all" }} onPointerDown={(e) => puxarLinha(e, c, g.mid)} onDoubleClick={() => void atualizar(c.id, { curva: null })}>
                    <circle cx={g.ponto.x} cy={g.ponto.y} r={sel || grupo > 1 ? 10 : 5} fill="var(--card)" stroke={COR[c.tipo]} strokeWidth={2} />
                    {(sel || grupo > 1) && <text x={g.ponto.x} y={g.ponto.y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontFamily="var(--font-mono)" fill="var(--foreground)" pointerEvents="none">{c.ordem + 1}</text>}
                  </g>
                </g>
              )
            })}
            {apoio.cartas.map((c) => {
              const a = posApoio(c), cor = corApoio(tipoDe(c), c)
              const visivel = conexoesVisiveis || apoioSel === c.id || sobreApoio === c.id
              return c.usuarios.map((u) => {
                if (!mesa.cartas.some((x) => x.cartaId === u) || !(visivel || sobre === u)) return null
                const b = pos(u)
                return <path key={c.id + u} d={`M${a.x + APOIO_W / 2} ${a.y + APOIO_H / 2} L${b.x + CARTA_W / 2} ${b.y + CARTA_H / 2}`} stroke={cor} strokeWidth={2} strokeDasharray="2 7" strokeLinecap="round" fill="none" opacity={0.85} />
              })
            })}
            {plugue && (() => {
              const c = apoio.cartas.find((x) => x.id === plugue.id)!, o = posApoio(c)
              return <path d={`M${o.x + APOIO_W} ${o.y + APOIO_H / 2} L${plugue.x} ${plugue.y}`} stroke="var(--primary)" strokeWidth={2.5} strokeDasharray="4 6" className="link-flow" fill="none" />
            })()}
            {ligando && (() => {
              const o = pos(ligando.de)
              return <path d={`M${o.x + CARTA_W} ${o.y + CARTA_H / 2} L${ligando.x} ${ligando.y}`} stroke="var(--primary)" strokeWidth={2.5} strokeDasharray="4 6" className="link-flow" fill="none" markerEnd="url(#seta)" />
            })()}
          </svg>

          {mesa.cartas.map((m) => {
            const k = porId.get(m.cartaId)
            if (!k) return null
            const p = pos(m.cartaId), orq = k.classe === "orquestrador"
            return (
              <ContextMenu key={m.id}><ContextMenuTrigger asChild>
              <div data-carta={k.id} className={cn("group pointer-events-auto absolute rounded-[18px]", doCirculo.has(k.id) && "ring-2 ring-destructive")}
                style={{ left: p.x, top: p.y, width: CARTA_W, height: CARTA_H, zIndex: arrasto[k.id] ? 30 : 1 }}
                onPointerDown={(e) => arrastarCarta(e, k.id, orq)} onPointerEnter={() => setSobre(k.id)} onPointerLeave={() => setSobre(null)}>
                <CartaVisual carta={k} tamanho="md" className={cn(orq && "cursor-pointer")} />
                {atividades?.get(k.id) && (
                  // RF 3.28: o que a carta faz na task acompanhada.
                  <div className={cn("pointer-events-none absolute top-full left-0 mt-2 w-full rounded-md border bg-card/95 px-2 py-1 text-center text-[11px] leading-snug shadow", ["trabalhando", "questionando"].includes(atividades.get(k.id)!.estado) ? "border-info/60" : atividades.get(k.id)!.estado === "concluida" && "border-success/50")}>
                    {atividades.get(k.id)!.atividade || "Esperando"}
                  </div>
                )}
                {fluxo.comeco.includes(k.id) && (
                  <Badge className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 gap-1 shadow"><Play className="size-3 fill-current" />Começa aqui</Badge>
                )}
                {!orq && <span className="absolute top-1/2 -left-1.5 size-3 -translate-y-1/2 rounded-full border-2 border-background bg-muted-foreground" aria-hidden />}
                {!orq && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button aria-label={`Puxar conexão de ${k.nome}`} onPointerDown={(e) => puxarConector(e, k.id)}
                        className="absolute top-1/2 -right-2.5 z-10 size-5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary shadow transition-transform hover:scale-125" />
                    </TooltipTrigger>
                    <TooltipContent>Puxe até outra carta para ligar</TooltipContent>
                  </Tooltip>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-xs" variant="secondary" aria-label={`Menu de ${k.nome}`} onPointerDown={(e) => e.stopPropagation()}
                      className="absolute -top-2 -left-2 z-10 rounded-full opacity-0 shadow group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"><MoreVertical /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={() => forjar({ carta: k })}><Pencil />Editar carta</DropdownMenuItem>
                    {orq && <DropdownMenuItem onSelect={avisoMaestro}><MessageCircle />Conversar com o Maestro</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => void tirar(k.id)}><Undo2 />Tirar da mesa</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              </ContextMenuTrigger>
              <MenuCartaMesa carta={k} conversar={orq ? avisoMaestro : () => setConversa(k.id)} ficha={(aba) => setFicha({ carta: k, aba })} forjar={() => forjar({ carta: k })} tirar={() => void tirar(k.id)} />
              </ContextMenu>
            )
          })}

          {apoio.cartas.map((c) => {
            const p = posApoio(c)
            return (
              <div key={c.id} className="group pointer-events-auto absolute" style={{ left: p.x, top: p.y, width: APOIO_W, height: APOIO_H, zIndex: arrasto[c.id] ? 30 : 1 }}
                onPointerDown={(e) => arrastarApoio(e, c)} onPointerEnter={() => setSobreApoio(c.id)} onPointerLeave={() => setSobreApoio(null)}>
                <CartaApoioVisual carta={c} tipo={tipoDe(c)} selecionada={apoioSel === c.id} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button aria-label={`Puxar o plugue de ${c.nome}`} onPointerDown={(e) => puxarPlugue(e, c)}
                      className="absolute top-1/2 -right-2.5 z-10 grid size-5 -translate-y-1/2 cursor-crosshair place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow transition-transform hover:scale-125"><Plug className="size-3" /></button>
                  </TooltipTrigger>
                  <TooltipContent>Puxe até uma carta para ligar ou desligar o uso</TooltipContent>
                </Tooltip>
              </div>
            )
          })}
        </div>

        {/* barra de ferramentas */}
        <div data-sem-zoom className="absolute top-3 left-3 flex items-center gap-0.5 rounded-xl border bg-card/90 p-1 shadow backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
          <BotaoBarra rotulo="Afastar" onClick={() => zoomCentro(1 / 1.25)}><ZoomOut /></BotaoBarra>
          <Button size="sm" variant="ghost" className="w-14 font-mono text-xs tabular" onClick={() => { const { w, h } = tamanho(); zoomEm(w / 2, h / 2, 1 / vista.z) }} aria-label="Zoom 100%">{Math.round(vista.z * 100)}%</Button>
          <BotaoBarra rotulo="Aproximar" onClick={() => zoomCentro(1.25)}><ZoomIn /></BotaoBarra>
          <BotaoBarra rotulo="Enquadrar tudo" onClick={() => enquadrar()}><Maximize /></BotaoBarra>
          <span className="mx-1 h-5 w-px bg-border" />
          <BotaoBarra rotulo="Cartas de apoio" onClick={() => setCatalogo(true)}><Plug /></BotaoBarra>
          <BotaoBarra rotulo="Organizar a mesa" onClick={async () => { const m = await window.fma.mesa.organizar(projeto.id); setMesa(m); enquadrar(m) }}><LayoutGrid /></BotaoBarra>
          <BotaoBarra rotulo="Ligar em sequência" onClick={() => setPedeSequencia(true)}><Route /></BotaoBarra>
          <span className="mx-1 h-5 w-px bg-border" />
          <BotaoBarra rotulo={conexoesVisiveis ? "Mostrar só as conexões da carta sob o mouse" : "Mostrar todas as conexões"} ativo={conexoesVisiveis} onClick={() => { setConexoesVisiveis(!conexoesVisiveis); preferencia({ conexoesVisiveis: !conexoesVisiveis }) }}><Spline /></BotaoBarra>
          <BotaoBarra rotulo={sugestoes ? "Esconder os espaços sugeridos" : "Mostrar os espaços sugeridos"} ativo={sugestoes} onClick={() => { setSugestoes(!sugestoes); preferencia({ mostrarSugestoes: !sugestoes }) }}><SquareDashed /></BotaoBarra>
        </div>

        {/* situação do fluxo e painel */}
        <div data-sem-zoom className="absolute top-3 right-3 z-20 flex max-h-[calc(100%-1.5rem)] flex-col items-end gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline" className={cn("bg-card/90 backdrop-blur", fluxo.erros.length && "border-destructive text-destructive")} onClick={() => setPainel(!painel)} aria-expanded={painel}>
            {painel ? <PanelRightClose data-icon="inline-start" /> : <PanelRightOpen data-icon="inline-start" />}
            {mesa.cartas.length === 0 ? "Mesa vazia" : fluxo.erros.length ? "Fluxo com erro" : "Fluxo válido"}
            {fluxo.avisos.length + (avisoGit ? 1 : 0) > 0 && <Badge variant="secondary" className="text-warning">{fluxo.avisos.length + (avisoGit ? 1 : 0)}</Badge>}
          </Button>
          {painel && (
            <div className="min-h-0 w-80 shrink overflow-y-auto overscroll-contain rounded-xl border bg-card/95 shadow-xl backdrop-blur">
              <PainelMesa fluxo={fluxo} extras={avisoGit ? [avisoGit] : []} vazia={mesa.cartas.length === 0} conexoes={lista} nome={nome} selecionada={selecionada} aoSelecionar={setSelecionada}
                aoAtualizar={(id, m) => void atualizar(id, m)} aoOrdem={async (id, d) => tratar(await window.fma.mesa.moverOrdem(id, d))}
                aoRemover={async (id) => { tratar(await window.fma.mesa.removerConexao(id)); setSelecionada(null) }} />
            </div>
          )}
        </div>

        {/* mão (RF 3.03): cartas da coleção fora da mesa */}
        <div data-mao data-sem-zoom onPointerDown={(e) => e.stopPropagation()}
          className={cn("absolute inset-x-0 bottom-0 flex h-[132px] flex-col items-center bg-gradient-to-t from-background via-background/85 to-transparent px-6 pt-2 transition-colors", sobreMao && "from-primary/30")}>
          <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {sobreMao ? "Solte aqui para tirar da mesa" : mao.length ? `Mão · ${mao.length} ${mao.length === 1 ? "carta" : "cartas"} · arraste para a mesa` : cartas.length ? "Todas as suas cartas estão na mesa" : "Forje cartas na Coleção"}
          </span>
          <div className="mt-2 flex w-full max-w-[1100px] justify-center">
            {mao.map((c) => (
              <div key={c.id} draggable className="hand-card relative w-[150px] min-w-9 flex-[0_1_150px] last:shrink-0"
                onDragStart={(e) => { e.dataTransfer.setData("text/fma-carta", c.id); e.dataTransfer.effectAllowed = "copy" }}>
                <button className="rounded-[18px]" aria-label={`Colocar ${c.nome} na mesa`} onClick={() => { const p = centro(); void colocar(c.id, p.x - CARTA_W / 2, p.y - CARTA_H / 2) }}>
                  <CartaVisual carta={c} tamanho="sm" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <FichaCarta alvo={ficha} aoFechar={() => setFicha(null)} forjar={forjar} />
      <ConversaCarta carta={(conversa && porId.get(conversa)) || null} projetoId={projeto.id} aoFechar={() => setConversa(null)} />
      <CatalogoApoio aberto={catalogo} aoMudar={setCatalogo} tipos={apoio.tipos} aoEscolher={(t) => void colocarApoio(t)} />
      <EditorApoio carta={editada ?? null} tipo={editada && tipoDe(editada)} time={time}
        aoFechar={() => setEditando(null)} aoSalvo={(n) => apoio.setCartas((l) => l.map((o) => (o.id === n.id ? n : o)))} aoRemover={(c) => void removerApoio(c)} />

      <AlertDialog open={pedeSequencia} onOpenChange={setPedeSequencia}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ligar as cartas em sequência?</AlertDialogTitle>
            <AlertDialogDescription>Todas as conexões atuais, com as skills delas, serão apagadas. Depois, as entregas seguem da esquerda para a direita e o Revisor questiona as cartas anteriores.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { setMesa(await window.fma.mesa.ligarSequencia(projeto.id)); setSelecionada(null) }}>Apagar e ligar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
