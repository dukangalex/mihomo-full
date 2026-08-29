#!/usr/bin/env python3
"""Generate an opaque, stable public path without hex/UUID/token syntax."""
from __future__ import annotations
import secrets

WORDS = """
apple autumn basket beach berry blanket blossom bottle branch breeze bridge brook
candle canyon carpet castle cedar cherry circle cloud coast coffee cotton meadow
corner cradle crystal curtain daisy dawn desert dinner drawer dream earth feather
field flower forest garden glass grain harbor hill honey island jacket kettle ladder
lantern leaf lemon library mirror morning mountain needle orchard paper pebble pillow
pocket pond prairie rain ribbon river rocket saddle shadow shell silver window spring
stone summer sunset table valley velvet village walnut winter willow wood yellow cabin
gentle quiet amber anchor apricot avenue bamboo barley barrel basil button cactus
canyon cherry clover cocoa compass cottage cranberry creek dolphin fabric family
flannel garden ginger golden hammock hazel jacket jasmine kernel kitchen maple marble
melon mint mitten moonlight moss muffin napkin nectar noodle olive orange pantry
peach peanut picnic pine pocket pumpkin quilt rabbit raspberry recipe robin rosemary
sailboat sesame sidewalk sunrise teapot thyme tomato tulip umbrella vanilla wagon
watermelon whisper window meadow sunlight starlight
""".split()
WORDS = list(dict.fromkeys(WORDS))

FORBIDDEN = {
    "proxy", "proxies", "vpn", "node", "nodes", "server", "servers", "tunnel", "relay",
    "gateway", "api", "admin", "bot", "clash", "mihomo", "meta", "v2ray", "vmess",
    "vless", "trojan", "shadowsocks", "ss", "ssr", "config", "configs", "yaml", "yml",
    "sub", "subs", "subscribe", "subscription", "subscriptions", "airport", "token",
    "secret", "key", "auth", "access", "download", "stream", "network", "wire",
    "connection", "connect", "client", "route", "routing", "dns", "http", "https",
}
WORDS = [w for w in WORDS if w not in FORBIDDEN]
COUNT = 12
if len(WORDS) < 128:
    raise SystemExit(f"endpoint word list is too small: {len(WORDS)}")

chosen = secrets.SystemRandom().sample(WORDS, COUNT)
path = "-".join(chosen)
if not (8 <= len(chosen) <= 16 and path.count("-") == COUNT - 1):
    raise SystemExit("endpoint generation failed")
if any(w in FORBIDDEN for w in chosen):
    raise SystemExit("endpoint semantic filter failed")
print(path)
