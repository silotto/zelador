import { describe, expect, test } from "bun:test"
import { parseDf, parseMeminfo, parseNetDev, parseProcStat } from "../src/providers/system"
import { parseListUnits, parseUnitFiles } from "../src/providers/services"
import { parseStat } from "../src/providers/processes"
import { parseJsonLines, simplifyPorts } from "../src/providers/docker"
import { parseUpgradable } from "../src/providers/updates"
import { parseSs, parseSshdConfig } from "../src/providers/security"
import { formatCommand } from "../src/lib/exec"
import { bar, bytes, fit, sparkline } from "../src/lib/format"

describe("system", () => {
  test("/proc/stat", () => {
    expect(parseProcStat("cpu  100 0 50 800 50 0 0 0 0 0\ncpu0 1 2 3")).toEqual({ idle: 850, total: 1000 })
  })
  test("/proc/meminfo usa MemAvailable", () => {
    const m = parseMeminfo("MemTotal:  1000 kB\nMemFree: 100 kB\nMemAvailable: 400 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB")
    expect(m.memTotal).toBe(1000 * 1024)
    expect(m.memUsed).toBe(600 * 1024)
    expect(m.swapTotal).toBe(0)
  })
  test("/proc/net/dev ignora lo e veth", () => {
    const text = `Inter-|   Receive |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets
    lo: 999 1 0 0 0 0 0 0 999 1 0 0 0 0 0 0
  eth0: 1000 10 0 0 0 0 0 0 2000 20 0 0 0 0 0 0
vethab: 5000 10 0 0 0 0 0 0 5000 20 0 0 0 0 0 0`
    expect(parseNetDev(text)).toEqual({ rx: 1000, tx: 2000 })
  })
  test("df", () => {
    const text = `Filesystem 1-blocks Used Available Capacity Mounted on
/dev/vda1 1000 600 400 60% /
/dev/vda1 1000 600 400 60% /var/lib/docker/x
/dev/loop0 100 100 0 100% /snap/core
/dev/vdb1 2000 200 1800 10% /mnt/my data`
    const d = parseDf(text)
    expect(d.map((x) => x.mount)).toEqual(["/", "/mnt/my data"])
    expect(d[0]!.pct).toBe(60)
  })
})

describe("services", () => {
  test("list-units com marcador ●", () => {
    const text = `  nginx.service loaded active running A high performance web server
● php8.3-fpm.service loaded failed failed The PHP 8.3 FastCGI Process Manager
  ghost.service not-found inactive dead ghost.service
  foo.socket loaded active listening Foo`
    const u = parseListUnits(text)
    expect(u.map((x) => x.name)).toEqual(["nginx", "php8.3-fpm", "ghost"])
    expect(u[1]!.active).toBe("failed")
    expect(u[0]!.description).toBe("A high performance web server")
  })
  test("list-unit-files", () => {
    const m = parseUnitFiles("nginx.service enabled enabled\nssh.service disabled enabled\n")
    expect(m.get("nginx.service")).toBe("enabled")
    expect(m.get("ssh.service")).toBe("disabled")
  })
})

describe("processes", () => {
  test("stat com espaço e parênteses no nome", () => {
    const fields = Array.from({ length: 50 }, (_, i) => String(i))
    fields[0] = "S"
    fields[11] = "300" // utime
    fields[12] = "200" // stime
    fields[19] = "12345" // starttime
    fields[21] = "10" // rss
    const s = parseStat(`42 (my (weird) proc) ${fields.join(" ")}`)
    expect(s.comm).toBe("my (weird) proc")
    expect(s.ticks).toBe(500)
    expect(s.start).toBe(12345)
    expect(s.rssPages).toBe(10)
  })
})

describe("docker", () => {
  test("portas", () => {
    expect(simplifyPorts("0.0.0.0:80->80/tcp, :::80->80/tcp, 0.0.0.0:8443->443/tcp")).toBe("80 8443→443")
    expect(simplifyPorts("5432/tcp")).toBe("")
  })
  test("json lines e array", () => {
    expect(parseJsonLines('{"a":1}\n{"a":2}\nlixo\n')).toEqual([{ a: 1 }, { a: 2 }])
    expect(parseJsonLines('[{"Name":"x"}]')).toEqual([{ Name: "x" }])
  })
})

describe("updates", () => {
  test("apt list --upgradable", () => {
    const text = `Listing...
curl/noble-updates,noble-security 8.5.0-2ubuntu10.6 amd64 [upgradable from: 8.5.0-2ubuntu10.5]
vim/noble-updates 2:9.1.0016-1ubuntu7.9 amd64 [upgradable from: 2:9.1.0016-1ubuntu7.8]`
    const u = parseUpgradable(text)
    expect(u).toHaveLength(2)
    expect(u[0]).toMatchObject({ name: "curl", security: true, from: "8.5.0-2ubuntu10.5" })
    expect(u[1]).toMatchObject({ name: "vim", security: false })
  })
})

describe("security", () => {
  test("sshd_config: vale a primeira ocorrência, drop-ins antes", () => {
    const dropin = "PasswordAuthentication no\n"
    const main = "# comentário\nPermitRootLogin yes\nPasswordAuthentication yes\nMatch User bob\n  PermitRootLogin no\n"
    const o = parseSshdConfig([dropin, main])
    expect(o.passwordauthentication).toBe("no")
    expect(o.permitrootlogin).toBe("yes")
  })
  test("ss", () => {
    const text = `tcp LISTEN 0 4096 0.0.0.0:5432 0.0.0.0:* users:(("postgres",pid=1,fd=5))
tcp LISTEN 0 4096 127.0.0.1:6379 0.0.0.0:* users:(("redis-server",pid=2,fd=6))
tcp LISTEN 0 4096 [::]:22 [::]:* users:(("sshd",pid=3,fd=3))
udp UNCONN 0 0 127.0.0.53%lo:53 0.0.0.0:*`
    const p = parseSs(text)
    expect(p.map((x) => [x.port, x.public, x.process])).toEqual([
      [22, true, "sshd"],
      [53, false, ""],
      [5432, true, "postgres"],
      [6379, false, "redis-server"],
    ])
  })
})

describe("format", () => {
  test("bytes", () => {
    expect(bytes(512)).toBe("512B")
    expect(bytes(1536)).toBe("1.5K")
    expect(bytes(5 * 1024 ** 3)).toBe("5.0G")
  })
  test("fit", () => {
    expect(fit("abc", 5)).toBe("abc  ")
    expect(fit("abcdef", 4)).toBe("abc…")
    expect(fit("7", 3, "right")).toBe("  7")
  })
  test("bar e sparkline", () => {
    expect(bar(50, 10)).toBe("█████░░░░░")
    expect(sparkline([0, 100], 4, 100)).toBe("  ▁█")
  })
  test("formatCommand faz aspas quando precisa", () => {
    expect(formatCommand({ argv: ["sh", "-c", "echo 'oi'"] })).toBe(`sh -c 'echo '\\''oi'\\'''`)
    expect(formatCommand({ argv: ["systemctl", "restart", "nginx.service"] })).toBe("systemctl restart nginx.service")
  })
})
