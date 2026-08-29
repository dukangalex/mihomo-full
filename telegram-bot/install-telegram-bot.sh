#!/usr/bin/env bash
# 安装 Mihomo-Full Telegram 管理机器人
set -euo pipefail
BASE="/opt/mihomo-full"; BOT_DIR="$BASE/telegram-bot"; ENV_FILE="$BASE/telegram-bot.env"; SERVICE_SRC="$BOT_DIR/mihomo-full-bot.service"
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
info(){ echo -e "${GREEN}[+]${NC} $1"; }; err(){ echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }
[[ $EUID -eq 0 ]] || err "请使用 root 运行"; [[ -f "$BOT_DIR/bot.py" ]] || err "找不到 $BOT_DIR/bot.py，请先安装 mihomo-full"
[[ -f "$BOT_DIR/vps_usage.py" ]] || err "缺少 VPS 流量统计模块，请重新安装/更新 mihomo-full"
command -v python3 >/dev/null || err "需要 python3"; python3 -m pip --version >/dev/null 2>&1 || err "需要 python3-pip"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$BASE/telegram-bot.example.env" "$ENV_FILE"; chmod 600 "$ENV_FILE"; echo "已创建 $ENV_FILE"; echo "请填写 TG_BOT_TOKEN 与 TG_ADMIN_IDS 后重新运行本脚本。"; exit 0
fi
# Backfill newly introduced VPS-plan settings without overwriting existing user values.
for line in 'VPS_MONTHLY_GB=0' 'VPS_EXPIRES_AT=' 'VPS_TRAFFIC_ALERT_PERCENT=80' 'VPS_TRAFFIC_INTERFACE='; do
  key="${line%%=*}"
  grep -q "^${key}=" "$ENV_FILE" || printf '%s\n' "$line" >> "$ENV_FILE"
done
chmod 600 "$ENV_FILE"

# Parse the small, fixed configuration format as data. Do not `source` the file:
# a Telegram bot token/config file must never be able to execute shell syntax.
declare -A CFG=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" =~ ^([A-Z0-9_]+)=(.*)$ ]] || err "$ENV_FILE 存在非法配置行；仅允许 KEY=VALUE"
  key="${BASH_REMATCH[1]}"; value="${BASH_REMATCH[2]}"
  [[ -z "${CFG[$key]+x}" ]] || err "$ENV_FILE 存在重复配置项：$key"
  CFG["$key"]="$value"
done < "$ENV_FILE"

# Export only the keys consumed by this installer/service. Unknown keys are ignored
# so future non-shell metadata cannot become executable input.
TG_BOT_TOKEN="${CFG[TG_BOT_TOKEN]:-}"
TG_ADMIN_IDS="${CFG[TG_ADMIN_IDS]:-}"
MIHOMO_FULL_DIR="${CFG[MIHOMO_FULL_DIR]:-$BASE}"
VPS_MONTHLY_GB="${CFG[VPS_MONTHLY_GB]:-0}"
VPS_EXPIRES_AT="${CFG[VPS_EXPIRES_AT]:-}"
VPS_TRAFFIC_ALERT_PERCENT="${CFG[VPS_TRAFFIC_ALERT_PERCENT]:-80}"
VPS_TRAFFIC_INTERFACE="${CFG[VPS_TRAFFIC_INTERFACE]:-}"

[[ "$MIHOMO_FULL_DIR" == "$BASE" ]] || err "MIHOMO_FULL_DIR 必须保持为 $BASE"
[[ "$TG_BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{20,}$ ]] || err "TG_BOT_TOKEN 格式不合法"
[[ "$TG_ADMIN_IDS" =~ ^[0-9]+(,[0-9]+)*$ ]] || err "TG_ADMIN_IDS 必须是逗号分隔的数字 Telegram 用户 ID"
[[ "$VPS_MONTHLY_GB" =~ ^([0-9]+([.][0-9]+)?)$ ]] || err "VPS_MONTHLY_GB 必须是非负数字"
[[ "$VPS_TRAFFIC_ALERT_PERCENT" =~ ^([0-9]+([.][0-9]+)?)$ ]] || err "VPS_TRAFFIC_ALERT_PERCENT 必须是数字"
python3 - "$VPS_TRAFFIC_ALERT_PERCENT" <<'PY'
import sys
v = float(sys.argv[1])
if not 0 <= v <= 100:
    raise SystemExit("VPS_TRAFFIC_ALERT_PERCENT 必须在 0 到 100 之间")
PY
[[ -z "$VPS_TRAFFIC_INTERFACE" || "$VPS_TRAFFIC_INTERFACE" =~ ^[A-Za-z0-9_.:-]+$ ]] || err "VPS_TRAFFIC_INTERFACE 含有非法字符"
[[ -z "$VPS_EXPIRES_AT" || "$VPS_EXPIRES_AT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})$ ]] || err "VPS_EXPIRES_AT 必须是 ISO 8601 UTC/带时区时间"

python3 -m py_compile "$BOT_DIR/bot.py" "$BOT_DIR/vps_usage.py"
python3 -m pip install --disable-pip-version-check --no-input -r "$BOT_DIR/requirements.txt"
chmod 700 "$BOT_DIR/bot.py" "$BOT_DIR/vps_usage.py"
install -m 644 "$SERVICE_SRC" /etc/systemd/system/mihomo-full-bot.service
systemctl daemon-reload
systemctl enable --now mihomo-full-bot.service
systemctl --no-pager --full status mihomo-full-bot.service || true
info "Telegram 管理机器人已启动。"
info "查看日志：journalctl -u mihomo-full-bot -f"
