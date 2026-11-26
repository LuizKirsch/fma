/** Mensagens do Maestro não lidas de um projeto (RF 7.04): o núcleo avisa a cada mudança. */
import { useEffect, useState } from "react"

export function useNaoLidas(projetoId: string) {
  const [total, setTotal] = useState(0)
  useEffect(() => {
    void window.fma.maestro.naoLidas(projetoId).then(setTotal)
    return window.fma.maestro.aoEvento((e) => { if (e.tipo === "nao-lidas" && e.projetoId === projetoId) setTotal(e.total) })
  }, [projetoId])
  return total
}
