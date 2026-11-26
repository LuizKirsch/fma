/**
 * Estado dos projetos na interface: a última lista que veio do núcleo e em que projetos cada carta está.
 * A mesa de cada projeto não passa por aqui: quem a mostra carrega e guarda a própria.
 */
import { useSyncExternalStore } from "react"
import type { Projeto, UsoDaCarta } from "@shared/projeto"
import type { Resultado } from "@shared/tipos"

let estado: { projetos: Projeto[]; usos: UsoDaCarta[]; carregado: boolean } = { projetos: [], usos: [], carregado: false }
const ouvintes = new Set<() => void>()

export async function recarregarProjetos() {
  const [projetos, usos] = await Promise.all([window.fma.projetos.listar(), window.fma.projetos.usos()])
  estado = { projetos, usos, carregado: true }
  ouvintes.forEach((f) => f())
}

export function useProjetos() {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); if (!estado.carregado) void recarregarProjetos(); return () => ouvintes.delete(f) },
    () => estado,
  )
}

async function depois<T>(r: Promise<Resultado<T>>): Promise<Resultado<T>> {
  const res = await r
  if (res.ok) await recarregarProjetos()
  return res
}
export const criarProjeto = (...a: Parameters<typeof window.fma.projetos.criar>) => depois(window.fma.projetos.criar(...a))
export const atualizarProjeto = (...a: Parameters<typeof window.fma.projetos.atualizar>) => depois(window.fma.projetos.atualizar(...a))
export const excluirProjeto = (...a: Parameters<typeof window.fma.projetos.excluir>) => depois(window.fma.projetos.excluir(...a))
export async function reordenarProjetos(ids: string[]) {
  await window.fma.projetos.reordenar(ids)
  await recarregarProjetos()
}
