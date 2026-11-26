/**
 * Painel lateral da task acompanhada (T08): Entrega (RF 8.09), Mudanças (diff da branch, em revisão) e Histórico (a Crônica da task, RF 8.11/8.19).
 * As Conexões ficam no painel da mesa.
 */
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { DetalheTask, DiffTask, Task, TipoEvento } from "@shared/task"
import type { Carta } from "@shared/tipos"
import { progresso } from "@/data/tasks"
import { EntregaApoio } from "@/components/EntregaApoio"
import { BadgeSituacao, Barra, nomeDaTask, rotuloDaTask } from "@/components/TaskUi"

const TIPO: Record<TipoEvento, { rotulo: string; cor: string }> = {
  missao: { rotulo: "Missão", cor: "text-primary" }, plano: { rotulo: "Plano", cor: "text-primary" },
  trabalho: { rotulo: "Trabalho", cor: "text-info" }, entrega: { rotulo: "Entrega", cor: "text-success" },
  pergunta: { rotulo: "Pergunta", cor: "text-warning" }, resposta: { rotulo: "Resposta", cor: "text-warning" },
  devolucao: { rotulo: "Devolução", cor: "text-destructive" }, aprovacao: { rotulo: "Aprovação", cor: "text-success" },
  decisao: { rotulo: "Decisão", cor: "text-warning" }, aviso: { rotulo: "Aviso", cor: "text-warning" },
  fim: { rotulo: "Fim", cor: "text-primary" }, console: { rotulo: "Console", cor: "text-muted-foreground" },
}

/** Nome da carta pela cópia fixada na task; senão, pela coleção. */
export function nomeadorDe(d: DetalheTask | null, cartas: Carta[]) {
  return (id: string | null) => (id ? d?.cartas.find((c) => c.cartaId === id)?.copia?.nome ?? cartas.find((c) => c.id === id)?.nome ?? "carta removida" : "")
}

const hora = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

function duracao(t: Task): string {
  if (!t.iniciadaEm) return "não começou"
  const s = Math.max(0, Math.round(((t.encerradaEm ?? Date.now()) - t.iniciadaEm) / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h ? `${h} h ${m} min` : m ? `${m} min ${s % 60} s` : `${s} s`
}

/** Arquivos (+/-) e patch da branch contra a base; linhas + verdes e - vermelhas. */
function Mudancas({ task }: { task: Task }) {
  const [diff, setDiff] = useState<DiffTask | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    setDiff(null); setErro(null)
    if (task.branch) void window.fma.tasks.diff(task.id).then((r) => { if (!vivo) return; if (r.ok) setDiff(r.valor); else { setErro(r.erro); toast.error(r.erro) } })
    return () => { vivo = false }
  }, [task.id, task.branch, task.situacao])
  if (!task.branch) return <p className="text-muted-foreground">A task ainda não tem branch.</p>
  if (erro) return <p className="text-destructive">{erro}</p>
  if (!diff) return <p className="text-muted-foreground">Carregando as mudanças...</p>
  if (!diff.arquivos.length) return <p className="text-muted-foreground">Nenhuma mudança em relação à branch base.</p>
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1 text-xs">
        {diff.arquivos.map((a) => (
          <li key={a.caminho} className="flex items-center gap-2 font-mono"><span className="min-w-0 flex-1 truncate">{a.caminho}</span><span className="text-success tabular">+{a.adicionadas}</span><span className="text-destructive tabular">-{a.removidas}</span></li>
        ))}
      </ul>
      <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-2 font-mono text-[11px] leading-snug">
        {diff.patch.split(String.fromCharCode(10)).map((l, i) => (
          <div key={i} className={cn(l.startsWith("+") && !l.startsWith("+++") && "bg-success/15 text-success", l.startsWith("-") && !l.startsWith("---") && "bg-destructive/15 text-destructive", l.startsWith("@@") && "text-info")}>{l || " "}</div>
        ))}
      </pre>
    </div>
  )
}

type Aba = "entrega" | "mudancas" | "historico"
const ABAS: { id: Aba; rotulo: string }[] = [{ id: "entrega", rotulo: "Entrega" }, { id: "mudancas", rotulo: "Mudanças" }, { id: "historico", rotulo: "Histórico" }]

export function PainelTask({ detalhe, cartas }: { detalhe: DetalheTask; cartas: Carta[] }) {
  const [aba, setAba] = useState<Aba>("entrega")
  const { task } = detalhe
  useEffect(() => { if (task.situacao === "revisao") setAba("mudancas") }, [task.id, task.situacao])
  const nome = nomeadorDe(detalhe, cartas)
  const entregas = detalhe.cartas.filter((c) => !c.retirada && c.entrega)
  const fim = detalhe.eventos.findLast((e) => e.tipo === "fim")
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b p-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{rotuloDaTask(task)}</span>
          <BadgeSituacao task={task} />
          <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular">{task.tokens.toLocaleString("pt-BR")} tokens</span>
        </div>
        <h3 className="font-display text-sm leading-snug">{nomeDaTask(task)}</h3>
        <Barra pct={progresso(task, detalhe.cartas)} />
        <p className="text-[11px] text-muted-foreground">Duração: {duracao(task)}</p>
      </div>
      <div role="tablist" className="flex gap-1 border-b px-3 pt-2">
        {ABAS.map(({ id: a, rotulo }) => (
          <button key={a} role="tab" aria-selected={aba === a} onClick={() => setAba(a)}
            className={cn("rounded-t-md px-3 py-1.5 text-sm", aba === a ? "border-b-2 border-primary font-medium" : "text-muted-foreground hover:text-foreground")}>{rotulo}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
        {aba === "entrega" ? (
          <div className="flex flex-col gap-4">
            {task.branch && <p className="text-xs text-muted-foreground">Branch <span className="font-mono text-foreground">{task.branch}</span>{task.prUrl && <> · <a href={task.prUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">PR</a></>}</p>}
            {fim && <section><h4 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Relatório</h4><p className="whitespace-pre-wrap">{fim.texto}</p></section>}
            {entregas.length === 0 && !fim && <p className="text-muted-foreground">Nada entregue ainda. O que cada carta entrega aparece aqui.</p>}
            {entregas.map((c) => (
              <section key={c.id}>
                <h4 className="mb-1 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"><span className="size-2 rounded-full" style={{ background: c.copia?.cor }} />{nome(c.cartaId)}</h4>
                <p className="rounded-lg border bg-muted/30 p-3 whitespace-pre-wrap">{c.entrega}</p>
              </section>
            ))}
            <EntregaApoio taskId={task.id} projetoId={task.projetoId} />
          </div>
        ) : aba === "mudancas" ? <Mudancas task={task} /> : (
          <ol className="flex flex-col gap-3">
            {detalhe.eventos.length === 0 && <li className="text-muted-foreground">Os eventos da task aparecem aqui.</li>}
            {detalhe.eventos.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 border-l-2 pl-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className={cn("font-medium", TIPO[e.tipo].cor)}>{TIPO[e.tipo].rotulo}</span>
                  {(e.deCartaId || e.paraCartaId) && <span className="text-muted-foreground">{nome(e.deCartaId) || "Sistema"}{e.paraCartaId && ` → ${nome(e.paraCartaId)}`}</span>}
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular">{e.tokens ? `${e.tokens.toLocaleString("pt-BR")} tok · ` : ""}{hora(e.criadoEm)}</span>
                </div>
                <p className="whitespace-pre-wrap">{e.texto}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
