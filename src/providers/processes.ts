// Processos, lidos direto do /proc. O %CPU é calculado entre duas leituras
// (como o top), e não a média desde o início do processo (como o ps).
import { readdirSync, readFileSync } from "node:fs"
import type { Command } from "../lib/exec"

export interface Proc {
  pid: number
  user: string
  uid: number
  cpu: number // %
  mem: number // %
  rss: number // bytes
  elapsed: number // segundos
  command: string
}

const CLK_TCK = 100
const PAGE = 4096

let users: Map<number, string> | null = null
function userName(uid: number): string {
  if (!users) {
    users = new Map()
    try {
      for (const line of readFileSync("/etc/passwd", "utf8").split("\n")) {
        const f = line.split(":")
        if (f.length > 2) users.set(Number(f[2]), f[0]!)
      }
    } catch {}
  }
  return users.get(uid) ?? String(uid)
}

/** Faz o parse de /proc/<pid>/stat. O nome vai entre parênteses e pode ter espaços. */
export function parseStat(text: string) {
  const open = text.indexOf("(")
  const close = text.lastIndexOf(")")
  const comm = text.slice(open + 1, close)
  const f = text.slice(close + 2).split(" ")
  // f[0] = state (campo 3). utime = campo 14, stime = 15, starttime = 22, rss = 24
  return {
    comm,
    ticks: Number(f[11]) + Number(f[12]),
    start: Number(f[19]),
    rssPages: Number(f[21]),
  }
}

let prev = new Map<number, number>()
let prevAt = 0

export function listProcesses(memTotal: number): Proc[] {
  const now = performance.now()
  const dt = prevAt ? (now - prevAt) / 1000 : 0
  const uptime = Number(safeRead("/proc/uptime").split(" ")[0]) || 0
  const next = new Map<number, number>()
  const out: Proc[] = []

  let entries: string[] = []
  try {
    entries = readdirSync("/proc")
  } catch {}

  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue
    const pid = Number(name)
    const stat = safeRead(`/proc/${pid}/stat`)
    if (!stat) continue // processo terminou no meio da leitura
    const s = parseStat(stat)
    // kernel threads não têm cmdline: mostra o nome entre colchetes
    const cmdline = safeRead(`/proc/${pid}/cmdline`).replace(/\0+$/, "").replace(/\0/g, " ")
    const uid = Number(/^Uid:\s+(\d+)/m.exec(safeRead(`/proc/${pid}/status`))?.[1] ?? -1)
    const before = prev.get(pid)
    next.set(pid, s.ticks)
    const cpu = dt > 0 && before !== undefined ? ((s.ticks - before) / CLK_TCK / dt) * 100 : 0
    const rss = s.rssPages * PAGE
    out.push({
      pid,
      uid,
      user: userName(uid),
      cpu: Math.max(0, cpu),
      mem: memTotal ? (rss / memTotal) * 100 : 0,
      rss,
      elapsed: Math.max(0, uptime - s.start / CLK_TCK),
      command: cmdline || `[${s.comm}]`,
    })
  }
  prev = next
  prevAt = now
  return out
}

function safeRead(p: string): string {
  try {
    return readFileSync(p, "utf8")
  } catch {
    return ""
  }
}

export function killCommand(p: Proc, force: boolean): Command {
  const myUid = typeof process.getuid === "function" ? process.getuid() : -1
  return { argv: ["kill", force ? "-KILL" : "-TERM", String(p.pid)], root: p.uid !== myUid }
}
