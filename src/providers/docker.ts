// Docker e docker compose, via CLI do docker.
import { isRoot, run, which, type Command } from "../lib/exec"

export interface Container {
  id: string
  name: string
  image: string
  state: string // running | exited | paused | restarting | created
  status: string // "Up 3 hours", "Exited (0) 2 days ago"
  ports: string
  project: string // stack do compose (se houver)
  cpu?: string
  mem?: string
}

export interface ComposeProject {
  name: string
  status: string // "running(3)", "exited(1)"
  configFiles: string
}

export type DockerState = "ok" | "notinstalled" | "noaccess"

let needsSudo = false

/** Descobre se o docker existe e se temos acesso ao daemon. */
export async function dockerState(): Promise<DockerState> {
  if (!which("docker")) return "notinstalled"
  const r = await run(["docker", "info", "--format", "{{.ServerVersion}}"], 8_000)
  if (r.code === 0) {
    needsSudo = false
    return "ok"
  }
  if (!isRoot) {
    const s = await run({ argv: ["docker", "info", "--format", "{{.ServerVersion}}"], root: true }, 8_000)
    if (s.code === 0) {
      needsSudo = true
      return "ok"
    }
  }
  return "noaccess"
}

function docker(...args: string[]): Command {
  return { argv: ["docker", ...args], root: needsSudo }
}

export function parseJsonLines<T = any>(text: string): T[] {
  const out: T[] = []
  for (const line of text.split("\n")) {
    const l = line.trim()
    if (!l) continue
    try {
      const v = JSON.parse(l)
      if (Array.isArray(v)) out.push(...v)
      else out.push(v)
    } catch {}
  }
  return out
}

export async function listContainers(): Promise<Container[]> {
  const r = await run(docker("ps", "-a", "--no-trunc", "--format", "{{json .}}"))
  return parseJsonLines(r.stdout)
    .map((c: any) => ({
      id: String(c.ID ?? "").slice(0, 12),
      name: String(c.Names ?? ""),
      image: String(c.Image ?? ""),
      state: String(c.State ?? ""),
      status: String(c.Status ?? ""),
      ports: simplifyPorts(String(c.Ports ?? "")),
      project: /com\.docker\.compose\.project=([^,]+)/.exec(String(c.Labels ?? ""))?.[1] ?? "",
    }))
    .sort((a, b) => Number(b.state === "running") - Number(a.state === "running") || a.name.localeCompare(b.name))
}

/** "0.0.0.0:80->80/tcp, :::80->80/tcp" -> "80→80" */
export function simplifyPorts(ports: string): string {
  const seen = new Set<string>()
  for (const p of ports.split(",")) {
    const m = /:(\d+)->(\d+)\//.exec(p)
    if (m) seen.add(m[1] === m[2] ? m[1]! : `${m[1]}→${m[2]}`)
  }
  return [...seen].join(" ")
}

export async function containerStats(): Promise<Map<string, { cpu: string; mem: string }>> {
  const r = await run(docker("stats", "--no-stream", "--format", "{{json .}}"), 15_000)
  const map = new Map<string, { cpu: string; mem: string }>()
  for (const s of parseJsonLines(r.stdout)) {
    map.set(String(s.Name), { cpu: String(s.CPUPerc ?? ""), mem: String(s.MemUsage ?? "").split(" / ")[0] ?? "" })
  }
  return map
}

export async function listCompose(): Promise<ComposeProject[]> {
  const r = await run(docker("compose", "ls", "-a", "--format", "json"))
  if (r.code !== 0) return []
  return parseJsonLines(r.stdout).map((p: any) => ({
    name: String(p.Name ?? ""),
    status: String(p.Status ?? ""),
    configFiles: String(p.ConfigFiles ?? ""),
  }))
}

export type ContainerAction = "start" | "stop" | "restart"
export function containerCommand(action: ContainerAction, c: Container): Command {
  return docker(action, c.name)
}

export function containerLogsCommand(c: Container): Command {
  return docker("logs", "-f", "--tail", "300", "--timestamps", c.name)
}

/** Shell interativo dentro do container (tenta bash, cai para sh). */
export function containerShellArgv(c: Container): string[] {
  const base = needsSudo ? ["sudo", "docker"] : ["docker"]
  return [...base, "exec", "-it", c.name, "sh", "-c", "command -v bash >/dev/null && exec bash || exec sh"]
}

export type ComposeAction = "up" | "down" | "pull" | "restart" | "logs"
export function composeCommand(action: ComposeAction, p: ComposeProject): Command {
  const files = p.configFiles.split(",").filter(Boolean).flatMap((f) => ["-f", f.trim()])
  const args = action === "up" ? ["up", "-d"] : action === "logs" ? ["logs", "-f", "--tail", "200"] : [action]
  return docker("compose", "-p", p.name, ...files, ...args)
}

