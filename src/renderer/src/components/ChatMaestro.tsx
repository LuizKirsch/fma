/**
 * Chat do Maestro (T09, RF 7.01 a 7.21): painel do projeto com a conversa, os pedidos rápidos e os chamados com botões.
 * Sem carta de Orquestrador na mesa o chat só explica o que falta (RF 7.02). Abrir marca tudo como lido (RF 7.04).
 */
import { useEffect, useRef, useState } from "react"
import { Network, Send, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { EstadoChat, MensagemChat, PedidoRapido } from "@shared/maestro"
import type { Projeto } from "@shared/projeto"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

const TOM = { alerta: "border-warning/60", ok: "border-success/60", info: "border-info/50" }

export function ChatMaestro({ projeto, aoFechar }: { projeto: Projeto; aoFechar: () => void }) {
  const [estado, setEstado] = useState<EstadoChat | null>(null)
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState<string | null>(null)
  const [digitando, setDigitando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const abrir = () => void window.fma.maestro.abrir(projeto.id).then(setEstado).catch((e) => toast.error(String(e?.message ?? e)))
    abrir()
    return window.fma.maestro.aoEvento((e) => {
      if (e.tipo === "digitando") { if (e.projetoId === projeto.id) setDigitando(e.ativo) } else if (e.tipo !== "nao-lidas" || e.projetoId === projeto.id) abrir()
    })
  }, [projeto.id])
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }) }, [estado?.mensagens.length, enviando, digitando])

  async function enviar(t: string) {
    if (!t.trim() || enviando) return
    setEnviando(t.trim()); setTexto("")
    try {
      const r = await window.fma.maestro.enviar(projeto.id, t)
      if (!r.ok) { toast.error(r.erro); setTexto(t) }
      setEstado(await window.fma.maestro.abrir(projeto.id))
    } catch (e) {
      toast.error(String((e as Error)?.message ?? e)); setTexto(t)
    } finally { setEnviando(null) }
  }
  async function agir(m: MensagemChat, acao: string) {
    try {
      const r = await window.fma.maestro.agir(m.id, acao)
      if (!r.ok) toast.error(r.erro)
      setEstado(await window.fma.maestro.abrir(projeto.id))
    } catch (e) { toast.error(String((e as Error)?.message ?? e)) }
  }
  const pedido = (p: PedidoRapido) => (p.preencher ? setTexto(p.texto) : void enviar(p.texto))

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-[420px] max-w-full flex-col border-l bg-card shadow-2xl" aria-label="Chat do Maestro">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Network className="size-5 text-primary" />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="font-display text-sm">Maestro</span>
          <span className="truncate text-[11px] text-muted-foreground">{estado?.orquestrador ? `${estado.orquestrador.nome} · ${estado.orquestrador.cli} ${estado.orquestrador.modelo}` : projeto.nome}</span>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Fechar o chat" onClick={aoFechar}><X /></Button>
      </header>

      {estado && !estado.disponivel ? (
        <p className="m-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{estado.motivo}</p>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {estado?.mensagens.length === 0 && !enviando && <p className="text-sm text-muted-foreground">Pergunte como estão as tasks, peça para liberar ou parar uma, ou abra uma task com “nova task: ...”.</p>}
            {estado?.mensagens.map((m) => (
              <div key={m.id} className={cn("flex max-w-[88%] flex-col gap-2 rounded-xl border px-3 py-2 text-sm", m.autor === "voce" ? "ml-auto bg-primary/15" : cn("bg-muted/40", m.tipo && TOM[m.tipo]))}>
                <p className="whitespace-pre-wrap">{m.texto}</p>
                {m.propostaTexto && <p className="rounded-md bg-background/60 p-2 text-xs whitespace-pre-wrap text-muted-foreground">{m.propostaTexto}</p>}
                {m.acoes.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {m.resolvida ? <span className="text-xs text-muted-foreground">Resolvido</span> : m.acoes.map((a) => (
                      <Button key={a.id} size="sm" variant={a.id === "confirmar" || a.id === "liberar" ? "default" : "outline"} onClick={() => void agir(m, a.id)}>{a.rotulo}</Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {enviando && <div className="ml-auto max-w-[88%] rounded-xl border bg-primary/15 px-3 py-2 text-sm whitespace-pre-wrap">{enviando}</div>}
            {(digitando || enviando) && <p className="text-xs text-muted-foreground">O Maestro está respondendo...</p>}
            <div ref={fim} />
          </div>

          <div className="flex flex-col gap-2 border-t p-3">
            <div className="flex flex-wrap gap-1.5">
              {estado?.pedidos.map((p) => <button key={p.id} onClick={() => pedido(p)} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground">{p.rotulo}</button>)}
            </div>
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void enviar(texto) }}>
              <Textarea value={texto} rows={2} placeholder="Escreva para o Maestro" className="min-h-0 resize-none" onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(texto) } }} />
              <Button type="submit" size="icon" aria-label="Enviar" disabled={!texto.trim() || !!enviando}><Send /></Button>
            </form>
          </div>
        </>
      )}
    </aside>
  )
}
