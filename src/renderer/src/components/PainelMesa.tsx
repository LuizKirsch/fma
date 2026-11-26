/**
 * Painel lateral da mesa: validação do fluxo (RF 3.21 a 3.23) e lista de conexões (RF 3.25)
 * com a edição de cada uma: tipo, ordem, skills, curva e remoção (RF 3.12 a 3.17).
 */
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, Play, Trash2, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { SKILLS_CONEXAO, type Conexao, type MudancaConexao } from "@shared/mesa"
import type { ResultadoFluxo } from "@shared/fluxo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export function PainelMesa({ extras = [], fluxo, vazia, conexoes, nome, selecionada, aoSelecionar, aoAtualizar, aoOrdem, aoRemover }: {
  fluxo: ResultadoFluxo
  /** Avisos de fora do fluxo (ex.: PR sem a carta Git, RF 3.29). */
  extras?: string[]
  vazia: boolean
  /** Já na ordem de leitura: por posição da carta de origem, tipo e ordem. */
  conexoes: Conexao[]
  nome: (cartaId: string) => string
  selecionada: string | null
  aoSelecionar: (id: string | null) => void
  aoAtualizar: (id: string, m: MudancaConexao) => void
  aoOrdem: (id: string, delta: -1 | 1) => void
  aoRemover: (id: string) => void
}) {
  const irmas = (c: Conexao) => conexoes.filter((o) => o.deCartaId === c.deCartaId && o.tipo === c.tipo)
  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="flex flex-col gap-2">
        <h3 className="font-display text-sm">Fluxo</h3>
        {vazia ? (
          <p className="text-xs text-muted-foreground">A mesa está vazia. Arraste cartas da mão para montar o fluxo.</p>
        ) : fluxo.erros.length ? (
          <p className="flex items-center gap-1.5 text-sm text-destructive"><CircleAlert className="size-4" />Fluxo com erro: nenhuma task começa.</p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-success"><CircleCheck className="size-4" />Fluxo válido.</p>
        )}
        {fluxo.comeco.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Play className="size-3.5 text-primary" />Começa por:
            {fluxo.comeco.map((id) => <Badge key={id} variant="secondary">{nome(id)}</Badge>)}
          </p>
        )}
        {fluxo.erros.map((e) => <p key={e.codigo} className="flex gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{e.mensagem}</p>)}
        {extras.map((a) => <p key={a} className="flex gap-1.5 rounded-md bg-warning/10 p-2 text-xs text-warning"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{a}</p>)}
        {fluxo.avisos.map((a, i) => <p key={a.codigo + i} className="flex gap-1.5 rounded-md bg-warning/10 p-2 text-xs text-warning"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{a.mensagem}</p>)}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-display text-sm">Conexões <span className="text-muted-foreground tabular">{conexoes.length}</span></h3>
        {conexoes.length === 0 && <p className="text-xs text-muted-foreground">Puxe o conector dourado de uma carta até outra para ligá-las.</p>}
        <ul className="flex flex-col gap-1.5">
          {conexoes.map((c) => {
            const aberta = c.id === selecionada, grupo = irmas(c)
            const skills = SKILLS_CONEXAO.filter((s) => s.tipo === c.tipo)
            return (
              <li key={c.id} className={cn("rounded-lg border bg-card/60", aberta && "border-primary/60 bg-card")}>
                <button className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs" onClick={() => aoSelecionar(aberta ? null : c.id)} aria-expanded={aberta}>
                  <span className="min-w-0 flex-1 truncate"><b>{nome(c.deCartaId)}</b> → <b>{nome(c.paraCartaId)}</b></span>
                  <Badge variant={c.tipo === "entrega" ? "default" : "outline"} className={c.tipo === "questiona" ? "border-warning text-warning" : undefined}>{c.tipo === "entrega" ? "Entrega" : "Questiona"}</Badge>
                  {grupo.length > 1 && <span className="font-mono text-muted-foreground">#{c.ordem + 1}</span>}
                </button>
                {aberta && (
                  <div className="flex flex-col gap-3 border-t p-2.5">
                    <ToggleGroup type="single" variant="outline" size="sm" value={c.tipo} onValueChange={(v) => v && v !== c.tipo && aoAtualizar(c.id, { tipo: v as Conexao["tipo"] })} className="w-full">
                      <ToggleGroupItem value="entrega" className="flex-1">Entrega</ToggleGroupItem>
                      <ToggleGroupItem value="questiona" className="flex-1">Questiona</ToggleGroupItem>
                    </ToggleGroup>
                    <p className="text-[11px] text-muted-foreground">{c.tipo === "entrega" ? "Passa o trabalho adiante." : "Uma carta pergunta à outra e pode devolver o trabalho."}</p>
                    {grupo.length > 1 && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">Ordem {c.ordem + 1} de {grupo.length}</span>
                        <Button size="icon-xs" variant="outline" aria-label="Subir" disabled={c.ordem === 0} onClick={() => aoOrdem(c.id, -1)}><ArrowUp /></Button>
                        <Button size="icon-xs" variant="outline" aria-label="Descer" disabled={c.ordem === grupo.length - 1} onClick={() => aoOrdem(c.id, 1)}><ArrowDown /></Button>
                      </div>
                    )}
                    <fieldset className="flex flex-col gap-1">
                      <legend className="mb-1 text-[11px] font-medium text-muted-foreground">{c.tipo === "questiona" ? "Perguntas" : "Cuidados na entrega"}</legend>
                      {skills.map((s) => (
                        <label key={s.chave} className="flex cursor-pointer items-start gap-2 text-xs">
                          <input type="checkbox" className="mt-0.5 accent-[var(--primary)]" checked={c.skills.includes(s.chave)}
                            onChange={(e) => aoAtualizar(c.id, { skills: e.target.checked ? [...c.skills, s.chave] : c.skills.filter((k) => k !== s.chave) })} />
                          <span><b className="font-medium">{s.nome}</b><br /><span className="text-muted-foreground">{s.descricao}</span></span>
                        </label>
                      ))}
                    </fieldset>
                    <div className="flex justify-between">
                      <Button size="xs" variant="ghost" disabled={c.curvaX === null} onClick={() => aoAtualizar(c.id, { curva: null })}>Endireitar linha</Button>
                      <Button size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => aoRemover(c.id)}><Trash2 data-icon="inline-start" />Remover</Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
