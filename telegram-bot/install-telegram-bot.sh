#!/usr/bin/env bash
# 安装 Mihomo-Full Telegram 管理机器人
set -euo pipefail

BASE="/opt/mihomo-full"
BOT_DIR="$BASE/telegram-bot"
ENV_FILE="$BASE/telegram-bot.env"
SERVICE_SRC="$BOT_DIR/mihomo-full-bot.service"
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
info(){ echo -e "${GREEN}[+]${NC} $1"; }
err(){ echo -e "${RED}[✗]${NC} $1"; exit 1; }

[[ $EUID -eq 0 ]] || err "请使用 root 运行"
[[ -f "$BOT_DIR/bot.py" ]] || err "找不到 $BOT_DIR/bot.py，请先安装 mihomo-full"

command -v python3 >/dev/null || err "需要 python3"
python3 -m pip --version >/dev/null 2>&1 || err "需要 python3-pip"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$BOT_DIR/../telegram-bot.example.env" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "已创建 $ENV_FILE"
  echo "请填写 TG_BOT_TOKEN 与 TG_ADMIN_IDS 后重新运行本脚本。"
  exit 0
fi

set -a
source "$ENV_FILE"
set +a
[[ -n "${TG_BOT_TOKEN:-}" && "$TG_BOT_TOKEN" != REPLACE_WITH_BOT_TOKEN ]] || err "请在 $ENV_FILE 设置 TG_BOT_TOKEN"
[[ -n "${TG_ADMIN_IDS:-}" ]] || err "请在 $ENV_FILE 设置 TG_ADMIN_IDS"

python3 -m pip install --disable-pip-version-check --no-input -r "$BOT_DIR/requirements.txt"
install -m 700 "$BOT_DIR/bot.py" "$BOT_DIR/bot.py"
install -m 644 "$SERVICE_SRC" /etc/systemd/system/mihomo-full-bot.service
systemctl daemon-reload
systemctl enable --now mihomo-full-bot.service
systemctl --no-pager --full status mihomo-full-bot.service || true
info "Telegram 管理机器人已启动。"
info "查看日志：journalctl -u mihomo-full-bot -f"
