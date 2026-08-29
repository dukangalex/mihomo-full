#!/usr/bin/env bash
# 审计 generate.sh 生成的最终 Mihomo 配置，避免模板历史残留重新影响实际输出。
set -euo pipefail

CONFIG="${1:-/opt/mihomo-full/output/full-config.yaml}"
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
fail(){ echo -e "${RED}[✗]${NC} $1"; exit 1; }
ok(){ echo -e "${GREEN}[✓]${NC} $1"; }

[[ -s "$CONFIG" ]] || fail "找不到最终配置：$CONFIG"

grep -qE '^\s*exclude-type:\s*vmess\s*$' "$CONFIG" && fail "最终配置仍排除 VMess 节点" || true
ok "落地节点未按协议类型排除"

grep -q '^  - name: "🛑 广告拦截"$' "$CONFIG" || fail "缺少广告拦截策略组"
grep -qF 'proxies: ["REJECT", "DIRECT"]' "$CONFIG" || fail "广告拦截缺少 DIRECT 例外"
grep -qF 'RULE-SET,category-ads-all,🛑 广告拦截' "$CONFIG" || fail "广告规则未进入广告策略组"
if grep -q 'geosite:category-ads-all.*rcode://name_error' "$CONFIG"; then fail "广告规则仍在 DNS 层强制 NXDOMAIN，DIRECT 例外无法生效"; fi
ok "广告拦截：默认阻断 + 用户可主动 DIRECT"

awk '/- name: "远控工具"/{p=1} p&&/proxies:/{print; exit}' "$CONFIG" | grep -Fq '"DIRECT"' || fail "远控工具缺少 DIRECT 例外"
ok "远控工具：默认拒绝 + 代理 + DIRECT"

grep -qF 'RULE-SET,private-ip,DIRECT,no-resolve' "$CONFIG" || fail "私有网络 DIRECT 底层规则缺失"
ok "私有网络：底层 DIRECT，不暴露全局直连按钮"
grep -qF 'RULE-SET,cn-ip,DIRECT,no-resolve' "$CONFIG" || fail "CN IP DIRECT 规则缺失"
grep -qE 'GEOSITE,cn,DIRECT|RULE-SET,cn,DIRECT' "$CONFIG" || fail "国内服务 DIRECT 规则缺失"
ok "国内服务：规则集/IP 层 DIRECT"

# DNS 必须与 template.yaml 的 canonical 设计一致：加密 IP bootstrap + 腾讯 DoH 域名 + 阿里 IP DoH。
grep -qF 'proxy-server-nameserver:' "$CONFIG" || fail "缺少 proxy-server-nameserver"
grep -qF 'direct-nameserver:' "$CONFIG" || fail "缺少 direct-nameserver"
grep -qF 'direct-nameserver-follow-policy: true' "$CONFIG" || fail "缺少 direct-nameserver-follow-policy: true"
grep -qF 'https://doh.pub/dns-query' "$CONFIG" || fail "缺少腾讯 DNSPod DoH"
grep -qF 'https://223.5.5.5/dns-query' "$CONFIG" || fail "缺少阿里公共 DNS IP DoH"
grep -qF 'tls://223.5.5.5' "$CONFIG" || fail "缺少加密 DNS bootstrap 223.5.5.5"
grep -qF 'tls://223.6.6.6' "$CONFIG" || fail "缺少加密 DNS bootstrap 223.6.6.6"
grep -qF 'nameserver-policy:' "$CONFIG" || fail "缺少 nameserver-policy"
if grep -qE '120\.53\.53\.53/dns-query|https://120\.53\.53\.53/dns-query' "$CONFIG"; then fail "禁止使用已停止公开提供的 DNSPod 免费版 DoH IP 接入 120.53.53.53"; fi
if grep -qF 'https://dns.alidns.com/dns-query' "$CONFIG"; then fail "禁止残留旧版 dns.alidns.com DoH URL；统一使用 223.5.5.5 IP DoH"; fi
if grep -qE '^\s*"(doh\.pub|dns\.alidns\.com)"\s*:' "$CONFIG"; then fail "禁止通过 hosts 固定 DNSPod/AliDNS 服务地址"; fi
ok "DNS：bootstrap / proxy-node DNS / direct DNS / policy 已统一"

# 规则目标引用完整性：防止 DOMAIN/RULE-SET/PROCESS 等规则指向不存在的 proxy-group。
awk '
  /^proxy-groups:/ {in_groups=1; in_rules=0; next}
  /^rules:/ {in_groups=0; in_rules=1; next}
  in_groups && /^  - name:/ {
    line=$0; sub(/^  - name: /,"",line); gsub(/^"|"$/,"",line); groups[line]=1; next
  }
  in_rules && /^  - / {
    line=$0; sub(/^  - /,"",line); sub(/#.*/,"",line); n=split(line,a,",")
    if(n>=2){
      target=a[n]; if(a[n]=="no-resolve" && n>=3) target=a[n-1]
      gsub(/^ +| +$/,"",target)
      if(a[1]!="SUB-RULE" && target!="DIRECT" && target!="REJECT" && target!="REJECT-DROP" && target!="PASS" && target!="fake-ip" && target!="real-ip" && target!="MATCH" && target!="no-resolve" && target!="") refs[target]=1
    }
  }
  END { bad=0; for(r in refs) if(!groups[r]) {print "missing proxy-group: " r > "/dev/stderr"; bad=1} exit bad }
' "$CONFIG" || fail "存在规则引用了不存在的 proxy-group"
ok "规则 → proxy-group 引用完整"

grep -qE '^\s*exclude-type:\s*vmess\s*$' "$CONFIG" && fail "最终配置仍存在协议类型排除" || true
ok "最终配置无协议类型排除"
echo "最终配置行为审计通过：$CONFIG"
