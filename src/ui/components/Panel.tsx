import type { ReactNode } from "react"
import { bar, fit, pct, sparkline } from "../../lib/format"
import { theme, usageColor } from "../theme"

export function Panel({
  title,
  children,
  flexGrow,
  flexShrink,
  width,
  height,
  focused,
}: {
  title: string
  children: ReactNode
  flexGrow?: number
  flexShrink?: number
  width?: number | `${number}%`
  height?: number
  focused?: boolean
}) {
  return (
    <box
      border
      borderStyle="rounded"
      borderColor={focused ? theme.borderActive : theme.border}
      title={` ${title} `}
      titleAlignment="left"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      flexGrow={flexGrow}
      flexShrink={flexShrink}
      overflow="hidden"
      width={width}
      height={height}
    >
      {children}
    </box>
  )
}

/** Linha "Rótulo  ██████░░░░  42%  ▁▂▄▆" */
export function Meter({
  label,
  value,
  width,
  detail,
  history,
  warn,
  labelWidth = 9,
}: {
  labelWidth?: number
  label: string
  value: number
  width: number
  detail?: string
  history?: number[]
  warn?: number
}) {
  const labelW = labelWidth
  const pctW = 5
  const detailW = detail ? 18 : 0
  const sparkW = history ? Math.min(40, Math.max(0, Math.floor((width - labelW - pctW - detailW) * 0.45))) : 0
  const barW = Math.max(5, Math.min(40, width - labelW - pctW - detailW - sparkW - 4))
  const color = usageColor(value, warn)
  return (
    <text>
      <span fg={theme.muted}>{fit(label, labelW - 1) + " "}</span>
      <span fg={color}>{bar(value, barW)}</span>
      <span fg={theme.fg}>{" " + fit(pct(value), pctW, "right")}</span>
      {detail ? <span fg={theme.muted}>{"  " + fit(detail, detailW - 1)}</span> : null}
      {history && sparkW > 0 ? <span fg={theme.accent}>{" " + sparkline(history, sparkW, 100)}</span> : null}
    </text>
  )
}

export function KV({ k, v, kw = 11, color }: { k: string; v: string; kw?: number; color?: string }) {
  return (
    <text>
      <span fg={theme.muted}>{fit(k, kw)}</span>
      <span fg={color ?? theme.fg}>{v}</span>
    </text>
  )
}

export function Centered({ children, color = theme.muted }: { children: string; color?: string }) {
  return (
    <box flexGrow={1} alignItems="center" justifyContent="center">
      <text fg={color}>{children}</text>
    </box>
  )
}
