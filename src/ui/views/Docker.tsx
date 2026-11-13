import { useKeyboard } from "@opentui/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { t } from "../../i18n"
import {
  composeCommand,
  containerCommand,
  containerLogsCommand,
  containerShellArgv,
  containerStats,
  dockerState,
  listCompose,
  listContainers,
  type ComposeAction,
  type ComposeProject,
  type Container,
  type DockerState,
} from "../../providers/docker"
import { ListView } from "../components/ListView"
import { Centered } from "../components/Panel"
import type { Column } from "../components/Table"
import { useApp } from "../context"
import { useFilter, useHints, usePolling, useSelection } from "../hooks"
import { theme } from "../theme"

function stateColor(state: string) {
  if (state === "running" || state.startsWith("running")) return theme.green
  if (state === "restarting" || state === "paused") return theme.yellow
  return theme.dim
}

export function Docker({ active }: { active: boolean }) {
  const [state, setState] = useState<DockerState | null>(null)
  const [mode, setMode] = useState<"containers" | "stacks">("containers")

  useEffect(() => {
    if (active && state === null) dockerState().then(setState)
  }, [active, state])

  useHints(active && state !== "ok", [])

  useKeyboard((key) => {
    if (active && state === "ok" && key.name === "t") setMode((m) => (m === "containers" ? "stacks" : "containers"))
  })

  if (state === null) return <Centered>{t("common.loading")}</Centered>
  if (state === "notinstalled") return <Centered>{t("docker.notinstalled")}</Centered>
  if (state === "noaccess") return <Centered color={theme.yellow}>{t("docker.noaccess")}</Centered>
  return mode === "containers" ? <Containers active={active} /> : <Stacks active={active} />
}

function Containers({ active }: { active: boolean }) {
  const app = useApp()
  const [items, setItems] = useState<Container[] | null>(null)
  const [stats, setStats] = useState<Map<string, { cpu: string; mem: string }>>(new Map())
  const filter = useFilter(active)
  const nav = active && !filter.editing

  const load = useCallback(async () => setItems(await listContainers()), [])
  usePolling(load, 3000, active)
  // docker stats é lento (~2s): roda separado para não travar a lista
  usePolling(async () => setStats(await containerStats()), 5000, active)

  const rows = useMemo(() => (items ?? []).filter((c) => filter.match(c.name, c.image, c.project)), [items, filter.match])
  const sel = useSelection(rows, (c) => c.name, nav, 10)

  useHints(active, [
    { key: "enter", label: t("key.logs") },
    { key: "s", label: t("key.start") },
    { key: "x", label: t("key.stop") },
    { key: "r", label: t("key.restart") },
    { key: "e", label: t("key.shell") },
    { key: "t", label: t("key.compose") },
    { key: "/", label: t("key.filter") },
  ])

  useKeyboard((key) => {
    if (!nav) return
    const c = sel.selected
    if (!c) return
    switch (key.name) {
      case "return":
      case "enter":
        app.view(`${t("key.logs")}: ${c.name}`, containerLogsCommand(c))
        break
      case "s":
        app.confirm({ cmd: containerCommand("start", c), title: `${t("key.start")}: ${c.name}`, onDone: load })
        break
      case "x":
        app.confirm({ cmd: containerCommand("stop", c), title: `${t("key.stop")}: ${c.name}`, onDone: load })
        break
      case "r":
        app.confirm({ cmd: containerCommand("restart", c), title: `${t("key.restart")}: ${c.name}`, onDone: load })
        break
      case "e":
        if (c.state === "running") app.interactive(containerShellArgv(c))
        break
    }
  })

  if (!items) return <Centered>{t("common.loading")}</Centered>

  const columns: Column<Container>[] = [
    { title: " ", width: 1, value: () => "●", color: (c) => stateColor(c.state) },
    { title: t("docker.name"), width: 24, value: (c) => c.name, color: () => theme.fg },
    { title: t("docker.image"), width: 26, value: (c) => c.image, color: () => theme.muted },
    { title: t("docker.status"), width: 22, value: (c) => c.status, color: (c) => stateColor(c.state) },
    { title: t("docker.cpu"), width: 7, align: "right", value: (c) => stats.get(c.name)?.cpu ?? "", color: () => theme.fg },
    { title: t("docker.mem"), width: 10, align: "right", value: (c) => stats.get(c.name)?.mem ?? "", color: () => theme.fg },
    { title: t("docker.ports"), width: "flex", value: (c) => c.ports, color: () => theme.cyan },
  ]

  return (
    <ListView
      title={`${t("tab.docker")} · ${t("key.containers")}`}
      columns={columns}
      rows={rows}
      selected={sel.index}
      onSelect={sel.moveTo}
      filter={filter}
      empty={t("docker.empty")}
    />
  )
}

function Stacks({ active }: { active: boolean }) {
  const app = useApp()
  const [items, setItems] = useState<ComposeProject[] | null>(null)
  const filter = useFilter(active)
  const nav = active && !filter.editing

  const load = useCallback(async () => setItems(await listCompose()), [])
  usePolling(load, 5000, active)

  const rows = useMemo(() => (items ?? []).filter((p) => filter.match(p.name, p.configFiles)), [items, filter.match])
  const sel = useSelection(rows, (p) => p.name, nav, 10)

  useHints(active, [
    { key: "enter", label: t("key.logs") },
    { key: "u", label: t("key.up") },
    { key: "d", label: t("key.down") },
    { key: "r", label: t("key.restart") },
    { key: "p", label: t("key.pull") },
    { key: "t", label: t("key.containers") },
  ])

  useKeyboard((key) => {
    if (!nav) return
    const p = sel.selected
    if (!p) return
    const go = (action: ComposeAction, label: string, danger = false) =>
      app.confirm({ cmd: composeCommand(action, p), title: `${label}: ${p.name}`, stream: true, danger, onDone: load })
    switch (key.name) {
      case "return":
      case "enter":
        app.view(`${t("key.logs")}: ${p.name}`, composeCommand("logs", p))
        break
      case "u":
        go("up", t("key.up"))
        break
      case "d":
        go("down", t("key.down"), true)
        break
      case "r":
        go("restart", t("key.restart"))
        break
      case "p":
        go("pull", t("key.pull"))
        break
    }
  })

  if (!items) return <Centered>{t("common.loading")}</Centered>

  const columns: Column<ComposeProject>[] = [
    { title: " ", width: 1, value: () => "●", color: (p) => (p.status.includes("running") ? theme.green : theme.dim) },
    { title: t("docker.project"), width: 24, value: (p) => p.name, color: () => theme.fg },
    { title: t("docker.status"), width: 22, value: (p) => p.status, color: (p) => (p.status.includes("running") ? theme.green : theme.muted) },
    { title: t("docker.files"), width: "flex", value: (p) => p.configFiles, color: () => theme.muted },
  ]

  return (
    <ListView
      title={`${t("tab.docker")} · ${t("key.compose")}`}
      columns={columns}
      rows={rows}
      selected={sel.index}
      onSelect={sel.moveTo}
      filter={filter}
      empty={t("docker.nocompose")}
    />
  )
}
