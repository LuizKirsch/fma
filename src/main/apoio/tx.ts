/** Transação mínima (cópia de db.ts#transacao, para esta camada não puxar o `electron` de db.ts). */
import type { DatabaseSync } from "node:sqlite"

export function transacao<T>(banco: DatabaseSync, fn: () => T): T {
  banco.exec("BEGIN")
  try {
    const r = fn()
    banco.exec("COMMIT")
    return r
  } catch (e) {
    banco.exec("ROLLBACK")
    throw e
  }
}
