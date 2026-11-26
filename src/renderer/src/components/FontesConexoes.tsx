/**
 * Fontes de tasks em Conexões (E10): GitHub (pelo gh) e MCP próprio (Jira, Azure DevOps etc.). O Lupito aparece como "em breve".
 * Conectar guarda só a configuração; "Testar" confere a conexão de verdade.
 */
import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Plug, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { FONTES, COLUNA_PRONTA, camposDeFiltro, type FerramentaDoServidor, type Fonte, type MapaMcp, type McpDaClaude, type PapelMcp, type TipoFonte } from "@shared/fonte"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { cn } from "@/lib/utils"

/** Tipos que dá para conectar (os "em breve" ficam de fora até existirem). */
export const TIPOS_FONTE = (Object.keys(FONTES) as TipoFonte[]).filter((t) => !FONTES[t].emBreve)
const texto = (v: unknown) => (typeof v === "string" ? v : "")
const PAPEIS: [PapelMcp, string][] = [["lista", "Lê com"], ["detalhe", "Detalhe com"], ["mover", "Move com"], ["comentar", "Comenta com"]]
const SELECT = "h-9 rounded-md border bg-transparent px-2 font-mono text-sm"

export function FormularioFonte({ tipo, fonte, aoFechar, aoSalvar }: { tipo: TipoFonte | null; fonte?: Fonte; aoFechar: () => void; aoSalvar: (fonte?: Fonte) => void }) {
  const [rotulo, setRotulo] = useState("")
  const [dono, setDono] = useState("")
  const [servidor, setServidor] = useState("")
  const [env, setEnv] = useState("")
  const [pronta, setPronta] = useState("")
  const [descoberta, setDescoberta] = useState<{ tools: FerramentaDoServidor[]; mapa: MapaMcp } | null>(null)
  const [escolha, setEscolha] = useState<MapaMcp>({})
  const [filtro, setFiltro] = useState<Record<string, string>>({})
  const [aoComecar, setAoComecar] = useState("")
  const [aoAceitar, setAoAceitar] = useState("")
  const [daClaude, setDaClaude] = useState<McpDaClaude[] | null>(null)
  const proprio = tipo === "mcp"
  const [ocupado, setOcupado] = useState(false)
  const github = tipo === "github"

  useEffect(() => {
    if (!tipo) return
    const c = fonte?.config ?? {}
    setRotulo(fonte?.rotulo ?? FONTES[tipo].nome); setDono(texto(c.dono)); setServidor(texto(c.servidor)); setEnv(texto(c.env)); setPronta(texto(c.colunaPronta))
    const f = (c.ferramentas ?? {}) as Record<string, unknown>
    setEscolha({ lista: texto(f.lista) || texto(c.ferramentaTasks) || undefined, detalhe: texto(f.detalhe) || undefined, mover: texto(f.mover) || texto(c.ferramentaMover) || undefined, comentar: texto(f.comentar) || texto(c.ferramentaComentar) || undefined })
    setFiltro(Object.fromEntries(Object.entries((c.filtro ?? {}) as Record<string, unknown>).map(([k, v]) => [k, texto(v)])))
    setAoComecar(texto(c.aoComecar)); setAoAceitar(texto(c.aoAceitar)); setDescoberta(null); setDaClaude(null)
    if (fonte && tipo === "mcp") void window.fma.fontes.ferramentas({ servidor: texto(c.servidor), env: texto(c.env) }).then((r) => r.ok && setDescoberta(r.valor))
  }, [tipo, fonte])

  async function descobrir() {
    setOcupado(true)
    const r = await window.fma.fontes.ferramentas({ servidor: servidor.trim(), env })
    setOcupado(false)
    if (!r.ok) return void toast.error(r.erro)
    setDescoberta(r.valor)
    setEscolha(Object.fromEntries(Object.entries(escolha).filter(([, v]) => v && r.valor.tools.some((t) => t.name === v)))) // mantém só as trocas que ainda existem
    toast.success(`${r.valor.tools.length} ferramentas encontradas`)
  }
  const final = (p: PapelMcp) => escolha[p] ?? descoberta?.mapa[p]
  const ferramentaLista = descoberta?.tools.find((t) => t.name === final("lista"))

  async function importar() {
    setOcupado(true)
    const l = await window.fma.fontes.mcpsClaude()
    setOcupado(false)
    if (!l.length) toast("Nenhum servidor MCP encontrado na Claude Code (Windows ou WSL).")
    setDaClaude(l)
  }
  function usar(m: McpDaClaude) {
    setServidor(m.config.servidor); setEnv(m.config.env); setDaClaude(null)
    if (rotulo === FONTES[tipo!].nome) setRotulo(m.nome.slice(0, 60))
    toast.success(`Servidor "${m.nome}" importado`, {
      description: m.claudeAi ? "Conector do claude.ai: o login dele é do claude.ai. O FMA conecta direto na URL; use Descobrir ferramentas para conferir se responde." : m.comHeaders ? "Ele usa headers, que o FMA ainda não suporta: a conexão pode falhar." : undefined,
    })
  }

  async function salvar() {
    setOcupado(true)
    const mcp = { ferramentas: Object.fromEntries(PAPEIS.map(([p]) => [p, final(p) ?? ""])), filtro: Object.fromEntries(Object.entries(filtro).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)), aoComecar: aoComecar.trim(), aoAceitar: aoAceitar.trim() }
    const config = github ? { dono: dono.trim(), colunaPronta: pronta.trim() } : { servidor: servidor.trim(), env, colunaPronta: pronta.trim(), ...(proprio ? mcp : {}) }
    const r = fonte ? await window.fma.fontes.atualizar(fonte.id, { rotulo, config }) : await window.fma.fontes.criar({ tipo: tipo!, rotulo, config })
    setOcupado(false)
    if (!r.ok) return void toast.error(r.erro)
    toast.success(fonte ? "Fonte atualizada" : "Fonte conectada", { description: "Use Testar para conferir a conexão." })
    aoSalvar(r.valor); aoFechar()
  }

  return (
    <Dialog open={!!tipo} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fonte ? "Editar" : "Conectar"} {tipo && FONTES[tipo].nome}</DialogTitle>
          <DialogDescription>{tipo && FONTES[tipo].desc}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="fonte-rotulo">Nome</FieldLabel>
            <Input id="fonte-rotulo" value={rotulo} maxLength={60} onChange={(e) => setRotulo(e.target.value)} />
          </Field>
          {github ? (
            <Field>
              <FieldLabel htmlFor="fonte-dono">Organização ou usuário</FieldLabel>
              <Input id="fonte-dono" value={dono} onChange={(e) => setDono(e.target.value)} placeholder="Vazio: o usuário logado no gh" />
              <FieldDescription>Precisa do gh instalado e autenticado, com o escopo project (gh auth refresh -s project).</FieldDescription>
            </Field>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="fonte-servidor">Servidor (URL ou comando)</FieldLabel>
                <Input id="fonte-servidor" className="font-mono" value={servidor} onChange={(e) => setServidor(e.target.value)} placeholder="node meu-mcp.js  ou  https://servidor/mcp" />
                {!proprio && <FieldDescription>O FMA descobre as ferramentas do servidor ao testar. Credenciais vão no campo abaixo (ficam em texto no banco local).</FieldDescription>}
                <Button type="button" variant="outline" size="sm" className="self-start" disabled={ocupado} onClick={() => void importar()}>{ocupado ? "Procurando na Claude…" : "Importar da Claude"}</Button>
                {daClaude && daClaude.length > 0 && (
                  <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-lg border p-1">
                    {daClaude.map((m, i) => (
                      <button key={i} type="button" onClick={() => usar(m)} className="flex flex-col rounded px-2 py-1 text-left text-sm hover:bg-muted">
                        <span className="flex items-center gap-1.5"><b>{m.nome}</b> <span className="text-xs text-muted-foreground">{m.origem === "windows" ? "Windows" : m.origem === "local" ? "" : `WSL ${m.origem.slice(4)}`}</span>
                          {m.claudeAi && <span className={cn("ml-auto rounded px-1.5 text-[10px]", m.conectado ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>claude.ai{m.conectado ? "" : " · precisa de login"}</span>}</span>
                        {m.projeto ? <span className="truncate font-mono text-xs text-muted-foreground">{m.projeto}</span> : m.claudeAi && <span className="truncate font-mono text-xs text-muted-foreground">{m.config.servidor}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              {!/^https?:\/\//i.test(servidor.trim()) && <Field>
                <FieldLabel htmlFor="fonte-env">Variáveis de ambiente</FieldLabel>
                <Textarea id="fonte-env" className="font-mono" rows={3} value={env} onChange={(e) => setEnv(e.target.value)} placeholder="API_TOKEN=..." />
                <FieldDescription>Uma por linha, NOME=valor. Credenciais do servidor (ficam em texto no banco local).</FieldDescription>
              </Field>}
              {proprio && (
                <>
                  <Button variant="outline" size="sm" className="self-start" disabled={ocupado || !servidor.trim()} onClick={() => void descobrir()}>{ocupado ? "Conectando…" : "Conectar"}</Button>
                  {descoberta && (
                    <>
                      <p className="text-sm text-muted-foreground">{PAPEIS.map(([p, r]) => `${r} ${final(p) ?? "—"}`).join(" · ")}</p>
                      <details className="rounded-lg border p-2 text-sm">
                        <summary className="cursor-pointer">Trocar ferramentas</summary>
                        <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-2">
                          {PAPEIS.map(([p, r]) => (
                            <label key={p} className="contents">
                              <span>{r}</span>
                              <select className={SELECT} value={final(p) ?? ""} onChange={(e) => setEscolha({ ...escolha, [p]: e.target.value || undefined })}>
                                <option value="">—</option>
                                {descoberta.tools.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                              </select>
                            </label>
                          ))}
                        </div>
                      </details>
                      {camposDeFiltro(ferramentaLista).length > 0 && (
                        <Field>
                          <FieldLabel>Filtro</FieldLabel>
                          <FieldDescription>Os campos que o servidor aceita, não colunas do board. Vários valores numa busca só: separe por vírgula (ex. projeto: SC, PA2).</FieldDescription>
                          <div className="grid grid-cols-2 gap-2">
                            {camposDeFiltro(ferramentaLista).map((c) => (
                              <Input key={c.nome} aria-label={c.nome} title={c.nome} className="font-mono" value={filtro[c.nome] ?? ""} onChange={(e) => setFiltro({ ...filtro, [c.nome]: e.target.value })} placeholder={c.descricao ? `${c.nome}: ${c.descricao}` : c.nome} />
                            ))}
                          </div>
                          <FieldDescription>Só as tasks que casam com o que você preencher; vazios não vão.</FieldDescription>
                        </Field>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <Field>
                          <FieldLabel htmlFor="fonte-comecar">Ao começar, mover para</FieldLabel>
                          <Input id="fonte-comecar" value={aoComecar} onChange={(e) => setAoComecar(e.target.value)} placeholder="ex.: Fazendo" disabled={!final("mover")} />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="fonte-aceitar">Ao aceitar, mover para</FieldLabel>
                          <Input id="fonte-aceitar" value={aoAceitar} onChange={(e) => setAoAceitar(e.target.value)} placeholder="ex.: Para Teste" disabled={!final("mover")} />
                        </Field>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
          <Field>
            <FieldLabel htmlFor="fonte-pronta">Coluna das tasks prontas</FieldLabel>
            <Input id="fonte-pronta" value={pronta} onChange={(e) => setPronta(e.target.value)} placeholder={COLUNA_PRONTA} />
            <FieldDescription>Tasks com esse status entram marcadas ao criar um projeto.</FieldDescription>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button disabled={ocupado || !rotulo.trim() || (!github && !servidor.trim()) || (proprio && !final("lista"))} onClick={() => void salvar()}>{fonte ? "Salvar" : "Salvar fonte"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function FontesConexoes() {
  const [fontes, setFontes] = useState<Fonte[]>([])
  const [novo, setNovo] = useState<TipoFonte | null>(null)
  const [editando, setEditando] = useState<Fonte | undefined>()
  const [testando, setTestando] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Record<string, { ok: boolean; texto: string }>>({})
  const recarregar = useCallback(() => void window.fma.fontes.listar().then(setFontes), [])
  useEffect(recarregar, [recarregar])

  async function testar(f: Fonte) {
    setTestando(f.id)
    const r = await window.fma.fontes.testar(f.id)
    setTestando(null)
    setResultado((x) => ({ ...x, [f.id]: r.ok ? { ok: true, texto: r.valor } : { ok: false, texto: r.erro } }))
  }
  async function remover(f: Fonte) {
    await window.fma.fontes.remover(f.id)
    toast("Fonte removida", { description: "Os projetos que vieram dela continuam como estão." })
    recarregar()
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl">Fontes de tasks</h2>
        <p className="text-sm text-muted-foreground">De onde vêm as tasks. Ao criar um projeto, você escolhe uma fonte, o projeto dela e as tasks que viram tasks prontas.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {TIPOS_FONTE.map((tipo) => {
          const info = FONTES[tipo]
          const minhas = fontes.filter((f) => f.tipo === tipo)
          return (
            <div key={tipo} className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4", !minhas.length && "border-dashed bg-card/40")}>
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted"><Plug className="size-5" /></span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="text-sm">{info.nome}</b>
                  <span className="text-xs text-muted-foreground">{info.desc}</span>
                </span>
                {info.emBreve
                  ? <Badge variant="outline">Em breve</Badge>
                  : <Button size="sm" variant="outline" onClick={() => { setEditando(undefined); setNovo(tipo) }}><Plus data-icon="inline-start" />Conectar</Button>}
              </div>
              {minhas.map((f) => (
                <div key={f.id} className="flex flex-col gap-1 rounded-lg border bg-background/40 p-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{f.rotulo}</span>
                    <Button size="xs" variant="ghost" onClick={() => { setEditando(f); setNovo(f.tipo) }}>Editar</Button>
                    <Button size="xs" variant="outline" disabled={testando === f.id} onClick={() => void testar(f)}>{testando === f.id ? "Testando…" : "Testar"}</Button>
                    <Button size="icon-xs" variant="ghost" aria-label={`Remover ${f.rotulo}`} onClick={() => void remover(f)}><Trash2 /></Button>
                  </div>
                  {resultado[f.id] && (
                    <p className={cn("flex items-start gap-1.5 text-xs", resultado[f.id].ok ? "text-success" : "text-destructive")}>
                      {resultado[f.id].ok && <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />}{resultado[f.id].texto}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <FormularioFonte tipo={novo} fonte={editando} aoFechar={() => { setNovo(null); setEditando(undefined) }} aoSalvar={recarregar} />
    </section>
  )
}
