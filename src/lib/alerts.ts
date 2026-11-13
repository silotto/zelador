import { t } from "../i18n"
import type { Snapshot } from "../providers/system"
import { pct } from "./format"

export interface Alert {
  level: "warn" | "fail"
  text: string
}

export function computeAlerts(
  s: Snapshot,
  cfg: { diskWarn: number; memWarn: number; cpuWarn: number },
  failed: number,
  updates: { total: number; security: number } | null,
): Alert[] {
  const out: Alert[] = []
  for (const d of s.disks) {
    if (d.pct >= cfg.diskWarn) out.push({ level: d.pct >= 95 ? "fail" : "warn", text: t("alert.disk", { mount: d.mount, pct: pct(d.pct) }) })
  }
  if (s.memPct >= cfg.memWarn) out.push({ level: "warn", text: t("alert.mem", { pct: pct(s.memPct) }) })
  if (s.cpu >= cfg.cpuWarn) out.push({ level: "warn", text: t("alert.cpu", { pct: pct(s.cpu) }) })
  if (s.swapTotal === 0 && s.memPct >= 80) out.push({ level: "warn", text: t("alert.noswap") })
  if (failed > 0) out.push({ level: "fail", text: t("alert.failed", { n: failed }) })
  if (updates && updates.total > 0)
    out.push({ level: updates.security > 0 ? "fail" : "warn", text: t("alert.updates", { n: updates.total, s: updates.security }) })
  if (s.rebootRequired) out.push({ level: "warn", text: t("alert.reboot") })
  return out
}
