#!/usr/bin/env bash
# mihomo-full 管理入口（CLI + Telegram 非交互调用共用同一套管理逻辑）
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SETTINGS="$SCRIPT_DIR/settings.conf"; GENERATE="$SCRIPT_DIR/generate.sh"; RULES="$SCRIPT_DIR/rulesets.local.conf"; UNINSTALL="$SCRIPT_DIR/uninstall.sh"; SETTINGS_LOADER="$SCRIPT_DIR/tools/load-settings.sh"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
err(){ echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }; info(){ echo -e "${GREEN}[+]${NC} $1"; }; warn(){ echo -e "${YELLOW}[!]${NC} $1"; }
[[ $EUID -eq 0 ]] || err "请使用 root 运行"; [[ -f "$SETTINGS" ]] || err "找不到 $SETTINGS"; [[ -f "$SETTINGS_LOADER" ]] || err "缺少安全配置加载器"; [[ -x "$GENERATE" ]] || err "找不到可执行的 generate.sh"; [[ -f "$RULES" ]] || { printf '%s\n' '# provider|https_mrs_url|behavior|target|enabled' > "$RULES"; chmod 600 "$RULES"; }
# shellcheck source=/dev/null
source "$SETTINGS_LOADER" "$SETTINGS"
get_current_url(){ printf '%s\n' "$AIRPORT_SUB_URL"; }
valid_url(){ [[ "$1" =~ ^https://[^[:space:]\"]+$ ]] && [[ "$1" != *$'\n'* && "$1" != *$'\r'* ]]; }
mask_url(){ local u="$1"; if (( ${#u} > 28 )); then printf '%s...%s' "${u:0:18}" "${u: -8}"; else printf '%s' "$u"; fi; }
core_rule(){ case "$1" in cn|cn-ip|private-ip|geolocation-cn|geolocation-!cn|category-ads-all|sukka-phishing) return 0;; *) return 1;; esac; }
set_airport_url(){ local new="$1"; valid_url "$new" || err "订阅地址必须是 HTTPS URL，且不能含空格、引号或换行"; NEW_URL="$new" SETTINGS_FILE="$SETTINGS" python3 - <<'PY'
import os, re
from pathlib import Path
p=Path(os.environ['SETTINGS_FILE']); new=os.environ['NEW_URL']
lines=p.read_text(encoding='utf-8').splitlines()
out=[]; found=False
for line in lines:
    if re.match(r'^AIRPORT_SUB_URL=', line):
        out.append('AIRPORT_SUB_URL=' + repr(new)); found=True
    else: out.append(line)
if not found: out.append('AIRPORT_SUB_URL=' + repr(new))
t=p.with_suffix(p.suffix+'.tmp'); t.write_text('\n'.join(out)+'\n', encoding='utf-8'); os.chmod(t,0o600); t.replace(p)
PY
}
noninteractive(){ local action="${1:-}"; shift || true; case "$action" in
  --set-airport) [[ $# -eq 1 ]] || err "--set-airport 需要一个 URL"; set_airport_url "$1"; bash "$GENERATE";;
  --rules-list) grep -vE '^[[:space:]]*(#|$)' "$RULES" || true;;
  --rule-add) [[ $# -eq 4 ]] || err "--rule-add NAME URL BEHAVIOR TARGET"; local n="$1" u="$2" b="$3" t="$4"; core_rule "$n" && err "核心安全规则禁止覆盖：$n"; [[ "$n" =~ ^[A-Za-z0-9_-]+$ ]] || err "规则集名称不合法"; [[ "$u" =~ ^https://[^[:space:]\"|]+$ ]] || err "规则集 URL 必须 HTTPS"; [[ "$b" == domain || "$b" == ipcidr ]] || err "规则集类型必须 domain/ipcidr"; [[ -n "$t" && "$t" != *'|'* && "$t" != *','* && "$t" != *$'\n'* && "$t" != *$'\r'* ]] || err "策略组名称不合法"; sed -i "/^$n|/d" "$RULES"; printf '%s|%s|%s|%s|1\n' "$n" "$u" "$b" "$t" >> "$RULES"; bash "$GENERATE";;
  --rule-disable) [[ $# -eq 1 ]] || err "--rule-disable NAME"; local n="$1"; [[ "$n" =~ ^[A-Za-z0-9_-]+$ ]] || err "规则集名称不合法"; core_rule "$n" && err "核心安全规则禁止禁用：$n"; sed -i "/^$n|/d" "$RULES"; printf '%s|https://disabled.invalid/disabled|domain|国外服务|0\n' "$n" >> "$RULES"; bash "$GENERATE";;
  --rule-restore) [[ $# -eq 1 ]] || err "--rule-restore NAME"; local n="$1"; [[ "$n" =~ ^[A-Za-z0-9_-]+$ ]] || err "规则集名称不合法"; core_rule "$n" && err "核心安全规则不可从本地覆盖恢复：$n"; sed -i "/^$n|/d" "$RULES"; bash "$GENERATE";;
  --generate) bash "$GENERATE";;
  --audit) [[ -f "$SCRIPT_DIR/tools/audit-generated-config.sh" ]] || err "缺少最终配置审计脚本"; [[ -s "$SCRIPT_DIR/output/full-config.yaml" ]] || err "尚未生成最终配置"; bash "$SCRIPT_DIR/tools/audit-generated-config.sh" "$SCRIPT_DIR/output/full-config.yaml";;
  --uninstall) [[ -x "$UNINSTALL" ]] || err "缺少安全卸载脚本"; bash "$UNINSTALL";;
  --check) test -s "$SETTINGS" && test -s "$SCRIPT_DIR/template.yaml" && test -s "$GENERATE" && test -s "$UNINSTALL" && test -s "$SETTINGS_LOADER" && bash -n "$GENERATE" && bash -n "$0" && bash -n "$UNINSTALL" && bash -n "$SETTINGS_LOADER"; info "管理、生成、卸载、配置加载脚本语法检查通过";;
  *) return 1;; esac; exit 0; }
[[ "${1:-}" == --* ]] && noninteractive "$@"
change_airport(){ local old new confirm; old="$(get_current_url)"; if command -v whiptail >/dev/null 2>&1; then new="$(whiptail --title "Mihomo-Full · 更换机场" --inputbox "请输入新的机场订阅链接：\n\n当前：$(mask_url "$old")" 12 78 "$old" 3>&1 1>&2 2>&3)" || return 0; else echo "当前机场：$(mask_url "$old")"; read -r -p "新的机场订阅链接： " new; fi; [[ -n "$new" ]] || { info "未修改"; return 0; }; valid_url "$new" || err "订阅地址必须是 HTTPS URL，且不能含空格、引号或换行"; if command -v whiptail >/dev/null 2>&1; then whiptail --title "确认更换" --yesno "确定更换机场？\n\n$(mask_url "$new")" 10 78 || return 0; else read -r -p "确认更换并重新生成？(y/N): " confirm; [[ "${confirm:-N}" =~ ^[Yy]$ ]] || return 0; fi; set_airport_url "$new"; info "机场订阅已更新"; bash "$GENERATE"; info "完成：客户端固定订阅地址无需修改"; }
list_rules(){ echo; grep -vE '^[[:space:]]*(#|$)' "$RULES" || echo "（无本地覆盖）"; echo; }
add_rule(){ local n u b t; read -r -p "规则集名称： " n; read -r -p "HTTPS MRS 地址（备用源）： " u; read -r -p "类型 [domain/ipcidr]（默认 domain）： " b; [[ -n "$b" ]] || b=domain; read -r -p "命中策略组（默认 国外服务）： " t; [[ -n "$t" ]] || t="国外服务"; "$0" --rule-add "$n" "$u" "$b" "$t"; info "已增加/替换：$n"; }
disable_rule(){ local n; read -r -p "要禁用的规则集名称： " n; "$0" --rule-disable "$n"; info "已禁用：$n"; }
restore_rule(){ local n; read -r -p "恢复哪个规则集： " n; "$0" --rule-restore "$n"; info "已恢复：$n"; }
rules_menu(){ local c; echo "1) 查看当前覆盖"; echo "2) 增加/替换规则集"; echo "3) 禁用规则集"; echo "4) 恢复模板默认"; echo "5) 返回"; read -r -p "选择: " c; case "$c" in 1) list_rules;;2) add_rule;;3) disable_rule;;4) restore_rule;;esac; }
show_status(){ echo; echo -e "${CYAN}Mihomo-Full 状态${NC}"; echo "-------------------------"; echo "机场：$(mask_url "$AIRPORT_SUB_URL")"; echo "配置：${SCRIPT_DIR}/output/full-config.yaml"; echo "完整订阅路径：${FIXED_FULL_CONFIG_PATH}"; echo "落地节点路径：${FIXED_EXIT_NODES_PATH}"; echo; }
uninstall_menu(){ [[ -x "$UNINSTALL" ]] || err "缺少安全卸载脚本"; bash "$UNINSTALL"; }
menu(){ local c; while :; do echo; echo -e "${CYAN}Mihomo-Full 管理${NC}"; echo "1) 更换机场订阅（自动重新生成）"; echo "2) 更新 VPS 落地节点"; echo "3) 规则集管理（增加/替换/禁用/恢复）"; echo "4) 查看当前状态"; echo "5) 配置完整性审计"; echo "6) 卸载 Mihomo Full（不会删除 v2ray-agent）"; echo "7) 退出"; read -r -p "请选择 [1-7]: " c; case "$c" in 1) change_airport;;2) bash "$GENERATE";;3) rules_menu;;4) show_status;;5) "$0" --audit;;6) uninstall_menu; return;;7) return;;*) warn "无效选择";;esac; done; }
case "${1:-menu}" in airport|change|1) change_airport;; generate|update|2) bash "$GENERATE";; rules|ruleset|3) rules_menu;; status|4) show_status;; audit|5) "$0" --audit;; uninstall|6) uninstall_menu;; menu|*) menu;; esac