/**
 * Botões da janela no lugar da barra nativa (Windows e Linux): minimizar, maximizar/restaurar e fechar,
 * na altura toda do cabeçalho, no visual do FMA. No macOS não aparece: lá ficam os semáforos nativos.
 */
import { useEffect, useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Ícones finos (1px), do mesmo traço dos do Windows, desenhados para combinar com o tema. */
const Minimizar = () => <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor" /></svg>
const Maximizar = () => <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" /></svg>
const Restaurar = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
    <rect x="0.5" y="2.5" width="7" height="7" rx="1.5" />
    <path d="M2.5 2.5V2a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 9.5 2v4A1.5 1.5 0 0 1 8 7.5h-.5" />
  </svg>
)
const Fechar = () => <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" /></svg>

function Botao({ rotulo, onClick, perigo, children }: { rotulo: string; onClick: () => void; perigo?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={rotulo} onClick={onClick}
          className={cn("flex h-full w-12 items-center justify-center text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            perigo ? "hover:bg-destructive hover:text-white" : "hover:bg-muted hover:text-foreground")}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{rotulo}</TooltipContent>
    </Tooltip>
  )
}

export function ControlesJanela() {
  const [maximizada, setMaximizada] = useState(false)
  useEffect(() => {
    void window.fma.janela.maximizada().then(setMaximizada)
    return window.fma.janela.aoMaximizar(setMaximizada)
  }, [])
  if (window.fma.plataforma === "darwin") return null
  return (
    <div className="flex h-full self-stretch border-l" data-sem-arrasto>
      <Botao rotulo="Minimizar" onClick={() => window.fma.janela.acao("minimizar")}><Minimizar /></Botao>
      <Botao rotulo={maximizada ? "Restaurar" : "Maximizar"} onClick={() => window.fma.janela.acao("maximizar")}>{maximizada ? <Restaurar /> : <Maximizar />}</Botao>
      <Botao rotulo="Fechar" perigo onClick={() => window.fma.janela.acao("fechar")}><Fechar /></Botao>
    </div>
  )
}
