/** Cartas de apoio na interface: o catálogo (fixo) e as cartas de um projeto, relidas depois de cada mudança. */
import { useCallback, useEffect, useState } from "react"
import type { Artefato, CartaApoio, TipoApoio } from "@shared/apoio"

let catalogo: TipoApoio[] = []
export const tipoDe = (chave: string) => catalogo.find((t) => t.chave === chave)

export function useApoio(projetoId: string) {
  const [cartas, setCartas] = useState<CartaApoio[]>([])
  const [tipos, setTipos] = useState<TipoApoio[]>(catalogo)
  const recarregar = useCallback(() => window.fma.apoio.listar(projetoId).then(setCartas), [projetoId])
  useEffect(() => {
    void recarregar()
    if (!catalogo.length) void window.fma.apoio.catalogo().then((t) => { catalogo = t; setTipos(t) })
  }, [recarregar])
  return { cartas, tipos, setCartas, recarregar }
}

/** Escritas e artefatos da task; relê quando o núcleo avisa de uma escrita pendente ou resolvida. */
export function useApoioDaTask(taskId: string) {
  const [dados, setDados] = useState<{ artefatos: Artefato[]; desligadas: string[]; usadas: string[] } | null>(null)
  const recarregar = useCallback(() => window.fma.apoio.daTask(taskId).then(setDados), [taskId])
  useEffect(() => {
    void recarregar()
    return window.fma.apoio.aoEvento((e) => { if (e.artefato.taskId === taskId) void recarregar() })
  }, [taskId, recarregar])
  return { dados, recarregar }
}
