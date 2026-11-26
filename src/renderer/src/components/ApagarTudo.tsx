/** Apagar tudo e começar do zero (RF 2.23): confirmação forte, só libera o botão depois de digitar APAGAR. */
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function ApagarTudo({ aberto, aoMudar }: { aberto: boolean; aoMudar: (a: boolean) => void }) {
  const [texto, setTexto] = useState("")
  const [apagando, setApagando] = useState(false)

  async function apagar() {
    setApagando(true)
    const r = await window.fma.geral.apagarTudo()
    setApagando(false)
    if (!r.ok) return toast.error(r.erro)
    window.location.reload() // zera o estado em memória e mostra as boas-vindas de novo
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { setTexto(""); aoMudar(o) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apagar tudo e começar do zero?</DialogTitle>
          <DialogDescription>
            Isso para as tasks em andamento e apaga todas as cartas, projetos, mesas e tasks. Os repositórios e as branches no disco não são tocados. Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite APAGAR para confirmar" aria-label="Confirmação" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => aoMudar(false)}>Cancelar</Button>
          <Button variant="destructive" disabled={texto !== "APAGAR" || apagando} onClick={() => void apagar()}>Apagar tudo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
