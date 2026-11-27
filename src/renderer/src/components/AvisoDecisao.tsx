/** Aviso de task esperando decisão (RF 8.20): o motivo e os botões. Limite de devoluções: Liberar mais uma volta e Parar (RF 6.27, 6.28). Carta travada (FMA-STATUS: bloqueado): Responder e reenviar, Seguir mesmo assim e Parar. */
import { useState } from "react"
import { CircleAlert } from "lucide-react"
import type { Task } from "@shared/task"
import { useCartas } from "@/data/cartas"
import { toast } from "sonner"
import { acrescentarRegra, sugerirRegra, vezesQueApareceu } from "@shared/regras"
import { recarregarProjetos, useProjetos } from "@/data/projetos"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { liberarTask, seguirTask, useDetalhe } from "@/data/tasks"
import { nomeadorDe } from "@/components/PainelTask"
import { BotaoParar, rotuloDaTask } from "@/components/TaskUi"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/** Guarda a decisão como regra no contexto do projeto (vale a partir da próxima task: o contexto é fixado ao iniciar). */
function LembrarNoProjeto({ task, motivo, resposta }: { task: Task; motivo: string; resposta: string }) {
  const { projetos } = useProjetos()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState("")
  const [vezes, setVezes] = useState(0)
  const abrir = async () => {
    setTexto(sugerirRegra(motivo, resposta))
    setAberto(true)
    setVezes(vezesQueApareceu(motivo, await window.fma.contexto.decisoes(task.projetoId, task.id)))
  }
  const salvar = async () => {
    const atual = projetos.find((p) => p.id === task.projetoId)?.contexto ?? ""
    const r = await window.fma.contexto.projeto(task.projetoId, acrescentarRegra(atual, texto))
    if (!r.ok) return void toast.error(r.erro)
    await recarregarProjetos()
    setAberto(false)
    toast.success("Regra salva no contexto do projeto", { description: "Vale a partir da próxima task." })
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => void abrir()}>Lembrar no projeto</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lembrar no projeto</DialogTitle>
            <DialogDescription>
              {vezes > 0 ? <strong className="text-warning">Essa trava já apareceu em {vezes} {vezes === 1 ? "task" : "tasks"}. </strong> : null}
              A regra entra em "Regras aprendidas" no contexto do projeto e vale a partir da próxima task.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={!texto.trim()} onClick={() => void salvar()}>Salvar regra</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AvisoDecisao({ task }: { task: Task }) {
  const { cartas } = useCartas()
  const detalhe = useDetalhe(task.id)
  const nome = nomeadorDe(detalhe, cartas)
  const [resposta, setResposta] = useState("")
  if (task.situacao !== "aguardando" || !task.decisao) return null
  const { motivo, cartaId, questionadorId } = task.decisao
  const travou = cartaId === questionadorId
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium">Task {rotuloDaTask(task)} espera sua decisão</p>
        <p className="text-muted-foreground">{motivo}</p>
        {travou
          ? <Textarea value={resposta} onChange={(e) => setResposta(e.target.value)} placeholder={`Responda a ${nome(cartaId)} (opcional): ela roda de novo com isto como apontamento`} rows={2} />
          : <p className="text-xs text-muted-foreground">{nome(questionadorId)} devolveu o trabalho de {nome(cartaId)} até o limite de devoluções.</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={async () => { if (await liberarTask(task.id, resposta)) setResposta("") }}>{travou ? "Responder e reenviar" : "Liberar mais uma volta"}</Button>
          {travou && <Button size="sm" variant="outline" onClick={() => void seguirTask(task.id)}>Seguir mesmo assim</Button>}
          <BotaoParar task={task} rotulo={travou ? "Parar" : "Parar a task"} />
          {travou && <LembrarNoProjeto task={task} motivo={motivo} resposta={resposta} />}
        </div>
      </div>
    </div>
  )
}
