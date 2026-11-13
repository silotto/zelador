import { useKeyboard } from "@opentui/react"
import { useCallback, useMemo, useState } from "react"
import { lang, t } from "../../i18n"
import { duration } from "../../lib/format"
import {
  aptAvailable,
  aptUpdateCommand,
  lastAptUpdate,
  listUpgrades,
  rebootCommand,
  rebootRequired,
  upgradeAllCommand,
  upgradePackagesCommand,
  type Upgrade,
} from "../../providers/updates"
import { ListView } from "../components/ListView"
import { Centered } from "../components/Panel"
import type { Column } from "../components/Table"
import { useApp } from "../context"
import { useFilter, useHints, usePolling, useSelection } from "../hooks"
import { theme } from "../theme"

export function Updates({ active }: { active: boolean }) {
  const app = useApp()
  const available = useMemo(aptAvailable, [])
  const filter = useFilter(active)
  const nav = active && !filter.editing
  const [reboot, setReboot] = useState(rebootRequired())
  const [age, setAge] = useState<number | null>(lastAptUpdate())

  const load = useCallback(async () => {
    app.setUpgrades(await listUpgrades())
    setReboot(rebootRequired())
    setAge(lastAptUpdate())
  }, [app.setUpgrades])
  usePolling(load, 60_000, active && available)

  const all = app.upgrades ?? []
  const rows = useMemo(() => all.filter((u) => filter.match(u.name, u.origin)), [all, filter.match])
  const sel = useSelection(rows, (u) => u.name, nav, 10)
  const security = all.filter((u) => u.security)

  useHints(active, [
    { key: "a", label: t("key.aptupdate") },
    { key: "u", label: t("key.upgrade") },
    { key: "s", label: t("key.security") },
    { key: "b", label: t("key.reboot") },
    { key: "/", label: t("key.filter") },
  ])

  useKeyboard((key) => {
    if (!nav) return
    switch (key.name) {
      case "a":
        app.confirm({ cmd: aptUpdateCommand, title: t("key.aptupdate"), stream: true, onDone: load })
        break
      case "u":
        if (all.length) app.confirm({ cmd: upgradeAllCommand, title: t("key.upgrade"), stream: true, onDone: load })
        break
      case "s":
        if (security.length)
          app.confirm({
            cmd: upgradePackagesCommand(security.map((u) => u.name)),
            title: `${t("key.security")} (${security.length})`,
            stream: true,
            onDone: load,
          })
        break
      case "b":
        app.confirm({ cmd: rebootCommand, title: t("key.reboot"), danger: true })
        break
    }
  })

  if (!available) return <Centered>{t("upd.unsupported")}</Centered>
  if (!app.upgrades) return <Centered>{t("common.loading")}</Centered>

  const columns: Column<Upgrade>[] = [
    { title: " ", width: 1, value: (u) => (u.security ? "!" : "·"), color: (u) => (u.security ? theme.red : theme.dim) },
    { title: t("upd.package"), width: 32, value: (u) => u.name, color: (u) => (u.security ? theme.red : theme.fg) },
    { title: t("upd.from"), width: 26, value: (u) => u.from, color: () => theme.muted },
    { title: t("upd.to"), width: 26, value: (u) => u.version, color: () => theme.green },
    { title: t("upd.origin"), width: "flex", value: (u) => u.origin, color: () => theme.dim },
  ]

  const when = age === null ? t("upd.never") : duration(age, lang())
  const extra = (
    <box flexDirection="row" height={1}>
      <text>
        <span fg={security.length ? theme.red : theme.fg}>{t("upd.summary", { n: all.length, s: security.length })}</span>
        <span fg={theme.muted}>{"   " + t("upd.lastcheck", { when })}</span>
        {reboot.required ? <span fg={theme.yellow}>{"   " + t("upd.reboot")}</span> : null}
      </text>
    </box>
  )

  return (
    <ListView
      title={t("tab.updates")}
      columns={columns}
      rows={rows}
      selected={sel.index}
      onSelect={sel.moveTo}
      filter={filter}
      empty={t("upd.none")}
      extra={extra}
      reserved={1}
    />
  )
}
