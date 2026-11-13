import { useTerminalDimensions } from "@opentui/react"
import { useState } from "react"
import { lang, t } from "../../i18n"
import { bytes, duration, fit, rate, sparkline } from "../../lib/format"
import { computeAlerts } from "../../lib/alerts"
import { useApp } from "../context"
import { useHints, usePolling } from "../hooks"
import { listProcesses, type Proc } from "../../providers/processes"
import { Centered, KV, Meter, Panel } from "../components/Panel"
import { theme } from "../theme"

export function Dashboard({ active }: { active: boolean }) {
  const { info, snapshot: s, history, cfg, failed, upgrades } = useApp()
  const term = useTerminalDimensions()
  useHints(active, [])

  if (!s) return <Centered>{t("common.loading")}</Centered>

  const wide = term.width >= 100
  const leftW = wide ? 40 : term.width - 2
  const rightW = wide ? term.width - leftW - 2 : term.width - 2
  const inner = rightW - 4
  const updates = upgrades ? { total: upgrades.length, security: upgrades.filter((u) => u.security).length } : null
  const alerts = computeAlerts(s, cfg, failed, updates)
  const halfW = Math.floor(term.width / 2)
  const diskLabelW = Math.min(16, Math.max(6, ...s.disks.map((d) => d.mount.length + 1)))
  const lowerH = Math.max(s.disks.length, alerts.length + 1, 1) + 2

  return (
    <box flexDirection="column" flexGrow={1}>
      <box flexDirection={wide ? "row" : "column"} flexShrink={0}>
        <Panel title={t("dash.system")} width={wide ? leftW : undefined}>
          <KV k={t("dash.host")} v={info.hostname} color={theme.accent} />
          <KV k={t("dash.os")} v={info.os} />
          <KV k={t("dash.kernel")} v={info.kernel} />
          <KV k={t("dash.uptime")} v={duration(s.uptime, lang())} />
          <KV k={t("dash.ip")} v={info.ips.slice(0, 2).join(", ") || "-"} />
          <KV k={t("dash.load")} v={s.load.map((l) => l.toFixed(2)).join("  ")} color={s.load[0] > info.cores ? theme.yellow : theme.fg} />
        </Panel>
        <Panel title={`${t("dash.cpu")} · ${t("dash.memory")}`} flexGrow={1}>
          <Meter label={t("dash.cpu")} value={s.cpu} width={inner} detail={t("dash.cores", { n: info.cores })} history={history.cpu} warn={cfg.cpuWarn} />
          <Meter
            label={t("dash.memory")}
            value={s.memPct}
            width={inner}
            detail={`${bytes(s.memUsed)} / ${bytes(s.memTotal)}`}
            history={history.mem}
            warn={cfg.memWarn}
          />
          {s.swapTotal > 0 ? (
            <Meter label={t("dash.swap")} value={s.swapPct} width={inner} detail={`${bytes(s.swapUsed)} / ${bytes(s.swapTotal)}`} history={[]} />
          ) : (
            <KV k={t("dash.swap")} kw={9} v="-" color={theme.dim} />
          )}
          <text> </text>
          <NetLine label={t("dash.down")} value={s.rxRate} hist={history.rx} width={inner} color={theme.cyan} />
          <NetLine label={t("dash.up")} value={s.txRate} hist={history.tx} width={inner} color={theme.accent2} />
        </Panel>
      </box>

      <box flexDirection={wide ? "row" : "column"} height={wide ? lowerH : undefined} flexShrink={0}>
        <Panel title={t("dash.disks")} width={wide ? halfW : undefined}>
          {s.disks.map((d) => (
            <Meter
              key={d.mount}
              label={d.mount}
              labelWidth={diskLabelW}
              value={d.pct}
              width={(wide ? halfW : term.width - 2) - 4}
              detail={`${bytes(d.used)} / ${bytes(d.size)}`}
              warn={cfg.diskWarn}
            />
          ))}
        </Panel>
        <Panel title={t("dash.alerts")} flexGrow={1}>
          {alerts.length === 0 ? (
            <text fg={theme.green}>{t("dash.allgood")}</text>
          ) : (
            alerts.map((a, i) => (
              <text key={i}>
                <span fg={a.level === "fail" ? theme.red : theme.yellow}>{a.level === "fail" ? "✗ " : "! "}</span>
                <span fg={theme.fg}>{a.text}</span>
              </text>
            ))
          )}
        </Panel>
      </box>

      <Panel title={t("dash.top")} flexGrow={1} flexShrink={1}>
        <TopProcesses width={term.width - 4} rows={Math.max(1, term.height - 3 - (wide ? 8 : 16) - lowerH - 3)} memTotal={s.memTotal} refreshMs={cfg.refreshMs} active={active} />
      </Panel>
    </box>
  )
}

/** Os processos que mais consomem CPU agora. */
function TopProcesses({ width, rows, memTotal, refreshMs, active }: { width: number; rows: number; memTotal: number; refreshMs: number; active: boolean }) {
  const [procs, setProcs] = useState<Proc[]>([])
  usePolling(() => setProcs(listProcesses(memTotal).sort((a, b) => b.cpu - a.cpu || b.rss - a.rss)), refreshMs, active)
  const cmdW = Math.max(10, width - 7 - 10 - 7 - 8 - 4)
  return (
    <box flexDirection="column" flexGrow={1} overflow="hidden">
      <text fg={theme.muted}>
        {fit(t("proc.pid"), 7, "right") + " " + fit(t("proc.user"), 10) + " " + fit(t("proc.cpu"), 7, "right") + " " + fit(t("proc.rss"), 8, "right") + " " + t("proc.command")}
      </text>
      {procs.slice(0, rows).map((p) => (
        <text key={p.pid}>
          <span fg={theme.dim}>{fit(String(p.pid), 7, "right") + " "}</span>
          <span fg={p.uid === 0 ? theme.orange : theme.fg}>{fit(p.user, 10) + " "}</span>
          <span fg={p.cpu > 50 ? theme.red : p.cpu > 10 ? theme.yellow : theme.fg}>{fit(p.cpu.toFixed(1) + "%", 7, "right") + " "}</span>
          <span fg={theme.muted}>{fit(bytes(p.rss), 8, "right") + " "}</span>
          <span fg={theme.fg}>{fit(p.command, cmdW)}</span>
        </text>
      ))}
    </box>
  )
}

function NetLine({ label, value, hist, width, color }: { label: string; value: number; hist: number[]; width: number; color: string }) {
  const labelW = 13
  const valW = 10
  const sparkW = Math.max(0, Math.min(40, width - labelW - valW - 2))
  return (
    <text>
      <span fg={theme.muted}>{fit(label, labelW)}</span>
      <span fg={theme.fg}>{fit(rate(value), valW, "right")}</span>
      <span fg={color}>{"  " + sparkline(hist, sparkW)}</span>
    </text>
  )
}

