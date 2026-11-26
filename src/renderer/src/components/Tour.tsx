/** Tutorial guiado (RF 2.34): escurece a tela, destaca um elemento ([data-tour=...]) e explica. */
import { useEffect, useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, ArrowRight, GraduationCap, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface PassoTour { alvo: string; titulo: string; texto: string; antes?: () => void }

export function Tour({ passos, aberto, aoFechar }: { passos: PassoTour[]; aberto: boolean; aoFechar: (concluiu: boolean) => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const passo = passos[i]
  useEffect(() => { if (aberto) setI(0) }, [aberto])
  useEffect(() => { if (aberto) passo?.antes?.() }, [aberto, i]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!aberto || !passo) return
    let vivo = true
    // a tela e a ficha demoram a aparecer: procura de novo depois da animação
    const achar = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${passo.alvo}"]`)
      if (vivo) setRect(el ? el.getBoundingClientRect() : null)
    }
    const t1 = window.setTimeout(achar, 80), t2 = window.setTimeout(achar, 450)
    window.addEventListener("resize", achar)
    return () => { vivo = false; clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", achar) }
  }, [aberto, i, passo])
  const proximo = () => (i < passos.length - 1 ? setI(i + 1) : aoFechar(true))
  useEffect(() => {
    if (!aberto) return
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); aoFechar(false) }
      if (e.key === "ArrowRight") proximo()
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener("keydown", k, true)
    return () => window.removeEventListener("keydown", k, true)
  })
  if (!aberto || !passo) return null
  const pad = 8, W = 340
  const vw = window.innerWidth, vh = window.innerHeight
  let left = vw / 2 - W / 2, top = vh / 2 - 90
  if (rect) {
    top = rect.bottom + 14 + 190 < vh ? rect.bottom + 14 : Math.max(12, rect.top - 14 - 190)
    left = Math.min(vw - W - 12, Math.max(12, rect.left + rect.width / 2 - W / 2))
    // alvo alto (a ficha): o balão fica ao lado
    if (rect.height > vh * 0.6) { top = Math.min(vh - 220, rect.top + 20); left = rect.left > W + 40 ? rect.left - W - 16 : Math.min(vw - W - 12, rect.right + 16) }
  }
  return createPortal(
    <div className="fixed inset-0 z-[200]" style={{ pointerEvents: "auto" }} role="dialog" aria-modal="true" aria-label="Tutorial">
      {rect ? <div className="pointer-events-none absolute rounded-xl transition-all duration-300" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px oklch(0 0 0 / 0.62), 0 0 0 2px var(--primary), 0 0 30px 4px color-mix(in oklch, var(--primary) 45%, transparent)" }} />
        : <div className="absolute inset-0 bg-black/60" />}
      <div className="deal-in absolute flex flex-col gap-3 rounded-2xl border bg-popover p-4 shadow-2xl" style={{ left, top, width: W }}>
        <div className="flex items-center gap-2"><GraduationCap className="size-4 text-primary" /><span className="text-xs text-muted-foreground tabular">Tutorial · {i + 1} de {passos.length}</span>
          <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Pular tutorial" onClick={() => aoFechar(false)}><X /></Button></div>
        <b className="text-base">{passo.titulo}</b>
        <p className="text-sm leading-relaxed text-muted-foreground">{passo.texto}</p>
        <div className="flex items-center gap-2">
          <span className="flex gap-1">{passos.map((_, k) => <span key={k} className={k === i ? "h-1.5 w-4 rounded-full bg-primary" : "size-1.5 rounded-full bg-muted-foreground/40"} />)}</span>
          <span className="ml-auto flex gap-1.5">
            {i > 0 && <Button size="sm" variant="ghost" onClick={() => setI(i - 1)}><ArrowLeft data-icon="inline-start" />Voltar</Button>}
            <Button size="sm" onClick={proximo}>{i < passos.length - 1 ? <>Próximo<ArrowRight data-icon="inline-end" /></> : "Entendi"}</Button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
