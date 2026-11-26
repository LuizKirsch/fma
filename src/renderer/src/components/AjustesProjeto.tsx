/**
 * Ajustes do projeto (T11) e editar/excluir (T20): nome, repositório e branch base, vagas,
 * limite de devoluções e limite de tokens por task (RF 2.10, 2.12 a 2.14, 2.24 a 2.26).
 */
import { useEffect, useState } from "react"
import { FolderOpen, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { LIMITES_PROJETO, validarAjustes, type AjustesProjeto as Ajustes, type Projeto, type Repositorio } from "@shared/projeto"
import { atualizarProjeto, excluirProjeto } from "@/data/projetos"
import { classeSelect } from "./NovoProjeto"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"

const doProjeto = (p: Projeto): Ajustes => ({ nome: p.nome, repositorio: p.repositorio, branchBase: p.branchBase, vagas: p.vagas, limiteDevolucoes: p.limiteDevolucoes, limiteTokens: p.limiteTokens, comandos: p.comandos, pastasCompartilhadas: p.pastasCompartilhadas })

export function AjustesProjeto({ projeto, aoFechar }: { projeto: Projeto | null; aoFechar: () => void }) {
  const [a, setA] = useState<Ajustes | null>(null)
  const [repo, setRepo] = useState<Repositorio | null>(null)
  const [erroRepo, setErroRepo] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<{ tasks: number } | null>(null)

  useEffect(() => {
    setExcluindo(null); setErroRepo(null); setRepo(null)
    setA(projeto && doProjeto(projeto))
    // Lista as branches do repositório atual para a troca da branch base.
    if (projeto) void window.fma.projetos.inspecionarRepositorio(projeto.repositorio, projeto.ambiente).then((r) => r.ok ? setRepo(r.valor) : setErroRepo(r.erro))
  }, [projeto])

  if (!projeto || !a) return null
  const muda = (p: Partial<Ajustes>) => setA({ ...a, ...p })
  const numero = (k: "vagas" | "limiteDevolucoes" | "limiteTokens") => (
    <Input type="number" id={`aj-${k}`} value={Number.isNaN(a[k]) ? "" : a[k]} min={LIMITES_PROJETO[k].min} max={LIMITES_PROJETO[k].max}
      step={k === "limiteTokens" ? 1000 : 1} onChange={(e) => muda({ [k]: e.target.valueAsNumber })} />
  )

  async function conferir(caminho: string) {
    const r = await window.fma.projetos.inspecionarRepositorio(caminho, projeto!.ambiente)
    if (r.ok && r.valor.ambiente !== projeto!.ambiente) { setRepo(null); setErroRepo("Essa pasta está em outro ambiente. Para trocar de ambiente, crie outro projeto.") }
    else if (r.ok) { setRepo(r.valor); setErroRepo(null); setA((x) => x && { ...x, repositorio: r.valor.raiz, branchBase: r.valor.branches.includes(x.branchBase) ? x.branchBase : r.valor.atual }) }
    else { setRepo(null); setErroRepo(r.erro) }
  }
  async function escolher() {
    const p = await window.fma.projetos.escolherPasta(projeto!.ambiente)
    if (p) { muda({ repositorio: p }); await conferir(p) }
  }
  async function salvar() {
    const r = await atualizarProjeto(projeto!.id, a!)
    if (!r.ok) return toast.error(r.erro)
    void window.fma.tasks.andarFila(projeto!.id) // RF 6.15: vagas novas começam a fila
    toast.success("Ajustes salvos")
    aoFechar()
  }
  async function confirmarExclusao() {
    const r = await excluirProjeto(projeto!.id)
    if (r.ok) toast(`Projeto "${projeto!.nome}" excluído`)
    else toast.error(r.erro)
    setExcluindo(null)
    aoFechar()
  }

  const invalido = validarAjustes(a)
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && aoFechar()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Ajustes do projeto</DialogTitle>
            <DialogDescription>Renomear o projeto muda o nome também nas tasks do histórico.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="aj-nome">Nome</FieldLabel>
              <Input id="aj-nome" value={a.nome} maxLength={80} onChange={(e) => muda({ nome: e.target.value })} />
            </Field>
            <Field data-invalid={!!erroRepo}>
              <FieldLabel htmlFor="aj-repo">Pasta do repositório</FieldLabel>
              <div className="flex gap-2">
                <Input id="aj-repo" className="font-mono" value={a.repositorio} aria-invalid={!!erroRepo} onChange={(e) => muda({ repositorio: e.target.value })} onBlur={() => a.repositorio !== projeto.repositorio && void conferir(a.repositorio)} />
                <Button type="button" variant="outline" onClick={() => void escolher()}><FolderOpen data-icon="inline-start" />Escolher</Button>
              </div>
              {erroRepo && <FieldError>{erroRepo}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="aj-branch">Branch base</FieldLabel>
              <select id="aj-branch" className={classeSelect} value={a.branchBase} onChange={(e) => muda({ branchBase: e.target.value })}>
                {[...new Set([a.branchBase, ...(repo?.branches ?? [])])].map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel htmlFor="aj-vagas">Vagas</FieldLabel>
                {numero("vagas")}
                <FieldDescription>Tasks ao mesmo tempo. As outras esperam na fila.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="aj-limiteDevolucoes">Devoluções</FieldLabel>
                {numero("limiteDevolucoes")}
                <FieldDescription>Quantas vezes uma carta pode devolver trabalho antes de a task parar.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="aj-limiteTokens">Tokens por task</FieldLabel>
                {numero("limiteTokens")}
                <FieldDescription>Limite de uso de cada task.</FieldDescription>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="aj-comandos">Comandos que as cartas podem rodar</FieldLabel>
              <Textarea id="aj-comandos" rows={5} className="font-mono text-xs" value={a.comandos.join("\n")} onChange={(e) => muda({ comandos: e.target.value.split("\n") })} />
              <FieldDescription>Um por linha; * vale qualquer continuação (ex.: npm *). Rodam sem pedir aprovação, dentro do worktree da task. Qualquer outro comando trava a task e chama você.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="aj-pastas">Pastas ligadas no worktree</FieldLabel>
              <Textarea id="aj-pastas" rows={3} className="font-mono text-xs" value={a.pastasCompartilhadas.join("\n")} onChange={(e) => muda({ pastasCompartilhadas: e.target.value.split("\n") })} />
              <FieldDescription>Pastas que o git não versiona (ex. vendor, node_modules) e que as cartas precisam para rodar testes. O worktree fica em .fma/worktrees dentro do repositório, então um container que monta o repositório também enxerga a task.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => setExcluindo({ tasks: await window.fma.projetos.contarTasks(projeto.id) })}>
              <Trash2 data-icon="inline-start" />Excluir projeto
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
              <Button disabled={!!invalido} title={invalido ?? undefined} onClick={() => void salvar()}>Salvar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{projeto.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Apaga a mesa, as conexões, as cartas de apoio, os monitores, o chat e {excluindo?.tasks ?? 0} {excluindo?.tasks === 1 ? "task" : "tasks"} do histórico, e para as tasks em andamento. As cartas continuam na coleção. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmarExclusao()}>Excluir projeto</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
