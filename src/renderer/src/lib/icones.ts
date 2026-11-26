// Símbolos que uma carta pode usar. O banco guarda o nome (ex.: "Code2"); aqui vira o ícone.
import type { LucideIcon } from "lucide-react"
import {
  BrainCircuit, Bug, Code2, Compass, Crown, Eye, Feather, FileSearch, FlaskConical, Gauge, GitPullRequest, Hammer,
  KeyRound, Lightbulb, Lock, Microscope, Network, Palette, PenTool, Radar, Rocket, ScanSearch, ScrollText, Shield,
  ShieldCheck, Sparkles, Swords, Target, Wand2, Zap,
} from "lucide-react"

export const ICONES: Record<string, LucideIcon> = {
  ScrollText, FileSearch, Compass, Palette, PenTool, Eye, Code2, Hammer, BrainCircuit,
  FlaskConical, ShieldCheck, Bug, ScanSearch, Swords, Shield, GitPullRequest, Rocket, Crown,
  Sparkles, Wand2, Lightbulb, Target, Microscope, Zap, Gauge, Feather, Network, Lock, KeyRound, Radar,
}
export const NOMES_ICONES = Object.keys(ICONES)
export const icone = (nome: string): LucideIcon => ICONES[nome] ?? Sparkles

/** Cores de quadro oferecidas na forja (as mesmas das classes). */
export const CORES_QUADRO = [
  "oklch(0.72 0.14 245)", "oklch(0.74 0.16 350)", "oklch(0.68 0.17 295)", "oklch(0.78 0.15 160)",
  "oklch(0.78 0.15 60)", "oklch(0.78 0.12 195)", "oklch(0.7 0.18 25)", "oklch(0.75 0.04 275)",
]
