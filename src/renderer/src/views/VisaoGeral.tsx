/**
 * Visão geral (T02, RF 2.15 a 2.20): totais, um cartão por projeto ordenado pelo que precisa de você,
 * as classes que faltam quando a mesa não tem fluxo válido e o estado vazio. As boas-vindas (T01) entram no primeiro acesso.
 */
import { useEffect, useMemo, useState } from "react"
import { FolderGit2, Layers, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { CLASSES } from "@shared/catalogo"
import type { ResumoProjeto } from "@shared/geral"
import type { Projeto } from "@shared/projeto"
import type { Task } from "@shared/task"
import { useProjetos } from "@/data/projetos"
import { progresso, useDetalhe, useTasks } from "@/data/tasks"
import { icone } from "@/lib/icones"
import { BoasVindas } from "@/components/BoasVindas"
import { Barra, nomeDaTask, rotuloDaTask } from "@/components/TaskUi"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

/** Na ordem do Processo 2.1: quem precisa de uma decisão vem primeiro. */
const SITUACOES = {
  decisao: { rotulo: "Precisa da sua decisão", cor: "text-warning" },
  desenvolvimento: { rotulo: "Em desenvolvimento", cor: "text-info" },
  pronto: { rotulo: "Pronto para iniciar", cor: "text-info" },
  montando: { rotulo: "Montando o time", cor: "text-muted-foreground" },
  parado: { rotulo: "Parado", cor: "text-muted-foreground" },
  concluido: { rotulo: "Concluído", cor: "text-success" },
}
type Situacao = keyof typeof SITUACOES
const ORDEM = Object.keys(SITUACOES) as Situacao[]

/** A task em destaque do projeto e a situação dele (RF 2.16 e 2.17). */
function leituraDoProjeto(tasks: Task[], resumo: ResumoProjeto | undefined): { situacao: Situacao; destaque: Task | null } {
  const dele = [...tasks].sort((a, b) => b.criadaEm - a.criadaEm)
  const com = (...s: Task["situacao"][]) => dele.find((t) => s.includes(t.situacao)) ?? null
  const decisao = com("aguardando", "revisao"), rodando = com("andamento"), pronta = com("pronta", "fila")
  if (decisao) return { situacao: "decisao", destaque: decisao }
  if (rodando) return { situacao: "desenvolvimento", destaque: rodando }
  if (pronta) return { situacao: "pronto", destaque: pronta }
  if (resumo && !resumo.fluxoValido) return { situacao: "montando", destaque: dele[0] ?? null }
  return { situacao: dele[0]?.situacao === "concluida" ? "concluido" : "parado", destaque: dele[0] ?? null }
}

function Cartao({ projeto, resumo, situacao, destaque, aoAbrir }: { projeto: Projeto; resumo?: ResumoProjeto; situacao: Situacao; destaque: Task | null; aoAbrir: () => void }) {
  const detalhe = useDetalhe(destaque && (destaque.situacao === "andamento" || destaque.situacao === "aguardando") ? destaque.id : null)
  const s = SITUACOES[situacao]
  const faltam = resumo?.faltam ?? []
  return (
    <button onClick={aoAbrir} className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/60", situacao === "decisao" && "border-warning/60")}>
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-display text-base">{projeto.nome}</span>
        <span className={cn("shrink-0 text-xs font-medium", s.cor)}>{s.rotulo}</span>
      </span>
      {destaque ? (
        <span className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2 text-xs"><span className="font-mono text-muted-foreground">{rotuloDaTask(destaque)}</span><span className="truncate">{nomeDaTask(destaque)}</span></span>
          <Barra pct={progresso(destaque, detalhe?.cartas)} />
        </span>
      ) : <span className="text-xs text-muted-foreground">Nenhuma task ainda.</span>}
      <span className="flex flex-wrap gap-1.5">
        {resumo?.time.map((c) => { const I = icone(c.simbolo); return <span key={c.id} title={`${c.nome} · ${CLASSES[c.classe].nome}`} className="grid size-7 place-items-center rounded-md border" style={{ borderColor: c.cor }}><I className="size-4" style={{ color: c.cor }} /></span> })}
        {!resumo?.time.length && <span className="text-xs text-muted-foreground">Mesa vazia.</span>}
      </span>
      {/* RF 2.18 */}
      {resumo && !resumo.fluxoValido && (
        <span className="text-xs text-warning">
          {faltam.length ? `Faltam no time: ${faltam.map((k) => CLASSES[k].nome).join(", ")}.` : resumo.problema ?? "O fluxo da mesa não está válido."}
        </span>
      )}
    </button>
  )
}

export function VisaoGeral({ aoAbrir, aoNovo, irColecao }: { aoAbrir: (id: string) => void; aoNovo: () => void; irColecao: () => void }) {
  const { projetos, carregado } = useProjetos()
  const tasks = useTasks()
  const [resumos, setResumos] = useState<ResumoProjeto[]>([])
  const [boas, setBoas] = useState(false)
  useEffect(() => { void window.fma.geral.boasVindas().then(setBoas) }, [])
  // A mesa muda por fora da lista de projetos; reler ao voltar para esta aba (ela é montada de novo) basta.
  useEffect(() => { void window.fma.geral.resumo().then(setResumos) }, [projetos])

  const linhas = useMemo(() => projetos.map((p) => {
    const resumo = resumos.find((r) => r.projetoId === p.id)
    return { projeto: p, resumo, ...leituraDoProjeto(tasks.filter((t) => t.projetoId === p.id), resumo) }
  }).sort((a, b) => ORDEM.indexOf(a.situacao) - ORDEM.indexOf(b.situacao)), [projetos, tasks, resumos])

  const totais = [
    { rotulo: "Projetos", n: projetos.length },
    { rotulo: "Em desenvolvimento", n: tasks.filter((t) => t.situacao === "andamento").length },
    { rotulo: "Precisam de você", n: tasks.filter((t) => t.situacao === "aguardando" || t.situacao === "revisao").length, alerta: true },
    { rotulo: "Concluídas", n: tasks.filter((t) => t.situacao === "concluida").length },
  ]

  if (!carregado) return null
  if (boas) {
    const sair = () => { void window.fma.geral.concluirBoasVindas(); setBoas(false) }
    return <BoasVindas aoCriar={() => { sair(); aoNovo() }} aoPular={sair} />
  }
  if (!projetos.length) return (
    <Empty className="m-8 border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FolderGit2 /></EmptyMedia>
        <EmptyTitle>Nenhum projeto ainda</EmptyTitle>
        <EmptyDescription>Um projeto aponta para um repositório git e tem uma mesa onde as cartas do seu time se ligam.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button size="lg" className="font-display" onClick={aoNovo}><Plus data-icon="inline-start" />Criar projeto</Button>
        <Button size="lg" variant="outline" onClick={irColecao}><Layers data-icon="inline-start" />Ir para a Coleção</Button>
      </EmptyContent>
    </Empty>
  )
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-8 py-7">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <h1 className="font-display text-2xl">Visão geral</h1>
            <p className="text-sm text-muted-foreground">O que precisa de você aparece primeiro.</p>
          </div>
          <Button size="lg" className="font-display" onClick={aoNovo}><Plus data-icon="inline-start" />Novo projeto</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {totais.map((t) => (
            <div key={t.rotulo} className="rounded-xl border bg-card px-4 py-3">
              <div className={cn("font-display text-2xl tabular", t.alerta && t.n > 0 && "text-warning")}>{t.n}</div>
              <div className="text-xs text-muted-foreground">{t.rotulo}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {linhas.map((l) => <Cartao key={l.projeto.id} {...l} aoAbrir={() => aoAbrir(l.projeto.id)} />)}
        </div>
      </div>
    </div>
  )
}
