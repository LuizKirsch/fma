/** Uso das contas de IA: barras por conta e o anel do cabeçalho (visual do UsageWidget do protótipo v16). */
import { Gauge, Plug } from "lucide-react"
import { Popover } from "radix-ui"
import { CLIS } from "@shared/ia"
import type { Conta, LimiteConta, UsoConta } from "@shared/conta"
import { useContas } from "@/data/contas"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const nomeDaCli = (id: string) => CLIS.find((c) => c.id === id)?.curto ?? id
export const COR_CLI: Record<string, string> = { claude: "oklch(0.72 0.15 45)", codex: "oklch(0.78 0.02 160)", gemini: "oklch(0.7 0.15 250)" }

export const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} mi` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(n))
/** "em 3h 20min", "em 2d 4h" ou "sem uso". */
export function fmtRenova(quando: number | null): string {
  if (!quando) return "sem uso"
  const min = Math.max(0, Math.round((quando - Date.now()) / 60_000))
  if (min >= 1440) return `renova em ${Math.floor(min / 1440)}d ${Math.round((min % 1440) / 60)}h`
  return min >= 60 ? `renova em ${Math.floor(min / 60)}h ${min % 60}min` : `renova em ${min}min`
}

function Barra({ rotulo, tokens, base, renova }: { rotulo: string; tokens: number; base: number; renova: number | null }) {
  return (
    <div className="grid grid-cols-[58px_1fr_auto] items-center gap-3 text-xs">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-foreground/80" style={{ width: `${base ? Math.max(tokens ? 3 : 0, Math.round((tokens / base) * 100)) : 0}%` }} /></span>
      <span className="flex gap-2 tabular"><b>{fmtTokens(tokens)}</b><span className="w-28 text-right text-muted-foreground">{fmtRenova(renova)}</span></span>
    </div>
  )
}

/** Barra do limite real: % usado, amarela a partir de 70% e vermelha a partir de 90%. */
function BarraLimite({ rotulo, usado, renova }: { rotulo: string; usado: number; renova: number | null }) {
  const cor = usado >= 90 ? "bg-destructive" : usado >= 70 ? "bg-warning" : "bg-success"
  return (
    <div className="grid grid-cols-[78px_1fr_auto] items-center gap-3 text-xs">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", cor)} style={{ width: `${Math.min(100, Math.max(usado ? 2 : 0, usado))}%` }} /></span>
      <span className="flex gap-2 tabular"><b>{Math.round(usado)}%</b><span className="w-28 text-right text-muted-foreground">{fmtRenova(renova)}</span></span>
    </div>
  )
}

const quando = (t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

/**
 * Limite real do provedor (igual ao /usage) quando a CLI expõe; senão, os tokens das tasks do FMA
 * (peso relativo entre as contas, sem % do limite).
 */
export function UsoDaConta({ uso, maxSemana, limite }: { uso: UsoConta | undefined; maxSemana: number; limite?: LimiteConta | null }) {
  if (limite?.janelas.length) return (
    <div className="flex flex-col gap-1.5">
      {limite.janelas.map((j) => <BarraLimite key={j.rotulo} rotulo={j.rotulo} usado={j.usado} renova={j.renovaEm} />)}
      {limite.fonte === "log" && <span className="text-[11px] text-muted-foreground">Do último uso do Codex ({quando(limite.atualizadoEm)}).</span>}
    </div>
  )
  const u = uso ?? { contaId: "", tokens5h: 0, tokensSemana: 0, renova5h: null, renovaSemana: null }
  return (
    <div className="flex flex-col gap-1.5">
      <Barra rotulo="5 horas" tokens={u.tokens5h} base={maxSemana} renova={u.renova5h} />
      <Barra rotulo="Semanal" tokens={u.tokensSemana} base={maxSemana} renova={u.renovaSemana} />
      <span className="text-[11px] text-muted-foreground">{limite?.erro ? `Limite indisponível: ${limite.erro}` : "Tokens das tasks do FMA (esta CLI não informa o limite)."}</span>
    </div>
  )
}

export const maiorSemana = (uso: UsoConta[]) => Math.max(0, ...uso.map((u) => u.tokensSemana))

export function CabecalhoConta({ conta }: { conta: Conta }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="size-2 rounded-full" style={{ background: COR_CLI[conta.cli] }} /><b>{nomeDaCli(conta.cli)}</b>
      <span className="truncate text-xs text-muted-foreground">{conta.nome}</span>
      {conta.padrao && <Badge variant="outline" className="ml-auto h-4 px-1.5 text-[10px]">padrão</Badge>}
    </span>
  )
}

/** Anel no cabeçalho: o arco externo é a fatia da semana gasta nas últimas 5 h (conta mais ativa); abre o detalhe. */
export function AnelDeUso({ aoGerenciar }: { aoGerenciar: () => void }) {
  const { contas, uso, limites } = useContas()
  const max = maiorSemana(uso)
  const total5h = uso.reduce((s, u) => s + u.tokens5h, 0)
  // Com limite real: o anel é o maior % das 5 h entre as contas (o que vai travar primeiro).
  const pcts = contas.map((c) => limites[c.id]?.janelas[0]?.usado).filter((x): x is number => typeof x === "number")
  const maiorPct = pcts.length ? Math.max(...pcts) : null
  const fatia = maiorPct !== null ? maiorPct / 100 : max ? Math.max(...uso.map((u) => u.tokens5h)) / max : 0
  const R = 9, C = 2 * Math.PI * R
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2" aria-label="Uso das IAs">
          <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
            <circle cx="12" cy="12" r={R} fill="none" stroke="var(--muted)" strokeWidth="3" />
            {contas.length > 0 && <circle cx="12" cy="12" r={R} fill="none" stroke={maiorPct !== null && maiorPct >= 90 ? "var(--destructive)" : maiorPct !== null && maiorPct >= 70 ? "var(--warning)" : "var(--success)"} strokeWidth="3" strokeDasharray={`${C * fatia} ${C}`} strokeLinecap="round" />}
          </svg>
          <span className="text-xs text-muted-foreground tabular">{!contas.length ? "Uso" : maiorPct !== null ? `${Math.round(maiorPct)}%` : fmtTokens(total5h)}</span>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-[420px] rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none">
          <div className="flex items-center gap-2 border-b px-4 py-3"><Gauge className="size-4" /><b className="text-sm">Uso das IAs</b><span className="text-xs text-muted-foreground">limite de cada conta</span></div>
          <div className="flex max-h-[380px] flex-col gap-4 overflow-y-auto p-4">
            {!contas.length && <span className="text-sm text-muted-foreground">Nenhuma conta conectada. Conecte uma conta de IA para as cartas poderem trabalhar.</span>}
            {contas.map((c) => (
              <div key={c.id} className="flex flex-col gap-2"><CabecalhoConta conta={c} /><UsoDaConta uso={uso.find((u) => u.contaId === c.id)} maxSemana={max} limite={limites[c.id]} /></div>
            ))}
          </div>
          <div className="border-t p-2"><Popover.Close asChild><Button variant="ghost" size="sm" className={cn("w-full")} onClick={aoGerenciar}><Plug data-icon="inline-start" />Gerenciar contas e conexões</Button></Popover.Close></div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
