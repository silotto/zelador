// Serviços do systemd.
import { existsSync } from "node:fs"
import { output, run, which, type Command } from "../lib/exec"

export interface Service {
  unit: string
  name: string // sem ".service"
  load: string
  active: string // active | inactive | failed | activating...
  sub: string // running | exited | dead...
  enabled: string // enabled | disabled | static | masked | ...
  description: string
}

export function systemdAvailable(): boolean {
  return which("systemctl") && existsSync("/run/systemd/system")
}

export function parseListUnits(text: string) {
  const out: Omit<Service, "enabled">[] = []
  for (const raw of text.split("\n")) {
    // remove o marcador "●" que o systemctl põe em unidades com problema
    const line = raw.replace(/^[\s●*]+/, "")
    if (!line) continue
    const m = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/.exec(line)
    if (!m || !m[1]!.endsWith(".service")) continue
    out.push({ unit: m[1]!, name: m[1]!.replace(/\.service$/, ""), load: m[2]!, active: m[3]!, sub: m[4]!, description: m[5] ?? "" })
  }
  return out
}

export function parseUnitFiles(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split("\n")) {
    const [unit, state] = line.trim().split(/\s+/)
    if (unit && state && unit.endsWith(".service")) map.set(unit, state)
  }
  return map
}

export async function listServices(): Promise<Service[]> {
  const [units, files] = await Promise.all([
    output(["systemctl", "list-units", "--type=service", "--all", "--no-legend", "--no-pager", "--plain"]),
    output(["systemctl", "list-unit-files", "--type=service", "--no-legend", "--no-pager"]),
  ])
  const enabled = parseUnitFiles(files)
  return parseListUnits(units)
    .filter((s) => s.load !== "not-found")
    .map((s) => ({ ...s, enabled: enabled.get(s.unit) ?? "-" }))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

// falhas primeiro, depois rodando, depois o resto
function rank(s: { active: string }) {
  if (s.active === "failed") return 0
  if (s.active === "active" || s.active === "activating" || s.active === "reloading") return 1
  return 2
}

export async function failedCount(): Promise<number> {
  if (!systemdAvailable()) return 0
  const r = await run(["systemctl", "list-units", "--type=service", "--state=failed", "--no-legend", "--no-pager", "--plain"])
  return r.stdout.split("\n").filter((l) => l.trim()).length
}

export type ServiceAction = "start" | "stop" | "restart" | "enable" | "disable"

export function serviceCommand(action: ServiceAction, unit: string): Command {
  return { argv: ["systemctl", action, unit], root: true }
}

export function serviceLogsCommand(unit: string): Command {
  return { argv: ["journalctl", "-u", unit, "-n", "300", "-f", "--no-pager", "-o", "short-iso"], root: true }
}
