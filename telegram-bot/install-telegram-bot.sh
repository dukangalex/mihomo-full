#!/usr/bin/env bash
# 安装 Mihomo-Full Telegram 管理机器人
set -euo pipefail
BASE="/opt/mihomo-full"; BOT_DIR="$BASE/telegram-bot"; ENV_FILE="$BASE/telegram-bot.env"; SERVICE_SRC="$BOT_DIR/mihomo-full-bot.service"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info(){ echo -e "${GREEN}[+]${NC} $1"; }; warn(){ echo -e "${YELLOW}[!]${NC} $1"; }; err(){ echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }
[[ $EUID -eq 0 ]] || err "请使用 root 运行"; [[ -f "$BOT_DIR/bot.py" ]] || err "找不到 $BOT_DIR/bot.py，请先安装 Mihomo Full"
[[ -f "$BOT_DIR/vps_usage.py" ]] || err "缺少 VPS 流量统计模块，请重新安装/更新 Mihomo Full"
command -v python3 >/dev/null || err "需要 python3"; python3 -m pip --version >/dev/null 2>&1 || err "需要 python3-pip"

write_env(){
  local token="$1" ids="$2" monthly="$3" expires="$4" alert="$5" iface="$6"
  umask 077
  cat > "$ENV_FILE" <<EOF_ENV
# Mihomo Full Telegram Bot private settings
TG_BOT_TOKEN=$token
TG_ADMIN_IDS=$ids
MIHOMO_FULL_DIR=$BASE
VPS_MONTHLY_GB=$monthly
VPS_EXPIRES_AT=$expires
VPS_TRAFFIC_ALERT_PERCENT=$alert
VPS_TRAFFIC_INTERFACE=$iface
EOF_ENV
  chmod 600 "$ENV_FILE"
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo
  echo "Telegram Bot 首次设置"
  echo "-------------------------"
  echo "请先在 Telegram 中通过 @BotFather 创建机器人。"
  echo "接下来只需按提示填写必要信息，不需要编辑配置文件。"
  echo
  read -r -s -p "Bot Token: " TG_BOT_TOKEN; echo
  [[ "$TG_BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{20,}$ ]] || err "Bot Token 格式不合法，请重新运行后检查后再输入"
  read -r -p "Telegram 管理员 User ID（多个 ID 用逗号分隔）: " TG_ADMIN_IDS
  [[ "$TG_ADMIN_IDS" =~ ^[0-9]+(,[0-9]+)*$ ]] || err "User ID 必须是数字；多个 ID 用逗号分隔"
  read -r -p "VPS 每月总流量 GB（不知道可填 0，之后可在 Bot 中设置）[0]: " VPS_MONTHLY_GB
  VPS_MONTHLY_GB="${VPS_MONTHLY_GB:-0}"
  [[ "$VPS_MONTHLY_GB" =~ ^([0-9]+([.][0-9]+)?)$ ]] || err "月流量必须是非负数字"
  read -r -p "VPS 到期时间（不知道可留空，之后可在 Bot 中设置）: " VPS_EXPIRES_AT
  read -r -p "流量提醒阈值 % [80]: " VPS_TRAFFIC_ALERT_PERCENT
  VPS_TRAFFIC_ALERT_PERCENT="${VPS_TRAFFIC_ALERT_PERCENT:-80}"
  [[ "$VPS_TRAFFIC_ALERT_PERCENT" =~ ^([0-9]+([.][0-9]+)?)$ ]] || err "提醒阈值必须是数字"
  VPS_TRAFFIC_INTERFACE="$(ip route show default 2>/dev/null | awk 'NR==1 {print $5}')"
  [[ "$VPS_TRAFFIC_INTERFACE" =~ ^[A-Za-z0-9_.:-]+$ ]] || VPS_TRAFFIC_INTERFACE=""
  write_env "$TG_BOT_TOKEN" "$TG_ADMIN_IDS" "$VPS_MONTHLY_GB" "$VPS_EXPIRES_AT" "$VPS_TRAFFIC_ALERT_PERCENT" "$VPS_TRAFFIC_INTERFACE"
  info "已保存 Telegram Bot 私有配置"
else
  # Backfill newly introduced VPS-plan settings without overwriting existing values.
  for line in 'VPS_MONTHLY_GB=0' 'VPS_EXPIRES_AT=' 'VPS_TRAFFIC_ALERT_PERCENT=80' 'VPS_TRAFFIC_INTERFACE='; do
    key="${line%%=*}"
    grep -q "^${key}=" "$ENV_FILE" || printf '%s\n' "$line" >> "$ENV_FILE"
  done
  chmod 600 "$ENV_FILE"
fi

# Parse the fixed configuration format as data. Never source the Telegram config.
declare -A CFG=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" =~ ^([A-Z0-9_]+)=(.*)$ ]] || err "$ENV_FILE 存在非法配置行；仅允许 KEY=VALUE"
  key="${BASH_REMATCH[1]}"; value="${BASH_REMATCH[2]}"
  [[ -z "${CFG[$key]+x}" ]] || err "$ENV_FILE 存在重复配置项：$key"
  CFG["$key"]="$value"
done < "$ENV_FILE"

TG_BOT_TOKEN="${CFG[TG_BOT_TOKEN]:-}"; TG_ADMIN_IDS="${CFG[TG_ADMIN_IDS]:-}"; MIHOMO_FULL_DIR="${CFG[MIHOMO_FULL_DIR]:-$BASE}"
VPS_MONTHLY_GB="${CFG[VPS_MONTHLY_GB]:-0}"; VPS_EXPIRES_AT="${CFG[VPS_EXPIRES_AT]:-}"; VPS_TRAFFIC_ALERT_PERCENT="${CFG[VPS_TRAFFIC_ALERT_PERCENT]:-80}"; VPS_TRAFFIC_INTERFACE="${CFG[VPS_TRAFFIC_INTERFACE]:-}"

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
info "在 Telegram 中打开机器人并发送 /start 进行验证。"
