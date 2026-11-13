import { TextAttributes } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useMemo, useRef, useState } from "react"
import { t, type Key } from "../i18n"
import { audit } from "../lib/audit"
import type { Config } from "../lib/config"
import { currentUser, hasSudo, isRoot, run, runInteractive, type Command } from "../lib/exec"
import { fit } from "../lib/format"
import { failedCount } from "../providers/services"
import { getSnapshot, getSystemInfo, type Snapshot } from "../providers/system"
import { aptAvailable, aptUpdateCommand, listUpgrades, rebootCommand, upgradeAllCommand, type Upgrade } from "../providers/updates"
import { ConfirmModal, HelpModal, PaletteModal, StreamModal, type PaletteItem } from "./components/Modals"
import { AppContext, type ActionOptions, type AppContextValue, type Hint, type History } from "./context"
import { usePolling } from "./hooks"
import { theme } from "./theme"
import { Dashboard } from "./views/Dashboard"
import { Docker } from "./views/Docker"
import { Processes } from "./views/Processes"
import { Security } from "./views/Security"
import { Services } from "./views/Services"
import { Updates } from "./views/Updates"

const TABS: { key: Key; View: (p: { active: boolean }) => React.ReactNode }[] = [
  { key: "tab.dashboard", View: Dashboard },
  { key: "tab.services", View: Services },
  { key: "tab.processes", View: Processes },
  { key: "tab.docker", View: Docker },
  { key: "tab.updates", View: Updates },
  { key: "tab.security", View: Security },
]

type Modal =
  | { type: "confirm"; opts: ActionOptions }
  | { type: "stream"; title: string; cmd: Command; isAction: boolean; onDone?: (code: number) => void }
  | { type: "palette" }
  | { type: "help" }
  | null

const HISTORY = 120

export function App({ cfg, version }: { cfg: Config; version: string }) {
  const renderer = useRenderer()
  const term = useTerminalDimensions()
  const info = useMemo(getSystemInfo, [])
  const [tab, setTab] = useState(0)
  const [modal, setModal] = useState<Modal>(null)
  const [inputLock, setInputLock] = useState(false)
  const [hints, setHints] = useState<Hint[]>([])
  const [toastState, setToast] = useState<{ msg: string; kind: "ok" | "error" | "info" } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // --- dados compartilhados entre as abas -----------------------------------
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [history, setHistory] = useState<History>({ cpu: [], mem: [], rx: [], tx: [] })
  const [failed, setFailed] = useState(0)
  const [upgrades, setUpgrades] = useState<Upgrade[] | null>(null)

  usePolling(
    async () => {
      const s = await getSnapshot()
      setSnapshot(s)
      const push = (arr: number[], v: number) => (arr.length >= HISTORY ? [...arr.slice(1), v] : [...arr, v])
      setHistory((h) => ({ cpu: push(h.cpu, s.cpu), mem: push(h.mem, s.memPct), rx: push(h.rx, s.rxRate), tx: push(h.tx, s.txRate) }))
    },
    cfg.refreshMs,
    true,
  )
  usePolling(async () => setFailed(await failedCount()), 10_000, true)
  usePolling(async () => setUpgrades(await listUpgrades()), 10 * 60_000, aptAvailable())

  // --- ações -----------------------------------------------------------------
  const toast = useCallback((msg: string, kind: "ok" | "error" | "info" = "info") => {
    clearTimeout(toastTimer.current)
    setToast({ msg, kind })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  /** Garante que o sudo está liberado, pedindo a senha fora da interface se preciso. */
  const ensureSudo = useCallback(async (): Promise<boolean> => {
    if (isRoot || (await hasSudo())) return true
    await renderer.suspend()
    process.stdout.write(`\n  zelador: ${t("toast.sudo")}\n\n`)
    const code = await runInteractive(["sudo", "-v"])
    await renderer.resume()
    if (code !== 0) toast(t("toast.nosudo"), "error")
    return code === 0
  }, [renderer, toast])

  const execute = useCallback(
    async (opts: ActionOptions) => {
      setModal(null)
      if (opts.cmd.root && !(await ensureSudo())) return
      if (opts.stream) {
        setModal({ type: "stream", title: opts.title, cmd: opts.cmd, isAction: true, onDone: opts.onDone })
        return
      }
      toast(`${opts.title}…`, "info")
      const r = await run(opts.cmd, 120_000)
      audit(opts.cmd, r.code)
      if (r.code === 0) toast(t("toast.ok", { what: opts.title }), "ok")
      else toast(t("toast.fail", { what: (r.stderr || r.stdout).trim().split("\n").pop() || opts.title }), "error")
      opts.onDone?.(r.code)
    },
    [ensureSudo, toast],
  )

  const ctx: AppContextValue = {
    cfg,
    info,
    snapshot,
    history,
    failed,
    upgrades,
    setUpgrades,
    confirm: (opts) => setModal({ type: "confirm", opts }),
    view: async (title, cmd) => {
      if (cmd.root && !(await ensureSudo())) return
      setModal({ type: "stream", title, cmd, isAction: false })
    },
    interactive: async (argv) => {
      if (argv[0] === "sudo" && !(await ensureSudo())) return
      await renderer.suspend()
      await runInteractive(argv)
      await renderer.resume()
    },
    toast,
    setInputLock,
    setHints,
  }

  const quit = useCallback(async () => {
    renderer.destroy()
    await renderer.closed
    process.exit(0)
  }, [renderer])

  const paletteItems: PaletteItem[] = [
    ...TABS.map((tb, i) => ({ id: `tab-${i}`, label: `${t("palette.go")}: ${t(tb.key)}`, hint: String(i + 1), run: () => setTab(i) })),
    ...(aptAvailable()
      ? [
          {
            id: "apt-update",
            label: t("key.aptupdate"),
            hint: "apt",
            run: () => ctx.confirm({ cmd: aptUpdateCommand, title: t("key.aptupdate"), stream: true, onDone: async () => setUpgrades(await listUpgrades()) }),
          },
          {
            id: "apt-upgrade",
            label: t("key.upgrade"),
            hint: "apt",
            run: () => ctx.confirm({ cmd: upgradeAllCommand, title: t("key.upgrade"), stream: true, onDone: async () => setUpgrades(await listUpgrades()) }),
          },
        ]
      : []),
    { id: "reboot", label: t("key.reboot"), hint: "systemctl reboot", run: () => ctx.confirm({ cmd: rebootCommand, title: t("key.reboot"), danger: true }) },
    { id: "help", label: t("help.title"), hint: "?", run: () => setModal({ type: "help" }) },
    { id: "quit", label: t("key.quit"), hint: "q", run: quit },
  ]

  // --- atalhos globais ---------------------------------------------------------
  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") return void quit()
    if (modal || inputLock) return
    if (key.ctrl && key.name === "k") return setModal({ type: "palette" })
    if (key.name === "q") return void quit()
    if (key.sequence === "?") return setModal({ type: "help" })
    if (key.name === "tab") return setTab((i) => (i + (key.shift ? TABS.length - 1 : 1)) % TABS.length)
    if (/^[1-9]$/.test(key.sequence) && Number(key.sequence) <= TABS.length) return setTab(Number(key.sequence) - 1)
    if (key.name === "left" || key.name === "right") return setTab((i) => (i + (key.name === "left" ? TABS.length - 1 : 1)) % TABS.length)
  })

  const viewActive = !modal
  const ActiveView = TABS[tab]!.View

  return (
    <AppContext.Provider value={ctx}>
      <box flexDirection="column" width={term.width} height={term.height} backgroundColor={theme.bg}>
        <Header tab={tab} setTab={setTab} host={info.hostname} version={version} width={term.width} />
        <box flexGrow={1} flexDirection="column">
          <ActiveView key={tab} active={viewActive} />
        </box>
        <Footer hints={hints} width={term.width} toast={toastState} />

        {modal?.type === "confirm" ? (
          <ConfirmModal
            title={modal.opts.title}
            cmd={modal.opts.cmd}
            danger={modal.opts.danger}
            onConfirm={() => execute(modal.opts)}
            onCancel={() => setModal(null)}
          />
        ) : null}
        {modal?.type === "stream" ? (
          <StreamModal
            title={modal.title}
            cmd={modal.cmd}
            auditIt={modal.isAction}
            onClose={(code) => {
              setModal(null)
              if (code !== null) modal.onDone?.(code)
            }}
          />
        ) : null}
        {modal?.type === "palette" ? <PaletteModal items={paletteItems} onClose={() => setModal((m) => (m?.type === "palette" ? null : m))} /> : null}
        {modal?.type === "help" ? <HelpModal onClose={() => setModal(null)} /> : null}
      </box>
    </AppContext.Provider>
  )
}

function Header({
  tab,
  setTab,
  host,
  version,
  width,
}: {
  tab: number
  setTab: (i: number) => void
  host: string
  version: string
  width: number
}) {
  const right = `${currentUser}@${host}  v${version} `
  return (
    <box flexDirection="column" height={2} backgroundColor={theme.headerBg}>
      <box flexDirection="row" height={1}>
        <text>
          <span fg={theme.accent} attributes={TextAttributes.BOLD}>
            {" ◆ zelador "}
          </span>
          <span fg={theme.muted}>{fit(t("app.tagline"), Math.max(0, width - right.length - 12))}</span>
          <span fg={theme.dim}>{right}</span>
        </text>
      </box>
      <box flexDirection="row" height={1}>
        {TABS.map((tb, i) => {
          const on = i === tab
          return (
            <box key={tb.key} onMouseDown={() => setTab(i)} backgroundColor={on ? theme.accent : undefined} marginRight={1}>
              <text>
                <span fg={on ? theme.bg : theme.dim}>{` ${i + 1} `}</span>
                <span fg={on ? theme.bg : theme.fg} attributes={on ? TextAttributes.BOLD : 0}>{`${t(tb.key)} `}</span>
              </text>
            </box>
          )
        })}
      </box>
    </box>
  )
}

function Footer({ hints, width, toast }: { hints: Hint[]; width: number; toast: { msg: string; kind: string } | null }) {
  const global: Hint[] = [
    { key: "^K", label: t("key.palette") },
    { key: "?", label: t("key.help") },
    { key: "q", label: t("key.quit") },
  ]
  if (toast) {
    const color = toast.kind === "ok" ? theme.green : toast.kind === "error" ? theme.red : theme.cyan
    return (
      <box height={1} backgroundColor={theme.headerBg}>
        <text fg={color}>{fit(" " + toast.msg, width)}</text>
      </box>
    )
  }
  return (
    <box height={1} backgroundColor={theme.headerBg} flexDirection="row">
      <text>
        {[...hints, ...global].flatMap((h, i) => [
          <span key={`k${i}`} fg={theme.accent}>{` ${h.key}`}</span>,
          <span key={`l${i}`} fg={theme.muted}>{` ${h.label} `}</span>,
        ])}
      </text>
    </box>
  )
}
