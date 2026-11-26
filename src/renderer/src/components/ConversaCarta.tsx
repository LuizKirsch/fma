/** Conversa direta com a carta, sem passar pelo Maestro. O histórico fica no banco (conversa_direta). */
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Send } from "lucide-react"
import type { MensagemDireta } from "@shared/conversa"
import type { Carta } from "@shared/tipos"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export function ConversaCarta({ carta, projetoId, aoFechar }: { carta: Carta | null; projetoId: string; aoFechar: () => void }) {
  const [msgs, setMsgs] = useState<MensagemDireta[]>([])
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  useEffect(() => { setMsgs([]); if (carta) void window.fma.conversa.listar(carta.id).then(setMsgs) }, [carta?.id])
  useEffect(() => { fim.current?.scrollIntoView() }, [msgs, enviando])

  async function enviar() {
    if (!carta || !texto.trim() || enviando) return
    const t = texto
    setTexto(""); setEnviando(true)
    setMsgs((m) => [...m, { id: "pendente", cartaId: carta.id, taskId: null, de: "voce", texto: t, criadaEm: Date.now() }])
    const r = await window.fma.conversa.enviar(carta.id, projetoId, t)
    setEnviando(false)
    if (r.ok) setMsgs(r.valor); else { toast.error(r.erro); setTexto(t) }
  }

  return (
    <Sheet open={!!carta} onOpenChange={(o) => !o && aoFechar()}>
      <SheetContent className="flex w-[420px] flex-col sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle className="font-display">Conversar com {carta?.nome}</SheetTitle>
          <SheetDescription>Direto com a carta, sem o Maestro. Durante uma task, o pedido vira apontamento dela.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4">
          {msgs.map((m) => (
            <div key={m.id} className={cn("max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm", m.de === "voce" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted")}>{m.texto}</div>
          ))}
          {enviando && <div className="self-start text-xs text-muted-foreground">{carta?.nome} está respondendo...</div>}
          <div ref={fim} />
        </div>
        <form className="flex gap-2 p-4" onSubmit={(e) => { e.preventDefault(); void enviar() }}>
          <Textarea value={texto} rows={2} placeholder="Escreva para a carta" onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar() } }} />
          <Button type="submit" size="icon" disabled={enviando || !texto.trim()} aria-label="Enviar"><Send /></Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
