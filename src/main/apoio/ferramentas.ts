/**
 * O que o motor pede ao montar a execução de uma carta (RF 4.14): as ferramentas ligadas a ela e
 * ativas na task, a config MCP para a CLI dela e um bloco de contexto para o prompt (memória + regras de escrita).
 * O motor concatena `contexto` ao prompt, grava `config.arquivos` e acrescenta `config.args` à linha da CLI.
 */
import type { DatabaseSync } from "node:sqlite"
import { tipoApoio, type CartaApoio } from "@shared/apoio"
import type { CliId } from "@shared/ia"
import { desligadasNaTask, listarCartasApoio } from "./repo"
import { configMcp, paraCli, type ConfigCli } from "./mcp"
import { textoMemoria } from "./memoria"

export interface FerramentasDaCarta { ferramentas: CartaApoio[]; config: ConfigCli; contexto: string }

export function ferramentasDaCarta(db: DatabaseSync, p: { taskId: string; projetoId: string; cartaId: string; cli: CliId; dirConfig: string }): FerramentasDaCarta {
  const off = new Set(desligadasNaTask(db, p.taskId))
  const ferramentas = listarCartasApoio(db, p.projetoId).filter((c) => c.usuarios.includes(p.cartaId) && !off.has(c.id))
  const linhas = ferramentas.map((c) => {
    const t = tipoApoio(c.tipo)!
    return `- ${c.nome}: ${t.descricao}${t.usaAmbiente ? ` Ambiente: ${c.ambiente}.` : ""}${c.urlBase ? ` URL base: ${c.urlBase}.` : ""}${t.acesso === "escrita" ? " Escrita só acontece depois da confirmação do usuário." : ""}`
  })
  const partes: string[] = []
  if (linhas.length) partes.push(`## Ferramentas à disposição\n${linhas.join("\n")}`)
  if (ferramentas.some((c) => c.tipo === "memoria")) {
    const m = textoMemoria(db, p.projetoId)
    if (m) partes.push(`## Memória do projeto\n${m}`)
  }
  return { ferramentas, config: paraCli(p.cli, configMcp(ferramentas), p.dirConfig), contexto: partes.join("\n\n") }
}
