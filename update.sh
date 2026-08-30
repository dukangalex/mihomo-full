#!/usr/bin/env bash
# mihomo-full 安全更新器：先 staging、生成、审计，成功后才提交
set -euo pipefail

INSTALL_DIR="/opt/mihomo-full"
REPO="dukangalex/mihomo-full"
MARKER_VALUE="mihomo-full-managed-v1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

for cmd in curl python3 systemctl; do command -v "$cmd" >/dev/null 2>&1 || err "需要 $cmd"; done

COMMIT="$(curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://api.github.com/repos/${REPO}/commits/main" | sed -n 's/.*"sha":"\([0-9a-f]\{40\}\)".*/\1/p' | head -n1)"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || err "无法获取有效提交 SHA"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${COMMIT}"

STAGE="$(mktemp -d /opt/.mihomo-full-update.XXXXXX)"
BACKUP=""
COMMITTED=0
cleanup(){
  if (( COMMITTED == 0 )); then rm -rf -- "$STAGE" 2>/dev/null || true; fi
  [[ -n "$BACKUP" ]] && rm -rf -- "$BACKUP" 2>/dev/null || true
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
  generate.sh template.yaml manage.sh uninstall.sh
  tools/generate-endpoint.py tools/load-settings.sh tools/audit-generated-config.sh
  telegram-bot/bot.py telegram-bot/vps_usage.py telegram-bot/install-telegram-bot.sh
  telegram-bot/mihomo-full-bot.service telegram-bot/requirements.txt telegram-bot.example.env
)
for f in "${FILES[@]}"; do
  mkdir -p "$STAGE/$(dirname "$f")"
  download "$STAGE/$f" "$RAW_BASE/$f"
done

chmod 700 "$STAGE/generate.sh" "$STAGE/manage.sh" "$STAGE/uninstall.sh" "$STAGE/tools" "$STAGE/tools/audit-generated-config.sh" "$STAGE/tools/generate-endpoint.py" "$STAGE/tools/load-settings.sh" "$STAGE/telegram-bot" "$STAGE/telegram-bot/install-telegram-bot.sh"
chmod 600 "$STAGE/settings.conf" "$STAGE/rulesets.local.conf" "$STAGE/telegram-bot.env" 2>/dev/null || true

[[ -f "$STAGE/settings.conf" ]] || err "当前安装缺少 settings.conf，拒绝自动更新；请先修复安装"
[[ -f "$STAGE/rulesets.local.conf" ]] || printf '%s\n' '# provider|https_mrs_url|behavior|target|enabled' > "$STAGE/rulesets.local.conf"

# 生成器必须只使用 staging 内部路径。
OUTPUT_DIR="$STAGE/output" python3 - "$STAGE/settings.conf" <<'PY'
from pathlib import Path
import re, sys
p=Path(sys.argv[1]); s=p.read_text(encoding='utf-8')
s=re.sub(r'^OUTPUT_DIR=.*$', "OUTPUT_DIR='" + str(p.parent/'output') + "'", s, flags=re.M)
p.write_text(s, encoding='utf-8')
PY

bash -n "$STAGE/generate.sh" "$STAGE/manage.sh" "$STAGE/uninstall.sh" "$STAGE/tools/load-settings.sh"
source "$STAGE/tools/load-settings.sh" "$STAGE/settings.conf"

# 使用 staging 的 generate.sh，确保正式目录在验证阶段完全不变。
bash "$STAGE/generate.sh"
[[ -s "$STAGE/output/full-config.yaml" ]] || err "未生成完整配置"
[[ -s "$STAGE/output/exit-nodes.yaml" ]] || err "未生成落地节点配置"
[[ -x "$STAGE/tools/audit-generated-config.sh" ]] || err "缺少最终配置审计脚本"
bash "$STAGE/tools/audit-generated-config.sh" "$STAGE/output/full-config.yaml" || err "更新版本最终审计失败，拒绝提交"

printf '%s\n' "$MARKER_VALUE" > "$STAGE/.mihomo-full-managed"
chmod 600 "$STAGE/.mihomo-full-managed"

# 提交前保留完整旧目录；任何失败均回滚。
BACKUP="$(mktemp -d /opt/.mihomo-full-backup.XXXXXX)"
rm -rf -- "$BACKUP"
cp -a -- "$INSTALL_DIR" "$BACKUP"

info "验证完成，开始提交更新"
if ! mv -- "$INSTALL_DIR" "${INSTALL_DIR}.previous"; then
  err "无法切换旧版本，原安装保持不变"
fi
if ! mv -- "$STAGE" "$INSTALL_DIR"; then
  mv -- "${INSTALL_DIR}.previous" "$INSTALL_DIR" || true
  err "无法部署新版本，已尝试恢复原安装"
fi
COMMITTED=1

# 新目录已就位；旧目录作为最后安全网短暂保留，健康检查通过后删除。
if [[ -x "$INSTALL_DIR/manage.sh" && -x "$INSTALL_DIR/generate.sh" ]]; then
  bash -n "$INSTALL_DIR/manage.sh" "$INSTALL_DIR/generate.sh" "$INSTALL_DIR/uninstall.sh"
else
  warn "新版本管理脚本不可执行，启动回滚"
  rm -rf -- "$INSTALL_DIR"
  mv -- "$INSTALL_DIR.previous" "$INSTALL_DIR"
  err "更新健康检查失败，已恢复原安装"
fi

rm -rf -- "$INSTALL_DIR.previous"
rm -rf -- "$BACKUP"
BACKUP=""

info "更新成功：$COMMIT"
echo "管理入口：$INSTALL_DIR/manage.sh"
echo "固定订阅路径保持不变：$FIXED_FULL_CONFIG_PATH"
echo "落地节点路径保持不变：$FIXED_EXIT_NODES_PATH"