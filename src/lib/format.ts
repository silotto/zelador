export function bytes(n: number, digits = 1): string {
  if (!Number.isFinite(n) || n < 0) return "-"
  const units = ["B", "K", "M", "G", "T", "P"]
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i === 0 ? 0 : digits)}${units[i]}`
}

export function rate(bytesPerSec: number): string {
  return `${bytes(bytesPerSec)}/s`
}

export function pct(n: number): string {
  if (!Number.isFinite(n)) return "-"
  return `${n.toFixed(n >= 10 ? 0 : 1)}%`
}

export function duration(seconds: number, lang: "pt" | "en" = "pt"): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const dl = lang === "pt" ? "d" : "d"
  if (d > 0) return `${d}${dl} ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${Math.floor(seconds)}s`
}

/** Corta/preenche um texto para caber exatamente em `width` colunas. */
export function fit(s: string, width: number, align: "left" | "right" = "left"): string {
  if (width <= 0) return ""
  const chars = [...s]
  if (chars.length > width) return width === 1 ? "…" : chars.slice(0, width - 1).join("") + "…"
  const pad = " ".repeat(width - chars.length)
  return align === "left" ? s + pad : pad + s
}

/** Barra de progresso em texto: ███████░░░ */
export function bar(value: number, width: number): string {
  const v = Math.max(0, Math.min(100, value))
  const full = Math.round((v / 100) * width)
  return "█".repeat(full) + "░".repeat(Math.max(0, width - full))
}

const SPARK = "▁▂▃▄▅▆▇█"

/** Sparkline: ▁▂▄▆█ — valores de 0 a 100 (ou normalizados pelo máximo). */
export function sparkline(values: number[], width: number, max?: number): string {
  const v = values.slice(-width)
  const top = max ?? Math.max(1, ...v)
  const s = v.map((x) => SPARK[Math.min(SPARK.length - 1, Math.max(0, Math.round((x / top) * (SPARK.length - 1))))]).join("")
  return " ".repeat(Math.max(0, width - v.length)) + s
}
