import { TextAttributes } from "@opentui/core"
import { fit } from "../../lib/format"
import { theme } from "../theme"

export interface Column<T> {
  title: string
  /** Largura fixa em colunas, ou "flex" para ocupar o espaço restante. */
  width: number | "flex"
  align?: "left" | "right"
  value: (row: T) => string
  color?: (row: T) => string | undefined
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  selected: number
  width: number
  height: number // linhas disponíveis, incluindo o cabeçalho
  focused?: boolean
  empty?: string
  onSelect?: (index: number) => void
}

/** Calcula as larguras finais: colunas "flex" dividem o que sobrar. */
export function layoutColumns<T>(columns: Column<T>[], width: number): number[] {
  const gaps = columns.length - 1
  const fixed = columns.reduce((s, c) => s + (c.width === "flex" ? 0 : c.width), 0)
  const flexCount = columns.filter((c) => c.width === "flex").length || 1
  const free = Math.max(0, width - fixed - gaps)
  return columns.map((c) => (c.width === "flex" ? Math.max(4, Math.floor(free / flexCount)) : c.width))
}

/** Janela visível: mantém a linha selecionada sempre na tela. */
export function visibleWindow(total: number, selected: number, size: number): [number, number] {
  if (total <= size) return [0, total]
  let start = Math.max(0, selected - Math.floor(size / 2))
  start = Math.min(start, total - size)
  return [start, start + size]
}

export function Table<T>({ columns, rows, selected, width, height, focused = true, empty, onSelect }: Props<T>) {
  const widths = layoutColumns(columns, width)
  const bodyHeight = Math.max(1, height - 1)
  const [start, end] = visibleWindow(rows.length, selected, bodyHeight)

  const header = columns.map((c, i) => fit(c.title, widths[i]!, c.align)).join(" ")

  return (
    <box flexDirection="column" width={width} height={height}>
      <text fg={theme.muted} attributes={TextAttributes.BOLD}>
        {fit(header, width)}
      </text>
      {rows.length === 0 && empty ? <text fg={theme.dim}>{empty}</text> : null}
      {rows.slice(start, end).map((row, i) => {
        const idx = start + i
        const isSel = idx === selected
        return (
          <box
            key={idx}
            height={1}
            width={width}
            backgroundColor={isSel ? (focused ? theme.selBg : theme.headerBg) : undefined}
            onMouseDown={onSelect ? () => onSelect(idx) : undefined}
          >
            <text>
              {columns.map((c, ci) => (
                <span key={ci} fg={c.color?.(row) ?? (isSel ? theme.fg : theme.fg)}>
                  {fit(c.value(row), widths[ci]!, c.align) + (ci < columns.length - 1 ? " " : "")}
                </span>
              ))}
            </text>
          </box>
        )
      })}
      {rows.length > bodyHeight ? (
        <box position="absolute" right={0} top={0}>
          <text fg={theme.dim}>{`${selected + 1}/${rows.length}`}</text>
        </box>
      ) : null}
    </box>
  )
}
