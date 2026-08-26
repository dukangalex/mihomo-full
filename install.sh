#!/usr/bin/env bash
# ============================================================
# Mihomo 完整配置 + v2ray-agent 一键安装脚本
# 用法：bash install.sh
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }
title() { echo -e "\n${CYAN}==== $1 ====${NC}\n"; }

INSTALL_DIR="/opt/mihomo-full"
OUTPUT_DIR="${INSTALL_DIR}/output"

# 固定路径（不带后缀，看起来像普通资源）
FULL_PATH="/assets/static/a7f3c21e9b"
NODES_PATH="/assets/static/e9b2f1a7c3"

clear
echo -e "${CYAN}"
echo "  Mihomo 完整配置 + v2ray-agent 一键部署"
echo "  --------------------------------------"
echo "  · 客户端只导入一个固定订阅"
echo "  · 订阅地址不带 .yaml，不易识别"
echo "  · 一键更新仅刷新落地节点"
echo -e "${NC}"

# ---------- 检查 root ----------
[[ $EUID -eq 0 ]] || err "请使用 root 运行：sudo bash install.sh"

# ---------- 收集信息 ----------
title "1. 填写必要信息"

read -rp "请输入机场订阅链接: " AIRPORT_SUB_URL
[[ -n "$AIRPORT_SUB_URL" ]] || err "机场订阅不能为空"

read -rp "请输入你的域名（例: example.com）: " DOMAIN
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN%%/*}"
[[ -n "$DOMAIN" ]] || err "域名不能为空"

read -rp "v2ray-agent 的 clashMeta 目录 [默认 /etc/v2ray-agent/subscribe_local/clashMeta]: " V2RAY_DIR
V2RAY_DIR="${V2RAY_DIR:-/etc/v2ray-agent/subscribe_local/clashMeta}"

echo
info "机场订阅 : $AIRPORT_SUB_URL"
info "域名     : $DOMAIN"
info "节点目录 : $V2RAY_DIR"
echo
read -rp "确认无误？(Y/n): " CONFIRM
[[ "${CONFIRM:-Y}" =~ ^[Yy]$ ]] || { echo "已取消"; exit 0; }

# ---------- 创建目录与文件 ----------
title "2. 写入文件"

mkdir -p "$INSTALL_DIR" "$OUTPUT_DIR"

# settings.conf
cat > "${INSTALL_DIR}/settings.conf" <<EOF
# 由 install.sh 自动生成，可随时手动修改
AIRPORT_SUB_URL="${AIRPORT_SUB_URL}"
FIXED_FULL_CONFIG_PATH="${FULL_PATH}"
FIXED_EXIT_NODES_PATH="${NODES_PATH}"
DOMAIN="${DOMAIN}"
V2RAY_AGENT_CLASHMETA_DIR="${V2RAY_DIR}"
OUTPUT_DIR="${OUTPUT_DIR}"
EOF

# generate.sh
cat > "${INSTALL_DIR}/generate.sh" <<'GEN'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/settings.conf"

TEMPLATE="${SCRIPT_DIR}/template.yaml"
FULL_CONFIG="${OUTPUT_DIR}/full-config.yaml"
EXIT_NODES="${OUTPUT_DIR}/exit-nodes.yaml"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log(){ echo -e "${GREEN}[+]${NC} $1"; }
warn(){ echo -e "${YELLOW}[!]${NC} $1"; }
err(){ echo -e "${RED}[✗]${NC} $1"; exit 1; }

[[ -f "$TEMPLATE" ]] || err "缺少 template.yaml"
[[ -n "${AIRPORT_SUB_URL:-}" ]] || err "请先在 settings.conf 填写 AIRPORT_SUB_URL"
[[ -n "${DOMAIN:-}" ]] || err "请先在 settings.conf 填写 DOMAIN"

mkdir -p "$OUTPUT_DIR"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

log "提取落地节点..."
if [[ -d "$V2RAY_AGENT_CLASHMETA_DIR" ]]; then
  find "$V2RAY_AGENT_CLASHMETA_DIR" -type f 2>/dev/null | while read -r f; do
    [[ -s "$f" ]] && cat "$f" >> "$TMP" || true
  done
else
  warn "未找到 $V2RAY_AGENT_CLASHMETA_DIR"
fi

{
  echo "# auto-generated $(date '+%F %T')"
  echo "proxies:"
  if [[ -s "$TMP" ]]; then
    awk 'BEGIN{skip=0;b=""}
      /^  - name:/{if(b!=""&&skip==0)print b; b=$0; skip=0; next}
      /type:[[:space:]]*vmess/{skip=1}
      {b=b"\n"$0}
      END{if(b!=""&&skip==0)print b}' "$TMP"
  fi
} > "$EXIT_NODES"

COUNT=$(grep -c "^  - name:" "$EXIT_NODES" 2>/dev/null || echo 0)
log "落地节点: $COUNT 个（已排除 VMess）"

log "生成完整配置..."
EXIT_URL="https://${DOMAIN}${FIXED_EXIT_NODES_PATH}"
cp "$TEMPLATE" "$FULL_CONFIG"
sed -i "s|__AIRPORT_SUB_URL__|${AIRPORT_SUB_URL//&/\\&}|g" "$FULL_CONFIG"
sed -i "s|__EXIT_NODES_URL__|${EXIT_URL//&/\\&}|g" "$FULL_CONFIG"
chmod 644 "$FULL_CONFIG" "$EXIT_NODES" 2>/dev/null || true

echo
echo "=============================================="
echo " 完整配置 : $FULL_CONFIG"
echo " 节点文件 : $EXIT_NODES"
echo " 节点数量 : $COUNT"
echo "=============================================="
echo " 客户端只导入（固定地址）："
echo " https://${DOMAIN}${FIXED_FULL_CONFIG_PATH}"
echo "=============================================="
echo " 以后更新落地节点只需再执行："
echo " ${SCRIPT_DIR}/generate.sh"
echo "=============================================="
GEN
chmod +x "${INSTALL_DIR}/generate.sh"

# 下载 template.yaml（如果还没有）
if [[ ! -f "${INSTALL_DIR}/template.yaml" ]]; then
  info "下载 template.yaml..."
  curl -fsSL -o "${INSTALL_DIR}/template.yaml" \
    "https://raw.githubusercontent.com/dukangalex/mihomo-full/main/template.yaml" || \
    warn "请手动把 template.yaml 放到 ${INSTALL_DIR}/"
fi

info "文件已写入 ${INSTALL_DIR}"

# ---------- 生成一次 ----------
title "3. 生成配置"
if [[ -f "${INSTALL_DIR}/template.yaml" ]]; then
  bash "${INSTALL_DIR}/generate.sh"
else
  warn "缺少 template.yaml，跳过生成"
fi

# ---------- Nginx 提示 ----------
title "4. Nginx 配置（必须）"

cat <<EOF
请把以下内容加入你的 Nginx server 块，然后执行 nginx -t && systemctl reload nginx：

location = ${FULL_PATH} {
    alias ${OUTPUT_DIR}/full-config.yaml;
    default_type application/octet-stream;
    add_header Cache-Control "no-cache";
}

location = ${NODES_PATH} {
    alias ${OUTPUT_DIR}/exit-nodes.yaml;
    default_type application/octet-stream;
    add_header Cache-Control "no-cache";
}

location /assets/static/ {
    return 404;
}

EOF

if command -v nginx >/dev/null 2>&1; then
  info "检测到 Nginx 已安装"
  echo "配置改好后执行：nginx -t && systemctl reload nginx"
else
  warn "未检测到 Nginx，请自行配置 Web 服务器"
fi

title "完成"
echo -e "客户端导入这个固定地址即可："
echo -e "${GREEN}https://${DOMAIN}${FULL_PATH}${NC}"
echo
echo "常用命令："
echo "  更新落地节点：  ${INSTALL_DIR}/generate.sh"
echo "  修改机场订阅：  nano ${INSTALL_DIR}/settings.conf 然后重新 generate"
echo
info "全部完成"
