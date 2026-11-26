/**
 * Estado das cartas na interface. A fonte de verdade é o banco no núcleo:
 * esta camada só guarda a última lista que veio de lá e avisa os componentes quando muda.
 */
import { useSyncExternalStore } from "react"
import type { Carta, Resultado } from "@shared/tipos"
import type { CliInstalada } from "@shared/ia"

let cartas: Carta[] = []
let carregado = false
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export async function recarregarCartas() {
  cartas = await window.fma.cartas.listar()
  carregado = true
  avisar()
}

/** Lista de cartas, sempre atualizada. Carrega do banco na primeira vez. */
export function useCartas(): { cartas: Carta[]; carregado: boolean } {
  const lista = useSyncExternalStore(
    (f) => { ouvintes.add(f); if (!carregado) void recarregarCartas(); return () => ouvintes.delete(f) },
    () => cartas,
  )
  return { cartas: lista, carregado }
}

async function depois<T>(r: Promise<Resultado<T>>): Promise<Resultado<T>> {
  const res = await r
  if (res.ok) await recarregarCartas()
  return res
}
export const salvarCarta = (c: Carta) => depois(window.fma.cartas.salvar(c))
export const duplicarCarta = (id: string) => depois(window.fma.cartas.duplicar(id))
export const excluirCarta = (id: string) => depois(window.fma.cartas.excluir(id))

/* ---------- CLIs instaladas ---------- */
let clis: CliInstalada[] | null = null
const ouvintesCli = new Set<() => void>()
let buscando = false
export function useClis(): CliInstalada[] | null {
  return useSyncExternalStore(
    (f) => {
      ouvintesCli.add(f)
      if (!clis && !buscando) {
        buscando = true
        void window.fma.clis.detectar().then((r) => { clis = r; ouvintesCli.forEach((g) => g()) })
      }
      return () => ouvintesCli.delete(f)
    },
    () => clis,
  )
}
