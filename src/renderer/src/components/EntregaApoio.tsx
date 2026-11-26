/**
 * Seção "Ferramentas" da Entrega (RF 4.15 a 4.24, 8.10): escritas esperando confirmação (com antes e depois),
 * o PR da task, os artefatos agrupados por carta de apoio e o liga/desliga de cada ferramenta antes de a task começar.
 */
import { useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { Artefato, CartaApoio } from "@shared/apoio"
import { ok } from "@/data/tasks"
import { useApoio, useApoioDaTask } from "@/data/apoio"
import { iconeApoio, ROTULO_AMBIENTE } from "@/components/CartaApoio"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

const SITUACAO = { registrado: "Registrado", pendente: "Espera você", confirmado: "Confirmado", descartado: "Descartado" } as const

const ehImagem = (s: string | null): s is string => !!s && /^(data:image\/|https?:\/\/\S+\.(png|jpe?g|webp|gif|svg)(\?\S*)?$|file:\/\/)/i.test(s.trim())

/** RF 4.23: antes e depois. Com imagem nos dois lados, um divisor arrastável; senão, o texto em duas colunas. */
export function AntesDepois({ antes, depois }: { antes: string | null; depois: string | null }) {
  const [x, setX] = useState(50)
  const caixa = useRef<HTMLDivElement>(null)
  if (antes === null && depois === null) return null
  if (ehImagem(antes) && ehImagem(depois)) {
    const mover = (px: number) => { const r = caixa.current!.getBoundingClientRect(); setX(Math.min(100, Math.max(0, ((px - r.left) / r.width) * 100))) }
    return (
      <div className="flex flex-col gap-1">
        <div ref={caixa} className="relative cursor-ew-resize touch-none overflow-hidden rounded-lg border select-none" role="slider" tabIndex={0} aria-label="Divisor entre antes e depois" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x)}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); mover(e.clientX) }} onPointerMove={(e) => e.buttons && mover(e.clientX)}
          onKeyDown={(e) => { if (e.key === "ArrowLeft") setX((v) => Math.max(0, v - 5)); if (e.key === "ArrowRight") setX((v) => Math.min(100, v + 5)) }}>
          <img src={depois} alt="Depois" draggable={false} className="block w-full" />
          <img src={antes} alt="Antes" draggable={false} className="absolute inset-0 size-full object-cover object-left-top" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }} />
          <div className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${x}%` }}><span className="absolute top-1/2 -left-2.5 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">&#8596;</span></div>
          <Badge variant="secondary" className="absolute top-2 left-2">Antes</Badge><Badge className="absolute top-2 right-2">Depois</Badge>
        </div>
        <span className="text-[11px] text-muted-foreground">Arraste para comparar.</span>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div><h5 className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Antes</h5><pre className="max-h-40 overflow-auto rounded border border-destructive/30 bg-destructive/5 p-2 font-mono whitespace-pre-wrap">{antes || "(vazio)"}</pre></div>
      <div><h5 className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Depois</h5><pre className="max-h-40 overflow-auto rounded border border-success/30 bg-success/5 p-2 font-mono whitespace-pre-wrap">{depois || "(vazio)"}</pre></div>
    </div>
  )
}

function Escrita({ a, nome, aoDecidir }: { a: Artefato; nome: string; aoDecidir: () => void }) {
  const [ocupado, setOcupado] = useState(false)
  const prod = a.ambiente === "producao"
  async function decidir(confirmar: boolean) {
    setOcupado(true)
    ok(await (confirmar ? window.fma.apoio.confirmar(a.id) : window.fma.apoio.descartar(a.id)))
    setOcupado(false)
    aoDecidir()
  }
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border bg-card p-3", prod ? "border-destructive/70" : "border-warning/60")}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">{a.titulo}</span>
        <span className="text-muted-foreground">{nome}</span>
        {a.ambiente && <Badge variant="outline" className={cn("h-5 text-[10px]", prod && "border-destructive text-destructive")}>{ROTULO_AMBIENTE[a.ambiente]}</Badge>}
      </div>
      {prod && <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">Esta escrita vai para Produção.</p>}
      {a.texto && <p className="text-xs whitespace-pre-wrap">{a.texto}</p>}
      <AntesDepois antes={a.antes} depois={a.depois} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => void decidir(false)}>Descartar</Button>
        <Button size="sm" variant={prod ? "destructive" : "default"} disabled={ocupado} onClick={() => void decidir(true)}>{ocupado ? "Executando..." : "Confirmar"}</Button>
      </div>
    </div>
  )
}

export function EntregaApoio({ taskId, projetoId }: { taskId: string; projetoId: string }) {
  const { dados, recarregar } = useApoioDaTask(taskId)
  const { cartas, tipos } = useApoio(projetoId)
  if (!dados) return null
  const nomeDe = (id: string) => cartas.find((c) => c.id === id)?.nome ?? "ferramenta removida"
  const pendentes = dados.artefatos.filter((a) => a.situacao === "pendente")
  const outros = dados.artefatos.filter((a) => a.situacao !== "pendente")
  const grupos = [...new Set(outros.map((a) => a.cartaApoioId))]
  if (!cartas.length && !dados.artefatos.length) return null

  async function alternar(c: CartaApoio, ligada: boolean) {
    ok(await window.fma.apoio.desligarNaTask(taskId, c.id, !ligada))
    void recarregar()
  }

  return (
    <div className="flex flex-col gap-4">
      {pendentes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-medium tracking-wide text-warning uppercase">Escritas esperando você</h4>
          {pendentes.map((a) => <Escrita key={a.id} a={a} nome={nomeDe(a.cartaApoioId)} aoDecidir={() => void recarregar()} />)}
        </section>
      )}

      {grupos.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Ferramentas</h4>
          {grupos.map((g) => {
            const c = cartas.find((x) => x.id === g), I = iconeApoio(c?.tipo ?? "")
            return (
              <div key={g} className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-1 flex items-center gap-2 text-xs font-medium"><I className="size-3.5 text-primary" />{nomeDe(g)}</p>
                <ul className="flex flex-col gap-1.5">
                  {outros.filter((a) => a.cartaApoioId === g).map((a) => (
                    <li key={a.id} className="text-xs">
                      <span className="flex items-center gap-2">{a.titulo}<Badge variant="outline" className={cn("h-4 px-1 text-[10px]", a.situacao === "confirmado" && "text-success", a.situacao === "descartado" && "text-muted-foreground")}>{SITUACAO[a.situacao]}</Badge>
                        {a.ambiente && <span className={cn("text-[10px]", a.ambiente === "producao" ? "text-destructive" : "text-muted-foreground")}>{ROTULO_AMBIENTE[a.ambiente]}</span>}</span>
                      {a.texto && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{a.texto}</p>}
                      <AntesDepois antes={a.antes} depois={a.depois} />
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </section>
      )}

      {cartas.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Ferramentas desta task</h4>
          {cartas.map((c) => {
            const t = tipos.find((x) => x.chave === c.tipo), I = iconeApoio(c.tipo), ligada = !dados.desligadas.includes(c.id)
            return (
              <label key={c.id} className="flex items-center gap-2 text-xs">
                <I className="size-3.5 text-primary" />
                <span className={cn("flex-1 truncate", !ligada && "text-muted-foreground line-through")}>{c.nome}</span>
                {dados.usadas.includes(c.id) && <Badge variant="secondary" className="h-4 px-1 text-[10px]">Usada</Badge>}
                <Switch checked={ligada} onCheckedChange={(v) => void alternar(c, v)} aria-label={`${ligada ? "Desligar" : "Ligar"} ${t?.nome ?? c.nome} nesta task`} />
              </label>
            )
          })}
          <p className="text-[11px] text-muted-foreground">Dá para desligar uma ferramenta só antes de a task começar.</p>
        </section>
      )}
    </div>
  )
}
