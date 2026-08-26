#!/usr/bin/env bash
# ============================================================
# Mihomo 完整配置一键生成 / 更新脚本（方案 B）
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/settings.conf"

TEMPLATE="${SCRIPT_DIR}/template.yaml"
FULL_CONFIG="${OUTPUT_DIR}/full-config.yaml"
EXIT_NODES="${OUTPUT_DIR}/exit-nodes.yaml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

command -v sed >/dev/null || err "需要 sed"
command -v grep >/dev/null || err "需要 grep"
command -v find >/dev/null || err "需要 find"

[[ -f "$TEMPLATE" ]] || err "找不到模板: $TEMPLATE"

if [[ -z "$AIRPORT_SUB_URL" || "$AIRPORT_SUB_URL" == "这里填入你的机场订阅链接" ]]; then
    err "请先编辑 settings.conf，填写 AIRPORT_SUB_URL"
fi

if [[ -z "$DOMAIN" || "$DOMAIN" == "你的域名.com" ]]; then
    err "请先编辑 settings.conf，填写 DOMAIN（你的域名）"
fi

mkdir -p "$OUTPUT_DIR"

log "提取 v2ray-agent 落地节点..."

TMP_NODES=$(mktemp)
trap 'rm -f "$TMP_NODES"' EXIT

if [[ -d "$V2RAY_AGENT_CLASHMETA_DIR" ]]; then
    find "$V2RAY_AGENT_CLASHMETA_DIR" -type f 2>/dev/null | while read -r f; do
        [[ -s "$f" ]] && cat "$f" >> "$TMP_NODES" || true
    done
else
    warn "未找到目录 $V2RAY_AGENT_CLASHMETA_DIR（请先用 vasma 添加协议）"
fi

{
    echo "# 由 generate.sh 自动生成，请勿手动编辑"
    echo "# 更新时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "proxies:"
    if [[ -s "$TMP_NODES" ]]; then
        awk '
            BEGIN { skip=0; block="" }
            /^  - name:/ {
                if (block != "" && skip==0) print block
                block = $0
                skip = 0
                next
            }
            /type:[[:space:]]*vmess/ { skip=1 }
            { block = block "\n" $0 }
            END { if (block != "" && skip==0) print block }
        ' "$TMP_NODES"
    fi
} > "$EXIT_NODES"

NODE_COUNT=$(grep -c "^  - name:" "$EXIT_NODES" 2>/dev/null || echo 0)
log "落地节点数量: $NODE_COUNT（已自动排除 VMess）"

log "生成完整配置..."

FULL_URL="https://${DOMAIN}${FIXED_FULL_CONFIG_PATH}"
EXIT_URL="https://${DOMAIN}${FIXED_EXIT_NODES_PATH}"

cp "$TEMPLATE" "$FULL_CONFIG"

sed -i "s|__AIRPORT_SUB_URL__|${AIRPORT_SUB_URL//&/\\&}|g" "$FULL_CONFIG"
sed -i "s|__EXIT_NODES_URL__|${EXIT_URL//&/\\&}|g" "$FULL_CONFIG"

chmod 644 "$FULL_CONFIG" "$EXIT_NODES" 2>/dev/null || true

log "生成完成"
echo
echo "========================================================"
echo " 完整配置文件 : $FULL_CONFIG"
echo " 落地节点文件 : $EXIT_NODES"
echo " 节点数量     : $NODE_COUNT"
echo "========================================================"
echo
echo "【客户端只需要导入这一个固定订阅】"
echo "  $FULL_URL"
echo
echo "（内部会自动拉取落地节点: $EXIT_URL）"
echo
echo "以后只更新落地节点时，重新执行："
echo "  $SCRIPT_DIR/generate.sh"
echo "========================================================"
echo
echo "Nginx 参考配置见同目录 nginx-example.conf"
echo "========================================================"
