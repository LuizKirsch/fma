/**
 * Lista de habilidades ou memórias da biblioteca com caixa de seleção e "Criar" na hora.
 * Nas fichas, liga itens à carta:
 *   <EscolherItensBiblioteca tipo="habilidade" selecionados={carta.habilidades} aoMudar={(ids) => ...} />
 * Sem `aoMudar`, vira o gerenciador da Loja (sem caixas; dá para excluir só os seus).
 */
import { useState } from "react"
import { BookOpen, Brain, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { TipoItem } from "@shared/biblioteca"
import { criarItem, excluirItem, useBiblioteca } from "@/data/biblioteca"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const TXT = {
  habilidade: { um: "habilidade", icone: BookOpen, ajuda: "Uma instrução que a carta segue quando trabalha.", texto: "Instrução", ex: "Ex.: Revisar textos de tela" },
  memoria: { um: "memória", icone: Brain, ajuda: "Algo que a carta deve saber e consultar antes de agir.", texto: "Conteúdo", ex: "Ex.: Regras do módulo de compras" },
} as const

export function EscolherItensBiblioteca({ tipo, selecionados = [], aoMudar }: {
  tipo: TipoItem
  /** Ids marcados. */
  selecionados?: string[]
  /** Recebe a lista nova de ids a cada marca ou desmarca (e quando você cria um item, que já vem marcado). */
  aoMudar?: (ids: string[]) => void
}) {
  const { itens } = useBiblioteca()
  const [q, setQ] = useState("")
  const [criando, setCriando] = useState(false)
  const T = TXT[tipo]
  const escolher = !!aoMudar
  const marcados = new Set(selecionados)
  const lista = itens.filter((i) => i.tipo === tipo && (!q || `${i.nome} ${i.descricao}`.toLowerCase().includes(q.toLowerCase())))
  const alternar = (id: string) => aoMudar?.(marcados.has(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id])

  async function excluir(id: string, nome: string) {
    const r = await excluirItem(id)
    if (!r.ok) return toast.error(r.erro)
    toast(`"${nome}" excluída`)
    if (marcados.has(id)) aoMudar?.(selecionados.filter((x) => x !== id))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="pl-8" />
        </div>
        <Button onClick={() => setCriando(true)}><Plus data-icon="inline-start" />Criar {T.um}</Button>
      </div>
      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nada por aqui.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {lista.map((i) => (
            <label key={i.id} className={cn("flex items-start gap-2.5 rounded-xl border bg-card p-3 transition-colors", escolher && "cursor-pointer", marcados.has(i.id) && "border-primary/70 bg-primary/5")}>
              {escolher && <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={marcados.has(i.id)} onChange={() => alternar(i.id)} />}
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2"><T.icone className="size-4 shrink-0 text-muted-foreground" /><b className="truncate text-sm">{i.nome}</b>
                  <Badge variant={i.padrao ? "outline" : "secondary"} className="h-4 px-1.5 text-[10px]">{i.padrao ? "padrão" : "sua"}</Badge></span>
                <span className="text-xs text-muted-foreground">{i.descricao}</span>
              </span>
              {!i.padrao && <Button type="button" size="icon-xs" variant="ghost" aria-label={`Excluir ${i.nome}`} onClick={(e) => { e.preventDefault(); void excluir(i.id, i.nome) }}><Trash2 /></Button>}
            </label>
          ))}
        </div>
      )}
      <CriarItem tipo={tipo} aberto={criando} aoFechar={() => setCriando(false)} aoCriar={(id) => aoMudar?.([...selecionados, id])} />
    </div>
  )
}

function CriarItem({ tipo, aberto, aoFechar, aoCriar }: { tipo: TipoItem; aberto: boolean; aoFechar: () => void; aoCriar: (id: string) => void }) {
  const [nome, setNome] = useState(""), [descricao, setDescricao] = useState(""), [texto, setTexto] = useState("")
  const T = TXT[tipo]
  async function criar() {
    const r = await criarItem({ tipo, nome, descricao, texto })
    if (!r.ok) return toast.error(r.erro)
    toast.success(`${T.um[0].toUpperCase() + T.um.slice(1)} criada`, { description: r.valor.nome })
    aoCriar(r.valor.id)
    setNome(""); setDescricao(""); setTexto("")
    aoFechar()
  }
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Criar {T.um}</DialogTitle><DialogDescription>{T.ajuda}</DialogDescription></DialogHeader>
        <FieldGroup>
          <Field><FieldLabel htmlFor="bib-nome">Nome</FieldLabel><Input id="bib-nome" autoFocus value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} placeholder={T.ex} /></Field>
          <Field><FieldLabel htmlFor="bib-desc">Resumo</FieldLabel><Input id="bib-desc" value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} placeholder="Uma linha sobre para que serve" /></Field>
          <Field><FieldLabel htmlFor="bib-texto">{T.texto}</FieldLabel><Textarea id="bib-texto" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Entra no prompt da carta quando ela roda." /></Field>
        </FieldGroup>
        <DialogFooter><Button variant="ghost" onClick={aoFechar}>Cancelar</Button><Button disabled={!nome.trim() || !texto.trim()} onClick={() => void criar()}>Criar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
