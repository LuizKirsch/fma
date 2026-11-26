/**
 * Trilha da task (RF 8.03, 8.04, RN 89): as cartas em ordem de fluxo, o estado de cada uma
 * e, no marcador vermelho, quantas vezes foi devolvida.
 */
import { Fragment, useMemo } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { icone } from "@/lib/icones"
import type { DetalheTask, EstadoCarta, PreviaTask, Task } from "@shared/task"
import type { Carta } from "@shared/tipos"
import { devolucoes, ok } from "@/data/tasks"
import { useApoio, useApoioDaTask } from "@/data/apoio"
import { iconeApoio } from "@/components/CartaApoio"

export interface Passo {
  cartaId: string
  nome: string
  simbolo: string
  cor: string
  orquestrador: boolean
  retirada: boolean
  /** Só em task que já começou. */
  estado: EstadoCarta | null
  atividade: string
  esperaDecisao: boolean
  devolucoes: number
}

/** Ordena as cartas pela profundidade nas Entregas (quem não recebe de ninguém vem primeiro). */
export function ordenarPorFluxo<T>(itens: T[], id: (t: T) => string, entregas: { de: string; para: string }[]): T[] {
  const nivel = new Map(itens.map((i) => [id(i), 0]))
  for (let volta = 0; volta < itens.length; volta++)
    for (const e of entregas) if (nivel.has(e.de) && nivel.has(e.para)) nivel.set(e.para, Math.max(nivel.get(e.para)!, nivel.get(e.de)! + 1))
  return [...itens].sort((a, b) => nivel.get(id(a))! - nivel.get(id(b))!)
}

/** Monta a trilha: do time fixado, se a task já começou, ou da prévia (mesa sem as cartas tiradas daquela task). */
export function montarPassos(task: Task, detalhe: DetalheTask | null, previa: PreviaTask | null, porId: Map<string, Carta>): Passo[] {
  const dev = devolucoes(detalhe?.eventos ?? [])
  const taskCarta = new Map((detalhe?.cartas ?? []).map((c) => [c.cartaId, c]))
  const comecou = task.iniciadaEm !== null && !!detalhe?.cartas.some((c) => c.copia)
  const ids = comecou ? detalhe!.cartas.filter((c) => c.copia).map((c) => c.cartaId) : (previa?.cartas ?? []).map((c) => c.id)
  const entregas = (comecou ? detalhe!.conexoes.map((c) => ({ tipo: c.tipo, de: c.deCartaId, para: c.paraCartaId })) : previa?.conexoes ?? []).filter((c) => c.tipo === "entrega")
  const retiradas = new Set((previa?.cartas ?? []).filter((c) => c.retirada).map((c) => c.id))
  const passos = ids.flatMap((id): Passo[] => {
    const tc = taskCarta.get(id), copia = tc?.copia, carta = porId.get(id)
    const base = copia ?? carta
    if (!base) return []
    return [{
      cartaId: id, nome: base.nome, simbolo: base.simbolo, cor: base.cor,
      orquestrador: (copia?.classe ?? carta?.classe) === "orquestrador",
      retirada: comecou ? !!tc?.retirada : retiradas.has(id), estado: comecou ? tc?.estado ?? "espera" : null, atividade: tc?.atividade ?? "",
      esperaDecisao: task.situacao === "aguardando" && task.decisao?.cartaId === id,
      devolucoes: dev[id] ?? 0,
    }]
  })
  return ordenarPorFluxo(passos, (p) => p.cartaId, entregas)
}

/** RN 89: o rótulo e a cor do estado. */
export function rotuloDoPasso(p: Passo, task: Task): { texto: string; cor: string } {
  if (p.retirada) return { texto: "fora desta task", cor: "text-muted-foreground/60" }
  if (p.esperaDecisao) return { texto: "esperando sua decisão", cor: "text-warning" }
  if (p.estado === null) return { texto: task.situacao === "parada" ? "não rodou" : "ainda não chegou", cor: "text-muted-foreground/70" }
  switch (p.estado) {
    case "concluida": return { texto: "concluiu", cor: "text-success" }
    case "trabalhando": return { texto: "trabalhando", cor: "text-info" }
    case "questionando": return { texto: "questionando", cor: "text-warning" }
    case "pronta": return { texto: "pronta para começar", cor: "text-info/80" }
    default: return { texto: "aguardando outras entregas", cor: "text-muted-foreground" }
  }
}

export function usePassos(task: Task, detalhe: DetalheTask | null, previa: PreviaTask | null, cartas: Carta[]) {
  return useMemo(() => montarPassos(task, detalhe, previa, new Map(cartas.map((c) => [c.id, c]))), [task, detalhe, previa, cartas])
}

export function Trilha({ task, passos, aoClicar, titulo }: { task: Task; passos: Passo[]; aoClicar?: (p: Passo) => void; titulo?: (p: Passo) => string | undefined }) {
  if (!passos.length) return <p className="text-xs text-muted-foreground">Sem cartas na mesa do projeto.</p>
  return (
    <ol className="flex flex-wrap items-center gap-y-2">
      {passos.map((p, i) => {
        const I = icone(p.simbolo), r = rotuloDoPasso(p, task)
        const trabalhando = p.estado === "trabalhando" || p.estado === "questionando"
        const Raiz = aoClicar ? "button" : "div"
        return (
          <Fragment key={p.cartaId}>
            {i > 0 && <ChevronRight className="mx-0.5 size-4 shrink-0 text-muted-foreground/50" aria-hidden />}
            <li className="relative">
              <Raiz type={aoClicar ? "button" : undefined} onClick={aoClicar ? () => aoClicar(p) : undefined} title={titulo?.(p)}
                className={cn("flex items-center gap-2 rounded-lg border bg-card/60 py-1.5 pr-3 pl-1.5 text-left", aoClicar && "hover:border-primary/60", p.retirada && "opacity-45", p.estado === "concluida" && "border-success/40")}>
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-md border-2", trabalhando && "animate-pulse")} style={{ borderColor: p.cor, color: p.cor }}><I className="size-4" /></span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className={cn("max-w-[130px] truncate text-xs font-medium", p.retirada && "line-through")}>{p.nome}</span>
                  <span className={cn("text-[10.5px]", r.cor)}>{r.texto}</span>
                </span>
              </Raiz>
              {p.devolucoes > 0 && (
                <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-destructive text-[10px] font-semibold text-white tabular" title={`Devolvida ${p.devolucoes} ${p.devolucoes === 1 ? "vez" : "vezes"}`}>{p.devolucoes}</span>
              )}
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}

/** RF 4.21 e 4.22: um ícone por ferramenta do projeto. Em task pronta ou na fila, clicar liga ou desliga; anel verde = já usada. */
export function FerramentasDaTask({ task }: { task: Task }) {
  const { cartas } = useApoio(task.projetoId)
  const { dados, recarregar } = useApoioDaTask(task.id)
  if (!cartas.length || !dados) return null
  const editavel = task.situacao === "pronta" || task.situacao === "fila"
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Ferramentas da task">
      {cartas.map((c) => {
        const I = iconeApoio(c.tipo), ligada = !dados.desligadas.includes(c.id), usada = dados.usadas.includes(c.id)
        const titulo = `${c.nome}: ${ligada ? "ligada" : "desligada"}${usada ? ", já usada" : ""}${editavel ? ". Clique para " + (ligada ? "desligar" : "ligar") : ""}`
        return (
          <li key={c.id}>
            <button type="button" disabled={!editavel} title={titulo} aria-label={titulo} aria-pressed={ligada}
              onClick={async () => { ok(await window.fma.apoio.desligarNaTask(task.id, c.id, ligada)); void recarregar() }}
              className={cn("grid size-6 place-items-center rounded-md border text-muted-foreground", ligada ? "text-foreground" : "line-through opacity-40", usada && "ring-2 ring-success", editavel && "hover:border-primary/60")}>
              <I className="size-3.5" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
