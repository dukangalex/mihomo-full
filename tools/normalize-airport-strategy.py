#!/usr/bin/env python3
"""Normalize Airport strategy groups after the mature synchronization step.

Airport UI policy after the MyClash merge:

- MY 100+ region three-layer groups stay (auto-detect + hidden url-test/load-balance)
- MY security baseline stays (ads, remote tools, phishing, STUN/QUIC)
- Service groups follow MyClash: dedicated exits, 直连 only on CN-like apps
- Homogeneous catch-alls (Gemini/Claude clones, 流媒体, 社交媒体, 游戏平台,
  云服务, 教育资源, 金融服务, 非中国, 私有网络, 国内服务, Github) are removed
- 哔哩哔哩 is a real group with 直连 first (not a dead bottom-layer DIRECT)
- Emby / EHentai come from MyClash (no extra MRS files; domain/process rules)
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AIRPORT = ROOT / "airport_overwrite.js"

START = '  var AUTO_NAME = "⚡ 自动选择";'
END = '  var ruleProviderCommonDomain ='

ICON = "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color"
MYCLASH_ICON = "https://fastly.jsdelivr.net/gh/AIsouler/MyClash@main/Icons/svg"

BLOCK = r'''  var AUTO_NAME = "⚡ 自动选择";
  var LB_NAME = "⚖️ 负载均衡";
  var SELECT_NAME = "🚀 节点选择";
  var DEFAULT_NAME = "默认代理";
  var DIRECT_GROUP = "直连";

  var DIRECT_NODES = [
    { name: "🇨🇳 直连 | 双栈", type: "direct" },
    { name: "🇨🇳 直连 | IPv4优先", type: "direct", "ip-version": "ipv4-prefer" },
    { name: "🇨🇳 直连 | IPv6优先", type: "direct", "ip-version": "ipv6-prefer" },
    { name: "🇨🇳 直连 | 仅IPv4", type: "direct", "ip-version": "ipv4" },
    { name: "🇨🇳 直连 | 仅IPv6", type: "direct", "ip-version": "ipv6" }
  ];
  var seenProxyNames = {};
  for (var spi = 0; spi < config.proxies.length; spi++) {
    seenProxyNames[String(config.proxies[spi].name || "")] = true;
  }
  for (var dni = 0; dni < DIRECT_NODES.length; dni++) {
    if (!seenProxyNames[DIRECT_NODES[dni].name]) config.proxies.push(DIRECT_NODES[dni]);
  }
  var directNames = [];
  for (var dnj = 0; dnj < DIRECT_NODES.length; dnj++) directNames.push(DIRECT_NODES[dnj].name);

  if (typeof rateNames === "undefined" || !rateNames) rateNames = [];
  if (typeof rateGroups === "undefined" || !rateGroups) rateGroups = [];

  var autoGroup = { name: AUTO_NAME, type: "url-test", "include-all": true, "exclude-type": "DIRECT", url: "https://www.gstatic.com/generate_204", interval: 180, tolerance: 35, timeout: 3000, "expected-status": 204, "max-failed-times": 2, icon: "''' + ICON + r'''/Auto.png" };
  var lbGroup = { name: LB_NAME, type: "load-balance", strategy: "sticky-sessions", "include-all": true, "exclude-type": "DIRECT", url: "https://www.gstatic.com/generate_204", interval: 180, timeout: 3000, "expected-status": 204, icon: "''' + ICON + r'''/Round_Robin.png" };
  var selectGroup = { name: SELECT_NAME, type: "select", proxies: [AUTO_NAME, LB_NAME].concat(rateNames).concat(regionNames), icon: "''' + ICON + r'''/Static.png" };
  var defaultGroup = { name: DEFAULT_NAME, type: "select", proxies: [AUTO_NAME, LB_NAME].concat(rateNames).concat(regionNames).concat([SELECT_NAME]), icon: "''' + ICON + r'''/Proxy.png" };
  var directGroup = { name: DIRECT_GROUP, type: "select", proxies: directNames, icon: "''' + ICON + r'''/China.png" };

  var serviceProxies = [DEFAULT_NAME, AUTO_NAME, LB_NAME].concat(rateNames).concat(regionNames).concat([SELECT_NAME]);
  function pickDefault(preferred) {
    if (preferred === DIRECT_GROUP) return DIRECT_GROUP;
    for (var i = 0; i < regionNames.length; i++) {
      if (regionNames[i] === preferred) return preferred;
    }
    return DEFAULT_NAME;
  }
  function serviceGroup(name, icon, preferred, withDirect, directFirst) {
    var proxies;
    if (withDirect && directFirst) proxies = [DIRECT_GROUP].concat(serviceProxies);
    else if (withDirect) proxies = serviceProxies.concat([DIRECT_GROUP]);
    else proxies = serviceProxies.slice();
    var g = { name: name, type: "select", proxies: proxies, icon: icon || "" };
    if (preferred) g["default-selected"] = pickDefault(preferred);
    return g;
  }

  var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT-DROP", "REJECT", DIRECT_GROUP], icon: "''' + ICON + r'''/Advertising.png" };
  var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", DEFAULT_NAME, DIRECT_GROUP], icon: "''' + ICON + r'''/Bypass.png" };
  var aiGroup = serviceGroup("💬 AI Services", "''' + ICON + r'''/ChatGPT.png", "🇺🇸 美国节点", false, false);
  var fcmGroup = serviceGroup("🔔 FCM", "''' + ICON + r'''/Google_Search.png", DIRECT_GROUP, true, true);
  var bilibiliGroup = serviceGroup("📺 Bilibili", "''' + ICON + r'''/bilibili.png", DIRECT_GROUP, true, true);
  var youtubeGroup = serviceGroup("📹 YouTube", "''' + ICON + r'''/YouTube.png", "", false, false);
  var googleGroup = serviceGroup("🔍 Google", "''' + ICON + r'''/Google_Search.png", "", false, false);
  var telegramGroup = serviceGroup("📲 Telegram", "''' + ICON + r'''/Telegram.png", "", false, false);
  var microsoftGroup = serviceGroup("Ⓜ️ Microsoft", "''' + ICON + r'''/Microsoft.png", "", true, false);
  var appleGroup = serviceGroup("🍏 Apple", "''' + ICON + r'''/Apple.png", "", true, false);
  var tiktokGroup = serviceGroup("📱 TikTok", "''' + ICON + r'''/TikTok.png", "🇯🇵 日本节点", false, false);
  var twitterGroup = serviceGroup("🐦 Twitter", "''' + ICON + r'''/Twitter.png", "", false, false);
  var metaGroup = serviceGroup("📘 Meta", "''' + ICON + r'''/Facebook.png", "", false, false);
  var lineGroup = serviceGroup("💬 Line", "''' + ICON + r'''/Line.png", "🇯🇵 日本节点", false, false);
  var netflixGroup = serviceGroup("📺 Netflix", "''' + ICON + r'''/Netflix.png", "", false, false);
  var embyGroup = serviceGroup("🎬 Emby", "''' + MYCLASH_ICON + r'''/Emby.svg", "", true, false);
  var spotifyGroup = serviceGroup("🎵 Spotify", "''' + ICON + r'''/Spotify.png", "", true, false);
  var steamGroup = serviceGroup("🎮 Steam", "''' + ICON + r'''/Steam.png", "", true, false);
  var pikpakGroup = serviceGroup("📦 PikPak", "''' + ICON + r'''/Cloud.png", "", true, false);
  var cryptoGroup = serviceGroup("🪙 Crypto", "''' + ICON + r'''/Bitcoin.png", "🇯🇵 日本节点", false, false);
  var ehentaiGroup = serviceGroup("📖 EHentai", "''' + MYCLASH_ICON + r'''/Ehentai.svg", "🇺🇸 美国节点", true, false);
  var fallbackGroup = { name: "🐟 Final", type: "select", proxies: [DEFAULT_NAME, DIRECT_GROUP, AUTO_NAME, LB_NAME].concat(rateNames).concat(regionNames).concat([SELECT_NAME]), icon: "''' + ICON + r'''/Stack.png" };

  config["proxy-groups"] = [defaultGroup, selectGroup, autoGroup, lbGroup, directGroup, adBlockGroup, remoteToolGroup, aiGroup, fcmGroup, bilibiliGroup, youtubeGroup, googleGroup, telegramGroup, microsoftGroup, appleGroup, tiktokGroup, twitterGroup, metaGroup, lineGroup, netflixGroup, embyGroup, spotifyGroup, steamGroup, pikpakGroup, cryptoGroup, ehentaiGroup, fallbackGroup].concat(rateGroups).concat(regionGroups);

'''


def main() -> None:
    text = AIRPORT.read_text(encoding="utf-8")
    start = text.find(START)
    end = text.find(END, start)
    if start < 0 or end < 0:
        raise SystemExit("airport strategy-group block not found")
    normalized = text[:start] + BLOCK + text[end:]
    # Keep the Airport strategy rule target aligned with the canonical YouTube group.
    normalized = normalized.replace(",📹 YouTube", ",📹 YouTube")
    AIRPORT.write_text(normalized, encoding="utf-8")


if __name__ == "__main__":
    main()
