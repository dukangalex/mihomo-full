#!/usr/bin/env python3
"""Generate an opaque public path without token/hash/UUID syntax."""
from __future__ import annotations
import secrets

# Ordinary, non-technical words. The path should not visually resemble a
# proxy token, node identifier, API key, UUID, or hash.
WORDS = """
apple autumn basket beach berry blanket blossom bottle branch breeze brook
candle canyon carpet castle cedar cherry circle coast coffee cotton meadow
corner cradle crystal curtain daisy dawn desert dinner drawer dream earth feather
field flower forest garden glass grain hill honey island jacket kettle ladder
lantern leaf lemon library mirror morning mountain needle orchard paper pebble pillow
pocket pond prairie rain ribbon river saddle shell silver window spring
stone summer sunset table valley velvet village walnut winter willow wood yellow cabin
gentle quiet amber anchor apricot avenue bamboo barley barrel basil button cactus
clover cocoa cottage cranberry creek dolphin fabric family flannel ginger golden
hammock hazel jasmine kernel kitchen maple marble melon mint mitten moonlight moss
muffin napkin nectar noodle olive orange pantry peach peanut picnic pine pumpkin
quilt rabbit raspberry recipe robin rosemary sailboat sesame sidewalk sunrise teapot
thyme tomato tulip umbrella vanilla wagon watermelon whisper sunlight starlight
""".split()
WORDS = list(dict.fromkeys(WORDS))

# Keep technical/network/security words out even if the word list is expanded later.
FORBIDDEN = {
    "proxy", "proxies", "vpn", "node", "nodes", "server", "servers", "tunnel", "relay",
    "gateway", "api", "admin", "bot", "clash", "mihomo", "meta", "v2ray", "vmess",
    "vless", "trojan", "shadowsocks", "ss", "ssr", "config", "configs", "yaml", "yml",
    "sub", "subs", "subscribe", "subscription", "subscriptions", "airport", "token",
    "secret", "key", "auth", "access", "download", "stream", "network", "wire",
    "connection", "connect", "client", "route", "routing", "dns", "http", "https",
    "cloud", "bridge", "shadow", "service", "services", "host", "hosts", "port", "ports",
}
WORDS = [w for w in WORDS if w not in FORBIDDEN]
COUNT = 8
if len(WORDS) < 128:
    raise SystemExit(f"endpoint word list is too small: {len(WORDS)}")

chosen = secrets.SystemRandom().sample(WORDS, COUNT)
path = "-".join(chosen)
if not (COUNT == 8 and len(chosen) == COUNT and path.count("-") == COUNT - 1):
    raise SystemExit("endpoint generation failed")
if any(w in FORBIDDEN for w in chosen):
    raise SystemExit("endpoint semantic filter failed")
print(path)
