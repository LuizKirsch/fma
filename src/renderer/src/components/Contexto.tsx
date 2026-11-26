/**
 * Contexto do projeto e da task (E10). O do projeto vale para as tasks que ainda vão começar; o da task só muda
 * antes de iniciar. Os dois entram no plano do Orquestrador e no prompt de cada carta (motor).
 * Edição na própria tela: Ctrl+Enter salva, Esc cancela.
 */
import { useState } from "react"
import { BookText, MessageSquareText } from "lucide-react"
import { toast } from "sonner"
import type { Projeto } from "@shared/projeto"
import { recarregarProjetos } from "@/data/projetos"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/** Caixa de edição com os atalhos; `aoSalvar` devolve true se gravou. */
export function EditorContexto({ inicial, titulo, dica, aoSalvar, aoCancelar }: { inicial: string; titulo: string; dica?: string; aoSalvar: (texto: string) => Promise<boolean>; aoCancelar: () => void }) {
  const [texto, setTexto] = useState(inicial)
  const salvar = async () => { if (await aoSalvar(texto)) aoCancelar() }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-muted/30 p-3">
      <span className="flex items-center gap-2 text-xs font-medium"><MessageSquareText className="size-3.5 text-primary" />{titulo}{dica && <span className="font-normal text-muted-foreground">· {dica}</span>}</span>
      <Textarea autoFocus rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label={titulo}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); aoCancelar() }
          else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void salvar() }
        }} />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-muted-foreground">Ctrl+Enter salva · Esc cancela</span>
        <Button size="xs" variant="ghost" onClick={aoCancelar}>Cancelar</Button>
        <Button size="xs" onClick={() => void salvar()}>Salvar</Button>
      </div>
    </div>
  )
}

/** Faixa no topo das Tasks: o contexto do projeto, editável. */
export function ContextoProjeto({ projeto }: { projeto: Projeto }) {
  const [editando, setEditando] = useState(false)
  if (editando) {
    return (
      <EditorContexto inicial={projeto.contexto} titulo="Contexto do projeto" dica="vale para as tasks que ainda vão começar"
        aoCancelar={() => setEditando(false)}
        aoSalvar={async (t) => {
          const r = await window.fma.contexto.projeto(projeto.id, t)
          if (!r.ok) { toast.error(r.erro); return false }
          await recarregarProjetos()
          toast("Contexto do projeto salvo", { description: "Vale para as tasks que ainda vão começar." })
          return true
        }} />
    )
  }
  return (
    <button type="button" onClick={() => setEditando(true)} className="group flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs text-muted-foreground hover:border-primary/50">
      <BookText className="size-3.5 shrink-0 text-primary" />
      {projeto.contexto
        ? <><span className="shrink-0 font-medium text-foreground">Contexto do projeto:</span><span className="truncate">{projeto.contexto.replace(/\n/g, " ")}</span><span className="ml-auto shrink-0 opacity-0 group-hover:opacity-100">Editar</span></>
        : <span>Adicionar contexto do projeto (vale para as tasks que ainda vão começar)</span>}
    </button>
  )
}
