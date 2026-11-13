import { TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { t } from "../../i18n"
import { audit, AUDIT_PATH } from "../../lib/audit"
import { formatCommand, stream, type Command } from "../../lib/exec"
import { fit } from "../../lib/format"
import { theme } from "../theme"
import { visibleWindow } from "./Table"

/** Caixa centralizada sobre o resto da tela. */
export function Overlay({
  title,
  width,
  height,
  borderColor = theme.borderActive,
  children,
}: {
  title: string
  width: number
  height: number
  borderColor?: string
  children: ReactNode
}) {
  const term = useTerminalDimensions()
  const w = Math.min(width, term.width - 2)
  const h = Math.min(height, term.height - 2)
  return (
    <box
      position="absolute"
      left={Math.max(0, Math.floor((term.width - w) / 2))}
      top={Math.max(0, Math.floor((term.height - h) / 2))}
      width={w}
      height={h}
      zIndex={100}
      border
      borderStyle="rounded"
      borderColor={borderColor}
      backgroundColor={theme.panel}
      title={` ${title} `}
      titleAlignment="left"
      paddingLeft={1}
      paddingRight={1}
      flexDirection="column"
    >
      {children}
    </box>
  )
}

// --- Confirmação ---------------------------------------------------------------

export function ConfirmModal({
  title,
  cmd,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string
  cmd: Command
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useKeyboard((key) => {
    const k = key.name
    if (k === "y" || k === "s" || k === "return" || k === "enter") onConfirm()
    else if (k === "n" || k === "escape" || k === "q") onCancel()
  })
  const command = formatCommand(cmd)
  const lines = Math.ceil(command.length / 64) + 1
  return (
    <Overlay
      title={danger ? t("confirm.danger") : t("confirm.title")}
      width={72}
      height={8 + lines}
      borderColor={danger ? theme.red : theme.borderActive}
    >
      <text fg={theme.fg} attributes={TextAttributes.BOLD}>
        {title}
      </text>
      <text> </text>
      <text fg={theme.muted}>{t("confirm.willrun")}</text>
      <text fg={danger ? theme.red : theme.cyan}>{`$ ${command}`}</text>
      <box flexGrow={1} />
      <text>
        <span fg={danger ? theme.red : theme.green}>{t("confirm.yes")}</span>
        <span fg={theme.muted}>{"    " + t("confirm.no")}</span>
      </text>
    </Overlay>
  )
}

// --- Saída ao vivo -------------------------------------------------------------

const MAX_LINES = 5000

export function StreamModal({
  title,
  cmd,
  auditIt,
  onClose,
}: {
  title: string
  cmd: Command
  /** Ações (não logs) são registradas na auditoria. */
  auditIt: boolean
  onClose: (code: number | null) => void
}) {
  const term = useTerminalDimensions()
  const [lines, setLines] = useState<{ text: string; err: boolean }[]>([])
  const [code, setCode] = useState<number | null>(null)
  const [follow, setFollow] = useState(true)
  const [offset, setOffset] = useState(0) // linhas acima do fim quando não está seguindo
  const buffer = useRef<{ text: string; err: boolean }[]>([])
  const handle = useRef<ReturnType<typeof stream> | null>(null)

  useEffect(() => {
    const h = stream(cmd, (text, err) => buffer.current.push({ text, err }))
    handle.current = h
    // junta as linhas e atualiza a tela no máximo 10x por segundo
    const flush = setInterval(() => {
      if (!buffer.current.length) return
      const chunk = buffer.current
      buffer.current = []
      setLines((prev) => {
        const next = prev.concat(chunk)
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
      })
    }, 100)
    h.done.then((c) => {
      setTimeout(() => setCode(c), 120)
      if (auditIt) audit(cmd, c)
    })
    return () => {
      clearInterval(flush)
      h.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const width = term.width - 4
  const height = term.height - 2
  const bodyHeight = Math.max(1, height - 4)
  const innerWidth = width - 4

  useKeyboard((key) => {
    switch (key.name) {
      case "escape":
      case "q":
        handle.current?.kill()
        onClose(code)
        break
      case "f":
        setFollow((f) => !f)
        setOffset(0)
        break
      case "up":
      case "k":
        setFollow(false)
        setOffset((o) => Math.min(Math.max(0, lines.length - bodyHeight), o + 1))
        break
      case "down":
      case "j":
        setOffset((o) => Math.max(0, o - 1))
        break
      case "pageup":
        setFollow(false)
        setOffset((o) => Math.min(Math.max(0, lines.length - bodyHeight), o + bodyHeight))
        break
      case "pagedown":
        setOffset((o) => Math.max(0, o - bodyHeight))
        break
      case "end":
        setFollow(true)
        setOffset(0)
        break
    }
  })

  const effectiveOffset = follow ? 0 : offset
  const endIdx = Math.max(0, lines.length - effectiveOffset)
  const startIdx = Math.max(0, endIdx - bodyHeight)
  const visible = lines.slice(startIdx, endIdx)

  const status =
    code === null ? t("stream.running") : code === 0 ? t("stream.done") : t("stream.failed", { code })
  const statusColor = code === null ? theme.yellow : code === 0 ? theme.green : theme.red

  return (
    <Overlay title={title} width={width} height={height}>
      <text fg={theme.dim}>{fit(`$ ${formatCommand(cmd)}`, innerWidth)}</text>
      <box flexDirection="column" height={bodyHeight}>
        {visible.map((l, i) => (
          <text key={startIdx + i} fg={l.err ? theme.orange : theme.fg}>
            {fit(l.text.replace(/\t/g, "  "), innerWidth)}
          </text>
        ))}
      </box>
      <text>
        <span fg={statusColor}>{status}</span>
        <span fg={theme.muted}>
          {"   " +
            (code === null ? t("stream.stop") : t("stream.close")) +
            "   " +
            t("stream.follow", { on: follow ? t("stream.on") : t("stream.off") }) +
            "   ↑↓ PgUp PgDn"}
        </span>
      </text>
    </Overlay>
  )
}

// --- Paleta de comandos -------------------------------------------------------

export interface PaletteItem {
  id: string
  label: string
  hint?: string
  run: () => void
}

export function PaletteModal({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const [sel, setSel] = useState(0)
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return items
    return items.filter((i) => (i.label + " " + (i.hint ?? "")).toLowerCase().includes(q))
  }, [items, query])

  useEffect(() => setSel(0), [query])

  useKeyboard((key) => {
    if (key.name === "escape") onClose()
    else if (key.name === "up") setSel((s) => Math.max(0, s - 1))
    else if (key.name === "down") setSel((s) => Math.min(filtered.length - 1, s + 1))
    else if (key.name === "return" || key.name === "enter") {
      const item = filtered[sel]
      onClose()
      item?.run()
    }
  })

  const height = 16
  const listHeight = height - 5
  const [start, end] = visibleWindow(filtered.length, sel, listHeight)

  return (
    <Overlay title={t("palette.title")} width={64} height={height}>
      <box border borderStyle="single" borderColor={theme.border} height={3}>
        <input
          focused
          placeholder={t("palette.placeholder")}
          onInput={setQuery}
          textColor={theme.fg}
          backgroundColor={theme.panel}
          focusedBackgroundColor={theme.panel}
        />
      </box>
      {filtered.slice(start, end).map((item, i) => {
        const idx = start + i
        return (
          <box key={item.id} height={1} backgroundColor={idx === sel ? theme.selBg : undefined}>
            <text>
              <span fg={theme.fg}>{fit(item.label, 40)}</span>
              <span fg={theme.dim}>{item.hint ? " " + item.hint : ""}</span>
            </text>
          </box>
        )
      })}
    </Overlay>
  )
}

// --- Ajuda ---------------------------------------------------------------------

export function HelpModal({ onClose }: { onClose: () => void }) {
  useKeyboard(() => onClose())
  const lines = [
    t("help.nav"),
    t("help.page"),
    t("help.tabs"),
    t("help.palette"),
    t("help.filter"),
    t("help.quit"),
  ]
  return (
    <Overlay title={t("help.title")} width={66} height={lines.length + 8}>
      {lines.map((l) => (
        <text key={l} fg={theme.fg}>
          {l}
        </text>
      ))}
      <text> </text>
      <text fg={theme.muted} wrapMode="word">
        {t("help.safe", { path: AUDIT_PATH })}
      </text>
      <box flexGrow={1} />
      <text fg={theme.dim}>{t("help.close")}</text>
    </Overlay>
  )
}
