// Compila o zelador em binários únicos (sem precisar de Bun/Node na VPS).
//
//   bun run scripts/build.ts            -> linux x64 e arm64
//   bun run scripts/build.ts x64        -> só uma arquitetura
//
// O OpenTUI carrega uma biblioteca nativa diferente por plataforma. Para não
// embutir as bibliotecas de todas as plataformas em cada binário, trocamos os
// pacotes das outras plataformas por um módulo vazio.
import type { BunPlugin } from "bun"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"

const ALL = ["x64", "arm64"] as const
type Arch = (typeof ALL)[number]

const requested = process.argv.slice(2) as Arch[]
const targets: Arch[] = requested.length ? requested : [...ALL]

function onlyPlatform(arch: Arch): BunPlugin {
  const keep = `@opentui/core-linux-${arch}`
  return {
    name: "opentui-only-target-platform",
    setup(build) {
      build.onResolve({ filter: /^@opentui\/core-(darwin|linux|win32)-/ }, (args) => {
        if (args.path === keep) return undefined
        return { path: args.path, namespace: "zelador-stub" }
      })
      build.onLoad({ filter: /.*/, namespace: "zelador-stub" }, () => ({
        contents: "export default ''",
        loader: "js",
      }))
    },
  }
}

await mkdir("dist", { recursive: true })
const sums: string[] = []

for (const arch of targets) {
  const outfile = `dist/zela-linux-${arch}`
  const result = await Bun.build({
    entrypoints: ["src/index.tsx"],
    compile: { target: `bun-linux-${arch}`, outfile },
    minify: true,
    sourcemap: "none",
    plugins: [onlyPlatform(arch)],
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
  // o instalador baixa a versão comprimida (bem menor)
  const gz = Bun.gzipSync(await readFile(outfile), { level: 9 })
  await writeFile(`${outfile}.gz`, gz)
  for (const f of [`zela-linux-${arch}`, `zela-linux-${arch}.gz`]) {
    const hash = createHash("sha256").update(await readFile(`dist/${f}`)).digest("hex")
    sums.push(`${hash}  ${f}`)
    const size = (Bun.file(`dist/${f}`).size / 1024 / 1024).toFixed(1)
    console.log(`✓ dist/${f} (${size} MB)`)
  }
}

await writeFile("dist/SHA256SUMS", sums.join("\n") + "\n")
console.log("✓ dist/SHA256SUMS")
