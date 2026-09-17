#!/usr/bin/env bash
# 从 v2ray-agent 提取全部落地节点并生成完整 Mihomo 配置
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS_LOADER="${SCRIPT_DIR}/tools/load-settings.sh"
[[ -f "$SETTINGS_LOADER" ]] || { echo '[✗] 缺少安全配置加载器' >&2; exit 1; }
# shellcheck source=/dev/null
source "$SETTINGS_LOADER" "${SCRIPT_DIR}/settings.conf"

TEMPLATE="${SCRIPT_DIR}/template.yaml"
FULL_CONFIG="${OUTPUT_DIR}/full-config.yaml"
RULES_LOCAL="${SCRIPT_DIR}/rulesets.local.conf"
EXIT_NODES="${OUTPUT_DIR}/exit-nodes.yaml"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

command -v sed >/dev/null || err "需要 sed"
command -v grep >/dev/null || err "需要 grep"
command -v find >/dev/null || err "需要 find"
command -v awk >/dev/null || err "需要 awk"
command -v python3 >/dev/null || err "需要 python3"

[[ -f "$TEMPLATE" ]] || err "找不到模板: $TEMPLATE"
case "${AIRPORT_SUB_URL:-}" in ""|"REPLACE_WITH_YOUR_AIRPORT_SUBSCRIPTION_URL"|"这里填入你的机场订阅链接") err "请先设置机场订阅链接";; esac
case "${DOMAIN:-}" in ""|"example.com"|"你的域名.com") err "请先设置真实 DOMAIN";; esac
[[ "$AIRPORT_SUB_URL" != *$'\n'* && "$AIRPORT_SUB_URL" != *$'\r'* ]] || err "机场订阅 URL 不能包含换行"
[[ "$DOMAIN" != *$'\n'* && "$DOMAIN" != *$'\r'* ]] || err "域名不能包含换行"
[[ "$AIRPORT_SUB_URL" =~ ^https://[^[:space:]\"]+$ ]] || err "机场订阅 URL 必须是 HTTPS URL，且不能包含空格或双引号"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || err "DOMAIN 格式不正确"
[[ "$FIXED_FULL_CONFIG_PATH" =~ ^/assets/[a-z]+(-[a-z]+){7,15}$ ]] || err "完整订阅路径格式非法"
[[ "$FIXED_EXIT_NODES_PATH" =~ ^/assets/[a-z]+(-[a-z]+){7,15}$ ]] || err "落地节点路径格式非法"

mkdir -p "$OUTPUT_DIR"
TMP_NODES=$(mktemp); trap 'rm -f "$TMP_NODES"' EXIT
log "提取 v2ray-agent 落地节点（不按协议类型排除节点）..."
if [[ -d "$V2RAY_AGENT_CLASHMETA_DIR" ]]; then
  find "$V2RAY_AGENT_CLASHMETA_DIR" -type f -print0 2>/dev/null | while IFS= read -r -d '' f; do [[ -s "$f" ]] && cat "$f" >> "$TMP_NODES"; done
else
  err "未找到目录 $V2RAY_AGENT_CLASHMETA_DIR。\n\n请先完成 v2ray-agent 节点配置：\n  1) 在 VPS 上运行 v2ray-agent 菜单（常见为 vasma），添加至少一种入站/协议\n  2) 确认已生成 clashMeta 订阅文件：\n       ls -la $V2RAY_AGENT_CLASHMETA_DIR\n  3) 确认目录里有文件后，重新执行本脚本或重新运行一键安装\n\n不要在没有落地节点的情况下继续，否则生成的订阅会没有可用节点。"
fi
{
  echo "# auto-generated $(date '+%Y-%m-%d %H:%M:%S')"
  echo "proxies:"
  if [[ -s "$TMP_NODES" ]]; then
    awk '
      BEGIN { block="" }
      {
        line=$0
        if (tolower(line) ~ /^  - name:[[:space:]]*/) {
          if (block != "") print block
          block=line
          next
        }
        if (block != "") block=block "\n" line
      }
      END { if (block != "") print block }
    ' "$TMP_NODES"
  fi
} > "$EXIT_NODES"
NODE_COUNT=$(grep -cE "^  - [Nn][Aa][Mm][Ee]:" "$EXIT_NODES" 2>/dev/null || true); NODE_COUNT=${NODE_COUNT:-0}
if (( NODE_COUNT == 0 )); then
  err "从 $V2RAY_AGENT_CLASHMETA_DIR 提取到 0 个落地节点，拒绝生成配置。\n\n请先完成 v2ray-agent 节点配置：\n  1) 在 VPS 上运行 v2ray-agent 菜单（常见为 vasma），添加至少一种入站/协议\n  2) 确认目录内容非空：\n       ls -la $V2RAY_AGENT_CLASHMETA_DIR\n  3) 确认能看到节点后，重新执行本脚本或重新运行一键安装\n\n不要在零落地节点的情况下继续，否则生成的订阅导入后策略组里不会有任何可用节点。"
fi
log "落地节点数量: $NODE_COUNT（未按协议类型排除）"

log "生成完整配置..."
FULL_URL="https://${DOMAIN}${FIXED_FULL_CONFIG_PATH}"
EXIT_URL="https://${DOMAIN}${FIXED_EXIT_NODES_PATH}"
AIRPORT_PROXY_URL="https://${DOMAIN}${FIXED_FULL_CONFIG_PATH}/source"
cp "$TEMPLATE" "$FULL_CONFIG"

replace_literal() {
  local file="$1" needle="$2" value="$3" tmp
  [[ -f "$file" ]] || err "文件不存在: $file"
  tmp="${file}.tmp"
  NEEDLE="$needle" VALUE="$value" python3 - "$file" "$tmp" <<'PY'
import os, sys
from pathlib import Path
src, dst = map(Path, sys.argv[1:])
s = src.read_text(encoding='utf-8')
needle = os.environ['NEEDLE']
value = os.environ['VALUE']
if needle not in s:
    raise SystemExit(f'placeholder not found: {needle}')
dst.write_text(s.replace(needle, value), encoding='utf-8')
PY
  mv "$tmp" "$file"
}
replace_literal "$FULL_CONFIG" '__AIRPORT_SUB_URL__' "$AIRPORT_PROXY_URL"
replace_literal "$FULL_CONFIG" '__EXIT_NODES_URL__' "$EXIT_URL"

# The real airport URL is a server-side secret. It must never enter the public
# full-config.yaml. The public client sees only the opaque local /source path.
if grep -Fq "$AIRPORT_SUB_URL" "$FULL_CONFIG"; then
  err "真实机场订阅 URL 意外进入公网 full-config.yaml，拒绝发布"
fi
if ! grep -Fq "url: \"$AIRPORT_PROXY_URL\"" "$FULL_CONFIG"; then
  err "公网 full-config.yaml 未指向服务端机场订阅代理"
fi

apply_ruleset_overrides() {
  local f="$RULES_LOCAL" name url behavior target enabled esc tmp anchor
  [[ -f "$f" ]] || return 0
  while IFS='|' read -r name url behavior target enabled; do
    [[ -z "$name" || "$name" == \#* ]] && continue
    [[ "$name" =~ ^[A-Za-z0-9_-]+$ ]] || { warn "忽略非法规则集名称: $name"; continue; }
    case "$name" in
      cn|cn-ip|private-ip|geolocation-cn|geolocation-!cn|category-ads-all|sukka-phishing)
        warn "拒绝修改核心安全规则集: $name"; continue;;
    esac
    [[ "$enabled" == 0 || "$enabled" == 1 ]] || { warn "忽略 $name：enabled 必须 0/1"; continue; }
    if [[ "$enabled" == 1 ]]; then
      [[ "$url" =~ ^https://[^[:space:]\"|]+$ ]] || { warn "忽略 $name：URL 必须 HTTPS"; continue; }
      [[ "$behavior" == domain || "$behavior" == ipcidr ]] || { warn "忽略 $name：类型必须 domain/ipcidr"; continue; }
      [[ -n "$target" && "$target" != *$'\n'* && "$target" != *$'\r'* && "$target" != *'|'* && "$target" != *,* ]] || { warn "忽略 $name：策略组名称非法"; continue; }
      esc=$(printf '%s' "$url" | sed 's/[&|\\]/\\&/g')
      if grep -qE "^  [\"']?$name[\"']?:$" "$FULL_CONFIG"; then
        sed -i -E "/^  [\"']?$name[\"']?:$/,/^  [^[:space:]#].*:$/ { s|^    url:.*$|    url: \"$esc\"|; }" "$FULL_CONFIG"
      else
        [[ "$behavior" == domain ]] && anchor="DA" || anchor="IA"
        tmp="$FULL_CONFIG.tmp"
        YAML_URL=$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1], ensure_ascii=False))' "$url")
        awk -v n="$name" -v u="$YAML_URL" -v a="$anchor" '/^rule-providers:/{print;printf "\n  %s:\n    <<: *%s\n    url: %s\n    path: \"./ruleset/%s.mrs\"\n",n,a,u,n;next}{print}' "$FULL_CONFIG" > "$tmp" && mv "$tmp" "$FULL_CONFIG"
        tmp="$FULL_CONFIG.tmp"
        awk -v n="$name" -v t="$target" '/^rules:/{print;printf "\n  - RULE-SET,%s,%s\n",n,t;next}{print}' "$FULL_CONFIG" > "$tmp" && mv "$tmp" "$FULL_CONFIG"
      fi
    else
      sed -i -E "s|^([[:space:]]*- RULE-SET,$name,)|# [disabled] \1|" "$FULL_CONFIG"
    fi
  done < "$f"
}
apply_ruleset_overrides

grep -q '^  - name: "🛑 广告拦截"$' "$FULL_CONFIG" || err "生成配置缺少广告拦截策略组"
grep -q 'proxies: \["REJECT-DROP","REJECT", "DIRECT"\]' "$FULL_CONFIG" || err "广告拦截策略组缺少 DIRECT 例外"
grep -q 'RULE-SET,category-ads-all,🛑 广告拦截' "$FULL_CONFIG" || err "广告规则未指向广告拦截策略组"
grep -q 'RULE-SET,sukka-phishing,REJECT-DROP' "$FULL_CONFIG" || err "钓鱼规则被意外修改"
if grep -qE '^[[:space:]]*exclude-type:[[:space:]]*vmess[[:space:]]*$' "$FULL_CONFIG"; then err "生成配置仍存在 VMess 协议排除"; fi

if [[ -f "$SCRIPT_DIR/tools/audit-generated-config.sh" ]]; then
  bash "$SCRIPT_DIR/tools/audit-generated-config.sh" "$FULL_CONFIG" || err "最终配置审计失败，拒绝发布配置"
fi

# Existing installations have an Nginx snippet already included by install.sh.
# Refresh it atomically after every generation so changing AIRPORT_SUB_URL via
# Telegram also updates the server-side upstream without exposing the URL.
NGINX_SNIPPET_FILE="/etc/nginx/snippets/mihomo-full-assets.conf"
if [[ "$SCRIPT_DIR" == "/opt/mihomo-full" && -f "$NGINX_SNIPPET_FILE" ]]; then
  CA_BUNDLE="/etc/ssl/certs/ca-certificates.crt"
  [[ -f "$CA_BUNDLE" ]] || err "找不到系统 CA bundle，拒绝启用机场 HTTPS 上游代理"
  NGINX_TMP="${NGINX_SNIPPET_FILE}.tmp"
  AIRPORT_UPSTREAM="$AIRPORT_SUB_URL" CA_BUNDLE="$CA_BUNDLE" FULL_PATH="$FIXED_FULL_CONFIG_PATH" EXIT_PATH="$FIXED_EXIT_NODES_PATH" INSTALL_DIR="$SCRIPT_DIR" python3 - "$NGINX_TMP" <<'PY'
import os, sys
from pathlib import Path

def q(v):
    return v.replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$')

a=os.environ['AIRPORT_UPSTREAM']
out=f'''# Managed by mihomo-full
# BEGIN mihomo-full managed assets
location = {os.environ['FULL_PATH']} {{
    alias {os.environ['INSTALL_DIR']}/output/full-config.yaml;
    default_type application/octet-stream;
    add_header Cache-Control "no-cache";
    add_header Content-Disposition "inline";
}}
location = {os.environ['EXIT_PATH']} {{
    alias {os.environ['INSTALL_DIR']}/output/exit-nodes.yaml;
    default_type application/octet-stream;
    add_header Cache-Control "no-cache";
    add_header Content-Disposition "inline";
}}
location = {os.environ['FULL_PATH']}/source {{
    proxy_pass "{q(a)}";
    proxy_ssl_server_name on;
    proxy_ssl_verify on;
    proxy_ssl_verify_depth 2;
    proxy_ssl_trusted_certificate {os.environ['CA_BUNDLE']};
    proxy_ssl_protocols TLSv1.2 TLSv1.3;
    proxy_set_header Host $proxy_host;
    proxy_set_header Connection "";
    proxy_http_version 1.1;
    proxy_method GET;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_buffering off;
    add_header Cache-Control "no-store" always;
    add_header Content-Disposition "inline";
}}
location /assets/ {{
    return 404;
}}
# END mihomo-full managed assets
'''
Path(sys.argv[1]).write_text(out, encoding='utf-8')
os.chmod(sys.argv[1], 0o600)
PY
  mv -- "$NGINX_TMP" "$NGINX_SNIPPET_FILE"
  if command -v nginx >/dev/null 2>&1 && ! nginx -t 2>/tmp/mihomo-full-nginx-test.err; then
    cat /tmp/mihomo-full-nginx-test.err >&2 || true
    err "Nginx 配置测试失败，拒绝发布新的机场代理上游"
  fi
fi

chmod 644 "$FULL_CONFIG" "$EXIT_NODES" 2>/dev/null || true
echo
echo "完整配置 : $FULL_CONFIG"
echo "落地节点 : $EXIT_NODES ($NODE_COUNT)"
echo "客户端导入: $FULL_URL"
echo "更新落地 : $SCRIPT_DIR/generate.sh"
