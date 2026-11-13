import { useKeyboard } from "@opentui/react"
import { useCallback, useMemo, useState } from "react"
import { t } from "../../i18n"
import {
  listServices,
  serviceCommand,
  serviceLogsCommand,
  systemdAvailable,
  type Service,
  type ServiceAction,
} from "../../providers/services"
import { Centered } from "../components/Panel"
import { ListView } from "../components/ListView"
import type { Column } from "../components/Table"
import { useApp } from "../context"
import { useFilter, useHints, usePolling, useSelection } from "../hooks"
import { theme } from "../theme"

function stateColor(s: Service) {
  if (s.active === "failed") return theme.red
  if (s.active === "active") return theme.green
  if (s.active === "activating" || s.active === "deactivating" || s.active === "reloading") return theme.yellow
  return theme.dim
}

export function Services({ active }: { active: boolean }) {
  const app = useApp()
  const available = useMemo(systemdAvailable, [])
  const [services, setServices] = useState<Service[] | null>(null)
  const [failedOnly, setFailedOnly] = useState(false)
  const filter = useFilter(active)
  const nav = active && !filter.editing

  const load = useCallback(async () => setServices(await listServices()), [])
  usePolling(load, 5000, active && available)

  const rows = useMemo(
    () => (services ?? []).filter((s) => (!failedOnly || s.active === "failed") && filter.match(s.name, s.description)),
    [services, failedOnly, filter.match],
  )
  const sel = useSelection(rows, (s) => s.unit, nav, 10)

  useHints(active, [
    { key: "enter", label: t("key.logs") },
    { key: "s", label: t("key.start") },
    { key: "x", label: t("key.stop") },
    { key: "r", label: t("key.restart") },
    { key: "e/d", label: `${t("key.enable")}/${t("key.disable")}` },
    { key: "f", label: t("key.failed") },
    { key: "/", label: t("key.filter") },
  ])

  const act = (action: ServiceAction, s: Service) => {
    const labels: Record<ServiceAction, string> = {
      start: t("key.start"),
      stop: t("key.stop"),
      restart: t("key.restart"),
      enable: t("key.enable"),
      disable: t("key.disable"),
    }
    app.confirm({ cmd: serviceCommand(action, s.unit), title: `${labels[action]}: ${s.name}`, onDone: load })
  }

  useKeyboard((key) => {
    if (!nav) return
    const s = sel.selected
    if (key.name === "f") return setFailedOnly((v) => !v)
    if (!s) return
    switch (key.name) {
      case "return":
      case "enter":
        app.view(`${t("key.logs")}: ${s.name}`, serviceLogsCommand(s.unit))
        break
      case "s":
        act("start", s)
        break
      case "x":
        act("stop", s)
        break
      case "r":
        act("restart", s)
        break
      case "e":
        act("enable", s)
        break
      case "d":
        act("disable", s)
        break
    }
  })

  if (!available) return <Centered>{t("svc.unavailable")}</Centered>
  if (!services) return <Centered>{t("common.loading")}</Centered>

  const columns: Column<Service>[] = [
    { title: " ", width: 1, value: () => "●", color: stateColor },
    { title: t("svc.unit"), width: 30, value: (s) => s.name, color: (s) => (s.active === "failed" ? theme.red : undefined) },
    { title: t("svc.active"), width: 18, value: (s) => `${s.active} (${s.sub})`, color: stateColor },
    {
      title: t("svc.enabled"),
      width: 9,
      value: (s) => s.enabled,
      color: (s) => (s.enabled === "enabled" ? theme.fg : theme.dim),
    },
    { title: t("svc.description"), width: "flex", value: (s) => s.description, color: () => theme.muted },
  ]

  return (
    <ListView
      title={t("tab.services") + (failedOnly ? ` · ${t("key.failed")}` : "")}
      columns={columns}
      rows={rows}
      selected={sel.index}
      onSelect={sel.moveTo}
      filter={filter}
    />
  )
}
