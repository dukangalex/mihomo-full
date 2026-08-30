#!/usr/bin/env bash
# Mihomo Full Telegram Bot 独立卸载
# 只移除 Bot 自身；绝不删除、停止或修改 Mihomo Full 主服务或 v2ray-agent。
set -euo pipefail

BASE="/opt/mihomo-full"
SERVICE="mihomo-full-bot.service"
SERVICE_FILE="/etc/systemd/system/${SERVICE}"
ENV_FILE="${BASE}/telegram-bot.env"
BOT_DIR="${BASE}/telegram-bot"
MARKER="${BASE}/.mihomo-full-managed"
SERVICE_MARKER="mihomo-full-managed-service-v1"

[[ $EUID -eq 0 ]] || { echo "请使用 root 运行"; exit 1; }
[[ -f "$MARKER" ]] || { echo "拒绝卸载：未找到 Mihomo Full 所有权标记。"; exit 1; }
[[ -f "$SERVICE_FILE" ]] || { echo "拒绝卸载：未找到 Mihomo Full Bot 服务。"; exit 1; }
grep -Fqx "# ${SERVICE_MARKER}" "$SERVICE_FILE" || { echo "拒绝卸载：Bot 服务所有权标记无效。"; exit 1; }
grep -Fqx "WorkingDirectory=${BASE}" "$SERVICE_FILE" || { echo "拒绝卸载：Bot 服务目录不匹配。"; exit 1; }
grep -Fqx "EnvironmentFile=${ENV_FILE}" "$SERVICE_FILE" || { echo "拒绝卸载：Bot 私有配置不匹配。"; exit 1; }
grep -Fqx "ExecStart=/usr/bin/python3 ${BOT_DIR}/bot.py" "$SERVICE_FILE" || { echo "拒绝卸载：Bot 启动文件不匹配。"; exit 1; }

printf 'Telegram Bot 独立卸载确认：输入 UNINSTALL_BOT 确认： '
read -r confirm
[[ "$confirm" == "UNINSTALL_BOT" ]] || { echo "已取消。"; exit 0; }

systemctl disable --now "$SERVICE" 2>/dev/null || true
rm -f -- "$SERVICE_FILE"
systemctl daemon-reload || true
rm -f -- "$ENV_FILE"
rm -rf -- "$BOT_DIR"

echo "Telegram Bot 已卸载。"
echo "Mihomo Full 主配置、Mihomo 服务和 v2ray-agent 未被操作。"
