/**
 * Coleção (RF 1.01 a 1.03, 1.29 a 1.31): as cartas do usuário, filtro por classe, em quais projetos
 * cada uma está, editar, duplicar e excluir. Clicar na carta abre a forja.
 */
import { useState, type CSSProperties } from "react"
import { Copy, Layers, MoreHorizontal, Pencil, Plus, Store, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { icone } from "@/lib/icones"
import { CLASSES, ORDEM_SUGERIDA, type ClasseId } from "@shared/catalogo"
import type { Carta } from "@shared/tipos"
import { duplicarCarta, excluirCarta, useCartas } from "@/data/cartas"
import { recarregarProjetos, useProjetos } from "@/data/projetos"
import { CartaVisual } from "@/components/CartaVisual"
// MVP: Loja desligada por enquanto
// import { PublicarLoja } from "@/components/PublicarLoja"
import { FichaCarta, type AlvoFicha } from "@/components/FichaCarta"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export function Colecao({ forjar }: { forjar: (o: { carta?: Carta; classe?: ClasseId }) => void }) {
  const { cartas, carregado } = useCartas()
  const { projetos, usos } = useProjetos()
  /** RF 1.03: nomes dos projetos em que a carta está, na ordem das abas. */
  const projetosDa = (cartaId: string) => projetos.filter((p) => usos.some((u) => u.cartaId === cartaId && u.projetoId === p.id)).map((p) => p.nome)
  const [filtro, setFiltro] = useState<string>("todas")
  const [excluir, setExcluir] = useState<Carta | null>(null)
  // const [publicar, setPublicar] = useState<Carta | null>(null)
  const [ficha, setFicha] = useState<AlvoFicha | null>(null)
  const lista = cartas.filter((c) => filtro === "todas" || c.classe === filtro)
  const classesUsadas = (Object.keys(CLASSES) as ClasseId[]).filter((k) => cartas.some((c) => c.classe === k))

  async function duplicar(c: Carta) {
    const r = await duplicarCarta(c.id)
    if (r.ok) toast.success(`"${r.valor.nome}" criada`)
    else toast.error(r.erro)
  }
  async function confirmarExclusao() {
    if (!excluir) return
    const r = await excluirCarta(excluir.id)
    if (r.ok) { toast(`"${excluir.nome}" excluída`); await recarregarProjetos() }
    else toast.error(r.erro)
    setExcluir(null)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-8 py-7">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <h1 className="font-display text-2xl">Suas cartas</h1>
            <p className="max-w-[70ch] text-sm text-muted-foreground">Cada carta é um agente com nome, IA, método, skills e prompt. A mesma carta pode jogar em vários projetos.</p>
          </div>
          <Button size="lg" onClick={() => forjar({})} className="font-display"><Plus data-icon="inline-start" />Forjar carta</Button>
        </div>

        {cartas.length > 0 && (
          <ToggleGroup type="single" variant="outline" value={filtro} onValueChange={(v) => v && setFiltro(v)} className="flex-wrap justify-start">
            <ToggleGroupItem value="todas" className="px-3">Todas <Badge variant="secondary" className="ml-1">{cartas.length}</Badge></ToggleGroupItem>
            {classesUsadas.map((k) => {
              const I = icone(CLASSES[k].simbolo)
              const n = cartas.filter((c) => c.classe === k).length
              return <ToggleGroupItem key={k} value={k} className="px-3"><I style={{ color: CLASSES[k].cor }} />{CLASSES[k].nome}<span className="text-muted-foreground tabular">{n}</span></ToggleGroupItem>
            })}
          </ToggleGroup>
        )}

        {!carregado ? null : cartas.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Layers /></EmptyMedia>
              <EmptyTitle>Sua coleção está vazia</EmptyTitle>
              <EmptyDescription>Forje a primeira carta. Um time completo tem Orquestrador, Análise, UX, Desenvolvimento, Teste, Segurança, Revisor e Pull Request.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-2">
                {ORDEM_SUGERIDA.map((k) => {
                  const I = icone(CLASSES[k].simbolo)
                  return <Button key={k} variant="outline" onClick={() => forjar({ classe: k })}><I data-icon="inline-start" style={{ color: CLASSES[k].cor }} />{CLASSES[k].nome}</Button>
                })}
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] justify-items-center gap-x-6 gap-y-10">
            {lista.map((c, i) => (
              <div key={c.id} className="deal-in flex flex-col items-center gap-2.5" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` } as CSSProperties}>
                <button data-tour={i === 0 ? "carta" : undefined} onClick={() => setFicha({ carta: c })} className="rounded-[18px]" aria-label={`Abrir ficha de ${c.nome}`}><CartaVisual carta={c} destacavel /></button>
                {c.origemLoja && <Badge variant="outline" className="-mb-1 max-w-[188px] gap-1 truncate text-[10px]" title={`Veio da Loja, por ${c.origemLoja.autor}`}><Store className="size-3" />Loja · {c.origemLoja.autor}</Badge>}
                <div className="flex w-[188px] items-center gap-1">
                  <span className="truncate text-xs text-muted-foreground" title={projetosDa(c.id).join(", ")}>{projetosDa(c.id).join(", ") || "Fora dos projetos"}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon-xs" variant="ghost" className="ml-auto" aria-label={`Ações de ${c.nome}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onSelect={() => forjar({ carta: c })}><Pencil />Editar</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void duplicar(c)}><Copy />Duplicar</DropdownMenuItem>
                        {/* MVP: Loja desligada por enquanto: Publicar na Loja */}
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem variant="destructive" onSelect={() => setExcluir(c)}><Trash2 />Excluir</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
            {filtro === "todas" && (
              <button onClick={() => forjar({})} className="ghost-slot flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground" style={{ width: 188, height: 270, "--c": "var(--primary)" } as CSSProperties}>
                <Plus className="size-7" />Forjar carta
              </button>
            )}
          </div>
        )}
      </div>

      <FichaCarta alvo={ficha} aoFechar={() => setFicha(null)} forjar={forjar} />
      {/* <PublicarLoja carta={publicar} aoFechar={() => setPublicar(null)} /> */}

      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{excluir?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluir && projetosDa(excluir.id).length > 0
                ? `A carta sai da coleção e das mesas de: ${projetosDa(excluir.id).join(", ")}. As conexões dela também se vão.`
                : "A carta sai da coleção. Ela não está em nenhum projeto."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmarExclusao()}>Excluir carta</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
