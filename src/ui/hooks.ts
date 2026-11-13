import { useKeyboard } from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useApp, type Hint } from "./context"

/**
 * Seleção numa lista guardando a CHAVE do item selecionado (não o índice),
 * para que a seleção não "pule" quando a lista é reordenada ou atualizada.
 */
export function useSelection<T>(items: T[], keyOf: (item: T) => string, active: boolean, pageSize: number) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const lastIndex = useRef(0)

  let index = selectedKey === null ? -1 : items.findIndex((i) => keyOf(i) === selectedKey)
  if (index < 0) index = Math.min(lastIndex.current, Math.max(0, items.length - 1))
  lastIndex.current = index
  const selected = items[index] ?? null

  const moveTo = useCallback(
    (i: number) => {
      if (!items.length) return
      const clamped = Math.max(0, Math.min(items.length - 1, i))
      lastIndex.current = clamped
      setSelectedKey(keyOf(items[clamped]!))
    },
    [items, keyOf],
  )

  useKeyboard((key) => {
    if (!active) return
    switch (key.name) {
      case "up":
      case "k":
        if (key.name === "k" && key.shift) return
        moveTo(index - 1)
        break
      case "down":
      case "j":
        moveTo(index + 1)
        break
      case "pageup":
        moveTo(index - pageSize)
        break
      case "pagedown":
        moveTo(index + pageSize)
        break
      case "home":
        moveTo(0)
        break
      case "end":
        moveTo(items.length - 1)
        break
      case "g":
        moveTo(key.shift ? items.length - 1 : 0)
        break
    }
  })

  return { index, selected, moveTo }
}

/** Filtro de texto acionado por "/". */
export function useFilter(active: boolean) {
  const { setInputLock } = useApp()
  const [text, setText] = useState("")
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setInputLock(editing)
  }, [editing, setInputLock])

  useKeyboard((key) => {
    if (editing) {
      if (key.name === "escape") {
        setText("")
        setEditing(false)
      } else if (key.name === "return" || key.name === "enter") {
        setEditing(false)
      }
      return
    }
    if (!active) return
    if (key.sequence === "/") setEditing(true)
    else if (key.name === "escape" && text) setText("")
  })

  const match = useCallback(
    (...fields: string[]) => {
      if (!text) return true
      const q = text.toLowerCase()
      return fields.some((f) => f.toLowerCase().includes(q))
    },
    [text],
  )

  return { text, setText, editing, match }
}

/** Atualiza os atalhos exibidos no rodapé enquanto a view estiver ativa. */
export function useHints(active: boolean, hints: Hint[]) {
  const { setHints } = useApp()
  const sig = useMemo(() => hints.map((h) => h.key + h.label).join("|"), [hints])
  useEffect(() => {
    if (active) setHints(hints)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sig])
}

/** Roda `fn` agora e a cada `ms` enquanto `enabled` for verdadeiro. */
export function usePolling(fn: () => void | Promise<void>, ms: number, enabled: boolean) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!enabled) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        await ref.current()
      } catch {}
      if (!stop) timer = setTimeout(tick, ms)
    }
    tick()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [ms, enabled])
}
