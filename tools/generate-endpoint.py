#!/usr/bin/env python3
"""Generate an opaque, stable-looking public path without hex/UUID/token syntax.
The path is intended to be created once during installation and then persisted.
"""
from __future__ import annotations
import secrets
import sys

WORDS = """
apple autumn basket beach berry blanket blossom bottle branch breeze bridge brook candle canyon carpet castle cedar cherry circle cloud coast coffee cotton meadow corner cradle crystal curtain daisy dawn desert dinner drawer dream earth feather field flower forest garden glass grain harbor hill honey island jacket kettle ladder lantern leaf lemon library meadow mirror morning mountain needle orchard paper pebble pillow pocket pond prairie rain ribbon river rocket saddle shadow shell silver window spring stone summer sunset table valley velvet village walnut winter willow window wood yellow breeze cabin garden gentle quiet
""".split()
WORDS = list(dict.fromkeys(WORDS))

FORBIDDEN = {
    "proxy", "proxies", "vpn", "node", "nodes", "server", "servers", "tunnel", "relay",
    "gateway", "api", "admin", "bot", "clash", "mihomo", "meta", "v2ray", "vmess",
    "vless", "trojan", "shadowsocks", "ss", "ssr", "config", "configs", "yaml", "yml",
    "sub", "subs", "subscribe", "subscription", "subscriptions", "airport", "token",
    "secret", "key", "auth", "access", "download", "stream", "cloud", "network",
    "wire", "connection", "connect", "client", "route", "routing", "dns", "http", "https",
}
WORDS = [w for w in WORDS if w not in FORBIDDEN]

COUNT = 12
if len(WORDS) < 128:
    raise SystemExit("endpoint word list is too small")

chosen = secrets.SystemRandom().sample(WORDS, COUNT)
path = "-".join(chosen)
# 12 words from >=128 choices provide >=84 bits before accounting for the
# no-repetition constraint. The path intentionally contains no hex-only/token form.
if not (8 <= len(chosen) <= 16 and path.count("-") == COUNT - 1):
    raise SystemExit("endpoint generation failed")
if any(w in FORBIDDEN for w in chosen):
    raise SystemExit("endpoint semantic filter failed")
print(path)
