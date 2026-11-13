// Configuração em /etc/zelador/config.toml (opcional; tudo tem padrão).
import { existsSync, readFileSync } from "node:fs"

export interface Config {
  /** "pt" ou "en". Padrão: detecta pelo LANG do sistema. */
  lang: "pt" | "en"
  /** Intervalo de atualização do painel, em ms. */
  refreshMs: number
  /** Limites (em %) a partir dos quais o painel alerta. */
  diskWarn: number
  memWarn: number
  cpuWarn: number
}

export const CONFIG_PATH = process.env.ZELADOR_CONFIG || "/etc/zelador/config.toml"

function detectLang(): "pt" | "en" {
  const l = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "").toLowerCase()
  if (l.startsWith("en")) return "en"
  return "pt"
}

export const DEFAULT_CONFIG: Config = {
  lang: detectLang(),
  refreshMs: 2000,
  diskWarn: 85,
  memWarn: 90,
  cpuWarn: 90,
}

export function loadConfig(path = CONFIG_PATH): Config {
  const cfg = { ...DEFAULT_CONFIG }
  if (!existsSync(path)) return cfg
  try {
    const raw = Bun.TOML.parse(readFileSync(path, "utf8")) as Record<string, any>
    if (raw.lang === "pt" || raw.lang === "en") cfg.lang = raw.lang
    if (typeof raw.refresh_ms === "number") cfg.refreshMs = Math.max(500, raw.refresh_ms)
    const a = raw.alerts ?? {}
    if (typeof a.disk === "number") cfg.diskWarn = a.disk
    if (typeof a.memory === "number") cfg.memWarn = a.memory
    if (typeof a.cpu === "number") cfg.cpuWarn = a.cpu
  } catch {
    // Config inválida: segue com os padrões em vez de quebrar o painel.
  }
  return cfg
}

export const DEFAULT_CONFIG_TOML = `# Configuração do zelador — https://github.com/silotto/zelador
# Idioma da interface: "pt" ou "en"
lang = "pt"

# Intervalo de atualização do painel (milissegundos)
refresh_ms = 2000

# Alertas: o painel avisa quando o uso passar destes limites (%)
[alerts]
disk = 85
memory = 90
cpu = 90
`
