/**
 * Monitores do projeto (T07, RF 5.01 a 5.22): lista, editor e as ações de cada monitor
 * (buscar agora, pausar, excluir). A busca e a escrita de volta no board são do núcleo.
 */
import { useEffect, useState } from "react"
import { Plug, Plus, RefreshCw, Radar, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { Monitor } from "@shared/monitor"
import { INTERVALO_MIN_PADRAO } from "@shared/monitor"
import type { Fonte, ProjetoDaFonte } from "@shared/fonte"
import { FONTES, type TipoFonte } from "@shared/fonte"
import type { Projeto } from "@shared/projeto"
import type { Carta } from "@shared/tipos"
import { FormularioFonte } from "@/components/FontesConexoes"
import { useCartas } from "@/data/cartas"
import { ok } from "@/data/tasks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

const VAZIO = { nome: "", conector: "", consulta: "", intervaloMin: INTERVALO_MIN_PADRAO, inicioAutomatico: false, cartaInicialId: null as string | null, colunaInicio: "", colunaConclusao: "", colunaTrava: "", comentarAoTravar: false, colunaRetomada: "" }
type Form = typeof VAZIO

const quando = (t: number | null) => (t ? new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca")

function EditorMonitor({ projeto, monitor, conectores, fontes, naMesa, aoFechar, aoSalvo, recarregarFontes }: {
  projeto: Projeto; monitor: Monitor | "novo" | null; conectores: { id: string; nome: string }[]; fontes: Fonte[]; naMesa: Carta[]; aoFechar: () => void; aoSalvo: () => void; recarregarFontes: () => void
}) {
  const [f, setF] = useState<Form>(VAZIO)
  const [tiposAbertos, setTiposAbertos] = useState(false)
  const [conectar, setConectar] = useState<TipoFonte | null>(null)
  const [projetos, setProjetos] = useState<ProjetoDaFonte[] | null>(null)
  const [erroProj, setErroProj] = useState<string | null>(null)
  // Fonte MCP escolhida como conector ("fonte:<id>"). Fonte MCP: a consulta é só a coluna (o filtro da fonte já recorta); com projetos, é "projeto:coluna"; sem, só a coluna.
  const fonte = fontes.find((x) => `fonte:${x.id}` === f.conector)
  const comProjetos = !!fonte && fonte.tipo !== "mcp"
  useEffect(() => {
    setProjetos(null); setErroProj(null)
    if (!fonte || !comProjetos) return
    let vivo = true
    void window.fma.fontes.projetos(fonte.id).then((r) => { if (vivo) r.ok ? setProjetos(r.valor) : setErroProj(r.erro) })
    return () => { vivo = false }
  }, [fonte?.id, comProjetos])
  useEffect(() => {
    if (monitor === "novo") setF({ ...VAZIO, conector: conectores[0]?.id ?? "" })
    else if (monitor) setF({ nome: monitor.nome, conector: monitor.conector, consulta: monitor.consulta, intervaloMin: monitor.intervaloMin, inicioAutomatico: monitor.inicioAutomatico, cartaInicialId: monitor.cartaInicialId, colunaInicio: monitor.colunaInicio, colunaConclusao: monitor.colunaConclusao, colunaTrava: monitor.colunaTrava, comentarAoTravar: monitor.comentarAoTravar, colunaRetomada: monitor.colunaRetomada })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitor, conectores[0]?.id]) // não reseta o form quando só chega uma fonte nova
  if (!monitor) return null
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const texto = (k: "colunaInicio" | "colunaConclusao" | "colunaTrava" | "colunaRetomada", id: string, rotulo: string, dica: string) => (
    <Field>
      <FieldLabel htmlFor={id}>{rotulo}</FieldLabel>
      <Input id={id} value={f[k]} maxLength={60} placeholder="(não mexer)" onChange={(e) => set(k, e.target.value)} />
      <FieldDescription>{dica}</FieldDescription>
    </Field>
  )

  async function salvar() {
    const r = monitor === "novo" ? await window.fma.monitores.criar({ projetoId: projeto.id, ...f }) : await window.fma.monitores.atualizar(monitor!.id, f)
    const salvo = ok(r)
    if (!salvo) return
    aoSalvo(); aoFechar()
    if (monitor === "novo") { // não espera o intervalo: busca já e diz o que achou
      const b = await window.fma.monitores.buscarAgora(salvo.id)
      if (b.ok) toast.info("Monitor buscou no board", { description: b.valor.ultimoResultado || "Sem resultado." })
      aoSalvo()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display">{monitor === "novo" ? "Novo monitor" : "Editar monitor"}</DialogTitle>
          <DialogDescription>Busca cards no board e cria uma task para cada um, com o time da mesa de {projeto.nome}.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="mo-nome">Nome</FieldLabel>
            <Input id="mo-nome" autoFocus value={f.nome} maxLength={80} onChange={(e) => set("nome", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mo-con">Conector do board</FieldLabel>
            <div className="flex items-center gap-2">
              <select id="mo-con" value={f.conector} onChange={(e) => set("conector", e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm">
                {conectores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              {!tiposAbertos
                ? <Button type="button" variant="outline" size="sm" onClick={() => setTiposAbertos(true)}><Plug data-icon="inline-start" />Conectar fonte</Button>
                : <span className="flex gap-1">
                    <Button type="button" size="xs" variant="outline" onClick={() => setConectar("mcp")}>{FONTES.mcp.nome}</Button>
                    <Button type="button" size="xs" variant="ghost" onClick={() => setTiposAbertos(false)}>Cancelar</Button>
                  </span>}
            </div>
            <FormularioFonte tipo={conectar} aoFechar={() => { setConectar(null); setTiposAbertos(false) }} aoSalvar={(nova) => { recarregarFontes(); if (nova) setF((x) => ({ ...x, conector: `fonte:${nova.id}`, nome: x.nome || nova.rotulo })) }} />
          </Field>
          {comProjetos && (
            <Field>
              <FieldLabel htmlFor="mo-proj">Projeto da fonte</FieldLabel>
              <select id="mo-proj" value={f.consulta.split(":")[0]} onChange={(e) => set("consulta", `${e.target.value}:${f.consulta.slice(f.consulta.indexOf(":") + 1 || f.consulta.length)}`)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">{erroProj ? "Não deu para listar" : projetos ? "Escolha o projeto" : "Buscando projetos…"}</option>
                {projetos?.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
              </select>
              {erroProj && <FieldDescription className="text-destructive">{erroProj}</FieldDescription>}
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="mo-q">{fonte ? "Coluna ou status (opcional)" : "Consulta"}</FieldLabel>
            <Input id="mo-q" value={fonte && comProjetos ? f.consulta.slice(f.consulta.indexOf(":") + 1 || f.consulta.length) : f.consulta} className={fonte ? "" : "font-mono"} placeholder={fonte ? "Vazio: todas as abertas. Várias: A Fazer, Rejeitado" : "acme/3:Pronto para desenvolver"}
              onChange={(e) => set("consulta", comProjetos ? `${f.consulta.split(":")[0]}:${e.target.value}` : e.target.value)} />
            <FieldDescription>{fonte ? `Traz as tasks abertas de ${fonte.rotulo} (com o filtro da fonte) que estão nessa coluna. Vazio: todas as abertas.` : "GitHub Projects: dono/número do projeto:coluna. Usa o gh instalado e logado (com o escopo project)."}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="mo-int">Intervalo (minutos)</FieldLabel>
            <Input id="mo-int" type="number" min={1} max={1440} value={f.intervaloMin} className="w-28" onChange={(e) => set("intervaloMin", Number(e.target.value))} />
          </Field>
          <Field orientation="horizontal">
            <Switch id="mo-auto" checked={f.inicioAutomatico} onCheckedChange={(v) => set("inicioAutomatico", v)} />
            <FieldLabel htmlFor="mo-auto">Iniciar as tasks assim que chegam</FieldLabel>
          </Field>
          <Field>
            <FieldLabel htmlFor="mo-carta">Carta por onde as tasks começam</FieldLabel>
            <select id="mo-carta" value={f.cartaInicialId ?? ""} onChange={(e) => set("cartaInicialId", e.target.value || null)} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">O começo natural do fluxo</option>
              {naMesa.filter((c) => c.classe !== "orquestrador").map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <details className="rounded-md border px-3 py-2 text-sm" open={!fonte}>
          <summary className="cursor-pointer select-none text-muted-foreground">{fonte ? "Mais opções (as colunas de começar e aceitar já vêm da fonte)" : "Colunas do board"}</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {texto("colunaInicio", "mo-ci", "Coluna ao começar", "Para onde o card vai quando a task começa.")}
            {texto("colunaConclusao", "mo-cc", "Coluna ao concluir", "Para onde vai quando a task termina.")}
            {texto("colunaTrava", "mo-ct", "Coluna ao travar", "Quando a task espera uma decisão.")}
            {texto("colunaRetomada", "mo-cr", "Coluna de retomada", "Se o card voltar para cá, a task retoma com a resposta deixada nele.")}
          </div>
          <Field orientation="horizontal">
            <Switch id="mo-com" checked={f.comentarAoTravar} onCheckedChange={(v) => set("comentarAoTravar", v)} />
            <FieldLabel htmlFor="mo-com">Comentar a dúvida no card quando a task trava</FieldLabel>
          </Field>
          </details>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={() => void salvar()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Monitores({ projeto, monitores, recarregar }: { projeto: Projeto; monitores: Monitor[]; recarregar: () => Promise<void> }) {
  const { cartas } = useCartas()
  const [conectores, setConectores] = useState<{ id: string; nome: string }[]>([])
  const [naMesa, setNaMesa] = useState<Carta[]>([])
  const [fontes, setFontes] = useState<Fonte[]>([])
  const [editando, setEditando] = useState<Monitor | "novo" | null>(null)
  const [excluindo, setExcluindo] = useState<Monitor | null>(null)
  const [buscando, setBuscando] = useState<string | null>(null)

  const recarregarFontes = () => { void window.fma.monitores.conectores().then(setConectores); void window.fma.fontes.listar().then(setFontes) }
  useEffect(recarregarFontes, [])
  useEffect(() => {
    void window.fma.mesa.carregar(projeto.id).then((m) => setNaMesa(cartas.filter((c) => m.cartas.some((x) => x.cartaId === c.id))))
  }, [projeto.id, cartas])

  async function buscar(m: Monitor) {
    setBuscando(m.id)
    const r = ok(await window.fma.monitores.buscarAgora(m.id))
    setBuscando(null)
    if (r) toast(r.ultimoResultado || "Busca concluída.")
    void recarregar()
  }
  async function pausar(m: Monitor, ativo: boolean) {
    ok(await window.fma.monitores.atualizar(m.id, { ativo }))
    void recarregar()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[900px] flex-col gap-5 px-8 py-6">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <h2 className="font-display text-xl">Monitores</h2>
            <p className="text-sm text-muted-foreground">Cada card do board vira uma task, uma vez só. Pausado, o monitor só busca quando você pede.</p>
          </div>
          <Button onClick={() => setEditando("novo")}><Plus data-icon="inline-start" />Novo monitor</Button>
        </div>

        {monitores.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Radar /></EmptyMedia>
              <EmptyTitle>Nenhum monitor</EmptyTitle>
              <EmptyDescription>Um monitor lê um board (GitHub Projects ou uma fonte MCP) e abre as tasks do time da mesa sozinho.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent><Button onClick={() => setEditando("novo")}><Plus data-icon="inline-start" />Criar monitor</Button></EmptyContent>
          </Empty>
        ) : monitores.map((m) => (
          <article key={m.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <span className={cn("size-2.5 rounded-full", m.ativo ? "animate-pulse bg-success" : "bg-muted-foreground/50")} aria-hidden />
              <h3 className="font-display text-base">{m.nome}</h3>
              <Badge variant="outline">{m.ativo ? "Ativo" : "Pausado"}</Badge>
              {m.inicioAutomatico && <Badge variant="secondary">Inicia sozinho</Badge>}
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {m.ativo ? "Ativo" : "Pausado"}<Switch checked={m.ativo} onCheckedChange={(v) => void pausar(m, v)} aria-label={m.ativo ? "Pausar o monitor" : "Ativar o monitor"} />
              </span>
            </div>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{conectores.find((c) => c.id === m.conector)?.nome ?? m.conector}</span>
              <span className="font-mono text-foreground">{m.consulta}</span>
              <span>a cada {m.intervaloMin} min</span>
              <span className="tabular">{m.totalCriadas} {m.totalCriadas === 1 ? "task criada" : "tasks criadas"}</span>
              {m.cartaInicialId && <span>começa por {cartas.find((c) => c.id === m.cartaInicialId)?.nome ?? "carta removida"}</span>}
            </p>
            <p className="text-xs text-muted-foreground">Última checagem: {quando(m.ultimaChecagem)}{m.ultimoResultado && <> · <span className="text-foreground">{m.ultimoResultado}</span></>}{m.ativo && m.proximaChecagem && <> · próxima {quando(m.proximaChecagem)}</>}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={buscando === m.id} onClick={() => void buscar(m)}><RefreshCw data-icon="inline-start" className={cn(buscando === m.id && "animate-spin")} />Buscar agora</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditando(m)}><Pencil data-icon="inline-start" />Editar</Button>
              <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => setExcluindo(m)}><Trash2 data-icon="inline-start" />Excluir</Button>
            </div>
          </article>
        ))}
      </div>

      <EditorMonitor projeto={projeto} monitor={editando} conectores={conectores} fontes={fontes} recarregarFontes={recarregarFontes} naMesa={naMesa} aoFechar={() => setEditando(null)} aoSalvo={() => void recarregar()} />
      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o monitor {excluindo?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>As {excluindo?.totalCriadas ?? 0} tasks que ele criou continuam no projeto.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (excluindo) { ok(await window.fma.monitores.excluir(excluindo.id)); setExcluindo(null); void recarregar() } }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
