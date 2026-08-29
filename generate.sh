#!/usr/bin/env bash
# 从 v2ray-agent 提取落地节点并生成完整 Mihomo 配置
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/settings.conf"

TEMPLATE="${SCRIPT_DIR}/template.yaml"
FULL_CONFIG="${OUTPUT_DIR}/full-config.yaml"
EXIT_NODES="${OUTPUT_DIR}/exit-nodes.yaml"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

command -v sed >/dev/null || err "需要 sed"
command -v grep >/dev/null || err "需要 grep"
command -v find >/dev/null || err "需要 find"

[[ -f "$TEMPLATE" ]] || err "找不到模板: $TEMPLATE"

# Block public-template placeholders (never generate with sample values)
case "${AIRPORT_SUB_URL:-}" in
  ""|"REPLACE_WITH_YOUR_AIRPORT_SUBSCRIPTION_URL"|"这里填入你的机场订阅链接")
    err "请先在 settings.conf 填写真实的 AIRPORT_SUB_URL（勿提交回公开仓库）"
    ;;
esac
case "${DOMAIN:-}" in
  ""|"example.com"|"你的域名.com")
    err "请先在 settings.conf 填写真实的 DOMAIN（勿提交回公开仓库）"
    ;;
esac

[[ "$AIRPORT_SUB_URL" != *
TMP_NODES=$(mktemp)
trap 'rm -f "$TMP_NODES"' EXIT

log "提取 v2ray-agent 落地节点..."
if [[ -d "$V2RAY_AGENT_CLASHMETA_DIR" ]]; then
    find "$V2RAY_AGENT_CLASHMETA_DIR" -type f 2>/dev/null | while read -r f; do
        [[ -s "$f" ]] && cat "$f" >> "$TMP_NODES" || true
    done
else
    warn "未找到目录 $V2RAY_AGENT_CLASHMETA_DIR（请先用 vasma 添加协议）"
fi

{
    echo "# auto-generated $(date '+%Y-%m-%d %H:%M:%S')"
    echo "proxies:"
    if [[ -s "$TMP_NODES" ]]; then
        awk '
            BEGIN { skip=0; block="" }
            /^  - name:/ {
                if (block != "" && skip==0) print block
                block = $0; skip = 0; next
            }
            /type:[[:space:]]*vmess/ { skip=1 }
            { block = block "\n" $0 }
            END { if (block != "" && skip==0) print block }
        ' "$TMP_NODES"
    fi
} > "$EXIT_NODES"

NODE_COUNT=$(grep -c "^  - name:" "$EXIT_NODES" 2>/dev/null || echo 0)
log "落地节点数量: $NODE_COUNT（已排除 VMess）"

log "生成完整配置..."
FULL_URL="https://${DOMAIN}${FIXED_FULL_CONFIG_PATH}"
EXIT_URL="https://${DOMAIN}${FIXED_EXIT_NODES_PATH}"
cp "$TEMPLATE" "$FULL_CONFIG"
sed -i "s|__AIRPORT_SUB_URL__|${AIRPORT_SUB_URL//&/\\&}|g" "$FULL_CONFIG"
sed -i "s|__EXIT_NODES_URL__|${EXIT_URL//&/\\&}|g" "$FULL_CONFIG"
chmod 644 "$FULL_CONFIG" "$EXIT_NODES" 2>/dev/null || true

echo
echo "完整配置 : $FULL_CONFIG"
echo "落地节点 : $EXIT_NODES ($NODE_COUNT)"
echo "客户端导入: $FULL_URL"
echo "更新落地  : $SCRIPT_DIR/generate.sh"
\n'* && "$AIRPORT_SUB_URL" != *
TMP_NODES=$(mktemp)
trap 'rm -f "$TMP_NODES"' EXIT

log "提取 v2ray-agent 落地节点..."
if [[ -d "$V2RAY_AGENT_CLASHMETA_DIR" ]]; then
    find "$V2RAY_AGENT_CLASHMETA_DIR" -type f 2>/dev/null | while read -r f; do
        [[ -s "$f" ]] && cat "$f" >> "$TMP_NODES" || true
    done
else
    warn "未找到目录 $V2RAY_AGENT_CLASHMETA_DIR（请先用 vasma 添加协议）"
fi

{
    echo "# auto-generated $(date '+%Y-%m-%d %H:%M:%S')"
    echo "proxies:"
    if [[ -s "$TMP_NODES" ]]; then
        awk '
            BEGIN { skip=0; block="" }
            /^  - name:/ {
                if (block != "" && skip==0) print block
                block = $0; skip = 0; next
            }
            /type:[[:space:]]*vmess/ { skip=1 }
            { block = block "\n" $0 }
            END { if (block != "" && skip==0) print block }
        ' "$TMP_NODES"
    fi
} > "$EXIT_NODES"

NODE_COUNT=$(grep -c "^  - name:" "$EXIT_NODES" 2>/dev/null || echo 0)
log "落地节点数量: $NODE_COUNT（已排除 VMess）"

log "生成完整配置..."
FULL_URL="https://${DOMAIN}${FIXED_FULL_CONFIG_PATH}"
EXIT_URL="https://${DOMAIN}${FIXED_EXIT_NODES_PATH}"
cp "$TEMPLATE" "$FULL_CONFIG"
sed -i "s|__AIRPORT_SUB_URL__|${AIRPORT_SUB_URL//&/\\&}|g" "$FULL_CONFIG"
sed -i "s|__EXIT_NODES_URL__|${EXIT_URL//&/\\&}|g" "$FULL_CONFIG"
chmod 644 "$FULL_CONFIG" "$EXIT_NODES" 2>/dev/null || true

echo
echo "完整配置 : $FULL_CONFIG"
echo "落地节点 : $EXIT_NODES ($NODE_COUNT)"
echo "客户端导入: $FULL_URL"
echo "更新落地  : $SCRIPT_DIR/generate.sh"
\r'* ]] || err "机场订阅 URL 不能包含换行"
[[ "$DOMAIN" != *
TMP_NODES=$(mktemp)
trap 'rm -f "$TMP_NODES"' EXIT

log "提取 v2ray-agent 落地节点..."
if [[ -d "$V2RAY_AGENT_CLASHMETA_DIR" ]]; then
    find "$V2RAY_AGENT_CLASHMETA_DIR" -type f 2>/dev/null | while read -r f; do
        [[ -s "$f" ]] && cat "$f" >> "$TMP_NODES" || true
    done
else
    warn "未找到目录 $V2RAY_AGENT_CLASHMETA_DIR（请先用 vasma 添加协议）"
fi

{
    echo "# auto-generated $(date '+%Y-%m-%d %H:%M:%S')"
    echo "proxies:"
    if [[ -s "$TMP_NODES" ]]; then
        awk '
            BEGIN { skip=0; block="" }
            /^  - name:/ {
                if (block != "" && skip==0) print block
                block = $0; skip = 0; next
            }
            /type:[[:space:]]*vmess/ { skip=1 }
            { block = block "\n" $0 }
            END { if (block != "" && skip==0) print block }
        ' "$TMP_NODES"
    fi
} > "$EXIT_NODES"

NODE_COUNT=$(grep -c "^  - name:" "$EXIT_NODES" 2>/dev/null || echo 0)
log "落地节点数量: $NODE_COUNT（已排除 VMess）"

log "生成完整配置..."
FULL_URL="https://${DOMAIN}${FIXED_FULL_CONFIG_PATH}"
EXIT_URL="https://${DOMAIN}${FIXED_EXIT_NODES_PATH}"
cp "$TEMPLATE" "$FULL_CONFIG"
sed -i "s|__AIRPORT_SUB_URL__|${AIRPORT_SUB_URL//&/\\&}|g" "$FULL_CONFIG"
sed -i "s|__EXIT_NODES_URL__|${EXIT_URL//&/\\&}|g" "$FULL_CONFIG"
chmod 644 "$FULL_CONFIG" "$EXIT_NODES" 2>/dev/null || true

echo
echo "完整配置 : $FULL_CONFIG"
echo "落地节点 : $EXIT_NODES ($NODE_COUNT)"
echo "客户端导入: $FULL_URL"
echo "更新落地  : $SCRIPT_DIR/generate.sh"
\n'* && "$DOMAIN" != *
TMP_NODES=$(mktemp)
trap 'rm -f "$TMP_NODES"' EXIT

log "提取 v2ray-agent 落地节点..."
if [[ -d "$V2RAY_AGENT_CLASHMETA_DIR" ]]; then
    find "$V2RAY_AGENT_CLASHMETA_DIR" -type f 2>/dev/null | while read -r f; do
        [[ -s "$f" ]] && cat "$f" >> "$TMP_NODES" || true
    done
else
    warn "未找到目录 $V2RAY_AGENT_CLASHMETA_DIR（请先用 vasma 添加协议）"
fi

{
    echo "# auto-generated $(date '+%Y-%m-%d %H:%M:%S')"
    echo "proxies:"
    if [[ -s "$TMP_NODES" ]]; then
        awk '
            BEGIN { skip=0; block="" }
            /^  - name:/ {
                if (block != "" && skip==0) print block
                block = $0; skip = 0; next
            }
            /type:[[:space:]]*vmess/ { skip=1 }
            { block = block "\n" $0 }
            END { if (block != "" && skip==0) print block }
        ' "$TMP_NODES"
    fi
} > "$EXIT_NODES"

NODE_COUNT=$(grep -c "^  - name:" "$EXIT_NODES" 2>/dev/null || echo 0)
log "落地节点数量: $NODE_COUNT（已排除 VMess）"

log "生成完整配置..."
FULL_URL="https://${DOMAIN}${FIXED_FULL_CONFIG_PATH}"
EXIT_URL="https://${DOMAIN}${FIXED_EXIT_NODES_PATH}"
cp "$TEMPLATE" "$FULL_CONFIG"
sed -i "s|__AIRPORT_SUB_URL__|${AIRPORT_SUB_URL//&/\\&}|g" "$FULL_CONFIG"
sed -i "s|__EXIT_NODES_URL__|${EXIT_URL//&/\\&}|g" "$FULL_CONFIG"
chmod 644 "$FULL_CONFIG" "$EXIT_NODES" 2>/dev/null || true

echo
echo "完整配置 : $FULL_CONFIG"
echo "落地节点 : $EXIT_NODES ($NODE_COUNT)"
echo "客户端导入: $FULL_URL"
echo "更新落地  : $SCRIPT_DIR/generate.sh"
\r'* ]] || err "域名不能包含换行"
mkdir -p "$OUTPUT_DIR"
TMP_NODES=$(mktemp)
trap 'rm -f "$TMP_NODES"' EXIT

log "提取 v2ray-agent 落地节点..."
if [[ -d "$V2RAY_AGENT_CLASHMETA_DIR" ]]; then
    find "$V2RAY_AGENT_CLASHMETA_DIR" -type f 2>/dev/null | while read -r f; do
        [[ -s "$f" ]] && cat "$f" >> "$TMP_NODES" || true
    done
else
    warn "未找到目录 $V2RAY_AGENT_CLASHMETA_DIR（请先用 vasma 添加协议）"
fi

{
    echo "# auto-generated $(date '+%Y-%m-%d %H:%M:%S')"
    echo "proxies:"
    if [[ -s "$TMP_NODES" ]]; then
        awk '
            BEGIN { skip=0; block="" }
            /^  - name:/ {
                if (block != "" && skip==0) print block
                block = $0; skip = 0; next
            }
            /type:[[:space:]]*vmess/ { skip=1 }
            { block = block "\n" $0 }
            END { if (block != "" && skip==0) print block }
        ' "$TMP_NODES"
    fi
} > "$EXIT_NODES"

NODE_COUNT=$(grep -c "^  - name:" "$EXIT_NODES" 2>/dev/null || echo 0)
log "落地节点数量: $NODE_COUNT（已排除 VMess）"

log "生成完整配置..."
FULL_URL="https://${DOMAIN}${FIXED_FULL_CONFIG_PATH}"
EXIT_URL="https://${DOMAIN}${FIXED_EXIT_NODES_PATH}"
cp "$TEMPLATE" "$FULL_CONFIG"
sed -i "s|__AIRPORT_SUB_URL__|${AIRPORT_SUB_URL//&/\\&}|g" "$FULL_CONFIG"
sed -i "s|__EXIT_NODES_URL__|${EXIT_URL//&/\\&}|g" "$FULL_CONFIG"
chmod 644 "$FULL_CONFIG" "$EXIT_NODES" 2>/dev/null || true

echo
echo "完整配置 : $FULL_CONFIG"
echo "落地节点 : $EXIT_NODES ($NODE_COUNT)"
echo "客户端导入: $FULL_URL"
echo "更新落地  : $SCRIPT_DIR/generate.sh"
