/**
 * Loja (local, sem backend): agentes prontos para adicionar à coleção, e as habilidades e memórias da biblioteca.
 * "Publicar" só guarda uma cópia na Loja deste app.
 */
import { useState } from "react"
import { BadgeCheck, BookOpen, Bot, Brain, Download, Plus, Search, Upload } from "lucide-react"
import { toast } from "sonner"
import { CATEGORIAS_LOJA, type AgenteLoja } from "@shared/biblioteca"
import { cliPorId } from "@shared/ia"
import type { Carta } from "@shared/tipos"
import { icone } from "@/lib/icones"
import { cn } from "@/lib/utils"
import { useCartas } from "@/data/cartas"
import { adicionarDaLoja, despublicar, useBiblioteca } from "@/data/biblioteca"
import { EscolherItensBiblioteca } from "@/components/EscolherItensBiblioteca"
import { PublicarLoja } from "@/components/PublicarLoja"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Secao = "agentes" | "habilidade" | "memoria"
const NAV = [{ id: "agentes", nome: "Agentes", icone: Bot }, { id: "habilidade", nome: "Habilidades", icone: BookOpen }, { id: "memoria", nome: "Memórias", icone: Brain }] as const

export function Loja() {
  const [secao, setSecao] = useState<Secao>("agentes")
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r p-3">
        <span className="px-2 pb-2 font-display text-lg">Loja</span>
        {NAV.map((n) => <Button key={n.id} variant={secao === n.id ? "secondary" : "ghost"} className="justify-start" onClick={() => setSecao(n.id)}><n.icone data-icon="inline-start" />{n.nome}</Button>)}
      </aside>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
          {secao === "agentes" ? <Agentes /> : (
            <>
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-2xl">{secao === "habilidade" ? "Habilidades" : "Memórias"}</h2>
                <p className="text-sm text-muted-foreground">
                  {secao === "habilidade" ? "Instruções reutilizáveis que você liga às cartas." : "Conhecimento que as cartas consultam antes de agir: glossário, regras, padrões."} As padrão vêm com o app; as suas você cria aqui.
                  O texto entra no prompt da carta quando ela roda.
                </p>
              </div>
              <EscolherItensBiblioteca tipo={secao} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Avatar({ carta, className }: { carta: Carta; className?: string }) {
  const I = icone(carta.simbolo)
  return (
    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", className)}
      style={{ background: `color-mix(in oklch, ${carta.cor} 22%, transparent)`, color: carta.cor, boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${carta.cor} 40%, transparent)` }}>
      <I className="size-5" />
    </span>
  )
}

function Agentes() {
  const { loja } = useBiblioteca()
  const { cartas } = useCartas()
  const [q, setQ] = useState("")
  const [filtro, setFiltro] = useState<"todas" | "verificadas" | "publicas">("todas")
  const [publicando, setPublicando] = useState(false)
  const [escolhida, setEscolhida] = useState<Carta | null>(null)

  const casa = (a: AgenteLoja) => !q || `${a.carta.nome} ${a.descricao} ${a.autor}`.toLowerCase().includes(q.toLowerCase())
  const comunidade = loja.filter((a) => !a.meu && casa(a) && (filtro !== "verificadas" || a.verificado) && filtro !== "publicas")
  const meus = loja.filter((a) => a.meu && casa(a) && filtro !== "verificadas")
  const destaques = loja.filter((a) => !a.meu && a.verificado).slice(0, 3) // a lista já vem por mais usos

  async function adicionar(a: AgenteLoja) {
    const r = await adicionarDaLoja(a.id)
    if (r.ok) toast.success(`${r.valor.nome} entrou na sua coleção`)
    else toast.error(r.erro)
  }
  async function tirar(a: AgenteLoja) {
    const r = await despublicar(a.id)
    if (r.ok) toast("Agente despublicado")
    else toast.error(r.erro)
  }
  const detalhe = (a: AgenteLoja) => `${a.carta.habilidades.length} habilidade${a.carta.habilidades.length === 1 ? "" : "s"} · ${a.carta.memorias.length} memória${a.carta.memorias.length === 1 ? "" : "s"} · ${cliPorId(a.carta.cli).curto} · ${a.instalacoes} usos`

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">Agentes</h2>
          <p className="text-sm text-muted-foreground">Agentes prontos, com instruções, habilidades e memórias próprias. Adicionar cria uma cópia na sua coleção.</p>
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" value={filtro} onValueChange={(v) => v && setFiltro(v as typeof filtro)} className="ml-auto">
          <ToggleGroupItem value="todas" className="px-3">Todas</ToggleGroupItem>
          <ToggleGroupItem value="verificadas" className="gap-1 px-3"><BadgeCheck />Verificadas</ToggleGroupItem>
          <ToggleGroupItem value="publicas" className="px-3">Públicas</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="pl-8" />
        </div>
        <Button onClick={() => setPublicando(true)} disabled={!cartas.length}><Upload data-icon="inline-start" />Publicar um agente meu</Button>
      </div>

      {filtro !== "publicas" && !q && destaques.length > 0 && (
        <section className="flex flex-col gap-3">
          <b className="text-sm">Destaques</b>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {destaques.map((a) => (
              <div key={a.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between"><Avatar carta={a.carta} /><Button size="sm" variant="ghost" onClick={() => void adicionar(a)}><Plus data-icon="inline-start" />Adicionar</Button></div>
                <span className="flex items-center gap-1.5"><b>{a.carta.nome}</b>{a.verificado && <BadgeCheck className="size-4 text-info" />}</span>
                <span className="-mt-1 text-xs text-muted-foreground">por {a.autor}</span>
                <span className="line-clamp-2 text-sm text-muted-foreground">{a.descricao}</span>
                <span className="mt-auto text-xs text-muted-foreground">{detalhe(a)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(filtro === "publicas" || meus.length > 0) && (
        <section className="flex flex-col gap-1">
          <b className="text-sm">Publicados por você <span className="font-normal text-muted-foreground">· ficam só neste app</span></b>
          {!meus.length && <span className="py-2 text-sm text-muted-foreground">Você ainda não publicou nenhum agente.</span>}
          {meus.map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-b py-2 last:border-0">
              <Avatar carta={a.carta} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 text-sm"><b>{a.carta.nome}</b><Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{a.categoria}</Badge><span className="text-xs text-muted-foreground">por você · {a.instalacoes} usos</span></span>
                <span className="truncate text-xs text-muted-foreground">{a.descricao}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => void adicionar(a)}><Download data-icon="inline-start" />Duplicar</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void tirar(a)}>Despublicar</Button>
            </div>
          ))}
        </section>
      )}

      {CATEGORIAS_LOJA.map((cat) => {
        const lista = comunidade.filter((a) => a.categoria === cat)
        if (!lista.length) return null
        return (
          <section key={cat} className="flex flex-col gap-1 border-t pt-4">
            <b className="text-sm">{cat}</b>
            <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
              {lista.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-2">
                  <Avatar carta={a.carta} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 text-sm"><b>{a.carta.nome}</b>{a.verificado && <BadgeCheck className="size-3.5 text-info" />}<span className="truncate text-xs text-muted-foreground">por {a.autor}</span></span>
                    <span className="truncate text-xs text-muted-foreground">{a.descricao}</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => void adicionar(a)}><Plus data-icon="inline-start" />Adicionar</Button>
                </div>
              ))}
            </div>
          </section>
        )
      })}

      <Dialog open={publicando} onOpenChange={setPublicando}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Qual carta publicar?</DialogTitle><DialogDescription>Cartas que vieram da Loja com o nome travado só podem ser publicadas pelo autor.</DialogDescription></DialogHeader>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {cartas.filter((c) => !c.origemLoja?.travada).map((c) => (
              <button key={c.id} className="flex items-center gap-3 rounded-xl p-2 text-left hover:bg-muted" onClick={() => { setPublicando(false); setEscolhida(c) }}>
                <Avatar carta={c} /><b className="truncate text-sm">{c.nome}</b>
              </button>
            ))}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setPublicando(false)}>Cancelar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <PublicarLoja carta={escolhida} aoFechar={() => setEscolhida(null)} />
    </>
  )
}
