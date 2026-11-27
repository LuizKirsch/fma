/**
 * Terminal (T05, RF 8.12): um quadro por carta da task acompanhada, com o que ela faz agora e as
 * últimas linhas da CLI dela; embaixo, o console (xterm) e terminais de verdade no worktree, inclusive na sessão de uma carta.
 */
import { useEffect, useRef, useState } from "react"
import { Plus, ScrollText, SquareTerminal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DetalheTask } from "@shared/task"
import { useCartas } from "@/data/cartas"
import { useConsole, type LinhaConsole } from "@/data/tasks"
import { nomeadorDe } from "@/components/PainelTask"
import { ConsoleXterm, ShellXterm, separarFerramenta } from "@/components/Xterm"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

const ESTADO: Record<string, string> = { espera: "aguardando", pronta: "pronta", trabalhando: "trabalhando", questionando: "questionando", concluida: "concluiu" }

function Linhas({ linhas, nome, comNome, className }: { linhas: LinhaConsole[]; nome: (id: string | null) => string; comNome?: boolean; className?: string }) {
  const fim = useRef<HTMLDivElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  // Só acompanha o fim se o usuário já estava no fim.
  useEffect(() => {
    const r = raiz.current
    if (r && r.scrollHeight - r.scrollTop - r.clientHeight < 80) fim.current?.scrollIntoView({ block: "end" })
  }, [linhas.length])
  return (
    <div ref={raiz} className={cn("overflow-y-auto bg-background/60 p-3 font-mono text-xs leading-relaxed", className)}>
      {linhas.length === 0 && <span className="text-muted-foreground">Sem saída ainda.</span>}
      {linhas.map((l, i) => {
        const { ferramenta, texto } = separarFerramenta(l.linha)
        return (
          <div key={i} className={cn("break-words whitespace-pre-wrap", l.canal === "stderr" && "text-destructive", ferramenta && "text-muted-foreground")}>
            {comNome && l.cartaId && <span className="mr-2 text-muted-foreground">[{nome(l.cartaId)}]</span>}
            {ferramenta && <span className="mr-2 rounded bg-muted px-1.5 py-px text-[10.5px] text-foreground/80">{ferramenta}</span>}
            {texto}
          </div>
        )
      })}
      <div ref={fim} />
    </div>
  )
}

type Aba = { chave: string; titulo: string; cartaId: string | null }

export function Terminal({ detalhe }: { detalhe: DetalheTask | null }) {
  const { cartas } = useCartas()
  const linhas = useConsole(detalhe?.task.id ?? null)
  const [abas, setAbas] = useState<Aba[]>([])
  const [ativa, setAtiva] = useState("console")
  if (!detalhe) return (
    <Empty className="m-8 border border-dashed"><EmptyHeader><EmptyTitle>Nenhuma task acompanhada</EmptyTitle><EmptyDescription>Escolha uma task na faixa do topo ou na aba Tasks para ver o console dela.</EmptyDescription></EmptyHeader></Empty>
  )
  const nome = nomeadorDe(detalhe, cartas)
  const quadros = detalhe.cartas.filter((c) => !c.retirada && c.copia)
  const abrir = (titulo: string, cartaId: string | null) => {
    const chave = crypto.randomUUID()
    setAbas((l) => [...l, { chave, titulo, cartaId }])
    setAtiva(chave)
  }
  const fechar = (chave: string) => { setAbas((l) => l.filter((a) => a.chave !== chave)); if (ativa === chave) setAtiva("console") }
  const aba = (chave: string, rotulo: React.ReactNode, fechavel?: boolean) => (
    <div key={chave} role="tab" aria-selected={ativa === chave} className={cn("group flex h-8 items-center gap-1.5 rounded-t-md border-b-2 px-3 text-xs", ativa === chave ? "border-primary bg-[#0d0f14] text-[#d6d9e0]" : "border-transparent text-muted-foreground hover:text-foreground")}>
      <button onClick={() => setAtiva(chave)} className="flex items-center gap-1.5">{rotulo}</button>
      {fechavel && <button aria-label="Fechar terminal" onClick={() => fechar(chave)} className="rounded opacity-60 hover:opacity-100"><X className="size-3" /></button>}
    </div>
  )
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      {quadros.length > 0 && (
        <div className="grid max-h-[34%] shrink-0 grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2 overflow-y-auto">
          {quadros.map((c) => (
            <section key={c.id} className="flex h-28 flex-col overflow-hidden rounded-lg border bg-card">
              <header className="flex items-center gap-2 border-b px-3 py-1 text-xs">
                <span className={cn("size-2 rounded-full", (c.estado === "trabalhando" || c.estado === "questionando") && "animate-pulse")} style={{ background: c.copia!.cor }} />
                <span className="truncate font-medium">{c.copia!.nome}</span>
                <span className="ml-auto text-muted-foreground">{ESTADO[c.estado]}</span>
                {c.copia!.cli === "claude" && (
                  <button title="Abrir a conversa desta carta num terminal (claude --resume)" onClick={() => abrir(c.copia!.nome, c.cartaId)} className="flex items-center gap-1 rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <SquareTerminal className="size-3.5" />Sessão
                  </button>
                )}
              </header>
              <p className="truncate px-3 py-1 text-[11px] text-muted-foreground">{c.atividade || "—"}</p>
              <Linhas linhas={linhas.filter((l) => l.cartaId === c.cartaId).slice(-40)} nome={nome} className="min-h-0 flex-1 py-1" />
            </section>
          ))}
        </div>
      )}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <div role="tablist" className="flex shrink-0 items-end gap-0.5 border-b px-2 pt-1">
          {aba("console", <><ScrollText className="size-3.5" />Console</>)}
          {abas.map((a) => aba(a.chave, <><SquareTerminal className="size-3.5" />{a.cartaId ? a.titulo : "Shell"}</>, true))}
          <button aria-label="Novo terminal no worktree" title="Novo terminal no worktree da task" onClick={() => abrir("Shell", null)} className="mb-1 ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Plus className="size-3.5" /></button>
          <span className="mb-1.5 ml-auto text-[11px] text-muted-foreground">task {detalhe.task.referencia ?? `#${detalhe.task.numero}`}</span>
        </div>
        <div className="relative min-h-0 flex-1">
          <div className={cn("absolute inset-0", ativa !== "console" && "invisible")}><ConsoleXterm linhas={linhas} nome={nome} comNome /></div>
          {/* os shells ficam montados (invisíveis) ao trocar de aba: o PTY continua vivo */}
          {abas.map((a) => <div key={a.chave} className={cn("absolute inset-0", ativa !== a.chave && "invisible")}><ShellXterm taskId={detalhe.task.id} cartaId={a.cartaId} /></div>)}
        </div>
      </section>
    </div>
  )
}
