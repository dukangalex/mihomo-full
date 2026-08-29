#!/usr/bin/env python3
"""Synchronize airport_overwrite.js with the public template's common behavior.

The airport script intentionally remains client-side JavaScript. This tool only
rewrites the static/common sections from template.yaml and preserves the existing
airport-specific node normalization/region grouping logic.

Run from the repository root:
    python3 tools/sync-airport-overwrite.py
Requires PyYAML (used only by the maintainer/CI, never by the client).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "template.yaml"
AIRPORT = ROOT / "airport_overwrite.js"


def js(value):
    return json.dumps(value, ensure_ascii=False, indent=2, separators=(",", ": "))


def replace_assignment(text: str, marker: str, value) -> str:
    """Replace one complete `config.<marker> = <object/array>;` assignment."""
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

    replacement = f'config["{marker}"] = {js(value)};'
    return text[:start] + replacement + text[j:]


def insert_before_return(text: str, block: str) -> str:
    needle = "\n  return config;"
    if needle not in text:
        raise RuntimeError("return config marker not found")
    return text.replace(needle, "\n" + block.rstrip() + "\n" + needle, 1)


def main() -> None:
    template = yaml.safe_load(TEMPLATE.read_text(encoding="utf-8"))
    airport = AIRPORT.read_text(encoding="utf-8")

    # Exact common sections. Chain-only proxy providers are deliberately excluded.
    for key in ("tun", "dns", "sniffer", "hosts", "rule-providers", "rules", "sub-rules"):
        if key not in template:
            raise RuntimeError(f"template missing required section: {key}")
        airport = replace_assignment(airport, key, template[key])

    # Canonical scalar/common values are applied last so old assignments cannot win.
    scalars = {
        "mode": template.get("mode", "rule"),
        "allow-lan": template.get("allow-lan", False),
        "bind-address": template.get("bind-address", "127.0.0.1"),
        "mixed-port": template.get("mixed-port", 17890),
        "log-level": template.get("log-level", "info"),
        "ipv6": template.get("ipv6", False),
        "unified-delay": template.get("unified-delay", True),
        "tcp-concurrent": template.get("tcp-concurrent", True),
        "keep-alive-interval": template.get("keep-alive-interval", 15),
        "keep-alive-idle": template.get("keep-alive-idle", 15),
        "disable-keep-alive": template.get("disable-keep-alive", False),
        "find-process-mode": template.get("find-process-mode", "strict"),
        "etag-support": template.get("etag-support", True),
        "external-controller": template.get("external-controller", "127.0.0.1:19090"),
        "global-ua": template.get("global-ua"),
        "geodata-mode": template.get("geodata-mode", True),
        "geodata-loader": template.get("geodata-loader", "memconservative"),
        "geo-auto-update": template.get("geo-auto-update", True),
        "geo-update-interval": template.get("geo-update-interval", 168),
        "profile": template.get("profile", {}),
        "ntp": template.get("ntp", {}),
        "experimental": template.get("experimental", {}),
        "external-controller-cors": template.get("external-controller-cors", {}),
        "geox-url": template.get("geox-url", {}),
    }

    # Object/scalar assignments that may already exist are normalized through a
    # generated final block. This avoids brittle regex editing of old comments.
    final = ["  // BEGIN AUTO-SYNC: template.yaml common behavior", "  var CANONICAL = " + js(scalars) + ";"]
    for k in ("mode", "allow-lan", "bind-address", "mixed-port", "log-level", "ipv6", "unified-delay", "tcp-concurrent", "keep-alive-interval", "keep-alive-idle", "disable-keep-alive", "find-process-mode", "etag-support", "external-controller", "global-ua", "geodata-mode", "geodata-loader", "geo-auto-update", "geo-update-interval"):
        final.append(f'  config[{json.dumps(k, ensure_ascii=False)}] = CANONICAL[{json.dumps(k, ensure_ascii=False)}];')
    for k in ("profile", "ntp", "experimental", "external-controller-cors", "geox-url"):
        final.append(f'  config[{json.dumps(k, ensure_ascii=False)}] = CANONICAL[{json.dumps(k, ensure_ascii=False)}];')

    # Canonical group names and UI safety. Preserve the airport script's dynamic
    # regional groups, but make common functional groups match template semantics.
    final += [
        "  // Canonical functional-group naming for the pure-airport mode.",
        "  if (config[\"proxy-groups\"] && config[\"proxy-groups\"].forEach) {",
        "    config[\"proxy-groups\"].forEach(function (g) {",
        "      if (!g || !g.name) return;",
        "      var oldName = g.name;",
        "      if (oldName === \"♻️ 自动选择\") g.name = \"机场优选\";",
        "      else if (oldName === \"⚖️ 负载均衡\") g.name = \"机场负载均衡\";",
        "      else if (oldName === \"🔰 节点选择\") g.name = \"机场手动选择\";",
        "      else if (oldName === \"📺 Media\") g.name = \"流媒体\";",
        "      else if (oldName === \"🐟 漏网之鱼\") g.name = \"漏网之鱼\";",
        "      if (g.type === \"select\" && g.proxies && g.proxies.filter) {",
        "        var mapped = [];",
        "        for (var pi = 0; pi < g.proxies.length; pi++) {",
        "          var p = g.proxies[pi];",
        "          if (p === \"♻️ 自动选择\") p = \"机场优选\";",
        "          else if (p === \"⚖️ 负载均衡\") p = \"机场负载均衡\";",
        "          else if (p === \"🔰 节点选择\") p = \"机场手动选择\";",
        "          else if (p === \"📺 Media\") p = \"流媒体\";",
        "          else if (p === \"🐟 漏网之鱼\") p = \"漏网之鱼\";",
        "          if (p === \"DIRECT\") continue;",
        "          if (mapped.indexOf(p) < 0) mapped.push(p);",
        "        }",
        "        g.proxies = mapped;",
        "      }",
        "      if (g.name === \"🔧 远控工具\") g.proxies = [\"REJECT-DROP\", \"机场优选\"];",
        "      if (g.name === \"🛑 广告拦截\") g.proxies = [\"REJECT\", \"REJECT-DROP\"];",
        "    });",
        "  }",
        "  // BEGIN AUTO-SYNC: no DIRECT option in user-visible select groups.",
        "  // DIRECT remains available only to bottom-layer rules, matching template.yaml.",
        "  // END AUTO-SYNC",
        "  // END AUTO-SYNC: template.yaml common behavior",
    ]
    airport = insert_before_return(airport, "\n".join(final))

    # Sanity checks before writing.
    required = [
        'config["rule-providers"]', 'config["rules"]', 'config["sub-rules"]',
        'config["tun"]', 'config["dns"]', 'config["sniffer"]',
        'config["global-ua"]', 'config["geox-url"]'
    ]
    for marker in required:
        if marker not in airport:
            raise RuntimeError(f"post-sync sanity check failed: {marker}")

    AIRPORT.write_text(airport, encoding="utf-8")
    print("airport_overwrite.js synchronized with template.yaml common behavior")


if __name__ == "__main__":
    main()
