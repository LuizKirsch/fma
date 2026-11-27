/**
 * Tasks do projeto (T04, RF 8.02 a 8.08): as tasks agrupadas por situação, cada uma com a trilha,
 * o progresso e as ações (iniciar, parar, descartar, tirar da fila, reabrir). Antes de iniciar, clicar numa
 * carta da trilha a tira da task ou a devolve (RF 6.06 e 6.07). Clicar na task a escolhe como acompanhada.
 */
import { useEffect, useMemo, useState } from "react"
import { Download, ExternalLink, Eye, GitMerge, GitPullRequest, MessageSquareText, Pencil, Play, Plus, RotateCcw, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { SituacaoTask, Task } from "@shared/task"
import type { Projeto } from "@shared/projeto"
import { useCartas } from "@/data/cartas"
import { aceitarTask, atencaoDa, descartarTask, devolverCarta, iniciarTask, iniciarTodas, pedirAjuste, progresso, reabrirTask, revisarTask, tirarCarta, tirarDaFila, useDetalhe, usePrevia, useTasks, useVistas } from "@/data/tasks"
import { FerramentasDaTask, Trilha, usePassos, type Passo } from "@/components/Trilha"
import { BadgeSituacao, BotaoParar, Barra, nomeDaTask, PontoAtencao, rotuloDaTask } from "@/components/TaskUi"
import { ContextoProjeto, EditorContexto } from "@/components/Contexto"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

const GRUPOS: { titulo: string; situacoes: SituacaoTask[] }[] = [
  { titulo: "Prontas para iniciar", situacoes: ["pronta"] },
  { titulo: "Em andamento", situacoes: ["andamento", "aguardando"] },
  { titulo: "Em revisão", situacoes: ["revisao"] },
  { titulo: "Na fila", situacoes: ["fila"] },
  { titulo: "Concluídas e paradas", situacoes: ["concluida", "parada"] },
]

interface Acoes { escolher: () => void; descartar: () => void; reabrir: () => void }

/** Se a branch da task (em revisão ou parada) tem mudanças em relação à base; null enquanto carrega ou sem branch. */
function useTemMudancas(task: Task, ativo: boolean) {
  const [tem, setTem] = useState<boolean | null>(null)
  useEffect(() => {
    let vivo = true
    setTem(null)
    if (ativo && task.branch) void window.fma.tasks.diff(task.id).then((r) => { if (vivo) setTem(r.ok ? r.valor.arquivos.length > 0 : null) })
    return () => { vivo = false }
  }, [task.id, task.situacao, task.branch, ativo])
  return tem
}

/** Task em revisão: ver mudanças, aceitar (PR ou merge), pedir ajuste ou descartar. */
function AcoesRevisao({ task, acoes }: { task: Task; acoes: Acoes }) {
  const [ajustando, setAjustando] = useState(false)
  const [texto, setTexto] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const vazio = useTemMudancas(task, true) === false
  const rodar = async (fn: () => Promise<unknown>) => { setOcupado(true); try { return await fn() } finally { setOcupado(false) } }
  const enviar = () => void rodar(async () => { if (await pedirAjuste(task.id, texto)) { setTexto(""); setAjustando(false) } })
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={acoes.escolher}><Eye data-icon="inline-start" />Ver mudanças</Button>
        {vazio
          ? <Button size="sm" disabled={ocupado} onClick={() => void rodar(() => aceitarTask(task.id, "nada"))}>Concluir sem mudanças</Button>
          : <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" disabled={ocupado}>{ocupado ? "Aceitando..." : "Aceitar"}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => void rodar(() => aceitarTask(task.id, "pr"))}><GitPullRequest />Abrir PR</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void rodar(() => aceitarTask(task.id, "merge"))}><GitMerge />Merge local</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setAjustando((v) => !v)}><Pencil data-icon="inline-start" />Pedir ajuste</Button>
        <Button size="sm" variant="ghost" disabled={ocupado} onClick={acoes.descartar}><Trash2 data-icon="inline-start" />Descartar</Button>
      </div>
      {ajustando && (
        <div className="flex flex-col gap-2">
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="O que o time deve ajustar? Ele roda de novo na mesma branch." />
          <div className="flex justify-end"><Button size="sm" disabled={ocupado || !texto.trim()} onClick={enviar}>Enviar ajuste</Button></div>
        </div>
      )}
    </div>
  )
}

function CartaoTask({ task, acompanhada, acoes }: { task: Task; acompanhada: boolean; acoes: Acoes }) {
  const { cartas } = useCartas()
  const ativa = task.situacao === "andamento" || task.situacao === "aguardando"
  const antes = task.situacao === "pronta" || task.situacao === "fila"
  const mostra = ativa || antes || acompanhada
  const detalhe = useDetalhe(mostra || task.situacao === "parada" ? task.id : null)
  const previa = usePrevia(task)
  const passos = usePassos(task, detalhe, previa, cartas)
  const temCommits = (useTemMudancas(task, task.situacao === "parada") === true || !!task.worktree)
  const [editandoContexto, setEditandoContexto] = useState(false)
  const atencao = atencaoDa(task, useVistas())
  const salvarContexto = async (texto: string) => {
    const r = await window.fma.contexto.task(task.id, texto)
    if (!r.ok) toast.error(r.erro)
    return r.ok
  }

  // RF 6.06 e 6.07: antes de iniciar, clicar na carta da trilha a tira ou a devolve.
  const alternar = (p: Passo) => void (p.retirada ? devolverCarta(task.id, p.cartaId) : tirarCarta(task.id, p.cartaId))
  return (
    <ContextMenu>
    <ContextMenuTrigger asChild>
    <article className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", acompanhada && "border-primary/70 ring-1 ring-primary/30")}>
      <div className="flex items-center gap-2">
        <button onClick={acoes.escolher} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-pressed={acompanhada} aria-label={`Acompanhar a task ${rotuloDaTask(task)}`}>
          <PontoAtencao atencao={atencao} />
          <span className="font-mono text-xs text-muted-foreground">{rotuloDaTask(task)}</span>
          <span className={cn("truncate font-display text-sm", atencao === "nova" && "font-semibold")}>{nomeDaTask(task)}</span>
        </button>
        <BadgeSituacao task={task} />
        {task.situacao === "pronta" && <>
          <Button size="sm" variant="ghost" onClick={acoes.descartar} aria-label="Descartar a task"><Trash2 data-icon="inline-start" />Descartar</Button>
          <Button size="sm" disabled={!!previa?.erros.length} onClick={() => void iniciarTask(task.id)}><Play data-icon="inline-start" />Iniciar</Button>
        </>}
        {task.situacao === "fila" && <Button size="sm" variant="outline" onClick={() => void tirarDaFila(task.id)}><X data-icon="inline-start" />Tirar da fila</Button>}
        {ativa && <BotaoParar task={task} />}
        {task.situacao === "parada" && temCommits && <Button size="sm" onClick={() => void revisarTask(task.id)}><Eye data-icon="inline-start" />Revisar o que foi feito</Button>}
        {task.situacao === "parada" && <Button size="sm" variant="outline" onClick={acoes.reabrir}><RotateCcw data-icon="inline-start" />Reabrir</Button>}
      </div>
      <FerramentasDaTask task={task} />
      {task.situacao === "revisao" && <AcoesRevisao task={task} acoes={acoes} />}
      {task.situacao === "concluida" && task.prUrl && <a href={task.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><GitPullRequest className="size-3.5" />Ver o PR<ExternalLink className="size-3" /></a>}
      {task.situacao === "parada" && task.decisao?.motivo && <p className="text-xs text-muted-foreground"><b className="text-foreground">Motivo:</b> {task.decisao.motivo}</p>}
      {editandoContexto
        ? <EditorContexto inicial={task.contexto} titulo={`Contexto da task ${rotuloDaTask(task)}`} dica="vai para o Orquestrador e para cada carta desta task" aoSalvar={salvarContexto} aoCancelar={() => setEditandoContexto(false)} />
        : task.contexto && <p className="flex items-start gap-2 text-xs text-muted-foreground"><MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-primary" /><span className="whitespace-pre-wrap"><b className="text-foreground">Contexto:</b> {task.contexto}</span></p>}
      {!antes && <Barra pct={progresso(task, detalhe?.cartas)} />}
      {mostra && <Trilha task={task} passos={passos} aoClicar={antes ? alternar : undefined}
        titulo={antes ? (p) => (p.orquestrador ? "O Orquestrador não sai da task" : p.retirada ? "Clique para devolver à task" : "Clique para tirar da task") : undefined} />}
      {antes && previa?.erros.map((e) => <p key={e} className="text-xs text-destructive">{e}</p>)}
      {antes && previa?.avisos.map((e) => <p key={e} className="text-xs text-warning">{e}</p>)}
    </article>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem disabled={!antes} onSelect={() => setEditandoContexto(true)}><MessageSquareText />{task.contexto ? "Editar contexto" : "Contexto…"}{!antes && " (só antes de iniciar)"}</ContextMenuItem>
      {task.contexto && antes && <ContextMenuItem onSelect={() => void salvarContexto("")}><X />Limpar contexto</ContextMenuItem>}
    </ContextMenuContent>
    </ContextMenu>
  )
}

export function Tasks({ projeto, acompanhada, aoEscolher, aoNova }: { projeto: Projeto; acompanhada: string | null; aoEscolher: (id: string) => void; aoNova: () => void }) {
  const todas = useTasks()
  const [busca, setBusca] = useState("")
  const [achadas, setAchadas] = useState<Set<string> | null>(null)
  const [descartando, setDescartando] = useState<Task | null>(null)

  // RF 8.06: a busca é do núcleo (referência, título ou número); a lista continua viva pelos eventos.
  useEffect(() => {
    if (!busca.trim()) return setAchadas(null)
    const t = setTimeout(() => void window.fma.tasks.buscar(projeto.id, busca).then((l) => setAchadas(new Set(l.map((x) => x.id)))), 200)
    return () => clearTimeout(t)
  }, [busca, projeto.id])

  const tasks = useMemo(() => todas.filter((t) => t.projetoId === projeto.id && (!achadas || achadas.has(t.id))), [todas, projeto.id, achadas])

  const [buscando, setBuscando] = useState(false)
  async function buscarDaFonte() {
    setBuscando(true)
    const r = await window.fma.fontes.buscar(projeto.id)
    setBuscando(false)
    if (!r.ok) return void toast.error(r.erro)
    toast(r.valor ? `${r.valor} task${r.valor === 1 ? "" : "s"} nova${r.valor === 1 ? "" : "s"} da fonte` : "Nada novo na fonte")

  }

  async function reabrir(t: Task) {
    const nova = await reabrirTask(t.id)
    if (nova) aoEscolher(nova.id)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar pela referência ou pelo título" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar tasks" />
          </div>
          {projeto.fonteId && <Button variant="outline" disabled={buscando} onClick={() => void buscarDaFonte()} title="Traz as tasks abertas da fonte que ainda não estão aqui"><Download data-icon="inline-start" />Buscar</Button>}
          <Button onClick={aoNova}><Plus data-icon="inline-start" />Task manual</Button>
        </div>
        <ContextoProjeto projeto={projeto} />
        {tasks.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{busca ? "Nenhuma task encontrada" : "Nenhuma task ainda"}</EmptyTitle>
              <EmptyDescription>{busca ? "Tente outro trecho da referência ou do título." : "Crie uma task manual com a missão e o time da mesa começa o trabalho."}</EmptyDescription>
            </EmptyHeader>
            {!busca && <EmptyContent><Button onClick={aoNova}><Plus data-icon="inline-start" />Task manual</Button></EmptyContent>}
          </Empty>
        ) : GRUPOS.map((g) => {
          const lista = tasks.filter((t) => g.situacoes.includes(t.situacao))
          if (g.situacoes[0] === "fila") lista.sort((a, b) => (a.posicaoFila ?? 0) - (b.posicaoFila ?? 0)) // RF 8.07
          if (!lista.length) return null
          return (
            <section key={g.titulo} className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 font-display text-sm">
                {g.titulo}<span className="font-normal text-muted-foreground tabular">{lista.length}</span>
                {g.situacoes[0] === "pronta" && lista.length > 1 && <Button size="xs" variant="outline" className="ml-auto" onClick={() => void iniciarTodas(projeto.id)}><Play data-icon="inline-start" />Iniciar todas</Button>}
              </h2>
              {lista.map((t) => <CartaoTask key={t.id} task={t} acompanhada={t.id === acompanhada} acoes={{ escolher: () => aoEscolher(t.id), descartar: () => setDescartando(t), reabrir: () => void reabrir(t) }} />)}
            </section>
          )
        })}
      </div>

      <AlertDialog open={!!descartando} onOpenChange={(o) => !o && setDescartando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar a task {descartando && rotuloDaTask(descartando)}?</AlertDialogTitle>
            <AlertDialogDescription>{descartando?.situacao === "revisao" ? "A branch da task é apagada e o trabalho feito se perde." : "Ela fica na lista como parada, e você pode reabri-la depois como uma task nova."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => descartando && void descartarTask(descartando.id)}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
