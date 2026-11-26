/**
 * Forja: cria e edita cartas, em etapas (RF 1.04 a 1.32).
 * Classe fixa: Classe → Identidade → Conta e IA → Método → Skills → Memórias → Prompt.
 * Coringa: Classe → Missão → Métodos e skills (sugeridos pela missão) → Identidade → Conta e IA → Memórias → Prompt.
 * À esquerda fica a prévia da carta, que vira para mostrar o prompt final.
 * Salvar manda a carta ao núcleo, que valida de novo e grava no banco.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react"
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, Plus, Repeat2, RotateCcw, Sparkles, Trash2, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { CORES_QUADRO, NOMES_ICONES, icone } from "@/lib/icones"
import { CLASSES, MAX_SKILLS, type ClasseId } from "@shared/catalogo"
import { CLIS, RARIDADE, cliPorId, type CliId } from "@shared/ia"
import { ESFORCOS, type Conta } from "@shared/conta"
import { LOCAL, rotuloAmbiente } from "@shared/ambiente"
import { CATEGORIAS_LOJA } from "@shared/biblioteca"
import { chave, montarPrompt, partes, promptFinal, trocarClasse, validarCarta } from "@shared/carta"
import type { Carta } from "@shared/tipos"
import { salvarCarta, useClis } from "@/data/cartas"
import { catalogoCompleto, sugerir } from "@/data/sugestoes"
import { useContas } from "@/data/contas"
import { publicarNaLoja } from "@/data/biblioteca"
import { ConectarConta } from "./ConectarConta"
import { EscolherItensBiblioteca } from "./EscolherItensBiblioteca"
import { CartaVerso, CartaVisual } from "./CartaVisual"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

type Etapa = "classe" | "identidade" | "ia" | "metodo" | "skills" | "memorias" | "prompt" | "missao" | "sugestoes"
const ETAPAS_CLASSE: { id: Etapa; nome: string }[] = [
  { id: "classe", nome: "Classe" },
  { id: "identidade", nome: "Identidade" },
  { id: "ia", nome: "Conta e IA" },
  { id: "metodo", nome: "Método" },
  { id: "skills", nome: "Skills" },
  { id: "memorias", nome: "Memórias" },
  { id: "prompt", nome: "Prompt" },
]
const ETAPAS_CORINGA: { id: Etapa; nome: string }[] = [
  { id: "classe", nome: "Classe" },
  { id: "missao", nome: "Missão" },
  { id: "sugestoes", nome: "Métodos e skills" },
  { id: "identidade", nome: "Identidade" },
  { id: "ia", nome: "Conta e IA" },
  { id: "memorias", nome: "Memórias" },
  { id: "prompt", nome: "Revisão do prompt" },
]
const EXEMPLOS_MISSAO = [
  "Revisar as regras de negócio de um módulo e apontar inconsistências antes do desenvolvimento.",
  "Montar casos de teste a partir dos critérios de aceite e validar as permissões por perfil de acesso.",
  "Analisar uma tela quanto à acessibilidade, à usabilidade e à LGPD.",
]
const ADICIONAIS_PRONTOS: [string, string][] = [
  ["Padrões da empresa", "Siga os padrões de nomenclatura e o glossário oficial da empresa."],
  ["Formato de saída", "Entregue sempre em tópicos curtos, com um resumo de 3 linhas no início."],
  ["Tom de voz", "Use linguagem simples, direta e amigável."],
]

/** Pede ao App para abrir a forja: com uma carta para editar, ou nova (da classe pedida); `aoSalvar` recebe a carta gravada. */
export type Forjar = (o: { carta?: Carta; classe?: ClasseId; aoSalvar?: (c: Carta) => void }) => void

export function Forja({ aberta, aoMudar, inicial, nova, aoSalvar, irConexoes }: {
  aberta: boolean
  aoMudar: (aberta: boolean) => void
  inicial: Carta
  nova: boolean
  aoSalvar?: (c: Carta) => void
  irConexoes?: () => void
}) {
  const [c, setC] = useState<Carta>(inicial)
  const [etapa, setEtapa] = useState<Etapa>(nova ? "classe" : "identidade")
  const [virada, setVirada] = useState(false)
  const [modeloLivre, setModeloLivre] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [publicar, setPublicar] = useState(false)
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_LOJA[0])
  useEffect(() => {
    if (aberta) { setC(inicial); setEtapa(nova ? "classe" : "identidade"); setVirada(false); setModeloLivre(""); setPublicar(false) }
  }, [aberta, inicial, nova])

  const classe = CLASSES[c.classe]
  /** Muda a carta; enquanto o prompt não foi editado, ele acompanha as escolhas (RN 8). */
  const muda = (patch: Partial<Carta>, refazPrompt = true) =>
    setC((ant) => {
      const n = { ...ant, ...patch }
      return refazPrompt && !n.promptEditado ? { ...n, prompt: montarPrompt(n) } : n
    })
  const ETAPAS = c.classe === "custom" ? ETAPAS_CORINGA : ETAPAS_CLASSE
  const idx = Math.max(0, ETAPAS.findIndex((e) => e.id === etapa))
  const final = useMemo(() => promptFinal(c), [c])

  const semConta = nova && !c.contaId
  const [escala, setEscala] = useState(1)
  // Ref de callback: o painel só existe depois que o Dialog monta. 48 = padding, 44 = botão virar.
  const painel = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const ro = new ResizeObserver(() => setEscala(Math.min(1, Math.max(0.4, (el.clientHeight - 48 - 44) / 414))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Carta nova já começa com a conta padrão (da CLI da carta, senão a primeira padrão), para não travar no "Forjar".
  const { contas } = useContas()
  useEffect(() => {
    if (!semConta) return
    const k = contas.find((x) => x.padrao && x.cli === c.cli) ?? contas.find((x) => x.padrao)
    if (k) setC((v) => (v.contaId ? v : { ...v, contaId: k.id, cli: k.cli, modelo: k.cli === v.cli ? v.modelo : cliPorId(k.cli).modelos[0].id }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contas, semConta])
  const travada = !!c.origemLoja?.travada
  /** `forjando`: botão final; carta nova só é forjada com conta. Salvar edição vale em qualquer etapa (RF 1.32). */
  async function salvar(forjando = false) {
    if (forjando && semConta) { setEtapa("ia"); toast.error("Escolha a conta de IA para forjar a carta."); return }
    const erro = validarCarta(c)
    if (erro) {
      setEtapa(!c.nome.trim() ? "identidade" : c.classe === "custom" && !c.descricao.trim() ? "missao" : etapa)
      toast.error(erro)
      return
    }
    setSalvando(true)
    const r = await salvarCarta(c)
    setSalvando(false)
    if (!r.ok) { toast.error(r.erro); return }
    if (publicar && !travada) {
      const p = await publicarNaLoja(r.valor.id, r.valor.descricao, categoria)
      if (p.ok) toast.success(`"${r.valor.nome}" publicada na Loja`); else toast.error(p.erro)
    }
    aoMudar(false)
    aoSalvar?.(r.valor)
    toast.success(nova ? `Carta "${r.valor.nome}" forjada` : `Carta "${r.valor.nome}" atualizada`, { description: nova ? "Ela já está na sua coleção." : undefined })
  }

  return (
    <Dialog open={aberta} onOpenChange={aoMudar}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1080px]">
        <DialogHeader className="border-b px-6 pt-5 pb-4">
          <DialogTitle className="font-display text-lg">{nova ? "Forjar nova carta" : `Editar ${inicial.nome}`}</DialogTitle>
          <DialogDescription>
            {nova ? "Escolha a classe, dê um nome, defina a IA e o jeito de trabalhar. A carta ao lado muda enquanto você escolhe." : "Altere o que quiser. A carta ao lado mostra o resultado."}
          </DialogDescription>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ETAPAS.map((e, i) => (
              <button key={e.id} onClick={() => setEtapa(e.id)} className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors", e.id === etapa ? "border-primary bg-primary/15 text-foreground" : i < idx ? "border-transparent bg-secondary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px] font-bold", i < idx ? "bg-success text-background" : e.id === etapa ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {i < idx ? <Check className="size-3" /> : i + 1}
                </span>
                {e.nome}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 [grid-template-rows:minmax(0,1fr)] md:grid-cols-[340px_1fr]">
          <div ref={painel} className="table-felt flex min-h-0 flex-col items-center justify-center gap-3 overflow-hidden border-r p-6 max-md:hidden">
            {/* A carta encolhe para caber na altura do painel (janelas baixas), em vez de vazar por cima do rodapé. */}
            <div className={cn("flip shrink-0", virada && "flipped")} style={{ width: 290, height: 414, zoom: escala }}>
              <div className="flip-inner">
                <div className="flip-face"><CartaVisual carta={c} tamanho="lg" /></div>
                <div className="flip-face flip-back"><CartaVerso carta={c} texto={final} /></div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setVirada((v) => !v)}><Repeat2 data-icon="inline-start" />{virada ? "Ver frente" : "Virar e ver o prompt"}</Button>
          </div>

          <div className="min-h-0 overflow-y-auto px-6 py-5">
            {etapa === "classe" && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">A classe define o papel na equipe e traz o método e as skills sugeridos. O Orquestrador monta o plano de cada task; na mesa, a ordem sugerida é Análise, UX, Desenvolvimento, Teste, Segurança, Revisor e Pull Request.</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {Object.values(CLASSES).map((k) => {
                    const I = icone(k.simbolo)
                    const marcada = k.id === c.classe
                    return (
                      <button key={k.id} onClick={() => setC((ant) => trocarClasse(ant, k.id))} style={{ "--c": k.cor } as CSSProperties}
                        className={cn("group flex gap-3 rounded-xl border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5", marcada ? "border-[var(--c)] shadow-[0_0_0_1px_var(--c),0_10px_30px_-12px_var(--c)]" : "hover:border-foreground/20")}>
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklch, ${k.cor} 18%, transparent)`, color: k.cor }}><I className="size-5" /></span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="flex items-center gap-2"><b className="font-semibold">{k.nome}</b><span className="font-display text-[9.5px] uppercase tracking-[0.14em]" style={{ color: k.cor }}>{k.titulo}</span></span>
                          <span className="text-xs text-muted-foreground">{k.slogan}</span>
                        </span>
                        {marcada && <Check className="ml-auto size-4 shrink-0" style={{ color: k.cor }} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {etapa === "identidade" && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="f-nome">Nome da carta</FieldLabel>
                  <Input id="f-nome" maxLength={60} disabled={travada} value={c.nome} onChange={(e) => muda({ nome: e.target.value })} placeholder="Como você quer chamar este agente?" />
                  {travada && <FieldDescription>O nome é de {c.origemLoja!.autor}, autor desta carta da Loja, e não pode ser mudado.</FieldDescription>}
                  {!travada && <div className="flex flex-wrap gap-1.5">
                    {classe.nomes.map((n) => <Button key={n} size="xs" variant="outline" onClick={() => muda({ nome: n })}>{n}</Button>)}
                  </div>}
                </Field>
                {c.classe !== "custom" && (
                  <Field>
                    <FieldLabel htmlFor="f-desc">Descrição</FieldLabel>
                    <Textarea id="f-desc" rows={3} value={c.descricao} onChange={(e) => muda({ descricao: e.target.value }, false)} />
                    <FieldDescription>Aparece na coleção. Ajuda a lembrar para que serve.</FieldDescription>
                  </Field>
                )}
                <Field>
                  <FieldLabel>Símbolo</FieldLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {NOMES_ICONES.map((k) => {
                      const I = icone(k)
                      return <Button key={k} size="icon-sm" variant={c.simbolo === k ? "secondary" : "ghost"} aria-label={k} onClick={() => muda({ simbolo: k }, false)} className={cn(c.simbolo === k && "ring-2 ring-primary")}><I /></Button>
                    })}
                  </div>
                </Field>
                <Field>
                  <FieldLabel>Cor do quadro</FieldLabel>
                  <div className="flex gap-2">
                    {CORES_QUADRO.map((cor) => <button key={cor} aria-label="Cor" onClick={() => muda({ cor }, false)} className={cn("size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110", c.cor === cor && "ring-2 ring-foreground")} style={{ background: cor }} />)}
                  </div>
                </Field>
              </FieldGroup>
            )}

            {etapa === "ia" && <EtapaIa c={c} nova={nova} muda={muda} modeloLivre={modeloLivre} setModeloLivre={setModeloLivre} irConexoes={irConexoes} />}

            {etapa === "missao" && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="f-missao">O que este Coringa deve fazer?</FieldLabel>
                  <Textarea id="f-missao" rows={7} autoFocus value={c.descricao} onChange={(e) => muda({ descricao: e.target.value })} placeholder="Descreva a missão com as suas palavras: o que analisar, o que entregar, com que cuidado." />
                  <FieldDescription>Este texto vira a missão no prompt. Na próxima etapa ele sugere métodos e skills de todas as classes para você escolher. Quanto mais específico, melhores as sugestões.</FieldDescription>
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Exemplos para começar</span>
                  {EXEMPLOS_MISSAO.map((x) => <button key={x} onClick={() => muda({ descricao: x })} className="rounded-lg border border-dashed px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">{x}</button>)}
                </div>
              </FieldGroup>
            )}

            {etapa === "sugestoes" && <div className="flex flex-col gap-5"><EscolhaCoringa c={c} muda={muda} voltar={() => setEtapa("missao")} /><HabilidadesLoja c={c} muda={muda} /></div>}

            {etapa === "metodo" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">O método é o jeito de atuar da carta. Ele entra no prompt e muda o atributo Foco.</p>
                {classe.metodos.map((m) => {
                  const k = chave(c.classe, m.id)
                  const marcado = c.metodos[0] === k
                  return (
                    <button key={m.id} onClick={() => muda({ metodos: [k] })} className={cn("flex flex-col gap-1.5 rounded-xl border bg-card p-4 text-left transition-colors", marcado ? "border-primary ring-1 ring-primary" : "hover:border-foreground/20")}>
                      <span className="flex items-center gap-2"><b className="font-semibold">{m.nome}</b>{m.id === classe.metodos[0].id && <Badge variant="secondary">Sugerido</Badge>}<span className="ml-auto text-xs text-muted-foreground tabular">Foco {m.foco}/5</span></span>
                      <span className="text-sm text-muted-foreground">{m.descricao}</span>
                      {m.prompt && <span className="rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-[11.5px] text-muted-foreground">{m.prompt}</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {etapa === "skills" && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">Skills prontas da classe {classe.nome}. Cada uma acrescenta uma instrução ao prompt.</p>
                  <Badge variant="outline" className="ml-auto tabular">{c.skills.length}/{MAX_SKILLS} slots</Badge>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {classe.skills.map((s) => {
                    const k = chave(c.classe, s.id)
                    const marcada = c.skills.includes(k)
                    return (
                      <button key={s.id} onClick={() => {
                        if (!marcada && c.skills.length >= MAX_SKILLS) { toast("Todos os slots de skill estão ocupados", { description: "Tire uma skill para colocar outra." }); return }
                        muda({ skills: marcada ? c.skills.filter((x) => x !== k) : [...c.skills, k] })
                      }} className={cn("flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors", marcada ? "border-primary/70 bg-primary/5" : "hover:border-foreground/20")}>
                        <span className="gem mt-0.5 size-3.5 shrink-0" style={{ background: marcada ? c.cor : "oklch(1 0 0 / 0.15)" }} />
                        <span className="flex flex-col gap-0.5"><b className="text-sm font-semibold">{s.nome}</b><span className="text-xs text-muted-foreground">{s.descricao}</span></span>
                      </button>
                    )
                  })}
                </div>
                <HabilidadesLoja c={c} muda={muda} />
              </div>
            )}

            {etapa === "memorias" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">Skills são instruções prontas da classe; habilidades são instruções da biblioteca, que você cria ou pega na Loja. Memórias são o que a carta precisa saber e consulta antes de agir: regras, glossário, decisões. Marque as padrão ou crie as suas aqui.</p>
                <EscolherItensBiblioteca tipo="memoria" selecionados={c.memorias} aoMudar={(memorias) => muda({ memorias }, false)} />
              </div>
            )}

            {etapa === "prompt" && <EtapaPrompt c={c} setC={setC} publicar={publicar} setPublicar={setPublicar} categoria={categoria} setCategoria={setCategoria} travada={travada} />}
          </div>
        </div>

        <DialogFooter className="items-center border-t px-6 py-4 sm:justify-between">
          <span className="text-xs text-muted-foreground">Etapa {idx + 1} de {ETAPAS.length}</span>
          <div className="flex gap-2">
            {idx > 0 && <Button variant="ghost" onClick={() => setEtapa(ETAPAS[idx - 1].id)}><ArrowLeft data-icon="inline-start" />Voltar</Button>}
            {!nova && <Button variant="outline" disabled={salvando} onClick={() => salvar()}>Salvar</Button>}
            {nova && idx >= (c.classe === "custom" ? 2 : 1) && idx < ETAPAS.length - 1 && <Button variant="outline" disabled={salvando} onClick={() => salvar(true)}>Forjar agora</Button>}
            {idx < ETAPAS.length - 1
              ? <Button disabled={etapa === "missao" && !c.descricao.trim()} onClick={() => setEtapa(ETAPAS[idx + 1].id)}>{etapa === "missao" ? "Sugerir métodos e skills" : "Próximo"}<ArrowRight data-icon="inline-end" /></Button>
              : <Button disabled={salvando} onClick={() => salvar(true)}><Check data-icon="inline-start" />{nova ? "Forjar carta" : "Salvar carta"}</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Conta e IA: conta primeiro, depois modelo e esforço ---------------- */
function EtapaIa({ c, nova, muda, modeloLivre, setModeloLivre, irConexoes }: {
  c: Carta; nova: boolean; muda: (p: Partial<Carta>, refaz?: boolean) => void; modeloLivre: string; setModeloLivre: (v: string) => void; irConexoes?: () => void
}) {
  const { contas, ambientes } = useContas()
  const instaladas = useClis()
  const [conectando, setConectando] = useState<CliId | null>(null)
  const cli = cliPorId(c.cli)
  const ambConta = contas.find((k) => k.id === c.contaId)?.ambiente ?? LOCAL // onde a CLI da conta roda
  const situacao = instaladas?.find((x) => x.id === c.cli && x.ambiente === ambConta)
  const nomeAmb = (a: string) => rotuloAmbiente(a, window.fma.plataforma)
  const escolher = (k: Conta) => muda({ contaId: k.id, cli: k.cli, modelo: k.cli === c.cli ? c.modelo : cliPorId(k.cli).modelos[0].id }, false)
  // Carta nova só mostra modelos depois da conta; carta existente sem conta usa a padrão da CLI.
  const mostrarModelos = !!c.contaId || !nova
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Conta de IA</FieldLabel>
        <FieldDescription>A carta trabalha pela CLI da conta escolhida, dentro da pasta da task. Os modelos dependem da conta.</FieldDescription>
        {contas.length === 0 ? (
          <Alert>
            <CircleAlert />
            <AlertDescription>
              <span>Nenhuma conta conectada. Conecte uma para forjar a carta.</span>
              <span className="mt-2 flex flex-wrap gap-2">
                {irConexoes && <Button size="xs" variant="outline" onClick={irConexoes}>Abrir Conexões</Button>}
                {CLIS.map((x) => <Button key={x.id} size="xs" variant="secondary" onClick={() => setConectando(x.id)}><Plus data-icon="inline-start" />{x.nome}</Button>)}
              </span>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-3">
            {CLIS.map((x) => (
              <div key={x.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <b className="text-xs uppercase tracking-wide text-muted-foreground">{x.nome}</b>
                  <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setConectando(x.id)}><Plus data-icon="inline-start" />Conectar outra</Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {contas.filter((k) => k.cli === x.id).map((k) => (
                    <button key={k.id} onClick={() => escolher(k)} className={cn("flex items-center gap-2 rounded-xl border bg-card p-3 text-left text-sm transition-colors", c.contaId === k.id ? "border-primary ring-1 ring-primary" : "hover:border-foreground/20")}>
                      <b className="truncate font-semibold">{k.nome}</b>{ambientes.length > 1 && <Badge variant="outline">{nomeAmb(k.ambiente)}</Badge>}{k.padrao && <Badge variant="secondary" className="ml-auto">padrão</Badge>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {nova && !c.contaId && contas.length > 0 && <span className="text-xs text-muted-foreground">Escolha uma conta para ver os modelos. Sem conta a carta não é forjada.</span>}
      </Field>

      {mostrarModelos && (
        <>
          {situacao && !situacao.instalada && (
            <Alert>
              <CircleAlert />
              <AlertDescription>
                <span>Não achei o {cli.nome} {ambConta === LOCAL ? "neste computador" : `no ${nomeAmb(ambConta)}`}. A carta pode ser forjada agora, mas só trabalha numa task depois de instalar:</span>
                <code className="mt-1 block rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">{cli.instalar}</code>
              </AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel>Modelo</FieldLabel>
            <FieldDescription>A raridade da carta vem do modelo: quanto mais capaz, mais rara.</FieldDescription>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {cli.modelos.map((m) => {
                const marcado = c.modelo === m.id
                return (
                  <button key={m.id} onClick={() => muda({ modelo: m.id }, false)} className={cn("flex flex-col gap-1 rounded-xl border bg-card p-3 text-left transition-colors", marcado ? "border-primary ring-1 ring-primary" : "hover:border-foreground/20")}>
                    <span className="flex items-center gap-2"><b className="font-semibold">{m.nome}</b><Badge variant={m.raridade === "lendaria" || m.raridade === "epica" ? "default" : "secondary"} className="ml-auto">{RARIDADE[m.raridade].nome}</Badge></span>
                    <span className="text-xs text-muted-foreground">{m.dica}</span>
                    <span className="flex gap-3 text-[11px] text-muted-foreground tabular"><span>Poder {m.poder}/5</span><span>Velocidade {m.velocidade}/5</span><span>Custo {"$".repeat(m.custo)}</span></span>
                  </button>
                )
              })}
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="f-modelo">Outro modelo</FieldLabel>
            <div className="flex gap-2">
              <Input id="f-modelo" placeholder="Nome do modelo, como a CLI aceita" value={modeloLivre} onChange={(e) => setModeloLivre(e.target.value)} className="font-mono" />
              <Button variant="outline" disabled={!modeloLivre.trim()} onClick={() => muda({ modelo: modeloLivre.trim() }, false)}>Usar</Button>
            </div>
            <FieldDescription>
              Para um modelo que não está na lista.
              {!cli.modelos.some((m) => m.id === c.modelo) && <> Em uso: <span className="font-mono text-foreground">{c.modelo}</span></>}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Esforço</FieldLabel>
            <FieldDescription>Quanto a IA pensa antes de responder. Mais esforço gasta mais da cota da conta.</FieldDescription>
            <ToggleGroup type="single" variant="outline" value={c.esforco} onValueChange={(v) => v && muda({ esforco: v as Carta["esforco"] }, false)} className="flex-wrap justify-start">
              {ESFORCOS.map((e) => <ToggleGroupItem key={e.id} value={e.id} className="px-4">{e.nome}</ToggleGroupItem>)}
            </ToggleGroup>
          </Field>
        </>
      )}
      <ConectarConta cli={conectando} aoFechar={() => setConectando(null)} aoConectar={escolher} />
    </FieldGroup>
  )
}

/** Habilidades da biblioteca/Loja (além das skills da classe). */
function HabilidadesLoja({ c, muda }: { c: Carta; muda: (p: Partial<Carta>, refaz?: boolean) => void }) {
  return (
    <section className="flex flex-col gap-2">
      <b className="text-sm">Habilidades da loja</b>
      <EscolherItensBiblioteca tipo="habilidade" selecionados={c.habilidades} aoMudar={(habilidades) => muda({ habilidades }, false)} />
    </section>
  )
}

/* ---------------- Prompt principal e adicionais ---------------- */
function EtapaPrompt({ c, setC, publicar, setPublicar, categoria, setCategoria, travada }: {
  c: Carta; setC: Dispatch<SetStateAction<Carta>>; publicar: boolean; setPublicar: (v: boolean) => void; categoria: string; setCategoria: (v: string) => void; travada: boolean
}) {
  const mudaAdicional = (id: string, patch: Partial<Carta["adicionais"][number]>) =>
    setC((p) => ({ ...p, adicionais: p.adicionais.map((y) => (y.id === id ? { ...y, ...patch } : y)) }))
  const incluir = (titulo = "", texto = "") => setC((p) => ({ ...p, adicionais: [...p.adicionais, { id: crypto.randomUUID(), titulo, texto, ativo: true }] }))
  return (
    <FieldGroup>
      <Field>
        <div className="flex items-center gap-2">
          <FieldLabel htmlFor="f-prompt">Prompt principal</FieldLabel>
          {c.promptEditado ? <Badge variant="secondary">Editado por você</Badge> : <Badge variant="outline">Gerado pelas suas escolhas</Badge>}
          {c.promptEditado && <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setC((p) => ({ ...p, promptEditado: false, prompt: montarPrompt(p) }))}><RotateCcw data-icon="inline-start" />Regerar</Button>}
        </div>
        <Textarea id="f-prompt" rows={12} className="font-mono text-xs leading-relaxed" value={c.prompt} onChange={(e) => setC((p) => ({ ...p, prompt: e.target.value, promptEditado: true }))} />
        <FieldDescription>Enquanto você não editar, o prompt acompanha {c.classe === "custom" ? "a missão, os métodos e as skills escolhidos" : "a classe, o método e as skills"}. Depois de editar, ele fica do seu jeito.</FieldDescription>
      </Field>
      <Field>
        <div className="flex items-center gap-2">
          <FieldLabel>Prompts adicionais</FieldLabel>
          <Button size="xs" variant="outline" className="ml-auto" onClick={() => incluir()}><Plus data-icon="inline-start" />Incluir prompt</Button>
        </div>
        <FieldDescription>Blocos que você liga e desliga sem mexer no prompt principal. Ex.: padrões da empresa, glossário, formato de saída.</FieldDescription>
        {c.adicionais.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ADICIONAIS_PRONTOS.map(([t, x]) => <Button key={t} size="xs" variant="secondary" onClick={() => incluir(t, x)}><Sparkles data-icon="inline-start" />{t}</Button>)}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {c.adicionais.map((x) => (
            <div key={x.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
              <div className="flex items-center gap-2">
                <Input value={x.titulo} placeholder="Título" className="h-8" onChange={(e) => mudaAdicional(x.id, { titulo: e.target.value })} />
                <Switch checked={x.ativo} aria-label="Ligado" onCheckedChange={(v) => mudaAdicional(x.id, { ativo: v })} />
                <Button size="icon-sm" variant="ghost" aria-label="Remover" onClick={() => setC((p) => ({ ...p, adicionais: p.adicionais.filter((y) => y.id !== x.id) }))}><Trash2 /></Button>
              </div>
              <Textarea rows={3} value={x.texto} placeholder="Instrução" className="font-mono text-xs" onChange={(e) => mudaAdicional(x.id, { texto: e.target.value })} />
            </div>
          ))}
        </div>
      </Field>
      {/* MVP: Loja desligada por enquanto (remover "false &&" para religar) */}
      {false && !travada && (
        <Field>
          <div className="flex items-center gap-2">
            <FieldLabel htmlFor="f-publicar">Publicar na Loja</FieldLabel>
            <Switch id="f-publicar" className="ml-auto" checked={publicar} onCheckedChange={setPublicar} />
          </div>
          <FieldDescription>Ao salvar, guarda uma cópia na Loja deste app. A conta de IA não vai junto.</FieldDescription>
          {publicar && (
            <ToggleGroup type="single" variant="outline" size="sm" value={categoria} onValueChange={(v) => v && setCategoria(v)} className="flex-wrap justify-start">
              {CATEGORIAS_LOJA.map((x) => <ToggleGroupItem key={x} value={x} className="px-3">{x}</ToggleGroupItem>)}
            </ToggleGroup>
          )}
        </Field>
      )}
      <Alert>
        <Wand2 />
        <AlertDescription>Vire a carta na prévia para ler o prompt final, que junta o prompt principal com os adicionais ligados.</AlertDescription>
      </Alert>
    </FieldGroup>
  )
}

/* ---------------- Coringa: métodos e skills de qualquer classe ---------------- */
function EscolhaCoringa({ c, muda, voltar }: { c: Carta; muda: (p: Partial<Carta>) => void; voltar: () => void }) {
  const [tudo, setTudo] = useState(false)
  const sug = useMemo(() => sugerir(c.descricao), [c.descricao])
  const cat = useMemo(() => catalogoCompleto(), [])
  const metodos = tudo ? cat.metodos.map((x) => ({ ...x, motivo: [] as string[] })) : sug.metodos
  const skills = tudo ? cat.skills.map((x) => ({ ...x, motivo: [] as string[] })) : sug.skills
  const alterna = (lista: string[], k: string) => (lista.includes(k) ? lista.filter((x) => x !== k) : [...lista, k])
  const Classe = ({ id }: { id: ClasseId }) => <span className="font-display text-[9.5px] uppercase tracking-[0.14em]" style={{ color: CLASSES[id].cor }}>{CLASSES[id].nome}</span>

  if (!c.descricao.trim()) return (
    <Empty className="border border-dashed">
      <EmptyHeader><EmptyTitle>Escreva a missão primeiro</EmptyTitle><EmptyDescription>As sugestões de método e skills saem do que você escrever.</EmptyDescription></EmptyHeader>
      <Button size="sm" onClick={voltar}>Escrever a missão</Button>
    </Empty>
  )
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3">
        <span className="line-clamp-2 text-sm">“{c.descricao}”</span>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {sug.areas.length
            ? <>Temas encontrados: {sug.areas.slice(0, 5).map((x) => <Badge key={x.classe} variant="outline" style={{ color: CLASSES[x.classe].cor }}>{CLASSES[x.classe].nome}</Badge>)}</>
            : "Não achei um tema claro. Veja o catálogo completo ou detalhe mais a missão."}
          <Button size="xs" variant="ghost" className="ml-auto" onClick={voltar}>Editar missão</Button>
        </div>
      </div>

      <ToggleGroup type="single" variant="outline" size="sm" value={tudo ? "todos" : "sugeridos"} onValueChange={(v) => v && setTudo(v === "todos")} className="justify-start">
        <ToggleGroupItem value="sugeridos" className="px-3"><Wand2 />Sugeridos pela missão</ToggleGroupItem>
        <ToggleGroupItem value="todos" className="px-3">Catálogo completo</ToggleGroupItem>
      </ToggleGroup>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2"><b className="text-sm">Métodos</b><span className="text-xs text-muted-foreground">pode escolher mais de um, ou nenhum para atuar livre</span></div>
        {!metodos.length && <span className="text-xs text-muted-foreground">Nenhum método sugerido para esta missão.</span>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {metodos.map((x) => {
            const marcado = c.metodos.includes(x.chave)
            return (
              <button key={x.chave} onClick={() => muda({ metodos: alterna(c.metodos, x.chave) })} className={cn("flex flex-col gap-1 rounded-xl border bg-card p-3 text-left transition-colors", marcado ? "border-primary ring-1 ring-primary" : "hover:border-foreground/20")}>
                <span className="flex items-center gap-2"><Classe id={x.classe} /><span className="ml-auto text-[11px] text-muted-foreground tabular">Foco {x.item.foco}/5</span>{marcado && <Check className="size-3.5 text-primary" />}</span>
                <b className="text-sm font-semibold">{x.item.nome}</b>
                <span className="text-xs text-muted-foreground">{x.item.descricao}</span>
                {!!x.motivo.length && <span className="text-[11px] text-primary/80">Sugerido porque {x.motivo.join(" e ")}</span>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2"><b className="text-sm">Skills</b><Badge variant="outline" className="tabular">{c.skills.length}/{MAX_SKILLS} slots</Badge></div>
        {!skills.length && <span className="text-xs text-muted-foreground">Nenhuma skill sugerida para esta missão.</span>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {skills.map((x) => {
            const marcada = c.skills.includes(x.chave)
            return (
              <button key={x.chave} onClick={() => {
                if (!marcada && c.skills.length >= MAX_SKILLS) { toast("Todos os slots de skill estão ocupados", { description: "Tire uma skill para colocar outra." }); return }
                muda({ skills: alterna(c.skills, x.chave) })
              }} className={cn("flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors", marcada ? "border-primary/70 bg-primary/5" : "hover:border-foreground/20")}>
                <span className="gem mt-0.5 size-3.5 shrink-0" style={{ background: marcada ? c.cor : "oklch(1 0 0 / 0.15)" }} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2"><b className="text-sm font-semibold">{x.item.nome}</b><Classe id={partes(x.chave).classe} /></span>
                  <span className="text-xs text-muted-foreground">{x.item.descricao}</span>
                  {!!x.motivo.length && <span className="text-[11px] text-primary/80">Sugerida porque {x.motivo.join(" e ")}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </section>
      <p className="text-[11px] text-muted-foreground">As sugestões comparam as palavras da missão com o catálogo de todas as classes.</p>
    </div>
  )
}
