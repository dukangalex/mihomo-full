#!/usr/bin/env bash
# mihomo-full 安全更新器：先 staging、生成、审计，成功后才提交
set -euo pipefail

INSTALL_DIR="/opt/mihomo-full"
REPO="dukangalex/mihomo-full"
MARKER_VALUE="mihomo-full-managed-v1"
LOCK_FILE="/run/lock/mihomo-full-update.lock"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info(){ echo -e "${GREEN}[+]${NC} $1"; }
warn(){ echo -e "${YELLOW}[!]${NC} $1"; }
err(){ echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || err "请使用 root 运行"
[[ -d "$INSTALL_DIR" ]] || err "找不到 $INSTALL_DIR"
MARKER="$INSTALL_DIR/.mihomo-full-managed"
[[ -f "$MARKER" && ! -L "$MARKER" ]] || err "缺少有效 Mihomo Full 所有权标记，拒绝更新"
[[ "$(cat "$MARKER" 2>/dev/null)" == "$MARKER_VALUE" ]] || err "所有权标记无效，拒绝更新"
[[ -O "$MARKER" ]] || err "所有权标记不属于当前 root，拒绝更新"

for cmd in curl python3 systemctl flock; do command -v "$cmd" >/dev/null 2>&1 || err "需要 $cmd"; done
exec 9>"$LOCK_FILE"
flock -n 9 || err "已有更新任务正在运行，请稍后再试"

COMMIT="$(curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://api.github.com/repos/${REPO}/commits/main" | sed -n 's/.*"sha":"\([0-9a-f]\{40\}\)".*/\1/p' | head -n1)"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || err "无法获取有效提交 SHA"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${COMMIT}"

STAGE="$(mktemp -d /opt/.mihomo-full-update.XXXXXX)"
COMMITTED=0
PREVIOUS="${INSTALL_DIR}.previous"
cleanup(){
  if (( COMMITTED == 0 )); then
    rm -rf -- "$STAGE" 2>/dev/null || true
    # 提交窗口中收到 SIGINT/SIGTERM 或发生异常时，优先恢复旧版本。
    if [[ -e "$PREVIOUS" ]]; then
      rm -rf -- "$INSTALL_DIR" 2>/dev/null || true
      mv -- "$PREVIOUS" "$INSTALL_DIR" 2>/dev/null || true
    fi
  else
    rm -rf -- "$PREVIOUS" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "$STAGE/tools" "$STAGE/telegram-bot" "$STAGE/output"

download(){ curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 -o "$1" "$2" || err "下载失败：$2"; }

# 运行状态：永不从公开仓库覆盖。
for f in settings.conf rulesets.local.conf telegram-bot.env; do
  if [[ -f "$INSTALL_DIR/$f" ]]; then
    install -m 600 "$INSTALL_DIR/$f" "$STAGE/$f"
  fi
done
if [[ -d "$INSTALL_DIR/output" ]]; then
  cp -a -- "$INSTALL_DIR/output/." "$STAGE/output/"
fi

info "更新至固定提交：$COMMIT"
FILES=(
  generate.sh template.yaml manage.sh uninstall.sh update.sh
  tools/generate-endpoint.py tools/load-settings.sh tools/audit-generated-config.sh
  telegram-bot/bot.py telegram-bot/vps_usage.py telegram-bot/install-telegram-bot.sh
  telegram-bot/mihomo-full-bot.service telegram-bot/requirements.txt telegram-bot.example.env
)
for f in "${FILES[@]}"; do
  mkdir -p "$STAGE/$(dirname "$f")"
  download "$STAGE/$f" "$RAW_BASE/$f"
done

chmod 700 "$STAGE/generate.sh" "$STAGE/manage.sh" "$STAGE/uninstall.sh" "$STAGE/update.sh" "$STAGE/tools" "$STAGE/tools/audit-generated-config.sh" "$STAGE/tools/generate-endpoint.py" "$STAGE/tools/load-settings.sh" "$STAGE/telegram-bot" "$STAGE/telegram-bot/install-telegram-bot.sh"
chmod 600 "$STAGE/settings.conf" "$STAGE/rulesets.local.conf" "$STAGE/telegram-bot.env" 2>/dev/null || true

[[ -f "$STAGE/settings.conf" ]] || err "当前安装缺少 settings.conf，拒绝自动更新；请先修复安装"
[[ -f "$STAGE/rulesets.local.conf" ]] || printf '%s\n' '# provider|https_mrs_url|behavior|target|enabled' > "$STAGE/rulesets.local.conf"

python3 - "$STAGE/settings.conf" <<'PY'
from pathlib import Path
import re, sys
p=Path(sys.argv[1]); s=p.read_text(encoding='utf-8')
s=re.sub(r'^OUTPUT_DIR=.*$', "OUTPUT_DIR='" + str(p.parent/'output') + "'", s, flags=re.M)
p.write_text(s, encoding='utf-8'); p.chmod(0o600)
PY

bash -n "$STAGE/generate.sh" "$STAGE/manage.sh" "$STAGE/uninstall.sh" "$STAGE/update.sh" "$STAGE/tools/load-settings.sh"
source "$STAGE/tools/load-settings.sh" "$STAGE/settings.conf"

bash "$STAGE/generate.sh"
[[ -s "$STAGE/output/full-config.yaml" ]] || err "未生成完整配置"
[[ -s "$STAGE/output/exit-nodes.yaml" ]] || err "未生成落地节点配置"
[[ -x "$STAGE/tools/audit-generated-config.sh" ]] || err "缺少最终配置审计脚本"
bash "$STAGE/tools/audit-generated-config.sh" "$STAGE/output/full-config.yaml" || err "更新版本最终审计失败，拒绝提交"

printf '%s\n' "$MARKER_VALUE" > "$STAGE/.mihomo-full-managed"
chmod 600 "$STAGE/.mihomo-full-managed"
[[ ! -e "$PREVIOUS" ]] || err "检测到残留的旧版本目录，拒绝更新"

info "验证完成，开始提交更新"
if ! mv -- "$INSTALL_DIR" "$PREVIOUS"; then
  err "无法切换旧版本，原安装保持不变"
fi
if ! mv -- "$STAGE" "$INSTALL_DIR"; then
  err "无法部署新版本，更新退出并由清理程序恢复原安装"
fi
COMMITTED=1

if [[ -f "$INSTALL_DIR/settings.conf" ]]; then
  sed -i "s|^OUTPUT_DIR=.*$|OUTPUT_DIR=$(printf '%q' "${INSTALL_DIR}/output")|" "$INSTALL_DIR/settings.conf"
  chmod 600 "$INSTALL_DIR/settings.conf"
fi

if ! [[ -s "$INSTALL_DIR/output/full-config.yaml" && -s "$INSTALL_DIR/output/exit-nodes.yaml" && -x "$INSTALL_DIR/manage.sh" && -x "$INSTALL_DIR/generate.sh" && -x "$INSTALL_DIR/update.sh" && -f "$INSTALL_DIR/.mihomo-full-managed" ]]; then
  warn "更新后完整性检查失败，开始回滚"
  COMMITTED=0
  rm -rf -- "$INSTALL_DIR"
  mv -- "$PREVIOUS" "$INSTALL_DIR" || err "严重错误：新版本已移除，但旧版本恢复失败，请立即检查 ${PREVIOUS}"
  err "更新失败，已恢复原安装"
fi

rm -rf -- "$PREVIOUS"
info "更新成功：$COMMIT"
echo "管理入口：$INSTALL_DIR/manage.sh"
echo "固定订阅路径保持不变：$FIXED_FULL_CONFIG_PATH"
echo "落地节点路径保持不变：$FIXED_EXIT_NODES_PATH"