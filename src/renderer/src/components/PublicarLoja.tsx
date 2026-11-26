/** "Publicar na Loja": guarda uma cópia da carta na Loja local (sem backend). */
import { useState } from "react"
import { Send } from "lucide-react"
import { toast } from "sonner"
import { CATEGORIAS_LOJA } from "@shared/biblioteca"
import type { Carta } from "@shared/tipos"
import { publicarNaLoja } from "@/data/biblioteca"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function PublicarLoja({ carta, aoFechar }: { carta: Carta | null; aoFechar: () => void }) {
  const [descricao, setDescricao] = useState<string | null>(null)
  const [categoria, setCategoria] = useState(CATEGORIAS_LOJA[0])
  const fechar = () => { setDescricao(null); aoFechar() }
  async function publicar() {
    const r = await publicarNaLoja(carta!.id, descricao ?? carta!.descricao, categoria)
    if (r.ok) { toast.success(`${carta!.nome} publicado na Loja`); fechar() } else toast.error(r.erro)
  }
  return (
    <Dialog open={!!carta} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Publicar na Loja</DialogTitle><DialogDescription>Fica na Loja deste app, para você adicionar cópias. A sua carta continua sua.</DialogDescription></DialogHeader>
        <FieldGroup>
          <Field><FieldLabel htmlFor="pub-desc">O que ele faz</FieldLabel><Textarea id="pub-desc" rows={3} value={descricao ?? carta?.descricao ?? ""} onChange={(e) => setDescricao(e.target.value)} /></Field>
          <Field><FieldLabel>Categoria</FieldLabel>
            <ToggleGroup type="single" variant="outline" size="sm" value={categoria} onValueChange={(v) => v && setCategoria(v)} className="flex-wrap justify-start">
              {CATEGORIAS_LOJA.map((c) => <ToggleGroupItem key={c} value={c} className="px-3">{c}</ToggleGroupItem>)}
            </ToggleGroup>
          </Field>
          {carta && <FieldDescription>Vai junto: prompt, método, skills, {carta.habilidades.length} habilidade(s) e {carta.memorias.length} memória(s) da biblioteca. A conta de IA não vai.</FieldDescription>}
        </FieldGroup>
        <DialogFooter><Button variant="ghost" onClick={fechar}>Cancelar</Button><Button onClick={() => void publicar()}><Send data-icon="inline-start" />Publicar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
