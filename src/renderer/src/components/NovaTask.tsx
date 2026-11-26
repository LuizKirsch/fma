/**
 * Task manual (T12, RF 6.01 e 6.02): a missão, um título opcional e por quais cartas a task começa.
 * Sem cartas marcadas, ela começa pelo começo natural do fluxo. Cria a task pronta; quem inicia é a lista.
 */
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { icone } from "@/lib/icones"
import type { Task } from "@shared/task"
import type { Projeto } from "@shared/projeto"
import { useCartas } from "@/data/cartas"
import { ok } from "@/data/tasks"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"

const EXEMPLOS = [
  "Corrigir o erro ao salvar o formulário de cadastro e cobrir o caso com teste.",
  "Adicionar um filtro por data na listagem, com a validação dos campos.",
  "Documentar os endpoints da API e revisar os nomes dos campos.",
]

export function NovaTask({ projeto, aberto, aoMudar, aoCriar }: { projeto: Projeto; aberto: boolean; aoMudar: (a: boolean) => void; aoCriar: (t: Task) => void }) {
  const { cartas } = useCartas()
  const [naMesa, setNaMesa] = useState<string[]>([])
  const [missao, setMissao] = useState("")
  const [titulo, setTitulo] = useState("")
  const [comeca, setComeca] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setMissao(""); setTitulo(""); setComeca([])
    void window.fma.mesa.carregar(projeto.id).then((m) => setNaMesa(m.cartas.map((c) => c.cartaId)))
  }, [aberto, projeto.id])

  const candidatas = cartas.filter((c) => naMesa.includes(c.id) && c.classe !== "orquestrador")
  const alterna = (id: string) => setComeca((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))

  async function criar() {
    setSalvando(true)
    const t = ok(await window.fma.tasks.criar({ projetoId: projeto.id, missao, titulo: titulo || undefined, comecaPor: comeca }))
    setSalvando(false)
    if (!t) return
    aoMudar(false)
    aoCriar(t)
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display">Task manual</DialogTitle>
          <DialogDescription>Descreva o que o time deve fazer em {projeto.nome}. A task nasce pronta para iniciar.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="nt-missao">Missão</FieldLabel>
            <Textarea id="nt-missao" autoFocus rows={4} value={missao} onChange={(e) => setMissao(e.target.value)} placeholder="O que precisa ser feito, e o que é um bom resultado." />
            <div className="flex flex-wrap gap-1.5">
              {EXEMPLOS.map((x) => <button key={x} type="button" onClick={() => setMissao(x)} className="max-w-full truncate rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground">{x}</button>)}
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="nt-titulo">Título (opcional)</FieldLabel>
            <Input id="nt-titulo" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Por onde começa</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {candidatas.map((c) => {
                const I = icone(c.simbolo), on = comeca.includes(c.id)
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => alterna(c.id)}
                    className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", on ? "bg-primary/15 font-medium" : "text-muted-foreground")} style={{ borderColor: on ? c.cor : undefined }}>
                    <I className="size-3.5" style={{ color: c.cor }} />{c.nome}
                  </button>
                )
              })}
              {candidatas.length === 0 && <span className="text-xs text-muted-foreground">Coloque cartas na mesa para escolher.</span>}
            </div>
            <FieldDescription>{comeca.length ? "As cartas antes delas no fluxo contam como concluídas." : "Nenhuma marcada: começa pelo começo natural do fluxo."}</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => aoMudar(false)}>Cancelar</Button>
          <Button disabled={!missao.trim() || salvando} onClick={() => void criar()}>Criar task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
