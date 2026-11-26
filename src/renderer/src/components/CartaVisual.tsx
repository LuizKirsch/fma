/**
 * A carta como aparece na Coleção, na mesa e na forja (visual do protótipo).
 * Frente: nome, símbolo, CLI, raridade, classe e método, atributos e as skills como gemas.
 * Verso (CartaVerso): o prompt final que vai para a IA.
 */
import type { CSSProperties } from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { icone } from "@/lib/icones"
import { CLASSES } from "@shared/catalogo"
import { RARIDADE, cliPorId } from "@shared/ia"
import { atributos, rotuloMetodo, skillsDa } from "@shared/carta"
import type { Carta } from "@shared/tipos"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const TAMANHOS = { sm: { w: 150, h: 214 }, md: { w: 188, h: 270 }, lg: { w: 290, h: 414 } }
export type TamanhoCarta = keyof typeof TAMANHOS
export const tamanhoCarta = (t: TamanhoCarta) => TAMANHOS[t]

export function CartaVisual({ carta, tamanho = "md", destacavel, className, style }: {
  carta: Carta
  tamanho?: TamanhoCarta
  destacavel?: boolean
  className?: string
  style?: CSSProperties
}) {
  const classe = CLASSES[carta.classe]
  const { modelo, poder, velocidade, foco } = atributos(carta)
  const Icone = icone(carta.simbolo)
  const { w, h } = TAMANHOS[tamanho]
  const lg = tamanho === "lg", sm = tamanho === "sm"
  const skills = skillsDa(carta)
  const barras = [{ k: "Poder", v: poder }, { k: "Velocidade", v: velocidade }, { k: "Foco", v: foco }]
  const extras = carta.adicionais.filter((e) => e.ativo).length

  return (
    <div
      className={cn("fma-card select-none text-left", `rarity-${modelo.raridade}`, destacavel && "hoverable", className)}
      style={{ "--c": carta.cor, width: w, height: h, ...style } as CSSProperties}
    >
      <div className="face flex flex-col" style={{ padding: lg ? 12 : sm ? 7 : 9, gap: lg ? 10 : 6 }}>
        <span className={cn("font-display truncate font-semibold leading-tight", lg ? "text-base" : sm ? "text-[11px]" : "text-[12.5px]")}>
          {carta.nome || "Sem nome"}
        </span>
        <div className="art flex items-center justify-center" style={{ height: lg ? 170 : sm ? 86 : 112 }}>
          <Icone className="hero" strokeWidth={1.4} style={{ width: lg ? 92 : sm ? 44 : 58, height: lg ? 92 : sm ? 44 : 58 }} />
          <span className="absolute top-1.5 right-1.5 rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[9.5px] text-white/85 backdrop-blur">
            {cliPorId(carta.cli).curto}
          </span>
          <span className="absolute bottom-1.5 left-1.5 flex gap-0.5" aria-label={`Raridade ${RARIDADE[modelo.raridade].nome}`}>
            {Array.from({ length: RARIDADE[modelo.raridade].estrelas }).map((_, i) => <Star key={i} className="size-2.5 fill-current text-primary" />)}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={cn("font-display font-semibold uppercase tracking-[0.1em]", lg ? "text-sm" : "text-[11px]")} style={{ color: carta.cor }}>
            {classe.titulo}
          </span>
          {!sm && <span className={cn("truncate text-white/70", lg ? "text-[13px]" : "text-[11px]")}>{classe.nome} · {rotuloMetodo(carta)}</span>}
        </div>
        {!sm && (
          <div className="flex flex-col gap-1">
            {barras.map((b) => (
              <div key={b.k} className="flex items-center gap-2">
                <span className={cn("w-[62px] shrink-0 text-white/55", lg ? "text-[11px]" : "text-[9.5px]")}>{b.k}</span>
                <div className="flex flex-1 gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => <span key={n} className="h-1.5 flex-1 rounded-sm" style={{ background: n <= b.v ? carta.cor : "oklch(1 0 0 / 0.1)" }} />)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-1.5">
          <div className="flex gap-1">
            {skills.map((s) => (
              <Tooltip key={`${s.classe}:${s.id}`}>
                <TooltipTrigger asChild><span className="gem block size-2.5" style={{ background: carta.cor }} /></TooltipTrigger>
                <TooltipContent>{s.nome}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <span className={cn("ml-auto truncate font-mono text-white/60", lg ? "text-[11px]" : "text-[9.5px]")}>{modelo.nome}</span>
        </div>
        {lg && extras > 0 && <span className="text-[10.5px] text-white/50">+ {extras} prompt{extras > 1 ? "s" : ""} adiciona{extras > 1 ? "is" : "l"}</span>}
      </div>
    </div>
  )
}

/** Verso da carta: o prompt final (usado na prévia da forja). */
export function CartaVerso({ carta, texto }: { carta: Carta; texto: string }) {
  const { w, h } = TAMANHOS.lg
  return (
    <div className="fma-card" style={{ "--c": carta.cor, width: w, height: h } as CSSProperties}>
      <div className="face flex flex-col gap-2 p-3">
        <span className="font-display text-[11px] uppercase tracking-[0.14em]" style={{ color: carta.cor }}>Prompt da carta</span>
        <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-black/35 p-2.5 font-mono text-[10.5px] leading-relaxed text-white/80">{texto}</pre>
      </div>
    </div>
  )
}
