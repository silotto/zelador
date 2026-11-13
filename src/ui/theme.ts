export const theme = {
  bg: "#16161e",
  panel: "#1a1b26",
  border: "#2f334d",
  borderActive: "#7aa2f7",
  fg: "#c0caf5",
  muted: "#737aa2",
  dim: "#545c7e",
  accent: "#7aa2f7",
  accent2: "#bb9af7",
  cyan: "#7dcfff",
  green: "#9ece6a",
  yellow: "#e0af68",
  orange: "#ff9e64",
  red: "#f7768e",
  selBg: "#283457",
  headerBg: "#1f2335",
}

/** Cor para um percentual de uso (verde → amarelo → vermelho). */
export function usageColor(pct: number, warn = 85): string {
  if (pct >= warn) return theme.red
  if (pct >= warn * 0.75) return theme.yellow
  return theme.green
}
