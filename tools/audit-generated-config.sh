#!/usr/bin/env bash
# 审计 generate.sh 生成的最终主配置，避免模板历史残留重新影响实际输出。
set -euo pipefail

CONFIG="${1:-/opt/mihomo-full/output/full-config.yaml}"
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
fail(){ echo -e "${RED}[✗]${NC} $1"; exit 1; }
ok(){ echo -e "${GREEN}[✓]${NC} $1"; }

[[ -s "$CONFIG" ]] || fail "找不到最终配置：$CONFIG"

if grep -qE '^\s*exclude-type:\s*vmess\s*$' "$CONFIG"; then
  fail "最终配置仍排除 VMess 节点"
fi
ok "落地节点未按协议类型排除"

grep -q '^  - name: "🛑 广告拦截"$' "$CONFIG" || fail "缺少广告拦截策略组"
grep -q 'proxies: \["REJECT-DROP", "DIRECT"\]' "$CONFIG" || fail "广告拦截缺少 DIRECT 例外"
grep -q 'RULE-SET,category-ads-all,"🛑 广告拦截"' "$CONFIG" || fail "广告规则未进入广告策略组"
if grep -q 'geosite:category-ads-all.*rcode://name_error' "$CONFIG"; then
  fail "广告规则仍在 DNS 层强制 NXDOMAIN，DIRECT 例外无法生效"
fi
ok "广告拦截：默认阻断 + 用户可主动 DIRECT"

awk '/- name: "远控工具"/{p=1} p&&/proxies:/{print; exit}' "$CONFIG" | grep -Fq '"DIRECT"' || fail "远控工具缺少 DIRECT 例外"
ok "远控工具：默认拒绝 + 代理 + DIRECT"

grep -q 'RULE-SET,private-ip,DIRECT,no-resolve' "$CONFIG" || fail "私有网络 DIRECT 底层规则缺失"
ok "私有网络：底层 DIRECT，不暴露全局直连按钮"

grep -q 'RULE-SET,cn-ip,DIRECT,no-resolve' "$CONFIG" || fail "CN IP DIRECT 规则缺失"
grep -qE 'GEOSITE,cn,DIRECT|RULE-SET,cn,DIRECT' "$CONFIG" || fail "国内服务 DIRECT 规则缺失"
ok "国内服务：规则集/IP 层 DIRECT"

# 规则目标引用完整性：防止 DOMAIN/RULE-SET/PROCESS 等规则指向不存在的 proxy-group。
# 内置目标（DIRECT/REJECT/REJECT-DROP/fake-ip/real-ip 等）不要求出现在 proxy-groups。
awk '
  /^proxy-groups:/ {in_groups=1; in_rules=0; next}
  /^rules:/ {in_groups=0; in_rules=1; next}
  in_groups && /^  - name:/ {
    line=$0
    sub(/^  - name: /,"",line)
    gsub(/^"|"$/,"",line)
    groups[line]=1
    next
  }
  in_rules && /^  - / {
    line=$0
    sub(/^  - /,"",line)
    sub(/#.*/,"",line)
    n=split(line,a,",")
    if(n>=2){
      target=a[n]
      gsub(/^ +| +$/,"",target)
      if(a[1]!="SUB-RULE" && target!="DIRECT" && target!="REJECT" && target!="REJECT-DROP" && target!="PASS" && target!="fake-ip" && target!="real-ip" && target!="MATCH" && target!="no-resolve" && target!="") refs[target]=1
    }
  }
  END {
    bad=0
    for(r in refs) if(!groups[r]) {print "missing proxy-group: " r > "/dev/stderr"; bad=1}
    exit bad
  }
' "$CONFIG" || fail "存在规则引用了不存在的 proxy-group"
ok "规则 → proxy-group 引用完整"

if grep -qE '^\s*exclude-type:\s*vmess\s*
 "$CONFIG"; then
  fail "最终配置仍排除 VMess 节点"
fi
ok "最终配置无协议类型排除"

echo "主配置行为审计通过：$CONFIG"
