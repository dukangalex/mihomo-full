#!/usr/bin/env bash
# Mihomo Full 安全卸载
# 硬性边界：只删除 Mihomo Full 自身资源；绝不删除、停止、修改 v2ray-agent。
set -euo pipefail

INSTALL_DIR="/opt/mihomo-full"
BIN_LINK="/usr/local/bin/mihomo-full"
BOT_SERVICE="mihomo-full-bot.service"
BOT_ENV="${INSTALL_DIR}/telegram-bot.env"
MARKER="${INSTALL_DIR}/.mihomo-full-managed"
MARKER_VALUE="mihomo-full-managed-v1"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info(){ echo -e "${GREEN}[+]${NC} $1"; }
warn(){ echo -e "${YELLOW}[!]${NC} $1"; }
err(){ echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || err "请使用 root 运行"

if [[ -d "$INSTALL_DIR" ]]; then
  [[ -f "$MARKER" ]] || err "拒绝卸载：$INSTALL_DIR 没有 Mihomo Full 所有权标记。为防止误删未知目录，不执行删除。"
  [[ "$(cat "$MARKER" 2>/dev/null)" == "$MARKER_VALUE" ]] || err "拒绝卸载：Mihomo Full 所有权标记无效。"
elif [[ ! -L "$BIN_LINK" ]]; then
  info "Mihomo Full 未安装，无需卸载。"
  exit 0
fi

echo ""
echo "Mihomo Full 卸载预览"
echo "-----------------------------"
echo "将删除："
echo "  - $INSTALL_DIR（仅因所有权标记有效）"
echo "  - $BIN_LINK（仅当指向 Mihomo Full）"
echo "  - $BOT_SERVICE（若存在且属于本项目）"
echo ""
echo "明确不会操作："
echo "  - /etc/v2ray-agent"
echo "  - v2ray-agent systemd 服务"
echo "  - v2ray-agent 节点/订阅"
echo "  - 其他非 Mihomo Full 文件"
echo ""
read -r -p "确认卸载 Mihomo Full？输入 UNINSTALL 确认： " confirm
[[ "$confirm" == "UNINSTALL" ]] || { info "已取消。"; exit 0; }

if systemctl list-unit-files --type=service 2>/dev/null | grep -q "^${BOT_SERVICE}[[:space:]]"; then
  systemctl disable --now "$BOT_SERVICE" 2>/dev/null || true
  rm -f "/etc/systemd/system/${BOT_SERVICE}"
  systemctl daemon-reload || true
fi

if [[ -L "$BIN_LINK" ]]; then
  target="$(readlink -f "$BIN_LINK" 2>/dev/null || true)"
  if [[ "$target" == "$INSTALL_DIR/manage.sh" ]]; then
    rm -f "$BIN_LINK"
  else
    warn "检测到 $BIN_LINK 不是指向 Mihomo Full，保留它。"
  fi
fi

if [[ -d "$INSTALL_DIR" ]]; then
  rm -rf -- "$INSTALL_DIR"
fi

if [[ -d /etc/v2ray-agent ]]; then
  info "已检测到 /etc/v2ray-agent：保留，未执行任何删除或停止操作。"
fi

info "Mihomo Full 已卸载。"
warn "如果你曾手工把订阅 location 加入 Nginx，请按原配置手工移除；本卸载器不会扫描并修改未知的 Nginx 配置。"