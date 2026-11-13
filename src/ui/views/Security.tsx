import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useCallback, useState } from "react"
import { t } from "../../i18n"
import { isRoot } from "../../lib/exec"
import { fit } from "../../lib/format"
import { listPorts, runChecks, type Check, type Port } from "../../providers/security"
import { Centered, Panel } from "../components/Panel"
import { Table, type Column } from "../components/Table"
import { useApp } from "../context"
import { useHints, usePolling } from "../hooks"
import { theme } from "../theme"

const ICON: Record<Check["status"], [string, string]> = {
  ok: ["✓", theme.green],
  warn: ["!", theme.yellow],
  fail: ["✗", theme.red],
  unknown: ["?", theme.dim],
}

export function Security({ active }: { active: boolean }) {
  const app = useApp()
  const term = useTerminalDimensions()
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [ports, setPorts] = useState<Port[]>([])

  const securityUpdates = app.upgrades ? app.upgrades.filter((u) => u.security).length : null
  const load = useCallback(async () => {
    const p = await listPorts()
    setPorts(p)
    setChecks(await runChecks(securityUpdates, p))
  }, [securityUpdates])
  usePolling(load, 30_000, active)
  useHints(active, [])

  if (!checks) return <Centered>{t("common.loading")}</Centered>

  const ok = checks.filter((c) => c.status === "ok").length
  const width = term.width - 4
  const titleW = 38

  const portColumns: Column<Port>[] = [
    { title: t("sec.proto"), width: 6, value: (p) => p.proto, color: () => theme.muted },
    { title: t("sec.port"), width: 6, align: "right", value: (p) => String(p.port), color: () => theme.accent },
    { title: t("sec.address"), width: 24, value: (p) => p.address, color: (p) => (p.public ? theme.yellow : theme.green) },
    { title: t("sec.process"), width: "flex", value: (p) => p.process || (isRoot ? "" : "?"), color: () => theme.fg },
  ]
  // cada checagem ocupa 1 linha (+1 se tiver dica)
  const checksHeight = checks.reduce((n, c) => n + (c.hint && c.status !== "ok" ? 2 : 1), 0) + 2
  const portsHeight = Math.max(3, term.height - 5 - checksHeight - 2)

  return (
    <box flexDirection="column" flexGrow={1}>
      <Panel title={`${t("sec.title")} · ${t("sec.score", { ok, total: checks.length })}${isRoot ? "" : " " + t("sec.needroot")}`} focused={active}>
        {checks.map((c) => {
          const [icon, color] = ICON[c.status]
          return (
            <box key={c.id} flexDirection="column">
              <text>
                <span fg={color} attributes={TextAttributes.BOLD}>{`${icon} `}</span>
                <span fg={theme.fg}>{fit(t(c.title), titleW)}</span>
                <span fg={color}>{t(c.detail, c.vars)}</span>
              </text>
              {c.hint && c.status !== "ok" ? <text fg={theme.muted}>{"  ↳ " + fit(t(c.hint), width - 4)}</text> : null}
            </box>
          )
        })}
      </Panel>
      <Panel title={`${t("sec.ports")} · ${ports.length}`} flexGrow={1}>
        <Table columns={portColumns} rows={ports} selected={-1} width={width} height={portsHeight} focused={false} />
      </Panel>
    </box>
  )
}
