// Log de auditoria: toda ação executada pelo painel fica registrada.
import { appendFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { currentUser, formatCommand, isRoot, type Command } from "./exec"

export const AUDIT_PATH = isRoot
  ? "/var/log/zelador.log"
  : join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "zelador", "audit.log")

export function audit(cmd: Command, exitCode: number | "start") {
  const line = `${new Date().toISOString()} user=${currentUser} exit=${exitCode} cmd=${formatCommand(cmd)}\n`
  try {
    mkdirSync(dirname(AUDIT_PATH), { recursive: true })
    appendFileSync(AUDIT_PATH, line)
  } catch {
    // Sem permissão de escrita: o painel continua funcionando.
  }
}
