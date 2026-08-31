#!/usr/bin/env bash
# 审计 generate.sh 生成的最终 Mihomo 配置。
# 目标：验证最终产物，而不是只验证 template.yaml。
set -euo pipefail

CONFIG="${1:-/opt/mihomo-full/output/full-config.yaml}"
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
fail(){ echo -e "${RED}[✗]${NC} $1"; exit 1; }
ok(){ echo -e "${GREEN}[✓]${NC} $1"; }

[[ -s "$CONFIG" ]] || fail "找不到最终配置：$CONFIG"

grep -qE '^\s*exclude-type:\s*vmess\s*$' "$CONFIG" && fail "最终配置仍排除 VMess 节点" || true
ok "落地节点未按协议类型排除"

EXIT_NODES_FILE="$(dirname "$CONFIG")/exit-nodes.yaml"
if [[ -f "$EXIT_NODES_FILE" ]]; then
  EXIT_NODE_COUNT="$(grep -cE '^  - [Nn][Aa][Mm][Ee]:' "$EXIT_NODES_FILE" 2>/dev/null || true)"; EXIT_NODE_COUNT=${EXIT_NODE_COUNT:-0}
  (( EXIT_NODE_COUNT > 0 )) || fail "落地节点文件存在但节点数为 0：$EXIT_NODES_FILE（请先在 v2ray-agent 中添加协议）"
  ok "落地节点数量非零：$EXIT_NODE_COUNT"
fi

grep -qF 'provider_entry_J:' "$CONFIG" || fail "缺少前置机场 provider"
grep -qF 'provider_exit:' "$CONFIG" || fail "缺少落地 VPS provider"
grep -qF 'dialer-proxy: "前置优选入口"' "$CONFIG" || fail "落地 provider 未强制经前置优选入口"
grep -qF 'use: [provider_exit]' "$CONFIG" || fail "落地策略组未绑定落地 provider"
grep -q '^  - name: "前置优选入口"$' "$CONFIG" || fail "缺少前置优选入口策略组"
grep -q '^  - name: "落地优选出口"$' "$CONFIG" || fail "缺少落地优选出口策略组"
grep -q '^  - name: "落地负载均衡"$' "$CONFIG" || fail "缺少落地负载均衡策略组"
grep -q '^  - name: "落地手动选择"$' "$CONFIG" || fail "缺少落地手动选择策略组"
ok "链式：机场入口 → 前置优选入口 → 落地 VPS"

# DIRECT 只能存在于批准的局部例外，不得成为通用出口。
grep -q '^  - name: "🛑 广告拦截"$' "$CONFIG" || fail "缺少广告拦截策略组"
grep -qF 'proxies: ["REJECT", "DIRECT"]' "$CONFIG" || fail "广告拦截缺少 DIRECT 例外"
grep -qF 'RULE-SET,category-ads-all,🛑 广告拦截' "$CONFIG" || fail "广告规则未进入广告策略组"
grep -q '^  - name: "远控工具"$' "$CONFIG" || fail "缺少远控工具策略组"
if grep -q 'geosite:category-ads-all.*rcode://name_error' "$CONFIG"; then fail "广告规则仍在 DNS 层强制 NXDOMAIN，DIRECT 例外无法生效"; fi
ok "广告拦截：默认阻断 + 局部 DIRECT 例外"
awk '/- name: "远控工具"/{p=1} p&&/proxies:/{print; exit}' "$CONFIG" | grep -Fq '"DIRECT"' || fail "远控工具缺少 DIRECT 例外"
ok "远控工具：默认拒绝 + 落地代理 + 局部 DIRECT"

grep -qF 'RULE-SET,private-ip,DIRECT,no-resolve' "$CONFIG" || fail "私有网络 DIRECT 底层规则缺失"
grep -qF 'RULE-SET,cn-ip,DIRECT,no-resolve' "$CONFIG" || fail "CN IP DIRECT 规则缺失"
grep -qE 'GEOSITE,cn,DIRECT|RULE-SET,cn,DIRECT' "$CONFIG" || fail "国内服务 DIRECT 规则缺失"
ok "国内服务：规则集/IP 层 DIRECT"

# DNS：bootstrap / proxy-node DNS / public nameserver / direct DNS / policy。
grep -qF 'proxy-server-nameserver:' "$CONFIG" || fail "缺少 proxy-server-nameserver"
grep -qF 'direct-nameserver:' "$CONFIG" || fail "缺少 direct-nameserver"
grep -qF 'direct-nameserver-follow-policy: true' "$CONFIG" || fail "缺少 direct-nameserver-follow-policy: true"
grep -qF 'respect-rules: true' "$CONFIG" || fail "DNS respect-rules 未开启"
grep -qF 'https://doh.pub/dns-query' "$CONFIG" || fail "缺少腾讯 DNSPod DoH"
grep -qF 'https://223.5.5.5/dns-query' "$CONFIG" || fail "缺少阿里公共 DNS IP DoH"
grep -qF 'https://dns.google/dns-query#RULES' "$CONFIG" || fail "缺少境外 DNS Google DoH#RULES"
grep -qF 'https://1.1.1.1/dns-query#RULES' "$CONFIG" || fail "缺少境外 DNS Cloudflare DoH#RULES"
grep -qF 'tls://223.5.5.5' "$CONFIG" || fail "缺少加密 DNS bootstrap 223.5.5.5"
grep -qF 'tls://223.6.6.6' "$CONFIG" || fail "缺少加密 DNS bootstrap 223.6.6.6"
grep -qF 'nameserver-policy:' "$CONFIG" || fail "缺少 nameserver-policy"
if grep -qE '120\.53\.53\.53/dns-query|https://120\.53\.53\.53/dns-query' "$CONFIG"; then fail "禁止残留 DNSPod 120.53.53.53 DoH IP 接入"; fi
if grep -qF 'https://dns.alidns.com/dns-query' "$CONFIG"; then fail "禁止残留旧版 dns.alidns.com DoH URL；统一使用 IP DoH"; fi
if grep -qE '^\s*"(doh\.pub|dns\.alidns\.com)"\s*:' "$CONFIG"; then fail "禁止通过 hosts 固定 DNS 服务地址"; fi
ok "DNS：bootstrap / proxy-node / public / direct / policy 已统一"

# TUN / IPv6 / QUIC / 明文 DNS：零旁路基线。
grep -qE '^  strict-route:[[:space:]]*true' "$CONFIG" || fail "TUN strict-route 未开启"
grep -qE '^  auto-route:[[:space:]]*true' "$CONFIG" || fail "TUN auto-route 未开启"
grep -qE '^  auto-detect-interface:[[:space:]]*true' "$CONFIG" || fail "TUN auto-detect-interface 未开启"
grep -qE '^  inet4-route-only:[[:space:]]*false' "$CONFIG" || fail "TUN inet4-route-only 必须为 false"
grep -qE '^  gso:[[:space:]]*false' "$CONFIG" || fail "TUN gso 必须为 false"
grep -qF 'IP-CIDR6,::/0,REJECT-DROP,no-resolve' "$CONFIG" || fail "IPv6 全封堵规则缺失"
grep -qF 'AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP' "$CONFIG" || fail "境外 QUIC(UDP/443) 封堵缺失"
grep -qF 'AND,((NETWORK,TCP),(DST-PORT,53),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP' "$CONFIG" || fail "境外明文 TCP/53 封堵缺失"
grep -qF 'AND,((NETWORK,UDP),(DST-PORT,53),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP' "$CONFIG" || fail "境外明文 UDP/53 封堵缺失"
grep -qF 'AND,((NETWORK,TCP),(DST-PORT,853),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP' "$CONFIG" || fail "境外明文 TCP/853 封堵缺失"
grep -qF 'AND,((NETWORK,UDP),(DST-PORT,853),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP' "$CONFIG" || fail "境外明文 UDP/853 封堵缺失"
ok "TUN / IPv6 / QUIC / 明文 DNS 封堵基线通过"

# 最终 MATCH 必须唯一存在并指向链式出口。
MATCH_COUNT="$(grep -cE '^  - MATCH,' "$CONFIG" || true)"
[[ "$MATCH_COUNT" -eq 1 ]] || fail "最终配置必须且只能有一个顶层 MATCH，当前为 $MATCH_COUNT 个"
MATCH_TARGET="$(grep -E '^  - MATCH,' "$CONFIG" | sed 's/^  - MATCH,//; s/[[:space:]]*#.*$//')"
[[ "$MATCH_TARGET" == "漏网之鱼" ]] || fail "最终 MATCH 必须指向漏网之鱼（链式出口），实际为：$MATCH_TARGET"
[[ "$MATCH_TARGET" != "DIRECT" && "$MATCH_TARGET" != "REJECT" && "$MATCH_TARGET" != "REJECT-DROP" ]] || fail "最终 MATCH 不得为 DIRECT/REJECT"
ok "默认路由：所有未命中流量进入漏网之鱼链式出口"

# 规则目标引用完整性。
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
