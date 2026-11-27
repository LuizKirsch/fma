/**
 * Terminal (T05, RF 8.12): um quadro por carta da task acompanhada, com o que ela faz agora e as
 * últimas linhas da CLI dela, e o console com tudo, em tempo real.
 */
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import type { DetalheTask } from "@shared/task"
import { useCartas } from "@/data/cartas"
import { useConsole, type LinhaConsole } from "@/data/tasks"
import { nomeadorDe } from "@/components/PainelTask"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

const ESTADO: Record<string, string> = { espera: "aguardando", pronta: "pronta", trabalhando: "trabalhando", questionando: "questionando", concluida: "concluiu" }

/** "[Bash] docker ps" → ferramenta + texto. Linhas antigas vinham como "[Bash] {"command":"..."}" (JSON cortado): pega o primeiro texto. */
function separarFerramenta(linha: string): { ferramenta: string | null; texto: string } {
  const m = /^\[([\w.:-]+)\] ([\s\S]*)$/.exec(linha)
  if (!m) return { ferramenta: null, texto: linha }
  const antigo = m[2].startsWith("{") ? /"\w+":"((?:[^"\\]|\\.)*)/.exec(m[2]) : null
  let texto = m[2]
  if (antigo) try { texto = JSON.parse(`"${antigo[1]}"`) } catch { /* fica o cru */ }
  return { ferramenta: m[1], texto }
}

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

export function Terminal({ detalhe }: { detalhe: DetalheTask | null }) {
  const { cartas } = useCartas()
  const linhas = useConsole(detalhe?.task.id ?? null)
  if (!detalhe) return (
    <Empty className="m-8 border border-dashed"><EmptyHeader><EmptyTitle>Nenhuma task acompanhada</EmptyTitle><EmptyDescription>Escolha uma task na faixa do topo ou na aba Tasks para ver o console dela.</EmptyDescription></EmptyHeader></Empty>
  )
  const nome = nomeadorDe(detalhe, cartas)
  const quadros = detalhe.cartas.filter((c) => !c.retirada && c.copia)
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4">
      {quadros.length > 0 && (
        <div className="grid max-h-[46%] shrink-0 grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 overflow-y-auto">
          {quadros.map((c) => (
            <section key={c.id} className="flex h-44 flex-col overflow-hidden rounded-lg border bg-card">
              <header className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
                <span className={cn("size-2 rounded-full", (c.estado === "trabalhando" || c.estado === "questionando") && "animate-pulse")} style={{ background: c.copia!.cor }} />
                <span className="truncate font-medium">{c.copia!.nome}</span>
                <span className="ml-auto text-muted-foreground">{ESTADO[c.estado]}</span>
              </header>
              <p className="truncate px-3 py-1 text-[11px] text-muted-foreground">{c.atividade || "—"}</p>
              <Linhas linhas={linhas.filter((l) => l.cartaId === c.cartaId).slice(-60)} nome={nome} className="min-h-0 flex-1" />
            </section>
          ))}
        </div>
      )}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <header className="border-b px-3 py-1.5 text-xs font-medium">Console · task {detalhe.task.referencia ?? `#${detalhe.task.numero}`}</header>
        <Linhas linhas={linhas} nome={nome} comNome className="min-h-0 flex-1" />
      </section>
    </div>
  )
}
