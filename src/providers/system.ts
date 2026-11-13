// Métricas do sistema lidas direto do /proc (rápido, sem dependências).
import { existsSync, readFileSync, statSync } from "node:fs"
import { hostname, networkInterfaces, release, cpus } from "node:os"
import { output } from "../lib/exec"

export interface SystemInfo {
  hostname: string
  os: string
  kernel: string
  ips: string[]
  cores: number
}

export interface DiskUsage {
  mount: string
  device: string
  size: number
  used: number
  avail: number
  pct: number
}

export interface Snapshot {
  cpu: number // %
  memTotal: number
  memUsed: number
  memPct: number
  swapTotal: number
  swapUsed: number
  swapPct: number
  load: [number, number, number]
  uptime: number // segundos
  rxRate: number // bytes/s
  txRate: number
  disks: DiskUsage[]
  rebootRequired: boolean
}

function read(path: string): string {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return ""
  }
}

export function getSystemInfo(): SystemInfo {
  const osRelease = read("/etc/os-release")
  const pretty = /^PRETTY_NAME="?([^"\n]*)"?/m.exec(osRelease)?.[1] ?? "Linux"
  const ips: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (!a.internal && a.family === "IPv4") ips.push(a.address)
  }
  return { hostname: hostname(), os: pretty, kernel: release(), ips, cores: cpus().length || 1 }
}

// --- CPU ---------------------------------------------------------------
export function parseProcStat(text: string): { idle: number; total: number } {
  const line = text.split("\n").find((l) => l.startsWith("cpu ")) ?? ""
  const nums = line.trim().split(/\s+/).slice(1).map(Number)
  // user nice system idle iowait irq softirq steal
  const idle = (nums[3] ?? 0) + (nums[4] ?? 0)
  const total = nums.slice(0, 8).reduce((a, b) => a + (b || 0), 0)
  return { idle, total }
}

let prevCpu: { idle: number; total: number } | null = null
function cpuPercent(): number {
  const cur = parseProcStat(read("/proc/stat"))
  const prev = prevCpu
  prevCpu = cur
  if (!prev) return 0
  const dt = cur.total - prev.total
  const di = cur.idle - prev.idle
  return dt > 0 ? Math.max(0, Math.min(100, ((dt - di) / dt) * 100)) : 0
}

// --- Memória -----------------------------------------------------------
export function parseMeminfo(text: string) {
  const kv: Record<string, number> = {}
  for (const line of text.split("\n")) {
    const m = /^(\w+):\s+(\d+)/.exec(line)
    if (m) kv[m[1]!] = Number(m[2]) * 1024
  }
  const memTotal = kv.MemTotal ?? 0
  const memAvail = kv.MemAvailable ?? (kv.MemFree ?? 0) + (kv.Cached ?? 0)
  const swapTotal = kv.SwapTotal ?? 0
  const swapUsed = swapTotal - (kv.SwapFree ?? 0)
  return { memTotal, memUsed: memTotal - memAvail, swapTotal, swapUsed }
}

// --- Rede --------------------------------------------------------------
export function parseNetDev(text: string): { rx: number; tx: number } {
  let rx = 0
  let tx = 0
  for (const line of text.split("\n").slice(2)) {
    const [name, rest] = line.split(":")
    if (!rest) continue
    const iface = name!.trim()
    // ignora loopback e interfaces virtuais de containers
    if (iface === "lo" || iface.startsWith("veth") || iface.startsWith("docker") || iface.startsWith("br-")) continue
    const f = rest.trim().split(/\s+/).map(Number)
    rx += f[0] ?? 0
    tx += f[8] ?? 0
  }
  return { rx, tx }
}

let prevNet: { rx: number; tx: number; t: number } | null = null
function netRates(): { rxRate: number; txRate: number } {
  const cur = { ...parseNetDev(read("/proc/net/dev")), t: performance.now() }
  const prev = prevNet
  prevNet = cur
  if (!prev) return { rxRate: 0, txRate: 0 }
  const dt = (cur.t - prev.t) / 1000
  if (dt <= 0) return { rxRate: 0, txRate: 0 }
  return { rxRate: Math.max(0, (cur.rx - prev.rx) / dt), txRate: Math.max(0, (cur.tx - prev.tx) / dt) }
}

// --- Discos ------------------------------------------------------------
export function parseDf(text: string): DiskUsage[] {
  const seen = new Set<string>()
  const out: DiskUsage[] = []
  for (const line of text.trim().split("\n").slice(1)) {
    const f = line.trim().split(/\s+/)
    if (f.length < 6) continue
    const [device, size, used, avail, , ...mountParts] = f
    const mount = mountParts.join(" ")
    if (seen.has(device!) || !device!.startsWith("/dev/") || device!.startsWith("/dev/loop")) continue
    seen.add(device!)
    const s = Number(size)
    const u = Number(used)
    const a = Number(avail)
    // mesma fórmula do df: usado / (usado + disponível)
    out.push({ mount, device: device!, size: s, used: u, avail: a, pct: u + a > 0 ? (u / (u + a)) * 100 : 0 })
  }
  return out
}

let diskCache: { at: number; value: DiskUsage[] } = { at: 0, value: [] }
async function disks(): Promise<DiskUsage[]> {
  // discos mudam devagar: consulta no máximo a cada 10s
  if (Date.now() - diskCache.at < 10_000 && diskCache.value.length) return diskCache.value
  const text = await output(["df", "-B1", "-P", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs", "-x", "overlay"])
  diskCache = { at: Date.now(), value: parseDf(text) }
  return diskCache.value
}

export async function getSnapshot(): Promise<Snapshot> {
  const mem = parseMeminfo(read("/proc/meminfo"))
  const loadParts = read("/proc/loadavg").split(" ").map(Number)
  const uptime = Number(read("/proc/uptime").split(" ")[0]) || 0
  return {
    cpu: cpuPercent(),
    ...mem,
    memPct: mem.memTotal ? (mem.memUsed / mem.memTotal) * 100 : 0,
    swapPct: mem.swapTotal ? (mem.swapUsed / mem.swapTotal) * 100 : 0,
    load: [loadParts[0] || 0, loadParts[1] || 0, loadParts[2] || 0],
    uptime,
    ...netRates(),
    disks: await disks(),
    rebootRequired: existsSync("/var/run/reboot-required"),
  }
}

export function fileAge(path: string): number | null {
  try {
    return (Date.now() - statSync(path).mtimeMs) / 1000
  } catch {
    return null
  }
}
