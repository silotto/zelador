// Checagem de segurança (somente leitura no MVP).
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { Key } from "../i18n"
import { isRoot, run, which } from "../lib/exec"
import { systemdAvailable } from "./services"

export type CheckStatus = "ok" | "warn" | "fail" | "unknown"

export interface Check {
  id: string
  title: Key
  status: CheckStatus
  detail: Key
  vars?: Record<string, string | number>
  hint?: Key
}

export interface Port {
  proto: string
  address: string
  port: number
  process: string
  public: boolean
}

// --- SSH -----------------------------------------------------------------

/**
 * Lê as opções do sshd. Com root usamos `sshd -T` (configuração efetiva);
 * sem root lemos os arquivos. No sshd vale a PRIMEIRA ocorrência de cada opção,
 * e os arquivos de sshd_config.d entram onde está o Include (normalmente no topo).
 */
export function parseSshdConfig(files: string[]): Record<string, string> {
  const opts: Record<string, string> = {}
  for (const text of files) {
    for (const raw of text.split("\n")) {
      const line = raw.trim()
      if (!line || line.startsWith("#")) continue
      if (/^match\s/i.test(line)) return opts // blocos Match valem só para alguns usuários
      const m = /^(\S+)\s+(.+)$/.exec(line)
      if (!m) continue
      const key = m[1]!.toLowerCase()
      if (key === "include") continue
      if (!(key in opts)) opts[key] = m[2]!.trim().toLowerCase()
    }
  }
  return opts
}

async function sshdOptions(): Promise<Record<string, string> | null> {
  if (isRoot && which("sshd")) {
    const r = await run(["sshd", "-T"])
    if (r.code === 0) {
      const opts: Record<string, string> = {}
      for (const line of r.stdout.split("\n")) {
        const [k, ...v] = line.split(" ")
        if (k) opts[k.toLowerCase()] = v.join(" ").toLowerCase()
      }
      return opts
    }
  }
  if (!existsSync("/etc/ssh/sshd_config")) return null
  const files: string[] = []
  const dir = "/etc/ssh/sshd_config.d"
  try {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".conf")).sort()) files.push(readFileSync(join(dir, f), "utf8"))
  } catch {}
  try {
    files.push(readFileSync("/etc/ssh/sshd_config", "utf8"))
  } catch {
    return null
  }
  return parseSshdConfig(files)
}

// --- Portas ----------------------------------------------------------------

export function parseSs(text: string): Port[] {
  const out: Port[] = []
  const seen = new Set<string>()
  for (const line of text.split("\n")) {
    const f = line.trim().split(/\s+/)
    if (f.length < 5) continue
    const proto = f[0]!
    const local = f[4]!
    const idx = local.lastIndexOf(":")
    if (idx < 0) continue
    const address = local.slice(0, idx).replace(/^\[|\]$/g, "").replace(/%\S+$/, "")
    const port = Number(local.slice(idx + 1))
    if (!port) continue
    const process = /users:\(\("([^"]+)"/.exec(line)?.[1] ?? ""
    const key = `${proto}:${port}:${address}`
    if (seen.has(key)) continue
    seen.add(key)
    const isLocal = address.startsWith("127.") || address === "::1" || address === "localhost"
    out.push({ proto, address, port, process, public: !isLocal })
  }
  return out.sort((a, b) => a.port - b.port)
}

export async function listPorts(): Promise<Port[]> {
  if (!which("ss")) return []
  const r = await run(["ss", "-tulnpH"])
  return parseSs(r.stdout)
}

const DB_PORTS: Record<number, string> = {
  3306: "MySQL",
  5432: "PostgreSQL",
  6379: "Redis",
  27017: "MongoDB",
  9200: "Elasticsearch",
  11211: "Memcached",
}

// --- Checagens ----------------------------------------------------------------

async function isActive(unit: string): Promise<boolean> {
  if (!systemdAvailable()) return false
  const r = await run(["systemctl", "is-active", unit])
  return r.stdout.trim() === "active"
}

function readFile(p: string): string {
  try {
    return readFileSync(p, "utf8")
  } catch {
    return ""
  }
}

export async function runChecks(securityUpdates: number | null, ports: Port[]): Promise<Check[]> {
  const checks: Check[] = []
  const ssh = await sshdOptions()

  // 1. Login do root
  if (ssh) {
    const v = ssh.permitrootlogin ?? "prohibit-password"
    checks.push(
      v === "no"
        ? { id: "root", title: "sec.rootlogin", status: "ok", detail: "sec.rootlogin.ok" }
        : v === "yes"
          ? { id: "root", title: "sec.rootlogin", status: "fail", detail: "sec.rootlogin.bad", hint: "sec.rootlogin.hint" }
          : { id: "root", title: "sec.rootlogin", status: "warn", detail: "sec.rootlogin.keys", hint: "sec.rootlogin.hint" },
    )
    // 2. Senha
    const pw = ssh.passwordauthentication ?? "yes"
    checks.push(
      pw === "no"
        ? { id: "password", title: "sec.password", status: "ok", detail: "sec.password.ok" }
        : { id: "password", title: "sec.password", status: "warn", detail: "sec.password.bad", hint: "sec.password.hint" },
    )
  } else {
    checks.push({ id: "root", title: "sec.rootlogin", status: "unknown", detail: "sec.unknown" })
  }

  // 3. Firewall
  const ufwEnabled = /^ENABLED=yes/m.test(readFile("/etc/ufw/ufw.conf"))
  const fw = ufwEnabled ? "ufw" : (await isActive("firewalld")) ? "firewalld" : (await isActive("nftables")) ? "nftables" : null
  checks.push(
    fw
      ? { id: "firewall", title: "sec.firewall", status: "ok", detail: "sec.firewall.ok", vars: { name: fw } }
      : { id: "firewall", title: "sec.firewall", status: "fail", detail: "sec.firewall.bad", hint: "sec.firewall.hint" },
  )

  // 4. fail2ban
  if (!which("fail2ban-client") && !existsSync("/usr/bin/fail2ban-client")) {
    checks.push({ id: "fail2ban", title: "sec.fail2ban", status: "warn", detail: "sec.fail2ban.bad", hint: "sec.fail2ban.hint" })
  } else if (await isActive("fail2ban")) {
    checks.push({ id: "fail2ban", title: "sec.fail2ban", status: "ok", detail: "sec.fail2ban.ok" })
  } else {
    checks.push({ id: "fail2ban", title: "sec.fail2ban", status: "warn", detail: "sec.fail2ban.off", hint: "sec.fail2ban.hint" })
  }

  // 5. Atualizações automáticas
  if (existsSync("/etc/apt")) {
    const auto = /Unattended-Upgrade\s+"1"/.test(readFile("/etc/apt/apt.conf.d/20auto-upgrades"))
    checks.push(
      auto
        ? { id: "auto", title: "sec.auto", status: "ok", detail: "sec.auto.ok" }
        : { id: "auto", title: "sec.auto", status: "warn", detail: "sec.auto.bad", hint: "sec.auto.hint" },
    )
  }

  // 6. Atualizações de segurança pendentes
  if (securityUpdates !== null) {
    checks.push(
      securityUpdates === 0
        ? { id: "pending", title: "sec.pending", status: "ok", detail: "sec.pending.ok" }
        : {
            id: "pending",
            title: "sec.pending",
            status: "fail",
            detail: "sec.pending.bad",
            vars: { n: securityUpdates },
            hint: "sec.pending.hint",
          },
    )
  }

  // 7. Bancos de dados expostos
  const exposed = ports.filter((p) => p.public && DB_PORTS[p.port]).map((p) => `${DB_PORTS[p.port]} (${p.port})`)
  const uniqueExposed = [...new Set(exposed)]
  checks.push(
    uniqueExposed.length === 0
      ? { id: "exposed", title: "sec.exposed", status: "ok", detail: "sec.exposed.ok" }
      : {
          id: "exposed",
          title: "sec.exposed",
          status: fw ? "warn" : "fail",
          detail: "sec.exposed.bad",
          vars: { list: uniqueExposed.join(", ") },
          hint: "sec.exposed.hint",
        },
  )

  return checks
}
