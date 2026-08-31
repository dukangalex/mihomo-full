#!/usr/bin/env python3
"""Synchronize template public behavior into the non-chain Airport overwrite.

The template is authoritative for common Mihomo behavior. Airport-specific node
handling and UX remain local to airport_overwrite.js. The synchronizer is
idempotent: applying the transformation repeatedly must produce identical text.
"""
from __future__ import annotations

import argparse
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

# Chain-mode-only concepts. These must never survive in the Airport overwrite.
FORBIDDEN_CHAIN_MARKERS = (
    "EXIT_NODES",
    "EXIT_URL",
    "落地优选出口",
    "fallback.*落地",
    "dialer-proxy",
    "proxy-dialer",
)


def js(value) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, separators=(",", ": "))


def _find_assignment(text: str, marker: str):
    patterns = [f'config["{marker}"] =', f"config.{marker} ="]
    found = []
    for pattern in patterns:
        i = text.find(pattern)
        if i >= 0:
            found.append((i, pattern))
    return min(found, key=lambda x: x[0]) if found else (-1, None)


def replace_assignment(text: str, marker: str, value) -> str:
    start, prefix = _find_assignment(text, marker)
    if start < 0:
        raise RuntimeError(f"assignment not found: {marker}")

    eq = text.find("=", start, start + len(prefix) + 3)
    i = eq + 1
    while i < len(text) and text[i].isspace():
        i += 1
    if i >= len(text) or text[i] not in "[{":
        raise RuntimeError(f"assignment is not object/array: {marker}")

    opening = text[i]
    closing = "]" if opening == "[" else "}"
    depth = 0
    quote = None
    escape = False
    j = i
    while j < len(text):
        c = text[j]
        if quote:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == quote:
                quote = None
        else:
            if c in "'\"`":
                quote = c
            elif c == opening:
                depth += 1
            elif c == closing:
                depth -= 1
                if depth == 0:
                    j += 1
                    while j < len(text) and text[j].isspace():
                        j += 1
                    if j < len(text) and text[j] == ";":
                        j += 1
                    break
        j += 1
    else:
        raise RuntimeError(f"unterminated assignment: {marker}")

    return text[:start] + f'config["{marker}"] = {js(value)};' + text[j:]


def replace_scalar(text: str, marker: str, value) -> str:
    start, prefix = _find_assignment(text, marker)
    value_js = js(value)
    if start < 0:
        needle = "\n  return config;"
        if needle not in text:
            raise RuntimeError("return config marker not found")
        return text.replace(needle, f'\n  config["{marker}"] = {value_js};\n' + needle, 1)

    eq = text.find("=", start, start + len(prefix) + 3)
    i = eq + 1
    while i < len(text) and text[i].isspace():
        i += 1
    if i >= len(text):
        raise RuntimeError(f"invalid assignment: {marker}")

    if text[i] in "[{":
        return replace_assignment(text, marker, value)

    if text[i] in "'\"`":
        quote = text[i]
        j = i + 1
        escape = False
        while j < len(text):
            ch = text[j]
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                j += 1
                while j < len(text) and text[j].isspace():
                    j += 1
                if j < len(text) and text[j] == ";":
                    j += 1
                break
            j += 1
        else:
            raise RuntimeError(f"unterminated string assignment: {marker}")
    else:
        j = text.find(";", i)
        if j < 0:
            raise RuntimeError(f"unterminated scalar assignment: {marker}")
        j += 1

    return text[:start] + f'config["{marker}"] = {value_js};' + text[j:]


def add_assignment(text: str, marker: str, value) -> str:
    needle = "\n  return config;"
    if needle not in text:
        raise RuntimeError("return config marker not found")
    return text.replace(needle, f'\n  config["{marker}"] = {js(value)};\n' + needle, 1)


def upsert_object(text: str, marker: str, value) -> str:
    start, _ = _find_assignment(text, marker)
    return replace_assignment(text, marker, value) if start >= 0 else add_assignment(text, marker, value)


def restore_airport_exceptions(text: str) -> str:
    text = re.sub(
        r'^\s*"geosite:category-ads-all":\s*"rcode://name_error",\s*\n',
        "",
        text,
        flags=re.MULTILINE,
    )
    # NOTE: template.yaml's ad rule target is already the literal Airport
    # group name ("RULE-SET,category-ads-all,🛑 广告拦截"), so no rewrite is
    # needed here. A prior version of the template used a bare REJECT-DROP
    # target requiring translation; that mapping has been removed since it
    # can no longer match anything template.yaml produces.
    text = re.sub(r'^\s*var privateGroup = .*?;\s*\n', "", text, flags=re.MULTILINE)
    text = re.sub(r'^\s*var domesticGroup = .*?;\s*\n', "", text, flags=re.MULTILINE)
    text = text.replace('adBlockGroup, privateGroup, domesticGroup,', 'adBlockGroup,')
    return text


def map_airport_targets(text: str) -> str:
    mappings = {
        "AI服务": "🤖 AI服务",
        "国外服务": "🌍 国外服务",
        "流媒体": "📺 Media",
        "漏网之鱼": "🐟 漏网之鱼",
        "远控工具": "🔧 远控工具",
    }
    for src, dst in mappings.items():
        text = re.sub(r"," + re.escape(src) + r'(?=")', "," + dst, text)
        text = text.replace("," + src + ",no-resolve", "," + dst + ",no-resolve")
    return text


def assert_no_chain_features(text: str) -> None:
    for marker in FORBIDDEN_CHAIN_MARKERS:
        if re.search(marker, text, flags=re.IGNORECASE):
            raise RuntimeError("forbidden chain-mode feature remains in Airport overwrite: " + marker)
    for group in ("落地优选出口", "前置机场", "VPS落地", "EXIT_NODES"):
        if group in text:
            raise RuntimeError("forbidden chain-mode group remains in Airport overwrite: " + group)


def validate_airport(text: str) -> None:
    required = (
        'config["rule-providers"]', 'config["rules"]', 'config["sub-rules"]',
        'config["tun"]', 'config["dns"]', 'config["sniffer"]',
        'config["global-ua"]', 'config["geox-url"]',
    )
    for marker in required:
        if marker not in text:
            raise RuntimeError(f"post-sync sanity check failed: {marker}")
    if '"RULE-SET,category-ads-all,🛑 广告拦截"' not in text:
        raise RuntimeError("airport ad rule is not connected to the ad group")
    if 'var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT", "DIRECT"]' not in text:
        raise RuntimeError("airport ad DIRECT exception missing")
    if 'var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", "DIRECT"]' not in text:
        raise RuntimeError("airport remote DIRECT exception missing")
    if 'var privateGroup =' in text or 'var domesticGroup =' in text:
        raise RuntimeError("private/domestic UI groups must remain hidden")
    if 'exclude-type: vmess' in text:
        raise RuntimeError("protocol exclusion must not exist")
    for group in ("🤖 AI服务", "🌍 国外服务", "📺 Media", "🐟 漏网之鱼", "🔧 远控工具", "🛑 广告拦截"):
        if 'name: "' + group + '"' not in text:
            raise RuntimeError("required airport group missing: " + group)
    for target in (",国外服务", ",AI服务", ",流媒体", ",漏网之鱼"):
        if target in text:
            raise RuntimeError("unmapped chain-mode group target remains: " + target)
    if '"geosite:category-ads-all": "rcode://name_error"' in text:
        raise RuntimeError("ad DNS NXDOMAIN would defeat DIRECT")
    assert_no_chain_features(text)


def transform(template: dict, airport: str) -> str:
    """Pure transformation stage; deliberately contains no file writes."""
    result = airport
    for key in COMMON_OBJECTS:
        if key not in template:
            raise RuntimeError(f"template missing required section: {key}")
        result = upsert_object(result, key, template[key])
    for key in COMMON_SCALARS:
        if key in template:
            result = replace_scalar(result, key, template[key])
    result = restore_airport_exceptions(result)
    result = map_airport_targets(result)
    validate_airport(result)
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Synchronize template public behavior into airport_overwrite.js")
    parser.add_argument("--check", action="store_true", help="validate synchronization without writing the file")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    template = yaml.safe_load(TEMPLATE.read_text(encoding="utf-8"))
    original = AIRPORT.read_text(encoding="utf-8")

    first = transform(template, original)
    second = transform(template, first)
    if first != second:
        raise RuntimeError("Airport synchronization is not idempotent: second pass changes the output")

    if args.check:
        if first != original:
            raise RuntimeError("Airport overwrite is out of sync; run the synchronizer without --check")
        print("airport_overwrite.js synchronized")
        print("idempotence check: PASS; non-chain hard gate: PASS; sync check: PASS")
        return

    if first != original:
        tmp = AIRPORT.with_suffix(AIRPORT.suffix + ".tmp")
        tmp.write_text(first, encoding="utf-8")
        tmp.replace(AIRPORT)
        print("airport_overwrite.js synchronized")
    else:
        print("airport_overwrite.js already synchronized")
    print("idempotence check: PASS; non-chain hard gate: PASS")


if __name__ == "__main__":
    main()
