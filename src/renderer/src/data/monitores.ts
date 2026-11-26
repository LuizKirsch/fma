/** Monitores de um projeto: a lista, relida a cada checagem que o núcleo avisa. */
import { useCallback, useEffect, useState } from "react"
import type { Monitor } from "@shared/monitor"

export function useMonitores(projetoId: string) {
  const [monitores, setMonitores] = useState<Monitor[]>([])
  const recarregar = useCallback(() => window.fma.monitores.listar(projetoId).then(setMonitores), [projetoId])
  useEffect(() => {
    void recarregar()
    return window.fma.monitores.aoEvento(() => void recarregar())
  }, [recarregar])
  return { monitores, recarregar }
}
