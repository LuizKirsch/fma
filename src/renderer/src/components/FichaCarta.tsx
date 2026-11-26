/**
 * Ficha da carta: ajustes rápidos sem passar pela forja. Abas IA (modelo), Habilidades e Memórias.
 * Abre ao clicar na carta na Coleção e em "Editar rápido" na mesa.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Pencil } from "lucide-react"
import { cliPorId } from "@shared/ia"
import { ESFORCOS, type Conta } from "@shared/conta"
import type { Carta } from "@shared/tipos"
import { salvarCarta, useCartas } from "@/data/cartas"
import type { Forjar } from "@/components/Forja"
import { EscolherItensBiblioteca } from "@/components/EscolherItensBiblioteca"
// MVP: Loja desligada por enquanto
// import { PublicarLoja } from "@/components/PublicarLoja"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type AbaFicha = "ia" | "habilidades" | "memorias"
export interface AlvoFicha { carta: Carta; aba?: AbaFicha }

/** Troca o modelo da carta (a CLI continua a mesma). */
export async function trocarModelo(c: Carta, modelo: string) {
  const r = await salvarCarta({ ...c, modelo })
  if (!r.ok) toast.error(r.erro)
}

/** Salva um ajuste rápido na carta. */
export async function ajustarCarta(c: Carta, mudanca: Partial<Carta>) {
  const r = await salvarCarta({ ...c, ...mudanca })
  if (!r.ok) toast.error(r.erro)
}

export function FichaCarta({ alvo, aoFechar, forjar }: { alvo: AlvoFicha | null; aoFechar: () => void; forjar: Forjar }) {
  const { cartas } = useCartas()
  const carta = cartas.find((c) => c.id === alvo?.carta.id) ?? alvo?.carta // versão viva: muda ao salvar
  const [aba, setAba] = useState<AbaFicha>("ia")
  // const [publicar, setPublicar] = useState(false)
  useEffect(() => { if (alvo) setAba(alvo.aba ?? "ia") }, [alvo])
  const cli = carta && cliPorId(carta.cli)
  const [contas, setContas] = useState<Conta[]>([])
  useEffect(() => { if (alvo) void window.fma.contas.listar().then((e) => setContas(e.contas)) }, [alvo])

  return (
    <Sheet open={!!alvo} onOpenChange={(o) => !o && aoFechar()}>
      <SheetContent className="flex w-[420px] flex-col gap-0 sm:max-w-[420px]">
        {carta && cli && (
          <>
            <SheetHeader>
              <SheetTitle className="font-display">{carta.nome}</SheetTitle>
              <SheetDescription>{cli.nome}. Ajustes rápidos; o resto fica na forja.</SheetDescription>
            </SheetHeader>
            <Tabs value={aba} onValueChange={(v) => setAba(v as AbaFicha)} className="flex-1 overflow-y-auto px-4">
              <TabsList data-tour="ficha-abas">
                <TabsTrigger value="ia">IA</TabsTrigger>
                <TabsTrigger value="habilidades">Habilidades</TabsTrigger>
                <TabsTrigger value="memorias">Memórias</TabsTrigger>
              </TabsList>
              <TabsContent value="ia" className="flex flex-col gap-4 pt-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Modelo</span>
                  <Select value={carta.modelo} onValueChange={(m) => void trocarModelo(carta, m)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {!cli.modelos.some((m) => m.id === carta.modelo) && <SelectItem value={carta.modelo}>{carta.modelo}</SelectItem>}
                      {cli.modelos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Esforço</span>
                  <Select value={carta.esforco} onValueChange={(v) => void ajustarCarta(carta, { esforco: v as Carta["esforco"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ESFORCOS.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Conta</span>
                  <Select value={carta.contaId ?? "padrao"} onValueChange={(v) => void ajustarCarta(carta, { contaId: v === "padrao" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="padrao">Conta padrão</SelectItem>
                      {contas.filter((c) => c.cli === carta.cli).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
              <TabsContent value="habilidades" className="pt-2"><EscolherItensBiblioteca tipo="habilidade" selecionados={carta.habilidades} aoMudar={(habilidades) => void ajustarCarta(carta, { habilidades })} /></TabsContent>
              <TabsContent value="memorias" className="pt-2"><EscolherItensBiblioteca tipo="memoria" selecionados={carta.memorias} aoMudar={(memorias) => void ajustarCarta(carta, { memorias })} /></TabsContent>
            </Tabs>
            <SheetFooter className="flex-row justify-between">
              <Button variant="outline" onClick={() => { aoFechar(); forjar({ carta }) }}><Pencil data-icon="inline-start" />Abrir na forja</Button>
              {/* MVP: Loja desligada por enquanto: <Button data-tour="publicar" ...>Publicar na Loja</Button> */}
            </SheetFooter>
            {/* <PublicarLoja carta={publicar ? carta : null} aoFechar={() => setPublicar(false)} /> */}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
