import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import { App } from "../src/ui/App"
import { DEFAULT_CONFIG } from "../src/lib/config"
import { setLang } from "../src/i18n"

let destroy: (() => void) | null = null
afterEach(() => destroy?.())

async function press(s: Awaited<ReturnType<typeof testRender>>, key: string, wait = 200) {
  await act(async () => {
    s.mockInput.pressKey(key)
    await Bun.sleep(wait)
  })
  await s.renderOnce()
  return s.captureCharFrame()
}

test("abre o painel e navega por todas as abas sem erros", async () => {
  setLang("pt")
  const s = await testRender(<App cfg={DEFAULT_CONFIG} version="test" />, { width: 120, height: 32 })
  destroy = () => s.renderer.destroy()
  await act(async () => {
    await Bun.sleep(300)
  })
  await s.renderOnce()
  let frame = s.captureCharFrame()
  expect(frame).toContain("zelador")
  expect(frame).toContain("Sistema")

  for (const [key, expected] of [
    ["2", "Serviços"],
    ["3", "Processos"],
    ["4", "Docker"],
    ["5", "Atualizações"],
    ["6", "Segurança"],
  ] as const) {
    frame = await press(s, key, 400)
    expect(frame).toContain(expected)
  }

  // ajuda abre e fecha
  frame = await press(s, "?")
  expect(frame).toContain("Atalhos")
  frame = await press(s, "x")
  expect(frame).not.toContain("Atalhos")
})
