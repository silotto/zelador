// Atualizações de pacotes (Debian/Ubuntu via apt).
import { existsSync, readFileSync } from "node:fs"
import { run, which, type Command } from "../lib/exec"
import { fileAge } from "./system"

export interface Upgrade {
  name: string
  origin: string // ex.: noble-updates,noble-security
  version: string
  from: string
  security: boolean
}

export function aptAvailable(): boolean {
  return which("apt-get") && which("apt")
}

export function parseUpgradable(text: string): Upgrade[] {
  const out: Upgrade[] = []
  for (const line of text.split("\n")) {
    // curl/noble-updates,noble-security 8.5.0-2ubuntu10.6 amd64 [upgradable from: 8.5.0-2ubuntu10.5]
    const m = /^([^/\s]+)\/(\S+)\s+(\S+)\s+\S+\s+\[upgradable from:\s*([^\]]+)\]/.exec(line.trim())
    if (!m) continue
    out.push({ name: m[1]!, origin: m[2]!, version: m[3]!, from: m[4]!.trim(), security: /-security/.test(m[2]!) })
  }
  return out.sort((a, b) => Number(b.security) - Number(a.security) || a.name.localeCompare(b.name))
}

export async function listUpgrades(): Promise<Upgrade[]> {
  const r = await run(["apt", "list", "--upgradable"], 60_000)
  return parseUpgradable(r.stdout)
}

/** Segundos desde o último `apt update` bem-sucedido (ou null se não souber). */
export function lastAptUpdate(): number | null {
  return (
    fileAge("/var/lib/apt/periodic/update-success-stamp") ??
    fileAge("/var/lib/apt/lists/partial") ??
    fileAge("/var/cache/apt/pkgcache.bin")
  )
}

export function rebootRequired(): { required: boolean; packages: string[] } {
  if (!existsSync("/var/run/reboot-required")) return { required: false, packages: [] }
  let packages: string[] = []
  try {
    packages = readFileSync("/var/run/reboot-required.pkgs", "utf8").split("\n").filter(Boolean)
  } catch {}
  return { required: true, packages: [...new Set(packages)] }
}

const NONINTERACTIVE = ["env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "-y", "-o", "Dpkg::Options::=--force-confold"]

export const aptUpdateCommand: Command = { argv: ["apt-get", "update"], root: true }
export const upgradeAllCommand: Command = { argv: [...NONINTERACTIVE, "upgrade"], root: true }

export function upgradePackagesCommand(names: string[]): Command {
  return { argv: [...NONINTERACTIVE, "install", "--only-upgrade", ...names], root: true }
}

export const rebootCommand: Command = { argv: ["systemctl", "reboot"], root: true }

/** Contagem rápida para o resumo de login (lê o cache do update-notifier do Ubuntu). */
export function cachedUpdateCounts(): { total: number; security: number } | null {
  try {
    const text = readFileSync("/var/lib/update-notifier/updates-available", "utf8")
    const total = Number(/(\d+) (updates|update) can be applied/.exec(text)?.[1] ?? 0)
    const security = Number(/(\d+) of these updates (?:is a|are) (?:standard )?security update/.exec(text)?.[1] ?? 0)
    return { total, security }
  } catch {
    return null
  }
}
