#!/usr/bin/env python3
"""Sync common Mihomo-Full behavior without destroying airport-specific UX."""
from __future__ import annotations
import json
import re
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "template.yaml"
AIRPORT = ROOT / "airport_overwrite.js"
COMMON_OBJECTS = ("tun", "dns", "sniffer", "hosts", "rule-providers", "rules", "sub-rules")
COMMON_SCALARS = (
    "mode", "allow-lan", "bind-address", "mixed-port", "log-level", "ipv6",
    "unified-delay", "tcp-concurrent", "keep-alive-interval", "keep-alive-idle",
    "disable-keep-alive", "find-process-mode", "etag-support", "external-controller",
    "global-ua", "geodata-mode", "geodata-loader", "geo-auto-update", "geo-update-interval",
    "profile", "ntp", "experimental", "external-controller-cors", "geox-url",
)

def js(value):
    return json.dumps(value, ensure_ascii=False, indent=2, separators=(",", ": "))

def replace_assignment(text: str, marker: str, value) -> str:
    patterns = [f'config["{marker}"] =', f"config.{marker} ="]
    start = -1
    prefix = None
    for p in patterns:
        i = text.find(p)
        if i >= 0 and (start < 0 or i < start): start, prefix = i, p
    if start < 0: raise RuntimeError(f"assignment not found: {marker}")
    eq = text.find("=", start, start + len(prefix) + 3)
    i = eq + 1
    while i < len(text) and text[i].isspace(): i += 1
    if i >= len(text) or text[i] not in "[{": raise RuntimeError(f"assignment is not object/array: {marker}")
    opening = text[i]; closing = "]" if opening == "[" else "}"
    depth = 0; quote = None; escape = False; j = i
    while j < len(text):
        c = text[j]
        if quote:
            if escape: escape = False
            elif c == "\\": escape = True
            elif c == quote: quote = None
        else:
            if c in "'\"`": quote = c
            elif c == opening: depth += 1
            elif c == closing:
                depth -= 1
                if depth == 0:
                    j += 1
                    while j < len(text) and text[j].isspace(): j += 1
                    if j < len(text) and text[j] == ";": j += 1
                    break
        j += 1
    else: raise RuntimeError(f"unterminated assignment: {marker}")
    return text[:start] + f'config["{marker}"] = {js(value)};' + text[j:]

def replace_scalar(text: str, marker: str, value) -> str:
    value_js = js(value)
    pattern = re.compile(rf'(config\["{re.escape(marker)}"\]|config\.{re.escape(marker)})\s*=\s*[^;]+;', re.M)
    replacement = f'config["{marker}"] = {value_js};'
    if pattern.search(text): return pattern.sub(replacement, text, count=1)
    needle = "\n  return config;"
    if needle not in text: raise RuntimeError("return config marker not found")
    return text.replace(needle, f'\n  {replacement}\n' + needle, 1)

def add_assignment(text: str, marker: str, value) -> str:
    needle = "\n  return config;"
    if needle not in text: raise RuntimeError("return config marker not found")
    return text.replace(needle, f'\n  config["{marker}"] = {js(value)};\n' + needle, 1)

def upsert_object(text: str, marker: str, value) -> str:
    return replace_assignment(text, marker, value) if (f'config["{marker}"] =' in text or f"config.{marker} =" in text) else add_assignment(text, marker, value)

def restore_airport_exceptions(text: str) -> str:
    # DNS-level ad NXDOMAIN defeats the selectable DIRECT exception.
    text = text.replace('  "geosite:category-ads-all": "rcode://name_error",\\n', "")
    # Ads route to the existing airport ad group; remote-control retains DIRECT.
    text = text.replace('"RULE-SET,category-ads-all,REJECT-DROP",', '"RULE-SET,category-ads-all,🛑 广告拦截",')
    # Private/domestic DIRECT is bottom-layer behavior, not a user-facing group.
    text = text.replace('var privateGroup = { name: "🔒 私有网络", type: "select", proxies: ["DIRECT", SELECT_NAME], icon: "" };\\n', '')
    text = text.replace('var domesticGroup = { name: "🇨🇳 国内服务", type: "select", proxies: ["DIRECT", SELECT_NAME].concat(regionNames), icon: "" };\\n', '')
    text = text.replace('adBlockGroup, privateGroup, domesticGroup,', 'adBlockGroup,')
    return text


def map_airport_targets(text: str) -> str:
    # Chain-mode rule targets must resolve to the airport script's existing groups.
    mappings = {
        "AI服务": "🤖 AI服务",
        "国外服务": "🌍 国外服务",
        "流媒体": "📺 Media",
        "漏网之鱼": "🐟 漏网之鱼",
        "远控工具": "🔧 远控工具",
    }
    for src, dst in mappings.items():
        # JS rule arrays contain string literals ending with \"", or \".\"
        text = text.replace("," + src + "\",", "," + dst + "\",")
        text = text.replace("," + src + "\"", "," + dst + "\"")
        text = text.replace("," + src + "\\n", "," + dst + "\\n")
        text = text.replace("," + src + "\\r\\n", "," + dst + "\\r\\n")
    return text

def main() -> None:
    template = yaml.safe_load(TEMPLATE.read_text(encoding="utf-8"))
    airport = AIRPORT.read_text(encoding="utf-8")
    for key in COMMON_OBJECTS:
        if key not in template: raise RuntimeError(f"template missing required section: {key}")
        airport = upsert_object(airport, key, template[key])
    for key in COMMON_SCALARS:
        if key in template: airport = replace_scalar(airport, key, template[key])
    airport = restore_airport_exceptions(airport)
    airport = map_airport_targets(airport)
    required = ('config["rule-providers"]', 'config["rules"]', 'config["sub-rules"]', 'config["tun"]', 'config["dns"]', 'config["sniffer"]', 'config["global-ua"]', 'config["geox-url"]')
    for marker in required:
        if marker not in airport: raise RuntimeError(f"post-sync sanity check failed: {marker}")
    if '"RULE-SET,category-ads-all,🛑 广告拦截"' not in airport: raise RuntimeError("airport ad rule is not connected to the ad group")
    if 'var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT", "DIRECT"]' not in airport: raise RuntimeError("airport ad DIRECT exception missing")
    if 'var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", "DIRECT"]' not in airport: raise RuntimeError("airport remote DIRECT exception missing")
    if 'var privateGroup =' in airport or 'var domesticGroup =' in airport: raise RuntimeError("private/domestic UI groups must remain hidden")
    if 'exclude-type: vmess' in airport: raise RuntimeError("protocol exclusion must not exist")
    for group in ("🤖 AI服务", "🌍 国外服务", "📺 Media", "🐟 漏网之鱼", "🔧 远控工具", "🛑 广告拦截"):
        if 'name: "' + group + '"' not in airport:
            raise RuntimeError("required airport group missing: " + group)
    for target in (",国外服务", ",AI服务", ",流媒体", ",漏网之鱼"):
        if target in airport:
            raise RuntimeError("unmapped chain-mode group target remains: " + target)
    if '"geosite:category-ads-all": "rcode://name_error"' in airport: raise RuntimeError("ad DNS NXDOMAIN would defeat DIRECT")
    AIRPORT.write_text(airport, encoding="utf-8")
    print("airport_overwrite.js synchronized: common behavior synced; airport UX exceptions preserved")

if __name__ == "__main__": main()
