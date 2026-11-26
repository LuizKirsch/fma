/** Estado da biblioteca (habilidades e memórias) e da Loja na interface; a fonte de verdade é o banco no núcleo. */
import { useSyncExternalStore } from "react"
import type { AgenteLoja, ItemBiblioteca, NovoItem } from "@shared/biblioteca"
import type { Resultado } from "@shared/tipos"
import { recarregarCartas } from "@/data/cartas"

let estado: { itens: ItemBiblioteca[]; loja: AgenteLoja[]; carregado: boolean } = { itens: [], loja: [], carregado: false }
const ouvintes = new Set<() => void>()

export async function recarregarBiblioteca() {
  const [itens, loja] = await Promise.all([window.fma.biblioteca.itens(), window.fma.biblioteca.loja()])
  estado = { itens, loja, carregado: true }
  ouvintes.forEach((f) => f())
}

export function useBiblioteca() {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); if (!estado.carregado) void recarregarBiblioteca(); return () => ouvintes.delete(f) },
    () => estado,
  )
}

export const criarItem = async (n: NovoItem): Promise<Resultado<ItemBiblioteca>> => {
  const r = await window.fma.biblioteca.criarItem(n)
  if (r.ok) await recarregarBiblioteca()
  return r
}
export const excluirItem = async (id: string) => {
  const r = await window.fma.biblioteca.excluirItem(id)
  if (r.ok) await Promise.all([recarregarBiblioteca(), recarregarCartas()]) // as cartas perdem a ligação
  return r
}
export const adicionarDaLoja = async (lojaId: string) => {
  const r = await window.fma.biblioteca.adicionar(lojaId)
  if (r.ok) await Promise.all([recarregarBiblioteca(), recarregarCartas()])
  return r
}
export const publicarNaLoja = async (cartaId: string, descricao: string, categoria: string) => {
  const r = await window.fma.biblioteca.publicar(cartaId, descricao, categoria)
  if (r.ok) await recarregarBiblioteca()
  return r
}
export const despublicar = async (id: string) => {
  const r = await window.fma.biblioteca.despublicar(id)
  if (r.ok) await recarregarBiblioteca()
  return r
}
