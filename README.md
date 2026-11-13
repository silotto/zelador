# ◆ zelador

**O painel de controle da sua VPS, direto no terminal.**

Entre no servidor por SSH, digite `zela` e veja tudo num lugar só: CPU, memória, discos, serviços, processos, containers, atualizações e segurança. Sem instalar painel web, sem abrir portas e sem dependências.

Exemplo da tela inicial:

```
 ◆ zelador o painel da sua VPS                                              root@meu-vps  v0.1.0
 1 Painel   2 Serviços   3 Processos   4 Docker   5 Atualizações   6 Segurança
╭─ Sistema ────────────────────────────╮╭─ CPU · Memória ──────────────────────────────────────────╮
│ Servidor   meu-vps                   ││ CPU      ██░░░░░░░   14%  2 núcleos             ▁▂▃▂▅▃▂▁ │
│ Sistema    Ubuntu 24.04.5 LTS        ││ Memória  ████░░░░░   41%  1.6G / 3.8G           ▄▄▄▄▅▅▅▅ │
│ Kernel     6.8.0-48-generic          ││ Swap     █░░░░░░░░    6%  128M / 2.0G                    │
│ Ligado há  12d 4h 31m                ││                                                          │
│ IP         203.0.113.10              ││ ↓ recebendo     184.2K/s                    ▁▂▁▃▇▂▁▁▂▁   │
│ Carga      0.31  0.27  0.22          ││ ↑ enviando       52.0K/s                    ▁▁▁▂▃▁▁▁▁▁   │
╰──────────────────────────────────────╯╰──────────────────────────────────────────────────────────╯
╭─ Discos ───────────────────────────────────────╮╭─ Avisos ───────────────────────────────────────╮
│ /               ████░   71%  28.4G / 40.0G     ││ ✗ 1 serviço(s) com falha — veja a aba Serviços │
│                                                ││ ! 12 atualização(ões) pendente(s), 3 de        │
│                                                ││   segurança                                    │
╰────────────────────────────────────────────────╯╰────────────────────────────────────────────────╯
```

## Instalação

No terminal da VPS, rode:

```bash
curl -fsSL https://raw.githubusercontent.com/silotto/zelador/main/install.sh | bash
```

Sem `curl`? Use `wget`:

```bash
wget -qO- https://raw.githubusercontent.com/silotto/zelador/main/install.sh | bash
```

Depois, é só abrir o painel:

```bash
zela
```

O instalador:

1. detecta o sistema e a arquitetura (x86_64 ou arm64);
2. baixa o binário da última release no GitHub;
3. **confere o checksum SHA256** e cancela se não bater;
4. instala em `/usr/local/bin/zela` e cria `/etc/zelador/config.toml`;
5. pergunta se você quer ver um resumo do servidor ao fazer login.

Prefere ler o script antes de rodar? Ótimo hábito:

```bash
curl -fsSL https://raw.githubusercontent.com/silotto/zelador/main/install.sh -o install.sh
```

```bash
less install.sh
```

```bash
bash install.sh
```

Instalar uma versão específica:

```bash
curl -fsSL https://raw.githubusercontent.com/silotto/zelador/main/install.sh | bash -s -- --version 0.1.0
```

## O que ele faz

| Aba | Recursos |
| --- | --- |
| **1 Painel** | CPU, memória, swap, rede (com histórico), discos, carga, avisos e processos que mais consomem |
| **2 Serviços** | Serviços do systemd: iniciar, parar, reiniciar, habilitar/desabilitar no boot, logs ao vivo, filtro de falhas |
| **3 Processos** | Lista ordenável por CPU, memória ou PID, filtro e encerramento de processos |
| **4 Docker** | Containers (logs, start/stop/restart, shell dentro do container) e stacks do docker compose (up, down, pull) |
| **5 Atualizações** | Pacotes pendentes com destaque para os de segurança, `apt update`, atualizar tudo ou só segurança, reboot |
| **6 Segurança** | Checagem de login root, SSH por senha, firewall, fail2ban, atualizações automáticas, bancos expostos e portas abertas |

### Seguro por padrão

- **Toda ação mostra o comando exato antes de rodar** e pede confirmação.
- **Tudo fica registrado** em `/var/log/zelador.log` (quem, quando, qual comando e o resultado).
- Rodando como usuário comum, o painel pede `sudo` só quando uma ação precisa.
- Não abre portas nem roda em segundo plano: só existe enquanto você está usando.

## Atalhos

| Tecla | Ação |
| --- | --- |
| `1`–`6`, `Tab`, `←` `→` | trocar de aba |
| `↑` `↓` / `j` `k`, `PgUp` `PgDn` | navegar na lista |
| `/` | filtrar a lista |
| `Enter` | ver logs (serviços e containers) |
| `Ctrl+K` | paleta de comandos |
| `?` | ajuda |
| `q` | sair |

Os atalhos de cada aba aparecem no rodapé.

## Comandos

```text
zela                 abre o painel
zela status          resumo rápido do servidor (sem abrir a interface)
zela doctor          verifica dependências e permissões
zela update          atualiza para a versão mais recente
zela uninstall       remove o zelador
zela --lang en       interface em inglês
```

## Configuração

`/etc/zelador/config.toml`:

```toml
lang = "pt"          # "pt" ou "en"
refresh_ms = 2000    # intervalo de atualização do painel

[alerts]             # avisa quando o uso passar destes limites (%)
disk = 85
memory = 90
cpu = 90
```

Para desativar o resumo no login, apague `/etc/profile.d/zelador.sh` (ou exporte `ZELADOR_NO_MOTD=1`).

## Compatibilidade

- **Feito para:** Ubuntu 22.04/24.04 e Debian 12/13
- **Arquiteturas:** x86_64 e arm64
- Outras distros com systemd e glibc devem funcionar, mas a aba Atualizações por enquanto só entende `apt`.
- Alpine (musl) ainda não é suportado.

## Desenvolvimento

Feito com [Bun](https://bun.sh), [OpenTUI](https://opentui.com) e React.

```bash
bun install --os="*" --cpu="*"
```

```bash
bun run dev
```

```bash
bun test
```

```bash
bun run build
```

`bun run build` gera os binários únicos em `dist/` (com o runtime embutido, sem precisar de Bun ou Node na VPS).

Para publicar uma versão, crie uma tag. O GitHub Actions compila, testa o instalador e publica a release:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

### Estrutura

```text
src/
  index.tsx          entrada da CLI (zela, zela status, ...)
  cli.ts             subcomandos sem interface
  i18n.ts            textos em português e inglês
  lib/               execução de comandos, auditoria, config, formatação
  providers/         leitura do sistema: system, services, processes, docker, updates, security
  ui/                interface (App, componentes e uma view por aba)
install.sh           instalador
scripts/build.ts     compilação dos binários
```

Cada `provider` só lê dados ou monta comandos (`{ argv, root }`). Quem executa é a interface, depois da confirmação. Isso mantém o painel previsível, auditável e fácil de testar.

## Roadmap

- [ ] Correções de segurança com um clique (UFW, fail2ban, hardening do SSH)
- [ ] Nginx/Caddy + SSL com certbot e assistente de "novo site"
- [ ] Editor de configs com diff antes de salvar
- [ ] Backups agendados
- [ ] Gerenciar vários servidores via SSH

## Licença

MIT
