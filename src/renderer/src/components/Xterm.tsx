/**
 * Terminal desenhado com xterm.js (como no Orca): o console da task (só leitura, com cores) e o shell real (PTY).
 */
import { useEffect, useRef } from "react"
import { Terminal as XTerm, type ITheme } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import "@xterm/xterm/css/xterm.css"
import type { LinhaConsole } from "@/data/tasks"

// ponytail: tema escuro fixo (terminal é escuro nos dois temas do app); ler as variáveis CSS se pedirem tema claro.
const TEMA: ITheme = {
  background: "#0d0f14", foreground: "#d6d9e0", cursor: "#d6d9e0", selectionBackground: "#3a4660",
  black: "#1b1e26", red: "#f07178", green: "#a6da95", yellow: "#eed49f", blue: "#8aadf4", magenta: "#c6a0f6", cyan: "#7dc4e4", white: "#cad3f5",
  brightBlack: "#5b6078", brightRed: "#ff8a92", brightGreen: "#b8e8a8", brightYellow: "#f5dfb0", brightBlue: "#a5c0f7", brightMagenta: "#d4b8f8", brightCyan: "#9dd4ec", brightWhite: "#ffffff",
}

/** Cria o xterm no div, ajusta ao tamanho e chama `aoPronto`; devolve o ref do div. */
function useXterm(aoPronto: (t: XTerm, fit: () => void) => (() => void) | void, opcoes: { leitura?: boolean } = {}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const t = new XTerm({ theme: TEMA, fontFamily: '"JetBrains Mono Variable", Consolas, monospace', fontSize: 12.5, lineHeight: 1.25, cursorBlink: !opcoes.leitura, disableStdin: !!opcoes.leitura, scrollback: 10000, convertEol: !!opcoes.leitura, allowProposedApi: true })
    const fitAddon = new FitAddon()
    t.loadAddon(fitAddon)
    t.loadAddon(new WebLinksAddon((_e, url) => window.open(url, "_blank")))
    t.open(el)
    const fit = () => { if (el.clientWidth > 0 && el.clientHeight > 0) try { fitAddon.fit() } catch { /* sem tamanho ainda */ } }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    const fim = aoPronto(t, fit)
    return () => { ro.disconnect(); fim?.(); t.dispose() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return ref
}

/** "[Bash] docker ps" → ferramenta + texto. Linhas antigas vinham como "[Bash] {"command":"..."}" (JSON cortado): pega o primeiro texto. */
export function separarFerramenta(linha: string): { ferramenta: string | null; texto: string } {
  const m = /^\[([\w.:-]+)\] ([\s\S]*)$/.exec(linha)
  if (!m) return { ferramenta: null, texto: linha }
  const antigo = m[2].startsWith("{") ? /"\w+":"((?:[^"\\]|\\.)*)/.exec(m[2]) : null
  let texto = m[2]
  if (antigo) try { texto = JSON.parse(`"${antigo[1]}"`) } catch { /* fica o cru */ }
  return { ferramenta: m[1], texto }
}

/** Linha do console em ANSI: carta em cor, ferramenta como etiqueta, stderr em vermelho. */
function ansi(l: LinhaConsole, nome: (id: string | null) => string, comNome: boolean): string {
  const { ferramenta, texto } = separarFerramenta(l.linha)
  const quem = comNome && l.cartaId ? `\x1b[36m${nome(l.cartaId)}\x1b[0m ` : ""
  if (l.canal === "stderr") return `${quem}\x1b[31m${texto}\x1b[0m`
  if (ferramenta) return `${quem}\x1b[2m›\x1b[0m \x1b[1;35m${ferramenta}\x1b[0m \x1b[2m${texto}\x1b[0m`
  return `${quem}${texto}`
}

export function ConsoleXterm({ linhas, nome, comNome }: { linhas: LinhaConsole[]; nome: (id: string | null) => string; comNome?: boolean }) {
  const term = useRef<XTerm | null>(null)
  const escritas = useRef(0)
  const ref = useXterm((t) => { term.current = t; escritas.current = 0 }, { leitura: true })
  useEffect(() => {
    const t = term.current
    if (!t) return
    if (linhas.length < escritas.current || escritas.current === 0) { t.reset(); escritas.current = 0 } // começo, troca de task ou recarga
    for (const l of linhas.slice(escritas.current)) t.writeln(ansi(l, nome, !!comNome))
    if (!linhas.length && !escritas.current) t.write("\x1b[2mSem saída ainda.\x1b[0m\r")
    escritas.current = linhas.length
  }, [linhas]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className="h-full w-full overflow-hidden bg-[#0d0f14] p-2" />
}

/** Shell real no worktree da task; com `cartaId`, entra na sessão da carta. Fecha o PTY ao desmontar. */
export function ShellXterm({ taskId, cartaId }: { taskId: string; cartaId: string | null }) {
  const ref = useXterm((t, fit) => {
    let id: string | null = null, vivo = true
    const tirarEvento = window.fma.terminal.aoEvento((e) => {
      if (e.id !== id) return
      if (e.dados) t.write(e.dados)
      if (e.saiu !== undefined) t.write(`\r\n\x1b[2m[o terminal fechou (código ${e.saiu})]\x1b[0m\r\n`)
    })
    const entrada = t.onData((d) => id && window.fma.terminal.escrever(id, d))
    const tamanho = t.onResize(({ cols, rows }) => id && window.fma.terminal.redimensionar(id, cols, rows))
    fit()
    void window.fma.terminal.abrir(taskId, cartaId, t.cols, t.rows).then((r) => {
      if (!r.ok) return t.write(`\x1b[31m${r.erro}\x1b[0m\r\n`)
      if (!vivo) return window.fma.terminal.fechar(r.valor)
      id = r.valor
      t.focus()
    })
    return () => { vivo = false; tirarEvento(); entrada.dispose(); tamanho.dispose(); if (id) window.fma.terminal.fechar(id) }
  })
  return <div ref={ref} className="h-full w-full overflow-hidden bg-[#0d0f14] p-2" />
}
