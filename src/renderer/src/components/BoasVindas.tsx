/** Boas-vindas do primeiro acesso (T01, RF 2.21 e 2.22): os três passos e a criação do primeiro projeto. */
import { Hammer, LayoutGrid, Radar } from "lucide-react"
import { Button } from "@/components/ui/button"

const PASSOS = [
  { I: Hammer, titulo: "1. Forje", texto: "Crie as cartas do seu time: Orquestrador, Análise, Desenvolvimento, Revisor e as outras. Cada uma usa a CLI e o modelo que você escolher." },
  { I: LayoutGrid, titulo: "2. Monte a mesa", texto: "Aponte um repositório git, ponha as cartas na mesa e ligue uma na outra: Entrega passa o trabalho, Questiona devolve para ajustar." },
  { I: Radar, titulo: "3. Acompanhe", texto: "Peça uma task e veja cada carta trabalhar. Quando precisar de você, o FMA avisa." },
]

export function BoasVindas({ aoCriar, aoPular }: { aoCriar: () => void; aoPular: () => void }) {
  return (
    <div className="grid h-full place-items-center overflow-y-auto px-8 py-10">
      <div className="flex w-full max-w-[880px] flex-col items-center gap-8 text-center">
        <div>
          <h1 className="font-display text-3xl">Bem-vindo à mesa</h1>
          <p className="mt-2 text-muted-foreground">Um time de agentes de IA, cada um na sua carta, trabalhando no seu repositório.</p>
        </div>
        <div className="grid w-full gap-4 sm:grid-cols-3">
          {PASSOS.map(({ I, titulo, texto }) => (
            <div key={titulo} className="flex flex-col items-center gap-2 rounded-xl border bg-card p-5">
              <I className="size-7 text-primary" />
              <h2 className="font-display text-base">{titulo}</h2>
              <p className="text-sm text-muted-foreground">{texto}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <Button size="lg" className="font-display" onClick={aoCriar}>Criar o primeiro projeto</Button>
          <Button size="lg" variant="ghost" onClick={aoPular}>Agora não</Button>
        </div>
      </div>
    </div>
  )
}
