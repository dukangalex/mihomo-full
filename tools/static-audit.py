#!/usr/bin/env python3
"""Static regression audit for the public Mihomo-Full template.

Stricter than syntax checking: validates rule -> proxy-group references,
public UI DIRECT contract, and DNS bootstrap/policy consistency.
"""
from __future__ import annotations
import re
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
template_path = ROOT / "template.yaml"
airport_path = ROOT / "airport_overwrite.js"
template_text = template_path.read_text(encoding="utf-8")
template = yaml.safe_load(template_text)
airport = airport_path.read_text(encoding="utf-8")
errors: list[str] = []

if not isinstance(template, dict):
    raise SystemExit("[FAIL] template.yaml did not parse as a mapping")

groups = {g.get("name") for g in template.get("proxy-groups", []) if isinstance(g, dict) and g.get("name")}
builtins = {"DIRECT", "REJECT", "REJECT-DROP", "PASS", "fake-ip", "real-ip"}


def check_rules(rules, label: str) -> None:
    for rule in rules or []:
        if not isinstance(rule, str) or not rule or rule.startswith("SUB-RULE,"):
            continue
        parts = rule.split(",")
        if len(parts) < 2:
            continue
        target = parts[-2] if parts[-1] == "no-resolve" and len(parts) >= 3 else parts[-1]
        if target in builtins or target == "MATCH" or not target:
            continue
        if target not in groups:
            errors.append(f"{label}: missing proxy-group {target!r} in {rule!r}")


check_rules(template.get("rules"), "template.rules")
for name, rules in (template.get("sub-rules") or {}).items():
    check_rules(rules, f"template.sub-rules.{name}")

if re.search(r"(?m)^\s*exclude-type:\s*vmess\s*$", template_text):
    errors.append("template still contains VMess protocol exclusion")
if '"geosite:category-ads-all": "rcode://name_error"' in template_text:
    errors.append("template still forces ad DNS NXDOMAIN")

ad = next((g for g in template.get("proxy-groups", []) if g.get("name") == "🛑 广告拦截"), None)
if not ad or ad.get("proxies") != ["REJECT", "DIRECT"]:
    errors.append("template ad group must be exactly REJECT + DIRECT")
remote = next((g for g in template.get("proxy-groups", []) if g.get("name") == "远控工具"), None)
if not remote or "DIRECT" not in remote.get("proxies", []):
    errors.append("template remote-control group must retain DIRECT")

for forbidden in ("🔒 私有网络", "🇨🇳 国内服务"):
    if any(g.get("name") == forbidden for g in template.get("proxy-groups", []) if isinstance(g, dict)):
        errors.append(f"template must not expose {forbidden} as a UI group")
for g in template.get("proxy-groups", []):
    if isinstance(g, dict) and "DIRECT" in (g.get("proxies", []) or []) and g.get("name") not in {"🛑 广告拦截", "远控工具"}:
        errors.append(f"unexpected UI DIRECT in template group {g.get('name')!r}")

# DNS consistency audit.
dns = template.get("dns") or {}
hosts = template.get("hosts") or {}
canonical_cn = ["https://doh.pub/dns-query", "https://223.5.5.5/dns-query"]
if dns.get("default-nameserver") != ["tls://223.5.5.5", "tls://223.6.6.6"]:
    errors.append("default-nameserver must use encrypted IP bootstrap: tls://223.5.5.5 + tls://223.6.6.6")
if dns.get("proxy-server-nameserver") != canonical_cn:
    errors.append("proxy-server-nameserver does not match canonical CN DNS pair")
if dns.get("direct-nameserver") != canonical_cn:
    errors.append("direct-nameserver does not match canonical CN DNS pair")
if "nameserver-policy" not in dns:
    errors.append("template DNS missing nameserver-policy")
if "doh.pub" in hosts or "dns.alidns.com" in hosts:
    errors.append("DNSPod/Ali DoH endpoints must not be pinned in hosts")
if re.search(r"https://120\.53\.53\.53/dns-query", template_text):
    errors.append("template uses DNSPod 120.53.53.53 DoH IP access, which DNSPod discontinued for free public DNS")
if re.search(r"https://dns\.alidns\.com/dns-query", template_text):
    errors.append("template still contains legacy dns.alidns.com DoH URL; use official IP endpoint 223.5.5.5")

# Every policy that uses the domestic resolver family must resolve to the same
# canonical pair. This catches drift hidden behind YAML anchors/aliases.
for key, value in (dns.get("nameserver-policy") or {}).items():
    if isinstance(value, list) and any(isinstance(x, str) and "doh.pub/dns-query" in x for x in value):
        if value != canonical_cn:
            errors.append(f"nameserver-policy {key!r} is not using canonical CN DNS pair: {value!r}")

for raw in (",国外服务", ",AI服务", ",流媒体", ",漏网之鱼", ",远控工具"):
    if re.search(re.escape(raw) + r'(?=["\'])', airport):
        errors.append(f"airport script contains unmapped chain-mode target {raw}")
if '"geosite:category-ads-all": "rcode://name_error"' in airport:
    errors.append("airport script still forces ad DNS NXDOMAIN")
if re.search(r"exclude-type:\s*vmess", airport):
    errors.append("airport script still contains VMess protocol exclusion")
if "var privateGroup" in airport or "var domesticGroup" in airport:
    errors.append("airport script still exposes private/domestic UI groups")
if 'proxies: ["REJECT", "DIRECT"]' not in airport:
    errors.append("airport ad DIRECT exception is missing")
if 'proxies: ["REJECT-DROP", "DIRECT"]' not in airport:
    errors.append("airport remote DIRECT exception is missing")

if errors:
    print("\n".join("[FAIL] " + e for e in errors))
    raise SystemExit(1)

print("[OK] template rule/proxy-group references are complete")
print("[OK] main UI exposes DIRECT only for ads and remote-control exceptions")
print("[OK] airport rule targets are mapped to existing airport groups")
print("[OK] DNS bootstrap/policy structure is internally consistent")
print("[OK] no protocol exclusion / ad DNS NXDOMAIN / private-domestic UI groups")
