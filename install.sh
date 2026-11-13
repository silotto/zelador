#!/usr/bin/env bash
# Instalador do zelador — o painel da sua VPS no terminal.
#
#   curl -fsSL https://raw.githubusercontent.com/silotto/zelador/main/install.sh | bash
#
# Opções (depois de `bash -s --`):
#   --version 0.1.0   instala uma versão específica (padrão: a mais recente)
#   --no-motd         não mostra o resumo do servidor ao fazer login
#   --motd            mostra o resumo no login sem perguntar
#
# Leia antes de rodar: https://github.com/silotto/zelador/blob/main/install.sh
set -euo pipefail

REPO="silotto/zelador"
INSTALL_DIR="${ZELADOR_INSTALL_DIR:-/usr/local/bin}"
CONFIG_DIR="${ZELADOR_CONFIG_DIR:-/etc/zelador}"
PROFILE_HOOK="${ZELADOR_PROFILE_HOOK:-/etc/profile.d/zelador.sh}"
VERSION=""
MOTD="ask"

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2#v}"; shift 2 ;;
    --no-motd) MOTD="no"; shift ;;
    --motd) MOTD="yes"; shift ;;
    *) echo "Opção desconhecida: $1" >&2; exit 1 ;;
  esac
done

# --- aparência --------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$'\033[1m'; D=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; C=$'\033[34m'; N=$'\033[0m'
else
  B=""; D=""; G=""; Y=""; R=""; C=""; N=""
fi
ok() { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
fail() { printf '\n  %s✗ %s%s\n\n' "$R" "$*" "$N" >&2; exit 1; }

printf '\n  %s%s◆ zelador%s %s— instalador%s\n\n' "$B" "$C" "$N" "$D" "$N"

# --- sistema ------------------------------------------------------------------
[ "$(uname -s)" = "Linux" ] || fail "O zelador roda só em Linux (detectado: $(uname -s))."

case "$(uname -m)" in
  x86_64 | amd64) ARCH="x64" ;;
  aarch64 | arm64) ARCH="arm64" ;;
  *) fail "Arquitetura não suportada: $(uname -m). Suportadas: x86_64 e arm64." ;;
esac

if [ -f /etc/alpine-release ] || ldd --version 2>&1 | grep -qi musl; then
  fail "Distribuições com musl (como Alpine) ainda não são suportadas."
fi

OS_NAME="Linux"
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_NAME="${PRETTY_NAME:-Linux}"
  case "${ID:-}${ID_LIKE:-}" in
    *debian* | *ubuntu*) ;;
    *) warn "$OS_NAME ainda não é testado oficialmente (foco: Ubuntu e Debian). Seguindo mesmo assim." ;;
  esac
fi
ok "Sistema detectado: $OS_NAME ($(uname -m))"

# --- permissões ---------------------------------------------------------------
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || fail "Rode como root ou instale o sudo."
  SUDO="sudo"
  ok "Usando sudo para instalar"
fi

# --- download -----------------------------------------------------------------
if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
else
  fail "Precisa de curl ou wget."
fi
command -v gzip >/dev/null 2>&1 || fail "Precisa do gzip."
command -v sha256sum >/dev/null 2>&1 || fail "Precisa do sha256sum (coreutils)."

if [ -n "${ZELADOR_DOWNLOAD_BASE:-}" ]; then
  BASE="$ZELADOR_DOWNLOAD_BASE" # para testes locais
elif [ -n "$VERSION" ]; then
  BASE="https://github.com/$REPO/releases/download/v$VERSION"
else
  BASE="https://github.com/$REPO/releases/latest/download"
fi

ASSET="zela-linux-$ARCH.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch "$BASE/$ASSET" "$TMP/$ASSET" || fail "Não foi possível baixar $BASE/$ASSET"
fetch "$BASE/SHA256SUMS" "$TMP/SHA256SUMS" || fail "Não foi possível baixar a lista de checksums."
ok "Download concluído"

EXPECTED="$(grep " $ASSET\$" "$TMP/SHA256SUMS" | awk '{print $1}')"
ACTUAL="$(sha256sum "$TMP/$ASSET" | awk '{print $1}')"
[ -n "$EXPECTED" ] || fail "Checksum de $ASSET não encontrado."
[ "$EXPECTED" = "$ACTUAL" ] || fail "Checksum não confere! Esperado $EXPECTED, recebido $ACTUAL. Instalação cancelada."
ok "Integridade verificada (SHA256)"

gzip -d "$TMP/$ASSET"
chmod 755 "$TMP/zela-linux-$ARCH"
"$TMP/zela-linux-$ARCH" --version >/dev/null 2>&1 || fail "O binário baixado não executou neste sistema."
INSTALLED_VERSION="$("$TMP/zela-linux-$ARCH" --version)"

$SUDO mkdir -p "$INSTALL_DIR"
$SUDO install -m 755 "$TMP/zela-linux-$ARCH" "$INSTALL_DIR/zela"
ok "zela v$INSTALLED_VERSION instalado em $INSTALL_DIR/zela"

# --- configuração ---------------------------------------------------------------
if [ ! -f "$CONFIG_DIR/config.toml" ]; then
  $SUDO mkdir -p "$CONFIG_DIR"
  $SUDO tee "$CONFIG_DIR/config.toml" >/dev/null <<'EOF'
# Configuração do zelador — https://github.com/silotto/zelador
# Idioma da interface: "pt" ou "en"
lang = "pt"

# Intervalo de atualização do painel (milissegundos)
refresh_ms = 2000

# Alertas: o painel avisa quando o uso passar destes limites (%)
[alerts]
disk = 85
memory = 90
cpu = 90
EOF
  ok "Configuração criada em $CONFIG_DIR/config.toml"
else
  ok "Configuração mantida em $CONFIG_DIR/config.toml"
fi

# --- resumo no login -------------------------------------------------------------
if [ "$MOTD" = "ask" ]; then
  if [ -f "$PROFILE_HOOK" ]; then
    MOTD="keep"
  elif [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '\n  Mostrar um resumo do servidor sempre que você fizer login? [S/n] ' >/dev/tty
    read -r answer </dev/tty || answer=""
    case "$answer" in [nN]*) MOTD="no" ;; *) MOTD="yes" ;; esac
  else
    MOTD="no"
  fi
fi

if [ "$MOTD" = "yes" ]; then
  $SUDO tee "$PROFILE_HOOK" >/dev/null <<'EOF'
# zelador: resumo do servidor no login (remova este arquivo para desativar)
case $- in *i*) ;; *) return 0 2>/dev/null || exit 0 ;; esac
if [ -t 1 ] && [ -z "${ZELADOR_NO_MOTD:-}" ] && command -v zela >/dev/null 2>&1; then
  zela status --short 2>/dev/null
fi
EOF
  ok "Resumo no login ativado ($PROFILE_HOOK)"
elif [ "$MOTD" = "no" ] && [ -f "$PROFILE_HOOK" ]; then
  $SUDO rm -f "$PROFILE_HOOK"
fi

printf '\n  %sPronto!%s Digite %s%szela%s para abrir o painel.\n\n' "$G$B" "$N" "$B" "$C" "$N"
