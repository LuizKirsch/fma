/**
 * Novo projeto em 2 passos (T10, RF 2.01 a 2.06, 2.25 e 2.26):
 *  1. Detalhes: nome, pasta do repositório (conferida com o git), branch base e contexto geral.
 *  2. Time da coleção (Orquestrador obrigatório) e o fluxo sugerido.
 * O projeto nasce livre; a fonte de tasks (monitor MCP) é ligada depois, nos Monitores do projeto.
 * Ao criar, o núcleo monta a mesa com o time ligado em sequência.
 */
import { useEffect, useState, type CSSProperties } from "react"
import { ArrowRight, Check, CircleAlert, FolderOpen, GitBranch, Monitor, Plus, Terminal } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { icone } from "@/lib/icones"
import { CLASSES, ORDEM_SUGERIDA } from "@shared/catalogo"
import { LOCAL, deCaminho, ehWsl, rotuloAmbiente } from "@shared/ambiente"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ordemDoTime } from "@shared/mesa"
import type { Carta } from "@shared/tipos"
import type { Projeto, Repositorio } from "@shared/projeto"
import { useCartas } from "@/data/cartas"
import { useContas } from "@/data/contas"
import { criarProjeto } from "@/data/projetos"
import { CartaVisual } from "./CartaVisual"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"

export const classeSelect = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 [&>option]:bg-popover"

function Chip({ carta }: { carta: Carta }) {
  const I = icone(carta.simbolo)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: carta.cor }}>
      <I className="size-3.5" style={{ color: carta.cor }} />{carta.nome}
    </span>
  )
}

export function NovoProjeto({ aberto, aoMudar, forjar, aoCriar }: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  forjar: (o: { classe?: Carta["classe"]; aoSalvar?: (c: Carta) => void }) => void
  aoCriar: (p: Projeto) => void
}) {
  const { cartas } = useCartas()
  const [nome, setNome] = useState("")
  const [pasta, setPasta] = useState("")
  const [amb, setAmb] = useState(LOCAL)
  const { ambientes } = useContas()
  const [repo, setRepo] = useState<Repositorio | null>(null)
  const [erroRepo, setErroRepo] = useState<string | null>(null)
  const [branch, setBranch] = useState("")
  const [time, setTime] = useState<Set<string>>(new Set())
  const [criando, setCriando] = useState(false)
  const [passo, setPasso] = useState(1)
  const [contexto, setContexto] = useState("")

  // Ao abrir: formulário limpo e, de início, a primeira carta de cada classe sugerida no time.
  useEffect(() => {
    if (!aberto) return
    setNome(""); setPasta(""); setAmb(LOCAL); setRepo(null); setErroRepo(null); setBranch(""); setContexto(""); setPasso(1)
    setTime(new Set(ORDEM_SUGERIDA.map((k) => cartas.find((c) => c.classe === k)?.id).filter((id): id is string => !!id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  // O ambiente vem do caminho: \\wsl.localhost\<distro>\... é WSL; um caminho Linux solto fica no ambiente já detectado.
  const detectar = (p: string) => { const d = deCaminho(p).ambiente; const a = d !== LOCAL ? d : p.startsWith("/") ? amb : LOCAL; setAmb(a); return a }
  async function conferir(caminho: string, ambiente = amb) {
    if (!caminho.trim()) { setRepo(null); setErroRepo(null); return }
    const r = await window.fma.projetos.inspecionarRepositorio(caminho, ambiente)
    if (r.ok) { setRepo(r.valor); setErroRepo(null); setPasta(r.valor.raiz); setAmb(r.valor.ambiente); setBranch(r.valor.atual) }
    else { setRepo(null); setErroRepo(r.erro); setBranch("") }
  }
  async function escolher() {
    const p = await window.fma.projetos.escolherPasta(amb)
    if (p) { setPasta(p); await conferir(p, detectar(p)) }
  }
  const alternar = (id: string) => setTime((t) => { const n = new Set(t); if (!n.delete(id)) n.add(id); return n })

  const escolhidas = cartas.filter((c) => time.has(c.id))
  const { orquestradores, fluxo } = ordemDoTime(escolhidas)
  const semOrquestrador = orquestradores.length === 0
  const dadosOk = !!nome.trim() && !!repo && !!branch
  const pronto = dadosOk && !semOrquestrador && !criando

  async function criar() {
    setCriando(true)
    const r = await criarProjeto({ nome, repositorio: pasta, branchBase: branch, cartaIds: escolhidas.map((c) => c.id),
      contexto, ambiente: amb })
    setCriando(false)
    if (!r.ok) return toast.error(r.erro)
    toast.success(`Projeto "${r.valor.nome}" criado`)
    aoMudar(false)
    aoCriar(r.valor)
  }

  const passos = ["Detalhes", "Time"]

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-4 sm:max-w-[1000px]">
        <DialogHeader className="gap-3">
          <DialogTitle className="font-display">Novo projeto</DialogTitle>
          {/* Passos como no protótipo v16. */}
          <div className="flex flex-wrap items-center gap-2" aria-label="Passos">
            {passos.map((nome, i) => {
              const atual = i + 1 === passo, feito = i + 1 < passo
              return (
                <div key={nome} className="flex items-center gap-2">
                  {i > 0 && <span className="h-px w-6 bg-border" />}
                  <span className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs", atual ? "border-primary text-foreground" : feito ? "text-muted-foreground" : "border-dashed text-muted-foreground/60")}>
                    <span className={cn("flex size-4 items-center justify-center rounded-full text-[10px]", feito ? "bg-success text-background" : atual ? "bg-primary text-primary-foreground" : "bg-muted")}>{feito ? <Check className="size-3" /> : i + 1}</span>{nome}
                  </span>
                </div>
              )
            })}
          </div>
          <DialogDescription className="sr-only">Assistente para criar um projeto: detalhes e time.</DialogDescription>
        </DialogHeader>

        <div className="-mr-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {passo === 1 && (<>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="np-nome">Nome do projeto</FieldLabel>
            <Input id="np-nome" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Portal do cliente" autoFocus />
          </Field>
          <Field data-invalid={!!erroRepo}>
            <FieldLabel htmlFor="np-pasta">Pasta do repositório</FieldLabel>
            {/* Só aparece com mais de um ambiente (Windows com WSL). Trocar limpa a pasta: o Escolher abre no ambiente marcado. */}
            {ambientes.length > 1 && (
              <ToggleGroup type="single" variant="outline" size="sm" className="w-fit" value={amb}
                onValueChange={(v) => { if (!v || v === amb) return; setAmb(v); setPasta(""); setRepo(null); setErroRepo(null); setBranch("") }}>
                {ambientes.map((a) => <ToggleGroupItem key={a.id} value={a.id} className="px-3">{a.id === LOCAL ? <Monitor /> : <Terminal />}{a.nome}</ToggleGroupItem>)}
              </ToggleGroup>
            )}
            <div className="flex gap-2">
              <Input id="np-pasta" value={pasta} onChange={(e) => { setPasta(e.target.value); setRepo(null); detectar(e.target.value) }} onBlur={() => !repo && void conferir(pasta)} placeholder={ehWsl(amb) ? "/home/usuario/meu-repositorio" : window.fma.plataforma === "win32" ? "C:\\projetos\\meu-repositorio" : "~/projetos/meu-repositorio"} aria-invalid={!!erroRepo} className="font-mono" />
              <Button type="button" variant="outline" onClick={() => void escolher()}><FolderOpen data-icon="inline-start" />Escolher</Button>
            </div>
            {erroRepo ? <FieldError>{erroRepo}</FieldError> : <FieldDescription>Precisa ser um repositório git{ehWsl(amb) ? ` dentro do ${rotuloAmbiente(amb, window.fma.plataforma)}` : ""}. As tasks vão trabalhar em branches e worktrees dele.</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel htmlFor="np-branch">Branch base</FieldLabel>
            <div className="flex items-center gap-2">
              <GitBranch className="size-4 text-muted-foreground" />
              <select id="np-branch" className={classeSelect} value={branch} disabled={!repo} onChange={(e) => setBranch(e.target.value)}>
                {!repo && <option value="">Informe o repositório primeiro</option>}
                {repo?.branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <FieldDescription>As branches das tasks saem dela.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="np-contexto">Contexto geral</FieldLabel>
            <Textarea id="np-contexto" rows={4} value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Stack, convenções e o que o time precisa saber do projeto (opcional)." />
            <FieldDescription>Vale para as tasks que ainda vão começar: entra no plano do Orquestrador e no prompt de cada carta. Dá para editar depois, em Tasks.</FieldDescription>
          </Field>
        </FieldGroup>
        </>)}

        {passo === 2 && (<>
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-sm">Time do projeto</h3>
              <p className="text-xs text-muted-foreground">Marque as cartas da coleção que vão jogar. A mesma carta pode estar em vários projetos.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => forjar({ aoSalvar: (c) => setTime((t) => new Set(t).add(c.id)) })}>
              <Plus data-icon="inline-start" />Forjar carta
            </Button>
          </div>
          {cartas.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Sua coleção está vazia. Forje ao menos o Orquestrador.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] justify-items-center gap-4">
              {cartas.map((c) => (
                <button key={c.id} type="button" onClick={() => alternar(c.id)} aria-pressed={time.has(c.id)} aria-label={`${time.has(c.id) ? "Tirar" : "Pôr"} ${c.nome} no time`} className="relative rounded-[18px]">
                  <CartaVisual carta={c} tamanho="sm" className={cn("transition-opacity", !time.has(c.id) && "opacity-45 saturate-50")} style={time.has(c.id) ? ({ boxShadow: "0 0 0 2px var(--primary)" } as CSSProperties) : undefined} />
                  {time.has(c.id) && <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow"><Check className="size-3.5" /></span>}
                </button>
              ))}
            </div>
          )}
          {semOrquestrador && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription className="flex flex-wrap items-center gap-2">
                O time precisa de uma carta de Orquestrador: ele conduz todas as tasks do projeto.
                {(() => {
                  const orq = cartas.find((c) => c.classe === "orquestrador")
                  return orq
                    ? <Button type="button" size="xs" variant="outline" onClick={() => alternar(orq.id)}>Marcar {orq.nome}</Button>
                    : <Button type="button" size="xs" variant="outline" onClick={() => forjar({ classe: "orquestrador", aoSalvar: (c) => setTime((t) => new Set(t).add(c.id)) })}>Forjar Orquestrador</Button>
                })()}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {escolhidas.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3">
            <h3 className="font-display text-sm">Fluxo sugerido</h3>
            {orquestradores.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Conduz as tasks:</span>{orquestradores.map((c) => <Chip key={c.id} carta={c} />)}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {fluxo.length === 0 && <span className="text-xs text-muted-foreground">Marque mais cartas para ver a ordem em que elas trabalham.</span>}
              {fluxo.map((c, i) => (
                <span key={c.id} className="inline-flex items-center gap-1.5">
                  {i > 0 && <ArrowRight className="size-3.5 text-muted-foreground" />}
                  <Chip carta={c} />
                </span>
              ))}
            </div>
            {fluxo.some((c) => c.classe === "revisor") && <p className="text-xs text-muted-foreground">O {CLASSES.revisor.nome} questiona as cartas anteriores; as entregas seguem da esquerda para a direita.</p>}
          </div>
        )}
        </>)}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => aoMudar(false)}>Cancelar</Button>
          {passo > 1 && <Button variant="outline" onClick={() => setPasso(1)}>Voltar</Button>}
          {passo === 1 && <Button disabled={!dadosOk} onClick={() => setPasso(2)}>Continuar</Button>}
          {passo === 2 && <Button disabled={!pronto} onClick={() => void criar()} className="font-display">Criar projeto</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
