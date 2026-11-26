/**
 * Cartas de apoio na mesa (T16, RF 4.01 a 4.13): a carta deitada, o catálogo para colocar e o editor
 * (nome, ambiente, URL base, servidor MCP e quem usa). Em Produção a carta fica vermelha (RF 4.07).
 */
import { useState } from "react"
import { Accessibility, BookText, Brain, Camera, ClipboardCheck, Database, FileText, Frame, Gauge, GitBranch, Globe, KanbanSquare, MessageSquare, PenLine, Plug, ScanEye, ShieldAlert, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { AMBIENTES, type Ambiente, type CartaApoio, type TipoApoio } from "@shared/apoio"
import type { Carta } from "@shared/tipos"
import { ok } from "@/data/tasks"
import { atualizarProjeto, useProjetos } from "@/data/projetos"
import { LIMITES_PROJETO } from "@shared/projeto"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export const APOIO_W = 210
export const APOIO_H = 112
export const ROTULO_AMBIENTE: Record<Ambiente, string> = { desenvolvimento: "Desenvolvimento", homologacao: "Homologação", producao: "Produção" }

const ICONES: Record<string, LucideIcon> = {
  git: GitBranch, memoria: Brain, navegador: Globe, camera: Camera, regressao: ScanEye, dossie: FileText, massa: ClipboardCheck, acessibilidade: Accessibility,
  board: KanbanSquare, banco: Database, api: Plug, figma: Frame, seguranca: ShieldAlert, orcamento: Gauge, mensageiro: MessageSquare, redator: PenLine,
}
export const iconeApoio = (tipo: string) => ICONES[tipo] ?? BookText
/** Cor da faixa: âmbar nas que escrevem, azul nas que só leem; vermelho em Produção. */
export const corApoio = (t: TipoApoio | undefined, c: CartaApoio) => (c.ambiente === "producao" && t?.usaAmbiente ? "var(--destructive)" : t?.acesso === "escrita" ? "var(--warning)" : "var(--info)")

export function CartaApoioVisual({ carta, tipo, selecionada }: { carta: CartaApoio; tipo?: TipoApoio; selecionada?: boolean }) {
  const I = iconeApoio(carta.tipo), cor = corApoio(tipo, carta)
  const prod = carta.ambiente === "producao" && tipo?.usaAmbiente
  return (
    <div className={cn("flex h-full w-full overflow-hidden rounded-xl border bg-gradient-to-br from-card to-muted/60 shadow-md", selecionada && "ring-2 ring-primary", prod && "border-destructive")}>
      <div className="w-2 shrink-0" style={{ background: cor }} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <div className="flex items-center gap-2"><I className="size-4 shrink-0" style={{ color: cor }} /><span className="truncate font-display text-sm">{carta.nome}</span></div>
        <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">Gera: {tipo?.gera ?? "?"}</p>
        <div className="mt-auto flex flex-wrap gap-1">
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{tipo?.acesso === "escrita" ? "Escreve com confirmação" : "Só leitura"}</Badge>
          {tipo?.usaAmbiente && <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", prod && "border-destructive text-destructive")}>{ROTULO_AMBIENTE[carta.ambiente]}</Badge>}
        </div>
      </div>
    </div>
  )
}

/** Catálogo por grupo (RF 4.01); escolher cria a carta na mesa (RF 4.02). */
export function CatalogoApoio({ aberto, aoMudar, tipos, aoEscolher }: { aberto: boolean; aoMudar: (a: boolean) => void; tipos: TipoApoio[]; aoEscolher: (t: TipoApoio) => void }) {
  const grupos = [...new Set(tipos.map((t) => t.grupo))]
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Cartas de apoio</DialogTitle>
          <DialogDescription>Ferramentas que as cartas usam enquanto trabalham. Escolha uma para colocar na mesa.</DialogDescription>
        </DialogHeader>
        {grupos.map((g) => (
          <section key={g} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g}</h3>
            <div className="grid grid-cols-2 gap-2">
              {tipos.filter((t) => t.grupo === g).map((t) => {
                const I = iconeApoio(t.chave)
                return (
                  <button key={t.chave} onClick={() => { aoEscolher(t); aoMudar(false) }} className="flex flex-col gap-1 rounded-lg border bg-card p-3 text-left hover:border-primary/60">
                    <span className="flex items-center gap-2 text-sm font-medium"><I className="size-4 text-primary" />{t.nome}</span>
                    <span className="text-xs text-muted-foreground">{t.descricao}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-[10px]">{t.acesso === "escrita" ? "Escreve com confirmação" : "Só leitura"}</Badge>
                      {t.origem === "mcp" && <Badge variant="outline" className="text-[10px]">Servidor MCP</Badge>}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  )
}

const paraLinhas = (env: Record<string, string>) => Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n")
const deLinhas = (t: string) => Object.fromEntries(t.split("\n").map((l) => l.trim()).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))

/** Editor (RF 4.05 a 4.09, 4.12): nome, ambiente, URL base, servidor MCP e quem usa. */
export function EditorApoio({ carta, tipo, time, aoFechar, aoSalvo, aoRemover }: {
  carta: CartaApoio | null; tipo?: TipoApoio; time: Carta[]; aoFechar: () => void; aoSalvo: (c: CartaApoio) => void; aoRemover: (c: CartaApoio) => void
}) {
  const [f, setF] = useState<{ nome: string; ambiente: Ambiente; urlBase: string; usuarios: string[]; comando: string; args: string; env: string; limite: number } | null>(null)
  const { projetos } = useProjetos()
  const proj = projetos.find((p) => p.id === carta?.projetoId)
  const [id, setId] = useState<string | null>(null)
  const [testando, setTestando] = useState(false)
  // Abriu outra carta: recomeça o formulário a partir dela.
  if (carta && carta.id !== id) {
    setId(carta.id)
    setF({ nome: carta.nome, ambiente: carta.ambiente, urlBase: carta.urlBase, usuarios: carta.usuarios, comando: carta.mcp?.comando ?? "", args: carta.mcp?.args.join(" ") ?? "", env: paraLinhas(carta.mcp?.env ?? {}), limite: proj?.limiteTokens ?? 150000 })
  }
  if (!carta && id) { setId(null); setF(null) }
  if (!carta || !f || !tipo) return null
  const mcp = tipo.origem === "mcp" && f.comando.trim() ? { comando: f.comando.trim(), args: f.args.split(/\s+/).filter(Boolean), env: deLinhas(f.env) } : null
  const prod = tipo.usaAmbiente && f.ambiente === "producao"
  const alterna = (cid: string) => setF({ ...f, usuarios: f.usuarios.includes(cid) ? f.usuarios.filter((x) => x !== cid) : [...f.usuarios, cid] })

  async function salvar() {
    const c = ok(await window.fma.apoio.atualizar(carta!.id, { nome: f!.nome, ambiente: f!.ambiente, urlBase: f!.urlBase.trim(), usuarios: f!.usuarios, mcp }))
    if (!c) return
    // Orçamento: o limite é o de tokens por task do projeto; é ele que o Maestro vigia (RF 6.40).
    if (tipo!.chave === "orcamento" && proj && f!.limite !== proj.limiteTokens) {
      const { nome, repositorio, branchBase, vagas, limiteDevolucoes, comandos, pastasCompartilhadas } = proj
      if (!ok(await atualizarProjeto(proj.id, { nome, repositorio, branchBase, vagas, limiteDevolucoes, limiteTokens: f!.limite, comandos, pastasCompartilhadas }))) return
    }
    aoSalvo(c); aoFechar()
  }
  async function testar() {
    setTestando(true)
    // O teste lê a carta salva: grava a configuração antes.
    const c = ok(await window.fma.apoio.atualizar(carta!.id, { mcp }))
    if (c) {
      aoSalvo(c)
      const r = await window.fma.apoio.ferramentasMcp(carta!.id)
      if (r.ok) toast.success(`Servidor conectado: ${r.valor.length} ferramentas`, { description: r.valor.map((x) => x.nome).join(", ") })
      else toast.error(r.erro)
    }
    setTestando(false)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display">{tipo.nome}</DialogTitle>
          <DialogDescription>{tipo.descricao} Gera: {tipo.gera}. {tipo.acesso === "escrita" ? "Escreve fora do FMA só depois da sua confirmação." : "Só leitura."}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ap-nome">Nome</FieldLabel>
            <Input id="ap-nome" value={f.nome} maxLength={60} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          </Field>
          {tipo.usaAmbiente && (
            <Field>
              <FieldLabel>Ambiente</FieldLabel>
              <ToggleGroup type="single" variant="outline" size="sm" value={f.ambiente} onValueChange={(v) => v && setF({ ...f, ambiente: v as Ambiente })} className="w-full">
                {AMBIENTES.map((a) => <ToggleGroupItem key={a} value={a} className={cn("flex-1", a === "producao" && f.ambiente === a && "bg-destructive/20 text-destructive")}>{ROTULO_AMBIENTE[a]}</ToggleGroupItem>)}
              </ToggleGroup>
              {prod && <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">Produção: as leituras rodam em dados reais. Escritas continuam esperando a sua confirmação.</p>}
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="ap-url">URL base (opcional)</FieldLabel>
            <Input id="ap-url" value={f.urlBase} placeholder="https://" onChange={(e) => setF({ ...f, urlBase: e.target.value })} />
          </Field>
          {tipo.chave === "orcamento" && (
            <Field>
              <FieldLabel htmlFor="ap-limite">Limite de tokens por task</FieldLabel>
              <Input id="ap-limite" type="number" step={1000} min={LIMITES_PROJETO.limiteTokens.min} max={LIMITES_PROJETO.limiteTokens.max} value={Number.isNaN(f.limite) ? "" : f.limite} onChange={(e) => setF({ ...f, limite: e.target.valueAsNumber })} />
              <FieldDescription>Quando a task passa do limite, o Maestro chama você. É o mesmo limite dos ajustes do projeto.</FieldDescription>
            </Field>
          )}
          {tipo.origem === "mcp" && (
            <>
              <Field>
                <FieldLabel htmlFor="ap-cmd">Servidor MCP: comando</FieldLabel>
                <Input id="ap-cmd" value={f.comando} placeholder="npx" className="font-mono" onChange={(e) => setF({ ...f, comando: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ap-args">Argumentos</FieldLabel>
                <Input id="ap-args" value={f.args} placeholder="-y @acme/mcp-server" className="font-mono" onChange={(e) => setF({ ...f, args: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ap-env">Variáveis (uma por linha, CHAVE=valor)</FieldLabel>
                <Textarea id="ap-env" rows={3} value={f.env} className="font-mono" onChange={(e) => setF({ ...f, env: e.target.value })} />
                <FieldDescription>Ficam em texto no banco local.</FieldDescription>
                <Button type="button" variant="outline" size="sm" className="self-start" disabled={!mcp || testando} onClick={() => void testar()}>Testar conexão</Button>
              </Field>
            </>
          )}
          <Field>
            <FieldLabel>Quem usa</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {time.map((c) => (
                <button key={c.id} type="button" aria-pressed={f.usuarios.includes(c.id)} onClick={() => alterna(c.id)}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", f.usuarios.includes(c.id) ? "bg-primary/15 font-medium" : "text-muted-foreground")} style={{ borderColor: f.usuarios.includes(c.id) ? c.cor : undefined }}>{c.nome}</button>
              ))}
              {time.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma carta na mesa.</span>}
            </div>
            <FieldDescription>Também dá para puxar o plugue da carta de apoio até a carta na mesa.</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { aoRemover(carta); aoFechar() }}>Remover da mesa</Button>
          <span className="flex gap-2"><Button variant="ghost" onClick={aoFechar}>Cancelar</Button><Button onClick={() => void salvar()}>Salvar</Button></span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
