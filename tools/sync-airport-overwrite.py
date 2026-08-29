#!/usr/bin/env python3
"""Synchronize airport_overwrite.js with template.yaml common behavior.

Design contract:
- template.yaml is authoritative for COMMON behavior.
- airport_overwrite.js keeps its established airport-specific proxy groups/UI.
- No proxy-group renaming, filtering, or DIRECT removal is performed here.
- No protocol-based node exclusion is performed here.
- Chain-only VPS/dialer-proxy behavior is never copied to pure-airport mode.
"""
from __future__ import annotations

import json
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "template.yaml"
AIRPORT = ROOT / "airport_overwrite.js"

COMMON_OBJECTS = (
    "tun", "dns", "sniffer", "hosts", "rule-providers", "rules", "sub-rules",
)
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
        if i >= 0 and (start < 0 or i < start):
            start, prefix = i, p
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


def add_assignment(text: str, marker: str, value) -> str:
    needle = "\n  return config;"
    if needle not in text:
        raise RuntimeError("return config marker not found")
    block = f'  config["{marker}"] = {js(value)};\n'
    return text.replace(needle, "\n" + block + needle, 1)


def upsert_assignment(text: str, marker: str, value) -> str:
    if f'config["{marker}"] =' in text or f"config.{marker} =" in text:
        return replace_assignment(text, marker, value)
    return add_assignment(text, marker, value)


def main() -> None:
    template = yaml.safe_load(TEMPLATE.read_text(encoding="utf-8"))
    airport = AIRPORT.read_text(encoding="utf-8")

    for key in COMMON_OBJECTS:
        if key not in template:
            raise RuntimeError(f"template missing required section: {key}")
        airport = upsert_assignment(airport, key, template[key])

    for key in COMMON_SCALARS:
        if key in template:
            airport = upsert_assignment(airport, key, template[key])

    # IMPORTANT: do not touch proxy-groups here. The airport profile intentionally
    # keeps its existing groups and UX, including DIRECT exceptions for ads and
    # remote-control tools. Do not add protocol exclusions either.

    required_markers = [
        'config["rule-providers"]', 'config["rules"]', 'config["sub-rules"]',
        'config["tun"]', 'config["dns"]', 'config["sniffer"]',
        'config["global-ua"]', 'config["geox-url"]',
    ]
    for marker in required_markers:
        if marker not in airport:
            raise RuntimeError(f"post-sync sanity check failed: {marker}")

    AIRPORT.write_text(airport, encoding="utf-8")
    print("airport_overwrite.js synchronized: common behavior only; airport groups preserved")


if __name__ == "__main__":
    main()
