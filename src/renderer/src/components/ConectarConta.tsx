/** "Conectar conta": pede um nome e abre o terminal com o login da CLI (mesmo fluxo de Conexões). No Windows com WSL, escolhe onde. */
import { useEffect, useState } from "react"
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react"
import { toast } from "sonner"
import { CLIS, type CliId } from "@shared/ia"
import type { Conta, StatusLogin } from "@shared/conta"
import { LOCAL, rotuloAmbiente } from "@shared/ambiente"
import { conectarConta, useContas, usarConfigPadrao } from "@/data/contas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { classeSelect } from "./NovoProjeto"

export function ConectarConta({ cli, ambiente, aoFechar, aoConectar }: { cli: CliId | null; ambiente?: string; aoFechar: () => void; aoConectar?: (conta: Conta) => void }) {
  const [nome, setNome] = useState("")
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const { ambientes } = useContas()
  const info = CLIS.find((c) => c.id === cli)
  const amb = escolhido ?? ambiente ?? LOCAL
  const wsl = amb !== LOCAL
  const fechar = () => { setNome(""); setEscolhido(null); setExistente(undefined); aoFechar() }
  // Login que a CLI já tem neste ambiente (config padrão), conferido de verdade antes de oferecer "usar este login".
  const [existente, setExistente] = useState<StatusLogin | null | undefined>(undefined)
  useEffect(() => {
    if (!cli) return
    setExistente(null)
    void window.fma.contas.statusPadrao(cli, amb).then((s) => { setExistente(s); if (s.email) setNome((n) => n || s.email!) })
  }, [cli, amb])
  const enviar = async (existente: boolean) => {
    setOcupado(true)
    const r = await (existente ? usarConfigPadrao : conectarConta)(cli!, nome.trim() || info!.nome, amb)
    setOcupado(false)
    if (!r.ok) return void toast.error(r.erro)
    toast.success(existente ? "Conta registrada" : "Terminal aberto", { description: existente ? nome : `Faça o login da ${info?.curto} na janela que abriu.` })
    aoConectar?.(r.valor)
    fechar()
  }
  return (
    <Dialog open={!!cli} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar {info?.nome}</DialogTitle>
          <DialogDescription>{wsl ? `O FMA guarda a conta numa pasta própria dentro do ${rotuloAmbiente(amb, "win32").replace("WSL · ", "WSL (")}) e abre um terminal com o login da ${info?.curto} lá.` : `O FMA guarda a conta numa pasta própria e abre um terminal com o login da ${info?.curto}.`} Entre lá com a conta que quiser usar.</DialogDescription>
        </DialogHeader>
        {ambientes.length > 1 && (
          <Field>
            <FieldLabel htmlFor="conta-amb">Ambiente</FieldLabel>
            <select id="conta-amb" className={classeSelect} value={amb} onChange={(e) => setEscolhido(e.target.value)}>
              {ambientes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            <FieldDescription>Onde a CLI roda. Projetos no WSL usam as contas do WSL.</FieldDescription>
          </Field>
        )}
        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          {existente === null || existente === undefined ? <><LoaderCircle className="mt-0.5 size-4 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Procurando um login da {info?.curto} neste ambiente…</span></>
            : existente.logado ? <><CircleCheck className="mt-0.5 size-4 text-success" /><span>Login encontrado{existente.email ? <>: <b>{existente.email}</b></> : ""}{existente.detalhe && existente.detalhe !== existente.email ? <span className="text-muted-foreground"> · {existente.detalhe}</span> : null}. Dá para usar direto.</span></>
            : <><CircleX className="mt-0.5 size-4 text-muted-foreground" /><span className="text-muted-foreground">Nenhum login da {info?.curto} neste ambiente. Use "Abrir login" para entrar.</span></>}
        </div>
        <Field>
          <FieldLabel htmlFor="conta-nome">Nome da conta</FieldLabel>
          <Input id="conta-nome" autoFocus value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} placeholder="voce@empresa.com.br" />
          <FieldDescription>Só um rótulo para você reconhecer a conta.</FieldDescription>
        </Field>
        <DialogFooter className="sm:justify-between">
          <Button variant={existente?.logado ? "default" : "ghost"} disabled={!existente?.logado || ocupado} onClick={() => enviar(true)}>Usar este login</Button>
          <span className="flex gap-2"><Button variant="ghost" onClick={fechar}>Cancelar</Button><Button variant={existente?.logado ? "outline" : "default"} disabled={ocupado} onClick={() => enviar(false)}>{existente?.logado ? "Entrar com outra conta" : "Abrir login"}</Button></span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
