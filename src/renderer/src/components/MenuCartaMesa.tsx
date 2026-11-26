/** Conteúdo do botão direito na carta da mesa. A ação de cada item vem de quem usa (Mesa). */
import { Boxes, Gauge, MessageCircle, Pencil, Sparkles, SquarePen, Undo2 } from "lucide-react"
import { cliPorId } from "@shared/ia"
import { ESFORCOS } from "@shared/conta"
import type { Carta } from "@shared/tipos"
import type { AbaFicha } from "@/components/FichaCarta"
import { ajustarCarta, trocarModelo } from "@/components/FichaCarta"
import { ContextMenuContent, ContextMenuItem, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@/components/ui/context-menu"

export function MenuCartaMesa({ carta, conversar, ficha, forjar, tirar }: {
  carta: Carta
  conversar: () => void
  ficha: (aba?: AbaFicha) => void
  forjar: () => void
  tirar: () => void
}) {
  const cli = cliPorId(carta.cli)
  return (
    <ContextMenuContent className="w-56">
      <ContextMenuItem onSelect={conversar}><MessageCircle />Conversar</ContextMenuItem>
      <ContextMenuItem onSelect={() => ficha()}><SquarePen />Editar rápido</ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger><Sparkles />Trocar IA</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup value={carta.modelo} onValueChange={(m) => void trocarModelo(carta, m)}>
            {cli.modelos.map((m) => <ContextMenuRadioItem key={m.id} value={m.id}>{m.nome}</ContextMenuRadioItem>)}
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger><Gauge />Esforço</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup value={carta.esforco} onValueChange={(v) => void ajustarCarta(carta, { esforco: v as Carta["esforco"] })}>
            {ESFORCOS.map((e) => <ContextMenuRadioItem key={e.id} value={e.id}>{e.nome}</ContextMenuRadioItem>)}
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem onSelect={() => ficha("habilidades")}><Boxes />Habilidades e memórias</ContextMenuItem>
      <ContextMenuItem onSelect={forjar}><Pencil />Abrir na forja</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={tirar}><Undo2 />Tirar da mesa</ContextMenuItem>
    </ContextMenuContent>
  )
}
