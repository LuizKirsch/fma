/** Conversa direta com uma carta, sem passar pelo Maestro. */
export interface MensagemDireta {
  id: string
  cartaId: string
  /** Task em andamento quando a mensagem foi dita; o pedido virou apontamento dela. */
  taskId: string | null
  de: "voce" | "carta"
  texto: string
  criadaEm: number
}
