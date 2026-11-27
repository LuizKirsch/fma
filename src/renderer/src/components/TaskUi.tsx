/** Pecinhas comuns das tasks: rótulo e cor da situação, barra de progresso, nome da task. */
import { cn } from "@/lib/utils"
import type { SituacaoTask, Task } from "@shared/task"
import { Square } from "lucide-react"
import { pararTask, type Atencao } from "@/data/tasks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

export const SITUACAO: Record<SituacaoTask, { rotulo: string; cor: string }> = {
  pronta: { rotulo: "Pronta", cor: "text-info" },
  fila: { rotulo: "Na fila", cor: "text-muted-foreground" },
  andamento: { rotulo: "Em andamento", cor: "text-info" },
  aguardando: { rotulo: "Espera você", cor: "text-warning" },
  revisao: { rotulo: "Em revisão", cor: "text-warning" },
  concluida: { rotulo: "Concluída", cor: "text-success" },
  parada: { rotulo: "Parada", cor: "text-destructive" },
}

export const nomeDaTask = (t: Task) => t.titulo || t.missao.split("\n")[0].slice(0, 80)
export const rotuloDaTask = (t: Task) => t.referencia ?? `#${t.numero}`

const ATENCAO: Record<Exclude<Atencao, null>, { classe: string; titulo: string }> = {
  esperando: { classe: "bg-warning", titulo: "Esperando você" },
  trabalhando: { classe: "animate-pulse bg-info", titulo: "Trabalhando" },
  nova: { classe: "bg-success ring-2 ring-success/30", titulo: "Terminou desde a última vez que você abriu" },
}
/** Ponto de atenção da task (estilo Orca): esperando você, trabalhando ou terminou e você ainda não viu. */
export function PontoAtencao({ atencao, className }: { atencao: Atencao; className?: string }) {
  if (!atencao) return null
  return <span role="img" aria-label={ATENCAO[atencao].titulo} title={ATENCAO[atencao].titulo} className={cn("size-2 shrink-0 rounded-full", ATENCAO[atencao].classe, className)} />
}

export function BadgeSituacao({ task }: { task: Task }) {
  const s = SITUACAO[task.situacao]
  return <Badge variant="outline" className={cn("gap-1", s.cor)}>{task.situacao === "fila" && task.posicaoFila ? `Na fila · ${task.posicaoFila}º` : s.rotulo}</Badge>
}

export function Barra({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right font-mono text-[11px] text-muted-foreground tabular">{pct}%</span>
    </div>
  )
}

/** Parar a task, com confirmação. */
export function BotaoParar({ task, rotulo = "Parar" }: { task: Task; rotulo?: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button size="sm" variant="outline"><Square data-icon="inline-start" />{rotulo}</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Parar a task {rotuloDaTask(task)}?</AlertDialogTitle>
          <AlertDialogDescription>As cartas que estão rodando são interrompidas. O trabalho já feito fica na branch.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => void pararTask(task.id)}>Parar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
