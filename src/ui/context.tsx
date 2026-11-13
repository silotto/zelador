import { createContext, useContext } from "react"
import type { Config } from "../lib/config"
import type { Command } from "../lib/exec"
import type { Snapshot, SystemInfo } from "../providers/system"
import type { Upgrade } from "../providers/updates"

export interface Hint {
  key: string
  label: string
}

export interface ActionOptions {
  cmd: Command
  /** Texto curto que descreve a ação (usado no aviso de sucesso/falha). */
  title: string
  /** Mostra a saída ao vivo numa janela (apt upgrade, docker pull...). */
  stream?: boolean
  /** Destaca em vermelho no diálogo de confirmação. */
  danger?: boolean
  /** Chamado ao final (para recarregar a lista, por exemplo). */
  onDone?: (code: number) => void
}

export interface History {
  cpu: number[]
  mem: number[]
  rx: number[]
  tx: number[]
}

export interface AppContextValue {
  cfg: Config
  info: SystemInfo
  snapshot: Snapshot | null
  history: History
  failed: number
  upgrades: Upgrade[] | null
  setUpgrades: (u: Upgrade[]) => void
  /** Pede confirmação mostrando o comando e, se confirmado, executa. */
  confirm: (opts: ActionOptions) => void
  /** Abre uma janela com a saída ao vivo de um comando (sem confirmação; para logs). */
  view: (title: string, cmd: ActionOptions["cmd"]) => void
  /** Empresta o terminal para um programa interativo (ex.: shell no container). */
  interactive: (argv: string[]) => Promise<void>
  toast: (msg: string, kind?: "ok" | "error" | "info") => void
  /** A view avisa que um campo de texto está com foco (desliga atalhos globais). */
  setInputLock: (locked: boolean) => void
  setHints: (hints: Hint[]) => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp fora do AppContext")
  return ctx
}
