#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SETTINGS="$SCRIPT_DIR/settings.conf"
GENERATE="$SCRIPT_DIR/generate.sh"
RULES="$SCRIPT_DIR/rulesets.local.conf"
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
err(){ echo -e "$RED[✗]$NC $1"; exit 1; }
info(){ echo -e "$GREEN[+]$NC $1"; }
[[ $EUID -eq 0 ]] || err "请使用 root 运行"
[[ -f "$SETTINGS" ]] || err "找不到 settings.conf"
[[ -x "$GENERATE" ]] || err "找不到 generate.sh"
[[ -f "$RULES" ]] || printf '%s\n' '# provider|url|behavior|target|enabled' > "$RULES"
chmod 600 "$RULES"
mask(){ local u="$1" n; n=$(printf '%s' "$u"|wc -c); (( n > 28 )) && printf '%s...%s' "$(printf '%s' "$u"|cut -c1-18)" "$(printf '%s' "$u"|tail -c 8)" || printf '%s' "$u"; }
airport_internal(){
 local old new esc tmp
 old="$(sed -n 's/^AIRPORT_SUB_URL="\(.*\)"$/\1/p' "$SETTINGS"|head -n1)"
 if command -v whiptail >/dev/null; then new="$(whiptail --title "Mihomo-Full · 更换机场" --inputbox "请输入新的机场订阅链接：\n\n当前：$(mask "$old")" 12 78 "$old" 3>&1 1>&2 2>&3)"||return 0; else read -r -p "新的机场订阅链接： " new; fi
 [[ "$new" =~ ^https://[^[:space:]\"|]+$ ]]||err "订阅地址必须是 HTTPS URL"
 esc="$(printf '%s' "$new"|sed 's/[&|\\]/\\&/g')"; tmp="$SETTINGS.tmp"
 sed "s|^AIRPORT_SUB_URL=.*$|AIRPORT_SUB_URL=\"$esc\"|" "$SETTINGS" > "$tmp"; chmod 600 "$tmp"; mv "$tmp" "$SETTINGS"
 bash "$GENERATE"; info "机场已更新"
}
list_rules(){ echo "规则集本地覆盖："; grep -vE '^[[:space:]]*(#|$)' "$RULES" || echo "（无覆盖）"; }
add_rule(){
 local name url behavior target
 read -r -p "规则集名称： " name; read -r -p "HTTPS MRS 地址： " url
 read -r -p "类型 [domain/ipcidr]（默认 domain）： " behavior; [[ -n "$behavior" ]] || behavior=domain
 read -r -p "命中策略组（默认 国外服务）： " target; [[ -n "$target" ]] || target="国外服务"
 [[ "$name" =~ ^[A-Za-z0-9_-]+$ ]]||err "名称不合法"; [[ "$url" =~ ^https://[^[:space:]\"|]+$ ]]||err "只允许 HTTPS"; [[ "$behavior" == domain || "$behavior" == ipcidr ]]||err "类型错误"
 sed -i "/^$name|/d" "$RULES"; printf '%s|%s|%s|%s|1\n' "$name" "$url" "$behavior" "$target" >> "$RULES"
 bash "$GENERATE"; info "已增加/替换：$name"
}
disable_rule(){
 local name; read -r -p "要禁用的规则集名称： " name; [[ "$name" =~ ^[A-Za-z0-9_-]+$ ]]||err "名称不合法"
 sed -i "/^$name|/d" "$RULES"; printf '%s|https://disabled.invalid/disabled|domain|国外服务|0\n' "$name" >> "$RULES"
 bash "$GENERATE"; info "已禁用：$name"
}
restore_rule(){ local name; read -r -p "恢复哪个规则集： " name; sed -i "/^$name|/d" "$RULES"; bash "$GENERATE"; info "已恢复模板默认：$name"; }
rules_menu(){
 local c
 if command -v whiptail >/dev/null; then
  c="$(whiptail --title "Mihomo-Full · 规则集管理" --menu "规则源失效时使用" 16 78 5 "1" "查看当前覆盖" "2" "增加/替换规则集" "3" "禁用规则集" "4" "恢复模板默认" "5" "返回" 3>&1 1>&2 2>&3)"||return 0
 else echo "1查看 2增加/替换 3禁用 4恢复 5返回"; read -r -p "选择: " c; fi
 case "$c" in 1) list_rules;;2) add_rule;;3) disable_rule;;4) restore_rule;;5) return;;esac
}
status(){ echo "机场：$(mask "$(sed -n 's/^AIRPORT_SUB_URL="\(.*\)"$/\1/p' "$SETTINGS"|head -n1)")"; echo "规则覆盖：$RULES"; }
case "$1" in
 airport) airport_internal;; rules|ruleset) rules_menu;; update|generate) bash "$GENERATE";; status) status;;
 *) if command -v whiptail >/dev/null; then
  c="$(whiptail --title "Mihomo-Full 管理" --menu "请选择操作：" 18 78 5 "1" "更换机场订阅（自动重新生成）" "2" "更新 VPS 落地节点" "3" "规则集管理（增加/替换/禁用/恢复）" "4" "查看当前状态" "5" "退出" 3>&1 1>&2 2>&3)"||exit 0
 else echo "1)更换机场 2)更新落地 3)规则集管理 4)状态 5)退出"; read -r -p "选择: " c; fi
 case "$c" in 1) airport_internal;;2) bash "$GENERATE";;3) rules_menu;;4) status;;*) exit 0;;esac;;
esac
