// Subcomandos que rodam sem abrir a interface: status, doctor, update, uninstall.
import { existsSync, rmSync } from "node:fs"
import { createInterface } from "node:readline/promises"
import { t } from "./i18n"
import { AUDIT_PATH } from "./lib/audit"
import { CONFIG_PATH, type Config } from "./lib/config"
import { isRoot, run, runInteractive, which } from "./lib/exec"
import { bar, bytes, duration, pct } from "./lib/format"
import { failedCount, systemdAvailable } from "./providers/services"
import { getSnapshot, getSystemInfo } from "./providers/system"
import { cachedUpdateCounts } from "./providers/updates"
import { computeAlerts } from "./lib/alerts"

export const REPO = "silotto/zelador"
export const INSTALL_URL = `https://raw.githubusercontent.com/${REPO}/main/install.sh`
export const PROFILE_HOOK = "/etc/profile.d/zelador.sh"

const color = process.stdout.isTTY && !process.env.NO_COLOR
const c = (code: string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s)
const bold = c("1")
const dim = c("2")
const green = c("32")
const yellow = c("33")
const red = c("31")
const blue = c("34")

function usageColor(v: number, warn: number) {
  return v >= warn ? red : v >= warn * 0.75 ? yellow : green
}

/** Resumo rápido, usado também na mensagem de login. */
export async function status(cfg: Config, short: boolean) {
  const info = getSystemInfo()
  await getSnapshot() // 1ª leitura: base para calcular a CPU
  await Bun.sleep(short ? 200 : 500)
  const s = await getSnapshot()
  const failed = await failedCount()
  const updates = cachedUpdateCounts()
  const alerts = computeAlerts(s, cfg, failed, updates)

  const line = (label: string, v: number, warn: number, detail: string) =>
    `  ${label.padEnd(9)} ${usageColor(v, warn)(bar(v, 20))} ${pct(v).padStart(5)}  ${dim(detail)}`

  const out: string[] = []
  out.push("")
  out.push(`  ${blue(bold("◆ zelador"))}  ${bold(info.hostname)} ${dim(`· ${info.os} · ${t("dash.uptime").toLowerCase()} ${duration(s.uptime)}`)}`)
  out.push("")
  out.push(line(t("dash.cpu"), s.cpu, cfg.cpuWarn, `load ${s.load.map((l) => l.toFixed(2)).join(" ")}`))
  out.push(line(t("dash.memory"), s.memPct, cfg.memWarn, `${bytes(s.memUsed)} / ${bytes(s.memTotal)}`))
  const root = s.disks.find((d) => d.mount === "/") ?? s.disks[0]
  if (root) out.push(line(`${t("dash.disks").slice(0, -1)} ${root.mount}`, root.pct, cfg.diskWarn, `${bytes(root.used)} / ${bytes(root.size)}`))
  out.push("")
  if (alerts.length === 0) out.push(`  ${green(t("dash.allgood"))}`)
  for (const a of alerts) out.push(`  ${a.level === "fail" ? red("✗") : yellow("!")} ${a.text}`)
  if (short) out.push(dim(`\n  zela → ${t("app.tagline")}`))
  out.push("")
  console.log(out.join("\n"))
}

/** Verifica o ambiente e mostra o que funciona e o que falta. */
export async function doctor() {
  const ok = (m: string) => console.log(`  ${green("✓")} ${m}`)
  const warn = (m: string) => console.log(`  ${yellow("!")} ${m}`)
  const info = getSystemInfo()
  console.log(`\n  ${bold("zela doctor")}\n`)
  ok(`${info.os} · ${process.arch} · kernel ${info.kernel}`)
  isRoot ? ok("root") : which("sudo") ? ok("sudo") : warn("sem root e sem sudo: só leitura")
  systemdAvailable() ? ok("systemd") : warn("systemd não encontrado (aba Serviços desativada)")
  which("apt-get") ? ok("apt") : warn("apt não encontrado (aba Atualizações desativada)")
  if (which("docker")) {
    const r = await run(["docker", "info", "--format", "{{.ServerVersion}}"], 8000)
    r.code === 0 ? ok(`docker ${r.stdout.trim()}`) : warn("docker instalado, mas sem acesso ao daemon")
  } else warn("docker não instalado (opcional)")
  which("ss") ? ok("ss (iproute2)") : warn("ss não encontrado (lista de portas indisponível)")
  existsSync(CONFIG_PATH) ? ok(`config: ${CONFIG_PATH}`) : warn(`sem config (usando padrões): ${CONFIG_PATH}`)
  ok(`auditoria: ${AUDIT_PATH}`)
  console.log("")
}

/** Atualiza rodando o instalador de novo (ele baixa a versão mais recente). */
export async function update(version?: string) {
  const fetcher = which("curl") ? `curl -fsSL ${INSTALL_URL}` : which("wget") ? `wget -qO- ${INSTALL_URL}` : null
  if (!fetcher) {
    console.error(red("Precisa de curl ou wget para atualizar."))
    process.exit(1)
  }
  const args = version ? ` -s -- --version ${version}` : ""
  const argv = ["bash", "-c", `${fetcher} | bash${args}`]
  const code = await runInteractive(isRoot ? argv : ["sudo", ...argv])
  process.exit(code)
}

export async function uninstall(yes: boolean) {
  if (!isRoot) {
    const code = await runInteractive(["sudo", process.execPath, "uninstall", ...(yes ? ["--yes"] : [])])
    process.exit(code)
  }
  if (!yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = (await rl.question("Remover o zelador deste servidor? [s/N] ")).trim().toLowerCase()
    rl.close()
    if (!["s", "sim", "y", "yes"].includes(answer)) return console.log("Cancelado.")
  }
  const targets = [process.execPath, "/usr/local/bin/zela", PROFILE_HOOK, "/etc/zelador"]
  for (const p of new Set(targets)) {
    if (p.includes("/bun") || !existsSync(p)) continue // nunca apagar o bun em modo dev
    rmSync(p, { recursive: true, force: true })
    console.log(`  ${dim("removido")} ${p}`)
  }
  console.log(green("\n  zelador removido. Até mais! 👋\n"))
}

export function help(version: string) {
  console.log(`
  ${blue(bold("◆ zelador"))} ${dim("v" + version)} — ${t("app.tagline")}

  ${bold("Uso:")}
    zela                 abre o painel
    zela status          resumo rápido do servidor
    zela doctor          verifica dependências e permissões
    zela update          atualiza para a versão mais recente
    zela uninstall       remove o zelador
    zela --version       mostra a versão

  ${bold("Opções:")}
    --lang pt|en         idioma da interface

  ${dim(`Configuração: ${CONFIG_PATH}`)}
  ${dim(`https://github.com/${REPO}`)}
`)
}
