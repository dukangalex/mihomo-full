#!/usr/bin/env bash
# mihomo-full 一键安装（需已安装 v2ray-agent）
set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info(){ echo -e "${GREEN}[+]${NC} $1"; }; warn(){ echo -e "${YELLOW}[!]${NC} $1"; }; err(){ echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }; title(){ echo -e "\n${CYAN}==== $1 ====${NC}\n"; }
INSTALL_DIR="/opt/mihomo-full"; REPO="dukangalex/mihomo-full"; MARKER_VALUE="mihomo-full-managed-v1"; GO_LINK="/usr/local/bin/go"; MIHOMO_LINK="/usr/local/bin/mihomo-full"

title "0. 安装前安全预检"
[[ $EUID -eq 0 ]] || err "请使用 root 运行：sudo bash install.sh"
for cmd in curl python3 systemctl; do command -v "$cmd" >/dev/null 2>&1 || err "需要 $cmd"; done

EXISTING=0
if [[ -e "$INSTALL_DIR" ]]; then
  [[ -d "$INSTALL_DIR" ]] || err "$INSTALL_DIR 已存在但不是目录，拒绝继续"
  MARKER="$INSTALL_DIR/.mihomo-full-managed"
  [[ -f "$MARKER" && ! -L "$MARKER" ]] || err "$INSTALL_DIR 已存在但没有有效的 Mihomo Full 所有权标记，拒绝覆盖"
  [[ "$(cat "$MARKER" 2>/dev/null)" == "$MARKER_VALUE" ]] || err "$INSTALL_DIR 所有权标记无效，拒绝覆盖"
  [[ -O "$MARKER" ]] || err "$INSTALL_DIR 所有权标记不属于当前 root，拒绝继续"
  EXISTING=1
  info "检测到受 Mihomo Full 管理的现有安装，允许安全更新"
else
  info "未发现现有 Mihomo Full 安装，将使用临时目录完成事务式首次安装"
fi

if [[ -e "$GO_LINK" || -L "$GO_LINK" ]]; then
  if [[ -L "$GO_LINK" ]]; then
    existing_go_target="$(readlink -f "$GO_LINK" 2>/dev/null || true)"
    if [[ "$existing_go_target" != "$INSTALL_DIR/manage.sh" ]]; then
      err "$GO_LINK 已被其他程序占用；为避免覆盖现有 go 命令，本次安装已停止。请先处理该命令冲突。"
    fi
  else
    err "$GO_LINK 已存在且不是 Mihomo Full 创建的符号链接；为避免覆盖现有 go 命令，本次安装已停止。"
  fi
fi

if [[ -e "$MIHOMO_LINK" || -L "$MIHOMO_LINK" ]]; then
  if [[ -L "$MIHOMO_LINK" ]]; then
    existing_mihomo_target="$(readlink -f "$MIHOMO_LINK" 2>/dev/null || true)"
    [[ "$existing_mihomo_target" == "$INSTALL_DIR/manage.sh" ]] || err "$MIHOMO_LINK 已被其他程序占用，拒绝覆盖"
  else
    err "$MIHOMO_LINK 已存在且不是符号链接，拒绝覆盖"
  fi
fi

if [[ -d /etc/v2ray-agent ]]; then
  info "检测到 v2ray-agent：仅读取其 clashMeta 输出，不接管其生命周期"
else
  warn "未检测到 /etc/v2ray-agent，请确认 v2ray-agent 已正确安装；后续生成阶段可能没有落地节点"
fi

systemctl is-system-running >/dev/null 2>&1 || {
  state="$(systemctl is-system-running 2>/dev/null || true)"
  case "$state" in
    starting|degraded|maintenance) warn "systemd 当前状态：$state，继续前请确认这是预期状态";;
    *) err "systemd 不可正常使用（状态：${state:-unknown}），拒绝继续";;
  esac
}

REPO_COMMIT="$(curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://api.github.com/repos/${REPO}/commits/main" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha",""))')"
[[ "$REPO_COMMIT" =~ ^[0-9a-f]{40}$ ]] || err "无法解析仓库 main 的有效提交 SHA"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${REPO_COMMIT}"

clear; echo -e "${CYAN}"; echo "  Mihomo 完整配置 + v2ray-agent 一键部署"; echo "  --------------------------------------"; echo "  · 客户端只导入一个固定订阅"; echo "  · 公网路径安装时生成一次，使用自然语言随机词组"; echo "  · 公网路径不使用 hex / UUID / token / 节点语义"; echo -e "${NC}"
title "1. 填写必要信息"
read -rp "请输入机场订阅链接: " AIRPORT_SUB_URL
[[ "$AIRPORT_SUB_URL" =~ ^https://[^[:space:]\"]+$ ]] || err "机场订阅必须使用 HTTPS，且不能含空格或双引号"
read -rp "请输入域名（已解析到本机 VPS，不要 https://，例 example.com）: " DOMAIN
DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%%/*}"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || err "域名格式不正确"
read -rp "v2ray-agent clashMeta 目录 [默认 /etc/v2ray-agent/subscribe_local/clashMeta]: " V2RAY_DIR
V2RAY_DIR="${V2RAY_DIR:-/etc/v2ray-agent/subscribe_local/clashMeta}"
[[ "$V2RAY_DIR" == /* && "$V2RAY_DIR" != *$'\n'* && "$V2RAY_DIR" != *$'\r'* ]] || err "v2ray-agent 目录必须是绝对路径且不能包含换行"

if (( EXISTING )); then
  WORK_DIR="$(mktemp -d /opt/.mihomo-full-update.XXXXXX)"
else
  WORK_DIR="$(mktemp -d /opt/.mihomo-full-install.XXXXXX)"
fi
CLEANUP_STAGE=1
OUTPUT_DIR="${WORK_DIR}/output"
MARKER="${WORK_DIR}/.mihomo-full-managed"
mkdir -p "$OUTPUT_DIR" "$WORK_DIR/tools" "$WORK_DIR/telegram-bot"
cleanup(){ if (( CLEANUP_STAGE )); then rm -rf -- "$WORK_DIR"; fi; }
trap cleanup EXIT INT TERM

if (( EXISTING )); then
  for f in settings.conf rulesets.local.conf; do
    [[ -f "$INSTALL_DIR/$f" ]] && install -m 600 "$INSTALL_DIR/$f" "$WORK_DIR/$f"
  done
  [[ -f "$INSTALL_DIR/telegram-bot.env" ]] && install -m 600 "$INSTALL_DIR/telegram-bot.env" "$WORK_DIR/telegram-bot.env"
fi

download(){ curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 -o "$1" "$2" || err "下载失败：$2"; }

title "2. 下载固定代码快照"
download "${WORK_DIR}/generate.sh" "${RAW_BASE}/generate.sh"
download "${WORK_DIR}/template.yaml" "${RAW_BASE}/template.yaml"
download "${WORK_DIR}/manage.sh" "${RAW_BASE}/manage.sh"
download "${WORK_DIR}/uninstall.sh" "${RAW_BASE}/uninstall.sh"
download "${WORK_DIR}/update.sh" "${RAW_BASE}/update.sh"
download "${WORK_DIR}/tools/generate-endpoint.py" "${RAW_BASE}/tools/generate-endpoint.py"
download "${WORK_DIR}/tools/load-settings.sh" "${RAW_BASE}/tools/load-settings.sh"
download "${WORK_DIR}/tools/audit-generated-config.sh" "${RAW_BASE}/tools/audit-generated-config.sh"
download "${WORK_DIR}/telegram-bot/bot.py" "${RAW_BASE}/telegram-bot/bot.py"
download "${WORK_DIR}/telegram-bot/vps_usage.py" "${RAW_BASE}/telegram-bot/vps_usage.py"
download "${WORK_DIR}/telegram-bot/install-telegram-bot.sh" "${RAW_BASE}/telegram-bot/install-telegram-bot.sh"
download "${WORK_DIR}/telegram-bot/mihomo-full-bot.service" "${RAW_BASE}/telegram-bot/mihomo-full-bot.service"
download "${WORK_DIR}/telegram-bot/requirements.txt" "${RAW_BASE}/telegram-bot/requirements.txt"
download "${WORK_DIR}/telegram-bot.example.env" "${RAW_BASE}/telegram-bot.example.env"
chmod 700 "${WORK_DIR}/manage.sh" "${WORK_DIR}/generate.sh" "${WORK_DIR}/uninstall.sh" "${WORK_DIR}/update.sh" "${WORK_DIR}/tools/audit-generated-config.sh" "${WORK_DIR}/tools/generate-endpoint.py" "${WORK_DIR}/tools/load-settings.sh" "${WORK_DIR}/telegram-bot/install-telegram-bot.sh"
chmod 600 "${WORK_DIR}/telegram-bot/bot.py" "${WORK_DIR}/telegram-bot/vps_usage.py" "${WORK_DIR}/telegram-bot/requirements.txt"

if [[ -f "${WORK_DIR}/settings.conf" ]]; then
  source "${WORK_DIR}/tools/load-settings.sh" "${WORK_DIR}/settings.conf"
  [[ "$FIXED_FULL_CONFIG_PATH" =~ ^/assets/[a-z]+(-[a-z]+){7,15}$ ]] || err "已有订阅路径格式不符合当前 Endpoint 策略，拒绝覆盖"
  [[ "$FIXED_EXIT_NODES_PATH" =~ ^/assets/[a-z]+(-[a-z]+){7,15}$ ]] || err "已有落地路径格式不符合当前 Endpoint 策略，拒绝覆盖"
  FULL_PATH="$FIXED_FULL_CONFIG_PATH"; NODES_PATH="$FIXED_EXIT_NODES_PATH"
  info "检测到已有安装状态，保留固定公网路径"
else
  FULL_WORDS="$(python3 "${WORK_DIR}/tools/generate-endpoint.py")" || err "无法生成完整配置公网路径"
  NODES_WORDS="$(python3 "${WORK_DIR}/tools/generate-endpoint.py")" || err "无法生成落地节点公网路径"
  FULL_PATH="/assets/${FULL_WORDS}"; NODES_PATH="/assets/${NODES_WORDS}"
fi

info "代码快照       : $REPO_COMMIT"; info "机场订阅       : $AIRPORT_SUB_URL"; info "域名           : $DOMAIN"; info "节点目录       : $V2RAY_DIR"; info "完整订阅路径   : $FULL_PATH"; info "落地节点路径   : $NODES_PATH"
read -rp "确认无误？(Y/n): " CONFIRM; [[ "${CONFIRM:-Y}" =~ ^[Yy]$ ]] || { echo "已取消"; exit 0; }

if [[ ! -f "${WORK_DIR}/settings.conf" ]]; then
  { printf '%s\n' '# auto-generated by install.sh'; printf 'AIRPORT_SUB_URL=%q\n' "$AIRPORT_SUB_URL"; printf 'FIXED_FULL_CONFIG_PATH=%q\n' "$FULL_PATH"; printf 'FIXED_EXIT_NODES_PATH=%q\n' "$NODES_PATH"; printf 'DOMAIN=%q\n' "$DOMAIN"; printf 'V2RAY_AGENT_CLASHMETA_DIR=%q\n' "$V2RAY_DIR"; printf 'OUTPUT_DIR=%q\n' "$OUTPUT_DIR"; } > "${WORK_DIR}/settings.conf"
else
  NEW_URL="$AIRPORT_SUB_URL" NEW_DOMAIN="$DOMAIN" NEW_V2RAY_DIR="$V2RAY_DIR" SETTINGS_FILE="${WORK_DIR}/settings.conf" python3 - <<'PY'
import os, re, shlex
from pathlib import Path
p=Path(os.environ['SETTINGS_FILE']); vals={'AIRPORT_SUB_URL':os.environ['NEW_URL'],'DOMAIN':os.environ['NEW_DOMAIN'],'V2RAY_AGENT_CLASHMETA_DIR':os.environ['NEW_V2RAY_DIR']}
lines=p.read_text(encoding='utf-8').splitlines(); out=[]; seen=set()
for line in lines:
    m=re.match(r'^(AIRPORT_SUB_URL|DOMAIN|V2RAY_AGENT_CLASHMETA_DIR)=', line)
    if m:
        k=m.group(1); out.append(k+'='+shlex.quote(vals[k])); seen.add(k)
    else: out.append(line)
for k,v in vals.items():
    if k not in seen: out.append(k+'='+shlex.quote(v))
t=p.with_suffix('.conf.tmp'); t.write_text('\n'.join(out)+'\n',encoding='utf-8'); os.chmod(t,0o600); t.replace(p)
PY
fi
chmod 600 "${WORK_DIR}/settings.conf"
[[ -f "${WORK_DIR}/rulesets.local.conf" ]] || printf '%s\n' '# provider|https_mrs_url|behavior|target|enabled' > "${WORK_DIR}/rulesets.local.conf"
chmod 600 "${WORK_DIR}/rulesets.local.conf"

title "3. 生成并审计配置"
bash "${WORK_DIR}/generate.sh"

if (( ! EXISTING )); then
  printf '%s\n' "$MARKER_VALUE" > "$MARKER"
  chmod 600 "$MARKER"
  chmod 700 "$WORK_DIR" "$WORK_DIR/tools" "$WORK_DIR/telegram-bot"
  mv -- "$WORK_DIR" "$INSTALL_DIR"
  CLEANUP_STAGE=0
  trap - EXIT INT TERM
  info "首次安装事务提交成功：正式目录已原子落地"
else
  printf '%s\n' "$MARKER_VALUE" > "$MARKER"
  chmod 600 "$MARKER"
  chmod 700 "$WORK_DIR" "$WORK_DIR/tools" "$WORK_DIR/telegram-bot"
  BACKUP_DIR="$(mktemp -d /opt/.mihomo-full-backup.XXXXXX)"
  cp -a -- "$INSTALL_DIR/." "$BACKUP_DIR/"
  if ! mv -- "$WORK_DIR" "${INSTALL_DIR}.next"; then
    rm -rf -- "$BACKUP_DIR"
    err "无法准备更新目录，原安装保持不变"
  fi
  CLEANUP_STAGE=0
  if ! mv -- "$INSTALL_DIR" "${INSTALL_DIR}.previous" || ! mv -- "${INSTALL_DIR}.next" "$INSTALL_DIR"; then
    rm -rf -- "$INSTALL_DIR" "${INSTALL_DIR}.next" 2>/dev/null || true
    mv -- "$BACKUP_DIR" "$INSTALL_DIR"
    rm -rf -- "${INSTALL_DIR}.previous" 2>/dev/null || true
    err "更新提交失败，已尝试恢复原安装"
  fi
  rm -rf -- "$BACKUP_DIR" "${INSTALL_DIR}.previous"
fi

ln -sfn "${INSTALL_DIR}/manage.sh" "$MIHOMO_LINK"
if [[ ! -e "$GO_LINK" && ! -L "$GO_LINK" ]]; then
  ln -s "${INSTALL_DIR}/manage.sh" "$GO_LINK"
  info "已创建快捷入口：go"
else
  info "已存在受 Mihomo Full 管理的快捷入口：go"
fi
if [[ -f "${INSTALL_DIR}/settings.conf" ]]; then
  sed -i "s|^OUTPUT_DIR=.*$|OUTPUT_DIR=$(printf '%q' "${INSTALL_DIR}/output")|" "${INSTALL_DIR}/settings.conf"
  chmod 600 "${INSTALL_DIR}/settings.conf"
fi

title "4. Nginx 配置（必须）"
cat <<EOF
请把以下内容加入你的 Nginx server 块，然后执行 nginx -t && systemctl reload nginx：

location = ${FULL_PATH} {
    alias ${INSTALL_DIR}/output/full-config.yaml;
    default_type application/octet-stream;
    add_header Cache-Control "no-cache";
}

location = ${NODES_PATH} {
    alias ${INSTALL_DIR}/output/exit-nodes.yaml;
    default_type application/octet-stream;
    add_header Cache-Control "no-cache";
}

location /assets/ { return 404; }
EOF
if command -v nginx >/dev/null 2>&1; then info "检测到 Nginx 已安装"; else warn "未检测到 Nginx，请自行配置 Web 服务器"; fi

title "完成"
echo -e "客户端导入：${GREEN}https://${DOMAIN}${FULL_PATH}${NC}"
echo "管理入口：go"
echo "兼容入口：mihomo-full"
echo "安全卸载：${INSTALL_DIR}/uninstall.sh"
echo "TG Bot：已部署代码但默认不启用；运行 telegram-bot/install-telegram-bot.sh 后按提示设置"
info "全部完成"