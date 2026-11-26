/**
 * Ambiente em que o repositório e as CLIs rodam (RF 2.37): "local" (o sistema do app) ou "wsl:<distro>"
 * (só no Windows). Funções puras, usadas pelo núcleo e pela interface.
 */

export const LOCAL = "local"

export interface Ambiente { id: string; nome: string }

export const ehWsl = (a: string) => a.startsWith("wsl:")
export const distroDe = (a: string) => a.slice(4)

const UNC = /^[\\/]{2}(?:wsl\.localhost|wsl\$)[\\/]([^\\/]+)(.*)$/i

/** `\\wsl.localhost\<distro>\home\x` vira { ambiente: "wsl:<distro>", caminho: "/home/x" }. Qualquer outro caminho é local. */
export function deCaminho(p: string): { ambiente: string; caminho: string } {
  const m = UNC.exec(p.trim())
  return m ? { ambiente: `wsl:${m[1]}`, caminho: m[2].replace(/\\/g, "/") || "/" } : { ambiente: LOCAL, caminho: p }
}

/** Nome para mostrar: "Windows", "macOS", "Linux" ou "WSL · Ubuntu-24.04". */
export function rotuloAmbiente(a: string, plataforma: string): string {
  if (ehWsl(a)) return `WSL · ${distroDe(a)}`
  return plataforma === "win32" ? "Windows" : plataforma === "darwin" ? "macOS" : "Linux"
}

/** Dica para escolher a pasta de um projeto que está no WSL (Windows com distros). */
export const dicaWsl = (distro: string) => `Projeto no WSL: escolha a pasta em \\\\wsl.localhost\\${distro}\\…`
