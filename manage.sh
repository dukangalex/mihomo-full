#!/usr/bin/env bash
# mihomo-full 小白管理入口
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS="${SCRIPT_DIR}/settings.conf"
GENERATE="${SCRIPT_DIR}/generate.sh"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
err(){ echo -e "${RED}[✗]${NC} $1"; exit 1; }
info(){ echo -e "${GREEN}[+]${NC} $1"; }

[[ $EUID -eq 0 ]] || err "请使用 root 运行"
[[ -f "$SETTINGS" ]] || err "找不到 $SETTINGS"
[[ -x "$GENERATE" ]] || err "找不到可执行的 generate.sh"

get_current_url() {
  sed -n 's/^AIRPORT_SUB_URL="\(.*\)"$/\1/p' "$SETTINGS" | head -n1
}

valid_url() {
  [[ "$1" =~ ^https?://[^[:space:]\"]+$ ]] &&
  [[ "$1" != *$'\n'* && "$1" != *$'\r'* ]]
}

mask_url() {
  local u="$1"
  if (( ${#u} > 28 )); then
    printf '%s...%s' "${u:0:18}" "${u: -8}"
  else
    printf '%s' "${u}"
  fi
}

change_airport() {
  local old new confirm escaped tmp
  old="$(get_current_url)"
  if command -v whiptail >/dev/null 2>&1; then
    new="$(whiptail --title "Mihomo-Full · 更换机场" --inputbox "请输入新的机场订阅链接：\n\n当前：$(mask_url "$old")" 12 78 "$old" 3>&1 1>&2 2>&3)" || return 0
  elif command -v dialog >/dev/null 2>&1; then
    new="$(dialog --title "Mihomo-Full · 更换机场" --inputbox "请输入新的机场订阅链接：\n\n当前：$(mask_url "$old")" 12 78 "$old" 3>&1 1>&2 2>&3)" || return 0
  else
    echo
    echo "当前机场：$(mask_url "$old")"
    read -r -p "新的机场订阅链接： " new
  fi

  [[ -n "$new" ]] || { info "未修改"; return 0; }
  valid_url "$new" || err "订阅地址必须是 http:// 或 https:// URL，且不能含空格、引号或换行"

  if command -v whiptail >/dev/null 2>&1; then
    whiptail --title "确认更换" --yesno "确定把机场更换为：\n\n$(mask_url "$new")\n\n保存后会自动重新生成完整配置。" 12 78 || return 0
  elif command -v dialog >/dev/null 2>&1; then
    dialog --title "确认更换" --yesno "确定把机场更换为：\n\n$(mask_url "$new")\n\n保存后会自动重新生成完整配置。" 12 78 || return 0
  else
    read -r -p "确认更换并重新生成？(y/N): " confirm
    [[ "${confirm:-N}" =~ ^[Yy]$ ]] || { info "已取消"; return 0; }
  fi

  escaped=$(printf '%s' "$new" | sed 's/[&|\\]/\\&/g')
  tmp="${SETTINGS}.tmp"
  sed "s|^AIRPORT_SUB_URL=.*$|AIRPORT_SUB_URL="$escaped"|" "$SETTINGS" > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$SETTINGS"

  info "机场订阅已更新"
  bash "$GENERATE"
  info "完成：客户端固定订阅地址无需修改"
}

show_status() {
  echo
  echo -e "${CYAN}Mihomo-Full 状态${NC}"
  echo "-------------------------"
  echo "机场：$(mask_url "$(get_current_url)")"
  echo "配置：${SCRIPT_DIR}/output/full-config.yaml"
  echo
}

case "${1:-menu}" in
  airport|change|1) change_airport ;;
  generate|update|2) bash "$GENERATE" ;;
  status|3) show_status ;;
  *)
    if command -v whiptail >/dev/null 2>&1; then
      choice="$(whiptail --title "Mihomo-Full 管理" --menu "请选择操作：" 15 72 4         "1" "更换机场订阅（自动重新生成）"         "2" "更新 VPS 落地节点"         "3" "查看当前状态"         "4" "退出" 3>&1 1>&2 2>&3)" || exit 0
    elif command -v dialog >/dev/null 2>&1; then
      choice="$(dialog --title "Mihomo-Full 管理" --menu "请选择操作：" 15 72 4         "1" "更换机场订阅（自动重新生成）"         "2" "更新 VPS 落地节点"         "3" "查看当前状态"         "4" "退出" 3>&1 1>&2 2>&3)" || exit 0
    else
      echo "Mihomo-Full 管理"
      echo "1) 更换机场订阅（自动重新生成）"
      echo "2) 更新 VPS 落地节点"
      echo "3) 查看当前状态"
      echo "4) 退出"
      read -r -p "请选择 [1-4]: " choice
    fi
    case "$choice" in
      1) change_airport ;;
      2) bash "$GENERATE" ;;
      3) show_status ;;
      *) exit 0 ;;
    esac
    ;;
esac
