import { useTerminalDimensions } from "@opentui/react"
import type { ReactNode } from "react"
import { t } from "../../i18n"
import { theme } from "../theme"
import { Panel } from "./Panel"
import { Table, type Column } from "./Table"

/** Moldura padrão das abas que mostram uma lista: título, tabela e filtro. */
export function ListView<T>({
  title,
  columns,
  rows,
  selected,
  onSelect,
  filter,
  empty,
  extra,
  reserved = 0,
}: {
  title: string
  columns: Column<T>[]
  rows: T[]
  selected: number
  onSelect?: (i: number) => void
  filter: { text: string; editing: boolean; setText: (s: string) => void }
  empty?: string
  /** Conteúdo extra abaixo da tabela (ex.: detalhes do item). */
  extra?: ReactNode
  /** Linhas ocupadas por `extra`. */
  reserved?: number
}) {
  const term = useTerminalDimensions()
  const showFilter = filter.editing || filter.text.length > 0
  // cabeçalho (2) + rodapé (1) + bordas do painel (2) + filtro + extra
  const height = Math.max(3, term.height - 5 - (showFilter ? 1 : 0) - reserved)
  const width = term.width - 4

  return (
    <Panel title={`${title} · ${t("common.items", { n: rows.length })}`} flexGrow={1} focused>
      <Table columns={columns} rows={rows} selected={selected} width={width} height={height} empty={empty} onSelect={onSelect} />
      {showFilter ? (
        <box flexDirection="row" height={1}>
          <text fg={theme.yellow}>{t("common.filter")}</text>
          {filter.editing ? (
            <input
              focused
              value={filter.text}
              onInput={filter.setText}
              flexGrow={1}
              textColor={theme.fg}
              backgroundColor={theme.panel}
              focusedBackgroundColor={theme.panel}
            />
          ) : (
            <text fg={theme.fg}>{filter.text}</text>
          )}
        </box>
      ) : null}
      {extra}
    </Panel>
  )
}
