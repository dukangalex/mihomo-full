#!/usr/bin/env python3
"""Static regression audit for the public Mihomo-Full template.\n\nThis audit is intentionally stricter than a syntax check: it validates rule -> proxy-group references and the final UI DIRECT contract.\n"""
from __future__ import annotations
import re
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
template_text = (ROOT / "template.yaml").read_text(encoding="utf-8")
template = yaml.safe_load(template_text)
airport = (ROOT / "airport_overwrite.js").read_text(encoding="utf-8")
errors: list[str] = []

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

if "exclude-type: vmess" in template_text:
    errors.append("template still contains VMess protocol exclusion")
if '"geosite:category-ads-all": "rcode://name_error"' in template_text:
    errors.append("template still forces ad DNS NXDOMAIN")

ad = next((g for g in template["proxy-groups"] if g.get("name") == "🛑 广告拦截"), None)
if not ad or ad.get("proxies") != ["REJECT", "DIRECT"]:
    errors.append("template ad group must be exactly REJECT + DIRECT")
remote = next((g for g in template["proxy-groups"] if g.get("name") == "远控工具"), None)
if not remote or "DIRECT" not in remote.get("proxies", []):
    errors.append("template remote-control group must retain DIRECT")

for forbidden in ("🔒 私有网络", "🇨🇳 国内服务"):
    if any(g.get("name") == forbidden for g in template["proxy-groups"] if isinstance(g, dict)):
        errors.append(f"template must not expose {forbidden} as a UI group")
for g in template.get("proxy-groups", []):
    if isinstance(g, dict) and "DIRECT" in (g.get("proxies", []) or []) and g.get("name") not in {"🛑 广告拦截", "远控工具"}:
        errors.append(f"unexpected UI DIRECT in template group {g.get('name')!r}")

for raw in (",国外服务", ",AI服务", ",流媒体", ",漏网之鱼", ",远控工具"):
    if re.search(re.escape(raw) + r'(?=["\'])', airport):
        errors.append(f"airport script contains unmapped chain-mode target {raw}")
if '"geosite:category-ads-all": "rcode://name_error"' in airport:
    errors.append("airport script still forces ad DNS NXDOMAIN")
if "exclude-type: vmess" in airport:
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
print("[OK] no protocol exclusion / ad DNS NXDOMAIN / private-domestic UI groups")
