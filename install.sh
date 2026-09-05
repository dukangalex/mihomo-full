#!/usr/bin/env bash
# mihomo-full 一键安装（需已安装 v2ray-agent）
set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info(){ echo -e "${GREEN}[+]${NC} $1"; }; warn(){ echo -e "${YELLOW}[!]${NC} $1"; }; err(){ echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }; title(){ echo -e "\n${CYAN}==== $1 ====${NC}\n"; }
INSTALL_DIR="/opt/mihomo-full"; REPO="dukangalex/mihomo-full"; MARKER_VALUE="mihomo-full-managed-v1"; MF_LINK="/usr/local/bin/mff"; MIHOMO_LINK="/usr/local/bin/mihomo-full"

title "0. 安装前安全预检"
[[ $EUID -eq 0 ]] || err "请使用 root 运行：sudo bash install.sh"
for cmd in curl python3 systemctl awk; do command -v "$cmd" >/dev/null 2>&1 || err "需要 $cmd"; done
command -v nginx >/dev/null 2>&1 || err "未检测到 Nginx。

操作指示：
  1) Debian/Ubuntu:  apt update && apt install -y nginx
  2) RHEL/CentOS:    dnf install -y nginx
  3) 安装并启动 Nginx：systemctl enable --now nginx
  4) 为域名配置好 HTTPS 证书（见 README 步骤 C）
  5) 重新执行本安装脚本
"

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

if [[ -e "$MF_LINK" || -L "$MF_LINK" ]]; then
  if [[ -L "$MF_LINK" ]]; then
    existing_mf_target="$(readlink -f "$MF_LINK" 2>/dev/null || true)"
    if [[ "$existing_mf_target" != "$INSTALL_DIR/manage.sh" ]]; then
      err "$MF_LINK 已被其他程序占用；为避免覆盖现有 mff 命令，本次安装已停止。请先处理该命令冲突。"
    fi
  else
    err "$MF_LINK 已存在且不是 Mihomo Full 创建的符号链接；为避免覆盖现有 mff 命令，本次安装已停止。"
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

REPO_COMMIT_JSON="$(curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://api.github.com/repos/${REPO}/commits/main")" || err "无法连接 GitHub API（网络异常或 DNS 解析失败）。

请检查：
  1) VPS 网络是否能访问 api.github.com：
       curl -v https://api.github.com
  2) DNS 是否正常解析：
       getent ahostsv4 api.github.com
  3) 网络恢复后重新执行本安装脚本"
REPO_COMMIT="$(printf '%s' "$REPO_COMMIT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha",""))' 2>/dev/null || true)"
[[ "$REPO_COMMIT" =~ ^[0-9a-f]{40}$ ]] || err "无法解析仓库 main 的有效提交 SHA（可能是 GitHub API 限流或返回异常）。

请稍后重试，或手动检查：
  curl -s https://api.github.com/repos/${REPO}/commits/main"
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
if [[ ! -e "$MF_LINK" && ! -L "$MF_LINK" ]]; then
  ln -s "${INSTALL_DIR}/manage.sh" "$MF_LINK"
  info "已创建快捷入口：mff"
else
  info "已存在受 Mihomo Full 管理的快捷入口：mff"
fi
if [[ -f "${INSTALL_DIR}/settings.conf" ]]; then
  sed -i "s|^OUTPUT_DIR=.*$|OUTPUT_DIR=$(printf '%q' "${INSTALL_DIR}/output")|" "${INSTALL_DIR}/settings.conf"
  chmod 600 "${INSTALL_DIR}/settings.conf"
fi

title "4. 配置 Nginx（自动）"
SNIPPET_FILE="/etc/nginx/snippets/mihomo-full-assets.conf"
BEGIN_MARK="# BEGIN mihomo-full managed assets"
END_MARK="# END mihomo-full managed assets"
INCLUDE_LINE="include ${SNIPPET_FILE};"

NGX_HOST="${DOMAIN%%:*}"

has_cert=0
if [[ -f "/etc/letsencrypt/live/${NGX_HOST}/fullchain.pem" && -f "/etc/letsencrypt/live/${NGX_HOST}/privkey.pem" ]]; then
  has_cert=1
  info "检测到 Let's Encrypt 证书：/etc/letsencrypt/live/${NGX_HOST}/"
fi

mapfile -t NGX_CANDIDATES < <(find /etc/nginx -type f \( -name '*.conf' -o -name '*enabled*' \) 2>/dev/null | sort -u)
MATCH_CONF=""
for f in "${NGX_CANDIDATES[@]:-}"; do
  [[ -f "$f" ]] || continue
  if grep -Eq "server_name[[:space:]]+[^;]*\b${NGX_HOST//./\\.}\b" "$f" 2>/dev/null; then
    MATCH_CONF="$f"
    if grep -qE 'ssl_certificate[[:space:]]+' "$f" 2>/dev/null; then
      has_cert=1
    fi
    break
  fi
done

if (( ! has_cert )); then
  err "未检测到域名 ${NGX_HOST} 的有效 HTTPS 证书，拒绝继续（订阅必须走 HTTPS）。

操作指示（任选其一完成证书后，重新执行本安装脚本）：

【方式 A · certbot 自动签发（常用）】
  1) 确认 ${NGX_HOST} 的 DNS A/AAAA 已指向本机公网 IP
  2) 安装 certbot：
       Debian/Ubuntu:  apt install -y certbot python3-certbot-nginx
       RHEL/CentOS:    dnf install -y certbot python3-certbot-nginx
  3) 若已有该域名的 Nginx server 块：
       certbot --nginx -d ${NGX_HOST}
     若还没有 server 块，可先：
       certbot certonly --nginx -d ${NGX_HOST}
       或先写好带 server_name ${NGX_HOST} 的 80/443 站点再执行 certbot --nginx -d ${NGX_HOST}
  4) 确认存在：
       /etc/letsencrypt/live/${NGX_HOST}/fullchain.pem
  5) 重新运行安装：
       bash <(curl -fsSL https://raw.githubusercontent.com/dukangalex/mihomo-full/main/install.sh)

【方式 B · 已有其它路径的证书】
  在对应域名的 Nginx server 块中配置 ssl_certificate / ssl_certificate_key 后执行：
       nginx -t && systemctl reload nginx
  再重新运行本安装脚本。

说明：本脚本不会在无证书时强行开放明文 HTTP 订阅，以避免订阅内容被中间人读取。"
fi

mkdir -p /etc/nginx/snippets
cat > "$SNIPPET_FILE" <<EOF
# Managed by mihomo-full — do not edit by hand; re-run install/generate to refresh paths.
${BEGIN_MARK}
location = ${FULL_PATH} {
    alias ${INSTALL_DIR}/output/full-config.yaml;
    default_type application/octet-stream;
    add_header Cache-Control "no-cache";
    add_header Content-Disposition "inline";
}
location = ${NODES_PATH} {
    alias ${INSTALL_DIR}/output/exit-nodes.yaml;
    default_type application/octet-stream;
    add_header Cache-Control "no-cache";
    add_header Content-Disposition "inline";
}
location /assets/ {
    return 404;
}
${END_MARK}
EOF
chmod 644 "$SNIPPET_FILE"
info "已写入 Nginx 片段：$SNIPPET_FILE"

if [[ -z "$MATCH_CONF" ]]; then
  err "已写入片段，但未找到 server_name 含 ${NGX_HOST} 的 Nginx 站点配置。

操作指示：
  1) 编辑站点配置（常见路径）：
       /etc/nginx/sites-available/default
       /etc/nginx/sites-enabled/
       /etc/nginx/conf.d/
  2) 在域名 ${NGX_HOST} 的 HTTPS server { ... } 内加入一行：
       include ${SNIPPET_FILE};
  3) 测试并重载：
       nginx -t && systemctl reload nginx
  4) 若站点文件已存在只是未匹配到，检查 server_name 是否恰好为 ${NGX_HOST}
  5) 完成后客户端导入：
       https://${DOMAIN}${FULL_PATH}

说明：文件与订阅内容已生成；只需补上 include 并 reload 即可使用。"
fi

if grep -Fq "$SNIPPET_FILE" "$MATCH_CONF" 2>/dev/null; then
  info "站点配置已包含 mihomo-full 片段引用：$MATCH_CONF"
else
  BACKUP_NGX="${MATCH_CONF}.mihomo-full.bak.$(date +%Y%m%d%H%M%S)"
  cp -a -- "$MATCH_CONF" "$BACKUP_NGX"
  info "已备份 Nginx 配置：$BACKUP_NGX"
  TMP_NGX="$(mktemp)"
  HOST_RE="${NGX_HOST//./\\.}"
  awk -v hostre="$HOST_RE" -v incl="$INCLUDE_LINE" '
    BEGIN { done=0 }
    {
      print
      if (!done && $0 ~ ("server_name[[:space:]]+[^;]*" hostre)) {
        print "    " incl
        done=1
      }
    }
    END { if (!done) exit 2 }
  ' "$MATCH_CONF" > "$TMP_NGX" || {
    rm -f "$TMP_NGX"
    err "无法在 $MATCH_CONF 中自动插入 include。请手动在该域名的 server 块内加入：
    include ${SNIPPET_FILE};
然后执行：nginx -t && systemctl reload nginx"
  }
  mv -- "$TMP_NGX" "$MATCH_CONF"
  info "已在 $MATCH_CONF 插入：include ${SNIPPET_FILE};"
fi

if ! nginx -t 2>/tmp/mihomo-full-nginx-test.err; then
  echo "----- nginx -t 输出 -----" >&2
  cat /tmp/mihomo-full-nginx-test.err >&2 || true
  err "nginx -t 失败，已保留片段与备份，未执行 reload。

操作指示：
  1) 查看上方错误信息
  2) 必要时用备份恢复：ls /etc/nginx/**/*.mihomo-full.bak.* 2>/dev/null
  3) 修好配置后：nginx -t && systemctl reload nginx
  4) 客户端地址：https://${DOMAIN}${FULL_PATH}"
fi

if systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null; then
  info "Nginx 已重载，固定订阅路径已生效"
else
  warn "无法自动 reload Nginx，请手动执行：systemctl reload nginx"
fi

title "完成"
echo -e "客户端导入：${GREEN}https://${DOMAIN}${FULL_PATH}${NC}"
echo "管理入口：mff"
echo "兼容入口：mihomo-full"
echo "安全卸载：${INSTALL_DIR}/uninstall.sh"
echo "TG Bot：已部署代码但默认不启用；运行 telegram-bot/install-telegram-bot.sh 后按提示设置"
info "全部完成"
