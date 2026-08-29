#!/usr/bin/env python3
"""Runtime regression tests for the public endpoint generator."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "tools" / "generate-endpoint.py"
FORBIDDEN = {
    "proxy", "proxies", "vpn", "node", "nodes", "server", "servers", "tunnel", "relay",
    "gateway", "api", "admin", "bot", "clash", "mihomo", "meta", "v2ray", "vmess",
    "vless", "trojan", "shadowsocks", "ss", "ssr", "config", "configs", "yaml", "yml",
    "sub", "subs", "subscribe", "subscription", "subscriptions", "airport", "token",
    "secret", "key", "auth", "access", "download", "stream", "network", "wire",
    "connection", "connect", "client", "route", "routing", "dns", "http", "https",
    "cloud", "bridge", "shadow", "service", "services", "host", "hosts", "port", "ports",
}


def generate() -> str:
    return subprocess.check_output(["python3", str(GENERATOR)], cwd=ROOT, text=True, timeout=5).strip()


samples = [generate() for _ in range(64)]
if len(set(samples)) < 64:
    raise SystemExit("[FAIL] endpoint generator repeated a value in 64 samples")

for path in samples:
    words = path.split("-")
    if len(words) != 8:
        raise SystemExit(f"[FAIL] endpoint must contain exactly 8 words: {path}")
    if len(set(words)) != 8:
        raise SystemExit(f"[FAIL] endpoint contains duplicate words: {path}")
    if not re.fullmatch(r"[a-z]+(?:-[a-z]+){7}", path):
        raise SystemExit(f"[FAIL] endpoint contains unexpected characters: {path}")
    if any(word in FORBIDDEN for word in words):
        raise SystemExit(f"[FAIL] endpoint contains a forbidden technical word: {path}")

print("[PASS] endpoint generator: 64 unique opaque 8-word paths passed format and semantic checks")
