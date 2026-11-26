/**
 * Conexões: Contas de IA (pacote 1) e Fontes de tasks (pacote 3).
 * Uma conta é uma pasta de config da CLI; o login acontece num terminal do sistema.
 */
import { useEffect, useState } from "react"
import { BrainCircuit, CircleCheck, CircleHelp, CircleX, LoaderCircle, LogIn, Plus, RefreshCw, Star, Trash2 } from "lucide-react"
import type { StatusLogin } from "@shared/conta"
import { toast } from "sonner"
import { CLIS, type CliId } from "@shared/ia"
import { LOCAL, rotuloAmbiente } from "@shared/ambiente"
import { useCartas, useClis } from "@/data/cartas"
import { conectarConta, entrarConta, removerConta, tornarPadrao, useContas, usarConfigPadrao } from "@/data/contas"
import { COR_CLI, UsoDaConta, maiorSemana } from "@/components/UsoContas"
import { ConectarConta } from "@/components/ConectarConta"
import { FontesConexoes } from "@/components/FontesConexoes"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * Login real da conta: roda a CLI com a config dela (`claude auth status`, `codex login status`).
 * Depois de "Entrar de novo", confere a cada 4 s por até 3 min, até o login aparecer.
 */
function StatusConta({ id, aoEntrar }: { id: string; aoEntrar?: () => void }) {
  const [s, setS] = useState<StatusLogin | null>(null)
  const [aguardando, setAguardando] = useState(0)
  const conferir = async () => { const r = await window.fma.contas.status(id); setS(r.ok ? r.valor : { logado: false, detalhe: r.erro }); return r.ok && r.valor.logado }
  useEffect(() => { void conferir() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aguardando) return
    const t = setInterval(async () => { if ((await conferir()) || Date.now() > aguardando) { clearInterval(t); setAguardando(0) } }, 4000)
    return () => clearInterval(t)
  }, [aguardando]) // eslint-disable-line react-hooks/exhaustive-deps
  const entrar = async () => { const r = await entrarConta(id); if (!r.ok) return void toast.error(r.erro); aoEntrar?.(); setAguardando(Date.now() + 180_000) }
  if (!s) return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Conferindo o login…</span>
  return (
    <span className={cn("flex items-center gap-1.5 text-xs", s.logado ? "text-success" : s.logado === false ? "text-destructive" : "text-muted-foreground")}>
      {s.logado ? <CircleCheck className="size-3.5" /> : s.logado === false ? <CircleX className="size-3.5" /> : <CircleHelp className="size-3.5" />}
      <span className="truncate">{s.logado ? `Logada${s.email ? ` · ${s.email}` : ""}${s.detalhe && s.detalhe !== s.email ? ` · ${s.detalhe}` : ""}` : s.detalhe ?? "Sem login"}</span>
      {aguardando ? <span className="flex items-center gap-1 text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />aguardando o login…</span>
        : <>
          {s.logado === false && <Button size="xs" variant="outline" className="ml-1" onClick={() => void entrar()}><LogIn data-icon="inline-start" />Entrar</Button>}
          <Button size="icon-xs" variant="ghost" aria-label="Conferir de novo" onClick={() => { setS(null); void conferir() }}><RefreshCw /></Button>
        </>}
    </span>
  )
}

export function Conexoes() {
  const { contas, uso, limites, ambientes } = useContas()
  const { cartas } = useCartas()
  const instaladas = useClis()
  const [conectando, setConectando] = useState<{ cli: CliId; ambiente: string } | null>(null)
  const grupos = ambientes.length > 1 ? ambientes.map((a) => a.id) : [LOCAL] // WSL só aparece no Windows com distros
  const max = maiorSemana(uso)
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-8 overflow-y-auto px-6 py-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">Contas de IA</h2>
          <p className="text-sm text-muted-foreground">Conecte uma ou mais contas por CLI. Cada carta usa a conta padrão da CLI dela, ou a conta escolhida na carta. O uso é o limite real de cada conta (igual ao /usage), quando a CLI informa.</p>
        </div>
        {grupos.map((amb) => (
        <div key={amb} className="flex flex-col gap-3">
        {grupos.length > 1 && <h3 className="text-sm font-semibold text-muted-foreground">{rotuloAmbiente(amb, window.fma.plataforma)}</h3>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {CLIS.map((cli) => {
            const minhas = contas.filter((c) => c.cli === cli.id && c.ambiente === amb)
            const ids = new Set(minhas.map((c) => c.id))
            const padrao = minhas.find((c) => c.padrao)?.id
            const usando = cartas.filter((c) => c.cli === cli.id && (c.contaId ? ids.has(c.contaId) : !!padrao)).length
            const inst = instaladas?.find((i) => i.id === cli.id && i.ambiente === amb)
            return (
              <div key={cli.id} className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4", !minhas.length && "border-dashed bg-card/40")}>
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted" style={{ color: COR_CLI[cli.id] }}><BrainCircuit className="size-5" /></span>
                  <span className="flex min-w-0 flex-col">
                    <b className="text-sm">{cli.nome}</b>
                    <span className="text-xs text-muted-foreground">{cli.provedor} · {usando} carta{usando === 1 ? "" : "s"} usando{inst && !inst.instalada ? " · CLI não instalada" : ""}</span>
                  </span>
                  <Button size="sm" variant={minhas.length ? "ghost" : "outline"} className="ml-auto" onClick={() => setConectando({ cli: cli.id, ambiente: amb })}><Plus data-icon="inline-start" />{minhas.length ? "Outra conta" : "Conectar"}</Button>
                </div>
                {inst && !inst.instalada && <p className="text-xs text-muted-foreground">Instale com <code>{cli.instalar}</code> antes de conectar.</p>}
                {minhas.map((c) => (
                  <div key={c.id} className="flex flex-col gap-2 rounded-xl border bg-background/50 p-3">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="truncate">{c.nome}</span>
                      {c.pastaConfig ? null : <Badge variant="secondary" className="h-5">login existente</Badge>}
                      {c.padrao ? <Badge variant="outline" className="h-5 gap-1"><Star className="size-3" />padrão</Badge> : <Button size="xs" variant="ghost" onClick={async () => { const r = await tornarPadrao(c.id); if (!r.ok) toast.error(r.erro) }}>Tornar padrão</Button>}
                      <span className="ml-auto flex">
                        <Tooltip><TooltipTrigger asChild><Button size="icon-xs" variant="ghost" aria-label="Desconectar" onClick={async () => { try { const r = await removerConta(c.id); r.ok ? toast(`Conta ${c.nome} desconectada`) : toast.error(r.erro) } catch (e) { toast.error(String((e as Error)?.message ?? e)) } }}><Trash2 /></Button></TooltipTrigger><TooltipContent>Desconectar</TooltipContent></Tooltip>
                      </span>
                    </span>
                    <StatusConta id={c.id} />
                    <UsoDaConta uso={uso.find((u) => u.contaId === c.id)} maxSemana={max} limite={limites[c.id]} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        </div>
        ))}
      </section>

      <FontesConexoes />

      <ConectarConta cli={conectando?.cli ?? null} ambiente={conectando?.ambiente} aoFechar={() => setConectando(null)} />
    </div>
  )
}
