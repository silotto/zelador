import { useKeyboard } from "@opentui/react"
import { useCallback, useMemo, useState } from "react"
import { lang, t } from "../../i18n"
import { bytes, duration } from "../../lib/format"
import { killCommand, listProcesses, type Proc } from "../../providers/processes"
import { ListView } from "../components/ListView"
import type { Column } from "../components/Table"
import { useApp } from "../context"
import { useFilter, useHints, usePolling, useSelection } from "../hooks"
import { theme } from "../theme"

type SortKey = "cpu" | "mem" | "pid"
const SORTS: SortKey[] = ["cpu", "mem", "pid"]

export function Processes({ active }: { active: boolean }) {
  const app = useApp()
  const [procs, setProcs] = useState<Proc[]>([])
  const [sort, setSort] = useState<SortKey>("cpu")
  const filter = useFilter(active)
  const nav = active && !filter.editing

  const memTotal = app.snapshot?.memTotal ?? 0
  const load = useCallback(() => setProcs(listProcesses(memTotal)), [memTotal])
  usePolling(load, app.cfg.refreshMs, active)

  const rows = useMemo(() => {
    const list = procs.filter((p) => filter.match(p.command, p.user, String(p.pid)))
    if (sort === "cpu") list.sort((a, b) => b.cpu - a.cpu || b.rss - a.rss)
    else if (sort === "mem") list.sort((a, b) => b.rss - a.rss)
    else list.sort((a, b) => a.pid - b.pid)
    return list
  }, [procs, sort, filter.match])

  const sel = useSelection(rows, (p) => String(p.pid), nav, 10)

  useHints(active, [
    { key: "o", label: `${t("key.sort")} (${sort})` },
    { key: "x", label: t("key.kill") },
    { key: "X", label: t("key.forcekill") },
    { key: "/", label: t("key.filter") },
  ])

  useKeyboard((key) => {
    if (!nav) return
    if (key.name === "o") return setSort((s) => SORTS[(SORTS.indexOf(s) + 1) % SORTS.length]!)
    const p = sel.selected
    if (!p) return
    if (key.name === "x") {
      const force = key.shift
      app.confirm({
        cmd: killCommand(p, force),
        title: `${force ? t("key.forcekill") : t("key.kill")}: ${p.command.slice(0, 50)} (${p.pid})`,
        danger: force,
        onDone: load,
      })
    }
  })

  const columns: Column<Proc>[] = [
    { title: t("proc.pid"), width: 7, align: "right", value: (p) => String(p.pid), color: () => theme.muted },
    { title: t("proc.user"), width: 10, value: (p) => p.user, color: (p) => (p.uid === 0 ? theme.orange : theme.fg) },
    {
      title: t("proc.cpu") + (sort === "cpu" ? "▼" : ""),
      width: 6,
      align: "right",
      value: (p) => p.cpu.toFixed(1),
      color: (p) => (p.cpu > 50 ? theme.red : p.cpu > 10 ? theme.yellow : theme.fg),
    },
    {
      title: t("proc.mem") + (sort === "mem" ? "▼" : ""),
      width: 6,
      align: "right",
      value: (p) => p.mem.toFixed(1),
      color: (p) => (p.mem > 30 ? theme.red : p.mem > 10 ? theme.yellow : theme.fg),
    },
    { title: t("proc.rss"), width: 7, align: "right", value: (p) => bytes(p.rss), color: () => theme.muted },
    { title: t("proc.time"), width: 10, align: "right", value: (p) => duration(p.elapsed, lang()), color: () => theme.muted },
    { title: t("proc.command"), width: "flex", value: (p) => p.command, color: (p) => (p.command.startsWith("[") ? theme.dim : undefined) },
  ]

  return (
    <ListView
      title={`${t("tab.processes")} · ${t("proc.sortby", { by: sort })}`}
      columns={columns}
      rows={rows}
      selected={sel.index}
      onSelect={sel.moveTo}
      filter={filter}
    />
  )
}
