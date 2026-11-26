/** Configurações (RF 2.35 e 2.36): rever o tutorial e apagar tudo. A velocidade da simulação do protótipo não entra. */
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"

export function Configuracoes({ aberto, aoMudar, temCartas, reverTutorial, apagarTudo }: {
  aberto: boolean; aoMudar: (a: boolean) => void; temCartas: boolean; reverTutorial: () => void; apagarTudo: () => void
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader><DialogTitle>Configurações</DialogTitle><DialogDescription>Ajustes gerais do FMA.</DialogDescription></DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Tutorial</FieldLabel>
            <FieldDescription>Mostra de novo onde ficam a ficha da carta, as habilidades, as memórias e as Conexões.</FieldDescription>
            <div><Button variant="outline" disabled={!temCartas} onClick={() => { aoMudar(false); reverTutorial() }}>Rever tutorial</Button></div>
          </Field>
          <Field>
            <FieldLabel>Dados</FieldLabel>
            <FieldDescription>Apaga cartas, projetos, mesas e tasks. Os repositórios no disco não são tocados.</FieldDescription>
            <div><Button variant="outline" className="text-destructive" onClick={() => { aoMudar(false); apagarTudo() }}>Apagar tudo e começar do zero</Button></div>
          </Field>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  )
}
