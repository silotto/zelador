import { userInfo } from "node:os"

// Execução de comandos do sistema.
//
// Regra do zelador: toda ação que muda algo no servidor é um `Command`
// (uma lista de argumentos, nunca uma string de shell). Assim o comando exato
// pode ser mostrado ao usuário antes de rodar e gravado no log de auditoria.

export const isRoot = typeof process.getuid === "function" && process.getuid() === 0

function whoami(): string {
  try {
    return userInfo().username
  } catch {
    return process.env.USER || process.env.LOGNAME || "?"
  }
}

/** Usuário real (quem rodou `sudo zela` aparece pelo nome, não como root). */
export const currentUser = process.env.SUDO_USER || whoami()

export interface Command {
  /** Argumentos do comando, ex.: ["systemctl", "restart", "nginx"] */
  argv: string[]
  /** Precisa de root? Se não formos root, roda com sudo. */
  root?: boolean
}

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

const BASE_ENV = { ...process.env, LC_ALL: "C", LANG: "C", SYSTEMD_COLORS: "0", NO_COLOR: "1" }

/** Monta o argv final, prefixando sudo quando preciso. */
export function finalArgv(cmd: Command, interactiveSudo = false): string[] {
  if (cmd.root && !isRoot) return interactiveSudo ? ["sudo", ...cmd.argv] : ["sudo", "-n", ...cmd.argv]
  return cmd.argv
}

/** Representação legível do comando, como seria digitado no terminal. */
export function formatCommand(cmd: Command): string {
  const argv = cmd.root && !isRoot ? ["sudo", ...cmd.argv] : cmd.argv
  return argv.map(shellQuote).join(" ")
}

export function shellQuote(arg: string): string {
  if (/^[\w@%+=:,./-]+$/.test(arg)) return arg
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

export function which(bin: string): boolean {
  return Bun.which(bin) !== null
}

/** Roda um comando e espera terminar. Nunca lança exceção. */
export async function run(cmd: Command | string[], timeoutMs = 30_000): Promise<RunResult> {
  const c: Command = Array.isArray(cmd) ? { argv: cmd } : cmd
  try {
    const proc = Bun.spawn(finalArgv(c), {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: BASE_ENV,
    })
    const timer = setTimeout(() => proc.kill(), timeoutMs)
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    clearTimeout(timer)
    return { code, stdout, stderr }
  } catch (err) {
    return { code: 127, stdout: "", stderr: String(err) }
  }
}

/** Atalho: devolve só o stdout (ou "" se o comando falhar). */
export async function output(argv: string[], timeoutMs?: number): Promise<string> {
  const r = await run(argv, timeoutMs)
  return r.code === 0 ? r.stdout : ""
}

export interface StreamHandle {
  kill: () => void
  done: Promise<number>
}

/**
 * Roda um comando de longa duração (logs ao vivo, apt upgrade...) e entrega a
 * saída linha a linha.
 */
export function stream(cmd: Command, onLine: (line: string, isErr: boolean) => void): StreamHandle {
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn(finalArgv(cmd), {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: BASE_ENV,
    })
  } catch (err) {
    onLine(String(err), true)
    return { kill: () => {}, done: Promise.resolve(127) }
  }

  const pump = async (rs: ReadableStream<Uint8Array>, isErr: boolean) => {
    const decoder = new TextDecoder()
    let buf = ""
    for await (const chunk of rs) {
      buf += decoder.decode(chunk, { stream: true })
      // \r é usado por barras de progresso (apt, docker pull): trata como quebra de linha.
      const parts = buf.split(/\r?\n|\r/)
      buf = parts.pop() ?? ""
      for (const p of parts) onLine(p, isErr)
    }
    if (buf) onLine(buf, isErr)
  }

  const pumps = Promise.all([
    pump(proc.stdout as ReadableStream<Uint8Array>, false),
    pump(proc.stderr as ReadableStream<Uint8Array>, true),
  ]).catch(() => {})

  return {
    kill: () => {
      try {
        proc.kill()
      } catch {}
    },
    done: pumps.then(() => proc.exited),
  }
}

/** Verifica se já temos sudo sem senha (ou cache de senha válido). */
export async function hasSudo(): Promise<boolean> {
  if (isRoot) return true
  if (!which("sudo")) return false
  const r = await run(["sudo", "-n", "true"], 5_000)
  return r.code === 0
}

/**
 * Roda um comando com o terminal "emprestado" (stdin/stdout herdados).
 * Usado para pedir a senha do sudo e para abrir shells dentro de containers.
 */
export async function runInteractive(argv: string[]): Promise<number> {
  const proc = Bun.spawn(argv, { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  return proc.exited
}
