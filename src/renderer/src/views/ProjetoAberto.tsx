/**
 * Projeto aberto (T03 a T05): a faixa das tasks em andamento (RF 8.01), os avisos de decisão (RF 8.20),
 * as visões Mesa, Tasks e Terminal e o painel lateral com a Entrega e a Crônica da task acompanhada (RF 8.08).
 */
import { useState } from "react"
import { LayoutGrid, ListChecks, MessageCircle, Plus, Radar, SquareTerminal } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Projeto } from "@shared/projeto"
import { rotuloAmbiente } from "@shared/ambiente"
import { Badge } from "@/components/ui/badge"
import type { Task } from "@shared/task"
import { progresso, useDetalhe, useTasks, vagasEmUso } from "@/data/tasks"
import { Mesa } from "@/views/Mesa"
import { Tasks } from "@/views/Tasks"
import { Terminal } from "@/views/Terminal"
import { Monitores } from "@/views/Monitores"
import { ChatMaestro } from "@/components/ChatMaestro"
import { useMonitores } from "@/data/monitores"
import { useNaoLidas } from "@/data/maestro"
import { PainelTask } from "@/components/PainelTask"
import { AvisoDecisao } from "@/components/AvisoDecisao"
import { NovaTask } from "@/components/NovaTask"
import { Barra, rotuloDaTask } from "@/components/TaskUi"
import type { Forjar } from "@/components/Forja"
import { useCartas } from "@/data/cartas"
import { Button } from "@/components/ui/button"

type Visao = "mesa" | "tasks" | "monitores" | "terminal"
const VISOES = [{ id: "mesa", rotulo: "Mesa", I: LayoutGrid }, { id: "tasks", rotulo: "Tasks", I: ListChecks }, { id: "monitores", rotulo: "Monitores", I: Radar }, { id: "terminal", rotulo: "Terminal", I: SquareTerminal }] as const

function ChipFaixa({ task, ativo, aoEscolher }: { task: Task; ativo: boolean; aoEscolher: () => void }) {
  const detalhe = useDetalhe(task.id)
  return (
    <button onClick={aoEscolher} aria-pressed={ativo}
      className={cn("flex w-52 shrink-0 flex-col gap-1 rounded-lg border bg-card px-3 py-1.5 text-left", ativo && "border-primary/70", task.situacao === "aguardando" && "border-warning/60")}>
      <span className="flex items-center gap-2 text-xs"><span className={cn("size-1.5 rounded-full", task.situacao === "aguardando" ? "bg-warning" : "animate-pulse bg-info")} /><span className="font-mono">{rotuloDaTask(task)}</span><span className="truncate text-muted-foreground">{task.titulo ?? task.missao}</span></span>
      <Barra pct={progresso(task, detalhe?.cartas)} />
    </button>
  )
}

export function ProjetoAberto({ projeto, forjar }: { projeto: Projeto; forjar: Forjar }) {
  const { cartas } = useCartas()
  const todas = useTasks()
  const [visao, setVisao] = useState<Visao>("mesa")
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [nova, setNova] = useState(false)
  const [chat, setChat] = useState(false)
  const mon = useMonitores(projeto.id)
  const naoLidas = useNaoLidas(projeto.id)

  const doProjeto = todas.filter((t) => t.projetoId === projeto.id)
  const emAndamento = doProjeto.filter((t) => t.situacao === "andamento" || t.situacao === "aguardando")
  const esperando = emAndamento.filter((t) => t.situacao === "aguardando")
  const acompanhada = doProjeto.find((t) => t.id === escolhida) ?? emAndamento[0] ?? null
  const detalhe = useDetalhe(acompanhada?.id ?? null)

  // RF 3.28: o que cada carta da mesa está fazendo na task acompanhada.
  const atividades = new Map((detalhe?.cartas ?? []).filter((c) => c.copia && !c.retirada).map((c) => [c.cartaId, { estado: c.estado, atividade: c.atividade }]))

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className={cn("flex items-center gap-3 overflow-x-auto border-b bg-background/60 px-4 py-2", emAndamento.length === 0 && "hidden")}>
        <span className="shrink-0 text-xs text-muted-foreground tabular">Vagas {vagasEmUso(todas, projeto.id)}/{projeto.vagas}</span>
        {emAndamento.map((t) => <ChipFaixa key={t.id} task={t} ativo={t.id === acompanhada?.id} aoEscolher={() => setEscolhida(t.id)} />)}
      </div>
      <div className={cn("flex flex-col gap-2 px-4 pt-2", esperando.length === 0 && "hidden")}>
        {esperando.map((t) => <AvisoDecisao key={t.id} task={t} />)}
      </div>
      <div role="tablist" className="flex h-10 shrink-0 items-center gap-1 border-b px-4">
        {VISOES.map(({ id, rotulo, I }) => (
          <button key={id} role="tab" aria-selected={visao === id} onClick={() => setVisao(id)}
            className={cn("flex h-full items-center gap-2 border-b-2 px-3 text-sm", visao === id ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <I className="size-4" />{rotulo}
            {/* RF 5.22: há monitor ativo no projeto */}
            {id === "monitores" && mon.monitores.some((m) => m.ativo) && <span className="size-2 animate-pulse rounded-full bg-success" title="Há monitor ativo" />}
          </button>
        ))}
        <Badge variant="outline" className="ml-2 shrink-0" title="Onde o repositório e as CLIs rodam">{rotuloAmbiente(projeto.ambiente, window.fma.plataforma)}</Badge>
        {acompanhada && <span className="ml-3 text-xs text-muted-foreground">Acompanhando <span className="font-mono text-foreground">{rotuloDaTask(acompanhada)}</span></span>}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setChat(true)}><MessageCircle data-icon="inline-start" />Falar com Maestro{naoLidas > 0 && <span className="ml-1 rounded-full bg-warning px-1.5 text-[11px] text-primary-foreground tabular">{naoLidas}</span>}</Button>
        <Button size="sm" variant="outline" onClick={() => setNova(true)}><Plus data-icon="inline-start" />Task manual</Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
          {visao === "mesa" && <Mesa projeto={projeto} forjar={forjar} avisoMaestro={() => setChat(true)} atividades={atividades} />}
          {visao === "tasks" && <Tasks projeto={projeto} acompanhada={acompanhada?.id ?? null} aoEscolher={setEscolhida} aoNova={() => setNova(true)} />}
          {visao === "monitores" && <Monitores projeto={projeto} monitores={mon.monitores} recarregar={mon.recarregar} />}
          {visao === "terminal" && <Terminal detalhe={detalhe} />}
        </div>
        {visao === "tasks" && detalhe && (
          <aside className="w-[380px] shrink-0 border-l bg-card/40"><PainelTask detalhe={detalhe} cartas={cartas} /></aside>
        )}
      </div>
      {chat && <ChatMaestro projeto={projeto} aoFechar={() => setChat(false)} />}
      <NovaTask projeto={projeto} aberto={nova} aoMudar={setNova} aoCriar={(t) => { setEscolhida(t.id); setVisao("tasks") }} />
    </div>
  )
}
