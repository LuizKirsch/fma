/**
 * Projetos (T02/T03, RF 2.08 a 2.12): faixa de abas com a Visão geral e um projeto por aba,
 * e a mesa do projeto aberto. Arrastar a aba ou usar o menu muda a ordem.
 * A Visão geral (T02) está em VisaoGeral.tsx.
 */
import { useState } from "react"
import { ChevronDown, LayoutDashboard, Plus, Settings2, MoveLeft, MoveRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Projeto } from "@shared/projeto"
import { reordenarProjetos, useProjetos } from "@/data/projetos"
import { ProjetoAberto } from "@/views/ProjetoAberto"
import { atencaoDa, pendenciasDe, situacaoDoProjeto, useTasks, useVistas } from "@/data/tasks"
import { Badge } from "@/components/ui/badge"
import { NovoProjeto } from "@/components/NovoProjeto"
import { AjustesProjeto } from "@/components/AjustesProjeto"
import type { Forjar } from "@/components/Forja"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { VisaoGeral } from "@/views/VisaoGeral"

export const GERAL = "geral"
const SITUACAO_ABA = {
  rodando: { rotulo: "rodando", ponto: "animate-pulse bg-info" },
  esperando: { rotulo: "esperando você", ponto: "bg-warning" },
  parado: { rotulo: "parado", ponto: "bg-muted-foreground/60" },
}

export function Projetos({ aba, setAba, forjar, irColecao, aoCriar }: { aba: string; setAba: (aba: string) => void; forjar: Forjar; irColecao: () => void; aoCriar?: () => void }) {
  const { projetos, usos } = useProjetos()
  const [novo, setNovo] = useState(false)
  const [ajustes, setAjustes] = useState<Projeto | null>(null)
  const [arrastada, setArrastada] = useState<string | null>(null)
  const tasks = useTasks()
  const vistas = useVistas()
  const novas = (id: string) => tasks.filter((t) => t.projetoId === id && atencaoDa(t, vistas) === "nova").length
  const atual = projetos.find((p) => p.id === aba)
  const cartasDe = (id: string) => usos.filter((u) => u.projetoId === id).length

  /** Põe `id` na posição `para` (índice) e grava a ordem nova. */
  function mover(id: string, para: number) {
    const ids = projetos.map((p) => p.id).filter((x) => x !== id)
    if (para < 0 || para > ids.length) return
    ids.splice(para, 0, id)
    void reordenarProjetos(ids)
  }

  return (
    <div className="grid h-full grid-rows-[46px_1fr]">
      <div role="tablist" className="flex items-end gap-1 overflow-x-auto border-b bg-background/60 px-4 pt-2">
        <button role="tab" aria-selected={!atual} onClick={() => setAba(GERAL)}
          className={cn("flex h-10 items-center gap-2 rounded-t-lg border border-b-0 px-3.5 text-sm", !atual ? "bg-card font-medium" : "border-transparent text-muted-foreground hover:bg-muted/50")}>
          <LayoutDashboard className="size-4" />Visão geral
          {pendenciasDe(tasks) > 0 && <Badge className="h-5 min-w-5 bg-warning px-1.5 text-primary-foreground tabular" title="Tasks esperando você">{pendenciasDe(tasks)}</Badge>}
        </button>
        {projetos.map((p, i) => (
          <div key={p.id} role="tab" aria-selected={p.id === aba} draggable
            onDragStart={(e) => { setArrastada(p.id); e.dataTransfer.effectAllowed = "move" }}
            onDragOver={(e) => arrastada && e.preventDefault()}
            onDrop={() => { if (arrastada && arrastada !== p.id) mover(arrastada, i); setArrastada(null) }}
            onDragEnd={() => setArrastada(null)}
            className={cn("group flex h-10 max-w-[240px] items-center rounded-t-lg border border-b-0", p.id === aba ? "bg-card" : "border-transparent hover:bg-muted/50", arrastada === p.id && "opacity-50")}>
            <button onClick={() => setAba(p.id)} className="flex min-w-0 flex-col items-start px-3 text-left leading-tight">
              <span className={cn("max-w-[190px] truncate text-sm", p.id === aba && "font-medium")}>{p.nome}</span>
              {/* RF 2.09: rodando, esperando você ou parado */}
              <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground"><span className={cn("size-1.5 rounded-full", SITUACAO_ABA[situacaoDoProjeto(tasks, p.id)].ponto)} />{SITUACAO_ABA[situacaoDoProjeto(tasks, p.id)].rotulo} · {cartasDe(p.id)} {cartasDe(p.id) === 1 ? "carta" : "cartas"}
                {novas(p.id) > 0 && <span className="text-success" title="Tasks que terminaram desde a última vez que você abriu">· {novas(p.id)} {novas(p.id) === 1 ? "nova" : "novas"}</span>}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon-xs" variant="ghost" className="mr-1.5" aria-label={`Menu da aba ${p.nome}`}><ChevronDown /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setAjustes(p)}><Settings2 />Renomear e ajustes</DropdownMenuItem>
                <DropdownMenuItem disabled={i === 0} onSelect={() => mover(p.id, i - 1)}><MoveLeft />Mover para a esquerda</DropdownMenuItem>
                <DropdownMenuItem disabled={i === projetos.length - 1} onSelect={() => mover(p.id, i + 1)}><MoveRight />Mover para a direita</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        <Button size="icon-sm" variant="ghost" className="mb-1.5 ml-1" aria-label="Novo projeto" onClick={() => setNovo(true)}><Plus /></Button>
      </div>

      <div className="min-h-0">
        {atual ? (
          <ProjetoAberto key={atual.id} projeto={atual} forjar={forjar} />
        ) : (
          <VisaoGeral aoAbrir={setAba} aoNovo={() => setNovo(true)} irColecao={irColecao} />
        )}
      </div>

      <NovoProjeto aberto={novo} aoMudar={setNovo} forjar={forjar} aoCriar={(p) => { setAba(p.id); aoCriar?.() }} />
      <AjustesProjeto projeto={ajustes} aoFechar={() => setAjustes(null)} />
    </div>
  )
}
