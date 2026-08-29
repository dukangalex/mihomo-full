#!/usr/bin/env bash
# Mihomo Full 安全卸载
# 硬性边界：只删除 Mihomo Full 自身资源；绝不删除、停止、修改 v2ray-agent。
set -euo pipefail

INSTALL_DIR="/opt/mihomo-full"
BIN_LINK="/usr/local/bin/mihomo-full"
BOT_SERVICE="mihomo-full-bot.service"
BOT_ENV="${INSTALL_DIR}/telegram-bot/.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info(){ echo -e "${GREEN}[+]${NC} $1"; }
warn(){ echo -e "${YELLOW}[!]${NC} $1"; }
err(){ echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || err "请使用 root 运行"

if [[ ! -d "$INSTALL_DIR" && ! -L "$BIN_LINK" ]]; then
  info "Mihomo Full 未安装，无需卸载。"
  exit 0
fi

echo ""
echo "Mihomo Full 卸载预览"
echo "-----------------------------"
echo "将删除："
echo "  - $INSTALL_DIR"
echo "  - $BIN_LINK（若指向 Mihomo Full）"
echo "  - $BOT_SERVICE（若存在）"
echo ""
echo "明确不会操作："
echo "  - /etc/v2ray-agent"
echo "  - v2ray-agent systemd 服务"
echo "  - v2ray-agent 节点/订阅"
echo "  - 其他非 Mihomo Full 文件"
echo ""
read -r -p "确认卸载 Mihomo Full？输入 UNINSTALL 确认： " confirm
[[ "$confirm" == "UNINSTALL" ]] || { info "已取消。"; exit 0; }

# 先停止/禁用本项目自己的 Bot 服务；绝不按模糊匹配停止其他服务。
if systemctl list-unit-files --type=service 2>/dev/null | grep -q "^${BOT_SERVICE}[[:space:]]"; then
  systemctl disable --now "$BOT_SERVICE" 2>/dev/null || true
  rm -f "/etc/systemd/system/${BOT_SERVICE}"
  systemctl daemon-reload || true
fi

# 只删除明确属于 Mihomo Full 的命令链接。
if [[ -L "$BIN_LINK" ]]; then
  target="$(readlink -f "$BIN_LINK" 2>/dev/null || true)"
  if [[ "$target" == "$INSTALL_DIR/manage.sh" ]]; then
    rm -f "$BIN_LINK"
  else
    warn "检测到 $BIN_LINK 不是指向 Mihomo Full，保留它。"
  fi
fi

# 删除本项目自己的安装目录。该目录不应承载 v2ray-agent 数据。
if [[ -d "$INSTALL_DIR" ]]; then
  rm -rf -- "$INSTALL_DIR"
fi

# 明确做一次 v2ray-agent 边界检查；这里只读，不修改。
if [[ -d /etc/v2ray-agent ]]; then
  info "已检测到 /etc/v2ray-agent：保留，未执行任何删除或停止操作。"
fi

info "Mihomo Full 已卸载。"
warn "如果你曾手工把订阅 location 加入 Nginx，请按原配置手工移除；本卸载器不会扫描并修改未知的 Nginx 配置。"
