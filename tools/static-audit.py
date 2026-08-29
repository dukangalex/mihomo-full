#!/usr/bin/env python3
"""Hard repository regression audit.

The public template is the single source of truth for common behavior.
Only chain-specific provider/dialer/landing behavior may intentionally differ.
"""
from __future__ import annotations
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
import yaml

# This file is deliberately strict: a passing audit is a release prerequisite.
ROOT = Path(__file__).resolve().parents[1]
template_path = ROOT / "template.yaml"
airport_path = ROOT / "airport_overwrite.js"
generate_path = ROOT / "generate.sh"
install_path = ROOT / "install.sh"
settings_path = ROOT / "settings.conf"
template_text = template_path.read_text(encoding="utf-8")
airport = airport_path.read_text(encoding="utf-8")
generate = generate_path.read_text(encoding="utf-8")
install = install_path.read_text(encoding="utf-8")
settings = settings_path.read_text(encoding="utf-8")
template = yaml.safe_load(template_text)
errors: list[str] = []

if not isinstance(template, dict):
    raise SystemExit("[FAIL] template.yaml did not parse as a mapping")

groups = {g.get("name") for g in template.get("proxy-groups", []) if isinstance(g, dict) and g.get("name")}
builtins = {"DIRECT", "REJECT", "REJECT-DROP", "PASS", "fake-ip", "real-ip"}


def check_rules(rules, label: str, known_groups: set[str]) -> None:
    for rule in rules or []:
        if not isinstance(rule, str) or not rule or rule.startswith("SUB-RULE,"):
            continue
        parts = rule.split(",")
        if len(parts) < 2:
            continue
        target = parts[-2] if parts[-1] == "no-resolve" and len(parts) >= 3 else parts[-1]
        if target in builtins or target == "MATCH" or not target:
            continue
        if target not in known_groups:
            errors.append(f"{label}: missing proxy-group {target!r} in {rule!r}")


check_rules(template.get("rules"), "template.rules", groups)
for name, rules in (template.get("sub-rules") or {}).items():
    check_rules(rules, f"template.sub-rules.{name}", groups)

# Common behavior must be represented in the template, not re-created by generate.sh.
if "主配置公共行为增强" in generate:
    errors.append("generate.sh still contains a second common-behavior implementation")
if re.search(r"exclude-type:\s*vmess", generate):
    errors.append("generate.sh must not add VMess exclusion")
if re.search(r"geosite:category-ads-all.*rcode://name_error", generate, re.S):
    errors.append("generate.sh must not force ad DNS NXDOMAIN")

# Installer must take one immutable repository snapshot at install time, not mix SHAs.
if re.search(r"raw\.githubusercontent\.com/[^/]+/[^/]+/[0-9a-f]{40}/", install):
    errors.append("install.sh contains hard-coded per-file commit URLs; it must resolve one main commit")
if "REPO_COMMIT" not in install or "RAW_BASE" not in install:
    errors.append("install.sh lacks the single repository snapshot mechanism")

# Public settings must not carry a reusable subscription path.
for old in ("/assets/static/a7f3c21e9b", "/assets/static/e9b2f1a7c3"):
    if old in settings or old in install or old in generate:
        errors.append(f"stale fixed subscription path remains: {old}")
if not re.search(r"REPLACE_WITH_RANDOM_20_HEX", settings):
    errors.append("settings.conf lacks random-path placeholders")

# Canonical DNS architecture.
dns = template.get("dns") or {}
canonical_cn = ["https://doh.pub/dns-query", "https://223.5.5.5/dns-query"]
if dns.get("default-nameserver") != ["tls://223.5.5.5", "tls://223.6.6.6"]:
    errors.append("default-nameserver must be tls://223.5.5.5 + tls://223.6.6.6")
if dns.get("proxy-server-nameserver") != canonical_cn:
    errors.append("proxy-server-nameserver does not match canonical CN DNS pair")
if dns.get("direct-nameserver") != canonical_cn:
    errors.append("direct-nameserver does not match canonical CN DNS pair")
if dns.get("direct-nameserver-follow-policy") is not True:
    errors.append("direct-nameserver-follow-policy must be true")
if "nameserver-policy" not in dns:
    errors.append("DNS missing nameserver-policy")
if re.search(r"https://dns\.alidns\.com/dns-query", template_text):
    errors.append("template still contains legacy AliDNS hostname DoH endpoint")
if re.search(r"https://120\.53\.53\.53/dns-query", template_text):
    errors.append("template still contains retired DNSPod 120.53.53.53 DoH endpoint")
if re.search(r"^\s*\"(doh\.pub|dns\.alidns\.com)\"\s*:", template_text, re.M):
    errors.append("template pins a DoH service hostname through hosts")
for key, value in (dns.get("nameserver-policy") or {}).items():
    if isinstance(value, list) and any(isinstance(x, str) and "doh.pub/dns-query" in x for x in value):
        if value != canonical_cn and "#RULES" not in " ".join(map(str, value)):
            errors.append(f"nameserver-policy {key!r} drifts from canonical CN DNS pair")

# Airport override must be reproducibly synchronized from the current template.
with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    (t / "template.yaml").write_text(template_text, encoding="utf-8")
    (t / "airport_overwrite.js").write_text(airport, encoding="utf-8")
    (t / "tools").mkdir()
    sync_src = ROOT / "tools/sync-airport-overwrite.py"
    shutil.copy2(sync_src, t / "tools/sync-airport-overwrite.py")
    proc = subprocess.run(["python3", str(t / "tools/sync-airport-overwrite.py")], cwd=t, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if proc.returncode != 0:
        errors.append("sync-airport-overwrite.py cannot reproduce the airport variant: " + proc.stdout.strip())
    else:
        synced = (t / "airport_overwrite.js").read_text(encoding="utf-8")
        if synced != airport:
            errors.append("airport_overwrite.js is not synchronized with template.yaml; run the synchronizer")

# Airport-only exceptions are allowed, but public common behavior must remain present.
required_airport_markers = (
    'config["dns"]', 'config["rules"]', 'config["rule-providers"]',
    'config["sub-rules"]', 'config["tun"]', 'config["sniffer"]',
    'config["global-ua"]', 'config["geox-url"]',
)
for marker in required_airport_markers:
    if marker not in airport:
        errors.append(f"airport overwrite missing common assignment {marker}")
for forbidden in ("var privateGroup =", "var domesticGroup ="):
    if forbidden in airport:
        errors.append(f"airport overwrite exposes forbidden UI group: {forbidden}")
if re.search(r"exclude-type:\s*vmess", airport):
    errors.append("airport overwrite still contains VMess protocol exclusion")
if '"RULE-SET,category-ads-all,🛑 广告拦截"' not in airport:
    errors.append("airport overwrite lost the ad DIRECT exception routing")
if 'var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT", "DIRECT"]' not in airport:
    errors.append("airport overwrite lost the ad DIRECT exception group")
if 'var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", "DIRECT"]' not in airport:
    errors.append("airport overwrite lost the remote-control DIRECT exception group")
for raw in (",国外服务", ",AI服务", ",流媒体", ",漏网之鱼"):
    if raw in airport:
        errors.append(f"airport overwrite contains unmapped common rule target: {raw}")

# Repository-wide stale literal scan. Audit source files intentionally contain
# detection strings, so they are excluded from the literal-residue scan.
scan_exclude = {Path("tools/static-audit.py"), Path("tools/audit-generated-config.sh")}
scan_files = [p for p in ROOT.rglob("*") if p.is_file() and ".git" not in p.parts and p.relative_to(ROOT) not in scan_exclude]
for p in scan_files:
    try:
        text = p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    if "https://dns.alidns.com/dns-query" in text:
        errors.append(f"legacy AliDNS DoH URL remains in {p.relative_to(ROOT)}")
    if "/assets/static/a7f3c21e9b" in text or "/assets/static/e9b2f1a7c3" in text:
        errors.append(f"legacy fixed subscription path remains in {p.relative_to(ROOT)}")
    if "https://120.53.53.53/dns-query" in text:
        errors.append(f"retired DNSPod DoH IP endpoint remains in {p.relative_to(ROOT)}")

# No temporary repair workflow may remain in the repository.
for p in scan_files:
    if p.suffix.lower() in {".md", ".yml", ".yaml"}:
        text = p.read_text(encoding="utf-8")
        if "one-shot-consistency-repair" in text or "one-shot-doc-repair" in text or "repair-airport-dns" in text:
            errors.append(f"temporary repair workflow referenced by {p.relative_to(ROOT)}")

if errors:
    print("\n".join("[FAIL] " + e for e in errors))
    raise SystemExit(1)

print("[OK] template is the common source of truth")
print("[OK] generator does not reimplement common behavior")
print("[OK] installer uses one immutable repository snapshot")
print("[OK] public subscription paths contain no stale fixed literals")
print("[OK] DNS bootstrap / node DNS / direct DNS / policy are canonical")
print("[OK] airport overwrite is reproducibly synchronized")
print("[OK] repository-wide stale literal scan passed")
print("[OK] DIRECT UI exceptions remain limited to approved local cases")
