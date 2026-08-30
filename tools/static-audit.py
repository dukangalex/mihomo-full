#!/usr/bin/env python3
"""Hard repository regression audit.

The public template is the single source of truth for common behavior.
Only chain-specific provider/dialer/landing behavior may intentionally differ.
"""
from __future__ import annotations
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
template_path = ROOT / "template.yaml"
airport_path = ROOT / "airport_overwrite.js"
generate_path = ROOT / "generate.sh"
install_path = ROOT / "install.sh"
settings_path = ROOT / "settings.conf"
endpoint_path = ROOT / "tools/generate-endpoint.py"
uninstall_path = ROOT / "uninstall.sh"
manage_path = ROOT / "manage.sh"
template_text = template_path.read_text(encoding="utf-8")
airport = airport_path.read_text(encoding="utf-8")
generate = generate_path.read_text(encoding="utf-8")
install = install_path.read_text(encoding="utf-8")
settings = settings_path.read_text(encoding="utf-8")
endpoint = endpoint_path.read_text(encoding="utf-8")
uninstall = uninstall_path.read_text(encoding="utf-8")
manage = manage_path.read_text(encoding="utf-8")

class UniqueKeyLoader(yaml.SafeLoader):
    pass

def _construct_unique_mapping(loader, node, deep=False):
    # Support YAML merge keys (<<: *anchor) while still rejecting duplicate
    # keys explicitly written in the same mapping. SafeLoader's normal merge
    # semantics are preserved: merged mappings are flattened first, and an
    # explicit key overrides a merged value.
    explicit_keys = {}
    for key_node, _value_node in node.value:
        if key_node.tag == "tag:yaml.org,2002:merge":
            continue
        key = loader.construct_object(key_node, deep=deep)
        if key in explicit_keys:
            mark = getattr(key_node, "start_mark", None)
            line = (mark.line + 1) if mark else "?"
            raise ValueError(f"duplicate YAML mapping key {key!r} at line {line}")
        explicit_keys[key] = True

    loader.flatten_mapping(node)
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping

UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_unique_mapping)
try:
    template = yaml.load(template_text, Loader=UniqueKeyLoader)
except (yaml.YAMLError, ValueError) as exc:
    raise SystemExit(f"[FAIL] template.yaml YAML integrity error: {exc}")

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

if "主配置公共行为增强" in generate:
    errors.append("generate.sh still contains a second common-behavior implementation")
if re.search(r"exclude-type:\s*vmess", generate):
    errors.append("generate.sh must not add VMess exclusion")
if re.search(r"geosite:category-ads-all.*rcode://name_error", generate, re.S):
    errors.append("generate.sh must not force ad DNS NXDOMAIN")
if re.search(r"raw\.githubusercontent\.com/[^/]+/[^/]+/[0-9a-f]{40}/", install):
    errors.append("install.sh contains hard-coded per-file commit URLs; it must resolve one main commit")
if "REPO_COMMIT" not in install or "RAW_BASE" not in install:
    errors.append("install.sh lacks the single repository snapshot mechanism")

for old in ("/assets/static/a7f3c21e9b", "/assets/static/e9b2f1a7c3"):
    if old in settings or old in install or old in generate:
        errors.append(f"stale fixed subscription path remains: {old}")
if "REPLACE_WITH_RANDOM_WORD_PATH" not in settings:
    errors.append("settings.conf lacks the opaque endpoint placeholder")
if "openssl rand -hex" in install or "rand -hex" in endpoint:
    errors.append("endpoint generation must not use hex-token syntax")
if "/assets/static/" in install:
    errors.append("install.sh still hard-codes the old semantic /assets/static/ endpoint parent")
if not re.search(r"FULL_PATH=\"/assets/\$\{FULL_WORDS\}\"", install):
    errors.append("install.sh does not construct the public endpoint from the natural-language generator")
if not re.search(r"FIXED_FULL_CONFIG_PATH.*\^/assets/\[a-z\]\+\(-\[a-z\]\+\)\{7,15\}\$", install):
    errors.append("install.sh existing-state validation does not enforce opaque word-path format")
if "secrets.SystemRandom().sample" not in endpoint:
    errors.append("endpoint generator is missing a cryptographically secure random sampler")
if len(re.findall(r"WORDS =", endpoint)) < 1 or "FORBIDDEN" not in endpoint:
    errors.append("endpoint generator lacks its semantic word-list guard")

# DNS architecture: template.yaml is the only value source.
dns = template.get("dns") or {}
proxy_dns = dns.get("proxy-server-nameserver")
direct_dns = dns.get("direct-nameserver")
policy = dns.get("nameserver-policy") or {}
if not isinstance(proxy_dns, list) or not proxy_dns or not all(isinstance(x, str) and x.strip() for x in proxy_dns):
    errors.append("template dns.proxy-server-nameserver must be a non-empty string list")
else:
    if direct_dns != proxy_dns:
        errors.append("direct-nameserver must match template proxy-server-nameserver")
if not isinstance(dns.get("default-nameserver"), list) or not dns.get("default-nameserver") or not all(isinstance(x, str) and x.strip() for x in dns.get("default-nameserver")):
    errors.append("template dns.default-nameserver must be a non-empty string list")
if dns.get("direct-nameserver-follow-policy") is not True:
    errors.append("direct-nameserver-follow-policy must be true")
if "nameserver-policy" not in dns:
    errors.append("DNS missing nameserver-policy")
hosts = template.get("hosts") or {}
if "https://dns.google/dns-query#RULES" in (dns.get("nameserver") or []):
    if hosts.get("dns.google") != ["8.8.8.8", "8.8.4.4"]:
        errors.append("dns.google DoH is configured but hosts pinning is missing or incorrect")
for key, value in policy.items():
    if isinstance(value, list) and any(isinstance(x, str) and "doh.pub/dns-query" in x for x in value):
        if value != proxy_dns and "#RULES" not in " ".join(map(str, value)):
            errors.append(f"nameserver-policy {key!r} drifts from template proxy-server-nameserver")

def extract_json_assignment(text: str, marker: str):
    m = re.search(r'config\["' + re.escape(marker) + r'"\]\s*=\s*', text)
    if not m:
        raise ValueError(f"airport assignment not found: {marker}")
    i = m.end()
    if i >= len(text) or text[i] not in "[{":
        raise ValueError(f"airport assignment is not JSON object/array: {marker}")
    opening = text[i]; closing = "]" if opening == "[" else "}"
    depth = 0; quote = None; escape = False
    for j in range(i, len(text)):
        c = text[j]
        if quote:
            if escape: escape = False
            elif c == "\\": escape = True
            elif c == quote: quote = None
            continue
        if c in "\"'`": quote = c
        elif c == opening: depth += 1
        elif c == closing:
            depth -= 1
            if depth == 0:
                raw = text[i:j + 1]
                try: return json.loads(raw)
                except json.JSONDecodeError as exc: raise ValueError(f"airport assignment is not strict JSON: {marker}: {exc}")
    raise ValueError(f"unterminated airport assignment: {marker}")

RULE_TARGET_REVERSE = {"🤖 AI服务": "AI服务", "🌍 国外服务": "国外服务", "📺 Media": "流媒体", "🐟 漏网之鱼": "漏网之鱼", "🔧 远控工具": "远控工具"}
def canonicalize_airport_rules(rules):
    out = []
    for rule in rules or []:
        if not isinstance(rule, str): out.append(rule); continue
        parts = rule.split(",")
        if len(parts) >= 2:
            idx = -2 if parts[-1] == "no-resolve" and len(parts) >= 3 else -1
            parts[idx] = RULE_TARGET_REVERSE.get(parts[idx], parts[idx]); rule = ",".join(parts)
        out.append(rule)
    return out

for key in ("tun", "dns", "sniffer", "hosts", "rule-providers", "sub-rules"):
    try:
        if extract_json_assignment(airport, key) != template.get(key): errors.append(f"airport common object drift: {key}")
    except ValueError as exc: errors.append(str(exc))
try:
    if canonicalize_airport_rules(extract_json_assignment(airport, "rules")) != template.get("rules"):
        errors.append("airport common object drift: rules (outside approved target mappings)")
except ValueError as exc: errors.append(str(exc))

for key in ("mode", "allow-lan", "bind-address", "mixed-port", "log-level", "ipv6", "unified-delay", "tcp-concurrent", "keep-alive-interval", "keep-alive-idle", "disable-keep-alive", "find-process-mode", "etag-support", "external-controller", "global-ua", "geodata-mode", "geodata-loader", "geo-auto-update", "geo-update-interval", "profile", "ntp", "experimental", "external-controller-cors", "geox-url"):
    if key not in template: continue
    try: actual = extract_json_assignment(airport, key)
    except ValueError:
        m = re.search(r'config\["' + re.escape(key) + r'"\]\s*=\s*(.+?);\s*(?://.*)?$', airport, re.M)
        if not m: errors.append(f"airport scalar assignment not found: {key}"); continue
        try: actual = json.loads(m.group(1).strip())
        except json.JSONDecodeError: errors.append(f"airport scalar assignment is not strict JSON: {key}"); continue
    if actual != template[key]: errors.append(f"airport common scalar drift: {key}")

with tempfile.TemporaryDirectory() as td:
    t = Path(td); (t / "template.yaml").write_text(template_text, encoding="utf-8"); (t / "airport_overwrite.js").write_text(airport, encoding="utf-8"); (t / "tools").mkdir(); sync_src = ROOT / "tools/sync-airport-overwrite.py"; shutil.copy2(sync_src, t / "tools/sync-airport-overwrite.py")
    proc = subprocess.run(["python3", str(t / "tools/sync-airport-overwrite.py")], cwd=t, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if proc.returncode != 0: errors.append("sync-airport-overwrite.py cannot reproduce the airport variant: " + proc.stdout.strip())
    elif (t / "airport_overwrite.js").read_text(encoding="utf-8") != airport: errors.append("airport_overwrite.js is not synchronized with template.yaml; run the synchronizer")

required_airport_markers = ('config["dns"]', 'config["rules"]', 'config["rule-providers"]', 'config["sub-rules"]', 'config["tun"]', 'config["sniffer"]', 'config["global-ua"]', 'config["geox-url"]')
for marker in required_airport_markers:
    if marker not in airport: errors.append(f"airport overwrite missing common assignment {marker}")
for forbidden in ("var privateGroup =", "var domesticGroup ="):
    if forbidden in airport: errors.append(f"airport overwrite exposes forbidden UI group: {forbidden}")
if re.search(r"exclude-type:\s*vmess", airport): errors.append("airport overwrite still contains VMess protocol exclusion")
if '"RULE-SET,category-ads-all,🛑 广告拦截"' not in airport: errors.append("airport overwrite lost the ad DIRECT exception routing")
if 'var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT", "DIRECT"]' not in airport: errors.append("airport overwrite lost the ad DIRECT exception group")
if 'var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", "落地优选出口", "DIRECT"]' not in airport: errors.append("airport overwrite lost the remote-control DIRECT exception group")
for raw in (",国外服务", ",AI服务", ",流媒体", ",漏网之鱼"):
    if raw in airport: errors.append(f"airport overwrite contains unmapped common rule target: {raw}")

# Runtime residue scan.
scan_exclude = {Path("tools/static-audit.py"), Path("tools/audit-generated-config.sh")}
scan_files = []
for p in ROOT.rglob("*"):
    if not p.is_file() or ".git" in p.parts: continue
    rel = p.relative_to(ROOT); rel_posix = rel.as_posix()
    if rel in scan_exclude or rel_posix == "README.md" or rel_posix.startswith("docs/") or rel_posix.startswith("CHANGELOG"): continue
    scan_files.append(p)
for p in scan_files:
    try: text = p.read_text(encoding="utf-8")
    except UnicodeDecodeError: continue
    if "https://dns.alidns.com/dns-query" in text: errors.append(f"legacy AliDNS DoH URL remains in runtime file {p.relative_to(ROOT)}")
    if "/assets/static/a7f3c21e9b" in text or "/assets/static/e9b2f1a7c3" in text: errors.append(f"legacy fixed subscription path remains in runtime file {p.relative_to(ROOT)}")
    if "https://120.53.53.53/dns-query" in text: errors.append(f"retired DNSPod DoH IP endpoint remains in runtime file {p.relative_to(ROOT)}")

# Uninstall boundary: v2ray-agent may only appear in explicit read-only guard/documentation contexts.
if "rm -rf -- /etc/v2ray-agent" in uninstall or "systemctl stop v2ray-agent" in uninstall or "systemctl disable v2ray-agent" in uninstall:
    errors.append("uninstall.sh contains destructive v2ray-agent operation")
if not re.search(r"不会.*v2ray-agent|绝不.*v2ray-agent|不.*删除.*v2ray-agent", uninstall, re.S):
    errors.append("uninstall.sh lacks an explicit v2ray-agent safety boundary")
if "--uninstall" not in manage or "Mihomo Full（不会删除 v2ray-agent）" not in manage:
    errors.append("manage.sh lacks the main-menu uninstall entry with v2ray-agent protection")

for p in scan_files:
    if p.suffix.lower() in {".md", ".yml", ".yaml", ".py", ".sh", ".js"}:
        text = p.read_text(encoding="utf-8")
        if "one-shot-consistency-repair" in text or "one-shot-doc-repair" in text or "repair-airport-dns" in text:
            errors.append(f"temporary repair workflow referenced by {p.relative_to(ROOT)}")

if errors:
    print("\n".join("[FAIL] " + e for e in errors)); raise SystemExit(1)
print("[OK] template is the common source of truth")
print("[OK] generator does not reimplement common behavior")
print("[OK] installer uses one immutable repository snapshot")
print("[OK] public endpoint uses opaque natural-language path generation")
print("[OK] DNS common behavior is derived from template.yaml")
print("[OK] airport common objects/scalars independently match template")
print("[OK] airport overwrite is reproducibly synchronized")
print("[OK] runtime stale literal scan passed")
print("[OK] uninstall boundary protects v2ray-agent")
print("[OK] DIRECT UI exceptions remain limited to approved local cases")
