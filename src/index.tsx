#!/usr/bin/env bun
import pkg from "../package.json"
import { doctor, help, status, uninstall, update } from "./cli"
import { setLang } from "./i18n"
import { loadConfig } from "./lib/config"

const VERSION = pkg.version
const args = process.argv.slice(2)

function flag(name: string): string | undefined {
  const i = args.indexOf(name)
  if (i < 0) return undefined
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}

const cfg = loadConfig()
const langArg = flag("--lang")
if (langArg === "pt" || langArg === "en") cfg.lang = langArg
setLang(cfg.lang)

const cmd = args[0]

switch (cmd) {
  case "-v":
  case "--version":
  case "version":
    console.log(VERSION)
    break
  case "-h":
  case "--help":
  case "help":
    help(VERSION)
    break
  case "status":
    await status(cfg, args.includes("--short"))
    break
  case "doctor":
    await doctor()
    break
  case "update":
  case "upgrade":
    await update(flag("--version"))
    break
  case "uninstall":
    await uninstall(args.includes("--yes") || args.includes("-y"))
    break
  case undefined:
    await startTui()
    break
  default:
    console.error(`Comando desconhecido: ${cmd}\n`)
    help(VERSION)
    process.exit(1)
}

async function startTui() {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error("O painel precisa de um terminal interativo. Use `zela status` para um resumo em texto.")
    process.exit(1)
  }
  // imports dinâmicos: `zela status` fica rápido sem carregar o React/OpenTUI
  const [{ createCliRenderer }, { createRoot }, { App }] = await Promise.all([
    import("@opentui/core"),
    import("@opentui/react"),
    import("./ui/App"),
  ])
  const renderer = await createCliRenderer({ exitOnCtrlC: false, useMouse: true, targetFps: 30 })
  createRoot(renderer).render(<App cfg={cfg} version={VERSION} />)
}
