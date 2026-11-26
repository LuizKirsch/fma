/**
 * Contas de IA e uso na interface. A fonte de verdade é o banco no núcleo (src/main/contas.ts):
 * aqui fica a última resposta, que se atualiza a cada ação, a cada evento de task e a cada minuto.
 */
import { useSyncExternalStore } from "react"
import type { EstadoContas } from "@shared/conta"
import type { Resultado } from "@shared/tipos"

let estado: EstadoContas = { contas: [], uso: [], limites: {}, ambientes: [] }
let carregado = false
const ouvintes = new Set<() => void>()

export async function recarregarContas() {
  estado = await window.fma.contas.listar()
  carregado = true
  ouvintes.forEach((f) => f())
}

// Um intervalo e um listener para todo o app: ligam no 1o assinante, desligam no último.
let desligar: (() => void) | null = null
function assinar(f: () => void) {
  ouvintes.add(f)
  if (ouvintes.size === 1) {
    void recarregarContas()
    const t = window.setInterval(() => void recarregarContas(), 60_000)
    const fim = window.fma.tasks.aoEvento((e) => { if (e.tipo === "task") void recarregarContas() })
    desligar = () => { window.clearInterval(t); fim() }
  }
  return () => { ouvintes.delete(f); if (!ouvintes.size) { desligar?.(); desligar = null } }
}
let visao: EstadoContas & { carregado: boolean } = { ...estado, carregado }
const ler = () => (visao.contas === estado.contas && visao.carregado === carregado ? visao : (visao = { ...estado, carregado }))

export function useContas(): EstadoContas & { carregado: boolean } {
  return useSyncExternalStore(assinar, ler)
}

async function depois<T>(r: Promise<Resultado<T>>): Promise<Resultado<T>> {
  const res = await r
  await recarregarContas()
  return res
}
export const conectarConta = (...a: Parameters<typeof window.fma.contas.conectar>) => depois(window.fma.contas.conectar(...a))
export const usarConfigPadrao = (...a: Parameters<typeof window.fma.contas.usarConfigPadrao>) => depois(window.fma.contas.usarConfigPadrao(...a))
export const entrarConta = (id: string) => window.fma.contas.entrar(id)
export const tornarPadrao = (id: string) => depois(window.fma.contas.padrao(id))
export const removerConta = (id: string) => depois(window.fma.contas.remover(id))
