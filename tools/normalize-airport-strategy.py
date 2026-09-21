#!/usr/bin/env python3
"""Normalize Airport strategy groups after the mature synchronization step.

The synchronization generator remains the source of the complete Airport
configuration. This post-sync normalization enforces Airport UI policy:

- non-China service groups never expose DIRECT
- each group exposes: total-node auto → rate groups → detected regions → node selection
- dedicated service groups actually receive the matching RULE-SET traffic
  (YouTube → 油管视频, Google → 谷歌服务, …) instead of collapsing into 非中国
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AIRPORT = ROOT / "airport_overwrite.js"

START = '  var AUTO_NAME = "⚡ 自动选择";'
END = '  var ruleProviderCommonDomain ='

ICON = "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color"

BLOCK = r'''  var AUTO_NAME = "⚡ 自动选择";
  var SELECT_NAME = "🚀 节点选择";
  var autoGroup = { name: AUTO_NAME, type: "url-test", "include-all": true, url: "http://www.gstatic.com/generate_204", interval: 300, tolerance: 50, icon: "''' + ICON + r'''/Auto.png" };
  var selectGroup = { name: SELECT_NAME, type: "select", proxies: [AUTO_NAME, "DIRECT"].concat(config.proxies.map(function(p) { return p.name; })), icon: "''' + ICON + r'''/Static.png" };

  // Airport service groups: no DIRECT in non-China traffic groups.
  // Each group exposes: total-node auto selection -> rate groups -> detected regions -> node selection.
  if (typeof rateNames === "undefined" || !rateNames) rateNames = [];
  if (typeof rateGroups === "undefined" || !rateGroups) rateGroups = [];
  var serviceProxies = [AUTO_NAME].concat(rateNames).concat(regionNames).concat([SELECT_NAME]);
  function pickDefault(preferred) {
    for (var i = 0; i < regionNames.length; i++) {
      if (regionNames[i] === preferred) return preferred;
    }
    return AUTO_NAME;
  }
  function serviceGroup(name, icon, preferred) {
    var g = { name: name, type: "select", proxies: serviceProxies.slice(), icon: icon || "" };
    if (preferred) g["default-selected"] = pickDefault(preferred);
    return g;
  }

  var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT-DROP", "REJECT", "DIRECT"], icon: "''' + ICON + r'''/Advertising.png" };
  var aiGroup = serviceGroup("💬 AI 服务", "''' + ICON + r'''/ChatGPT.png", "🇺🇸 美国节点");
  var geminiGroup = serviceGroup("✨ Gemini", "''' + ICON + r'''/Google_Search.png", "🇺🇸 美国节点");
  var claudeGroup = serviceGroup("🤖 Claude AI", "''' + ICON + r'''/ChatGPT.png", "🇺🇸 美国节点");
  var fcmGroup = serviceGroup("🔔 FCM", "''' + ICON + r'''/Google_Search.png", "");
  var bilibiliGroup = serviceGroup("📺 哔哩哔哩", "''' + ICON + r'''/bilibili.png", "");
  var youtubeGroup = serviceGroup("📹 油管视频", "''' + ICON + r'''/YouTube.png", "");
  var googleGroup = serviceGroup("🔍 谷歌服务", "''' + ICON + r'''/Google_Search.png", "");
  var privateNetworkGroup = { name: "🏠 私有网络", type: "select", proxies: ["DIRECT", SELECT_NAME], icon: "''' + ICON + r'''/Available.png" };
  var domesticServiceGroup = { name: "🔒 国内服务", type: "select", proxies: ["DIRECT", SELECT_NAME], icon: "''' + ICON + r'''/China.png" };
  var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", "DIRECT"], icon: "''' + ICON + r'''/Bypass.png" };
  var telegramGroup = serviceGroup("📲 电报消息", "''' + ICON + r'''/Telegram.png", "");
  var githubGroup = serviceGroup("🐱 Github", "''' + ICON + r'''/GitHub.png", "");
  var microsoftGroup = serviceGroup("Ⓜ️ 微软服务", "''' + ICON + r'''/Microsoft.png", "");
  var appleGroup = serviceGroup("🍏 苹果服务", "''' + ICON + r'''/Apple.png", "");
  var tiktokGroup = serviceGroup("📱 TikTok", "''' + ICON + r'''/TikTok.png", "🇯🇵 日本节点");
  var twitterGroup = serviceGroup("🐦 Twitter", "''' + ICON + r'''/Twitter.png", "");
  var metaGroup = serviceGroup("📘 Meta", "''' + ICON + r'''/Facebook.png", "");
  var lineGroup = serviceGroup("💬 Line", "''' + ICON + r'''/Line.png", "🇯🇵 日本节点");
  var socialGroup = serviceGroup("🌐 社交媒体", "''' + ICON + r'''/Twitter.png", "");
  var netflixGroup = serviceGroup("📺 Netflix", "''' + ICON + r'''/Netflix.png", "");
  var spotifyGroup = serviceGroup("🎵 Spotify", "''' + ICON + r'''/Spotify.png", "");
  var streamingGroup = serviceGroup("🎬 流媒体", "''' + ICON + r'''/Video.png", "");
  var steamGroup = serviceGroup("🎮 Steam", "''' + ICON + r'''/Steam.png", "");
  var gamesGroup = serviceGroup("🎮 游戏平台", "''' + ICON + r'''/Game.png", "");
  var pikpakGroup = serviceGroup("📦 PikPak", "''' + ICON + r'''/Cloud.png", "");
  var cryptoGroup = serviceGroup("🪙 Crypto", "''' + ICON + r'''/Bitcoin.png", "🇯🇵 日本节点");
  var educationGroup = serviceGroup("📚 教育资源", "''' + ICON + r'''/Scholar.png", "");
  var financeGroup = serviceGroup("💰 金融服务", "''' + ICON + r'''/PayPal.png", "");
  var cloudGroup = serviceGroup("☁️ 云服务", "''' + ICON + r'''/Cloud.png", "");
  var nonChinaGroup = serviceGroup("🌐 非中国", "''' + ICON + r'''/Global.png", "");
  var fallbackGroup = serviceGroup("🐟 漏网之鱼", "''' + ICON + r'''/Stack.png", "");
  config["proxy-groups"] = [selectGroup, autoGroup, adBlockGroup, aiGroup, geminiGroup, claudeGroup, fcmGroup, bilibiliGroup, youtubeGroup, googleGroup, privateNetworkGroup, domesticServiceGroup, remoteToolGroup, telegramGroup, githubGroup, microsoftGroup, appleGroup, tiktokGroup, twitterGroup, metaGroup, lineGroup, socialGroup, netflixGroup, spotifyGroup, streamingGroup, steamGroup, gamesGroup, pikpakGroup, cryptoGroup, educationGroup, financeGroup, cloudGroup, nonChinaGroup, fallbackGroup].concat(rateGroups).concat(regionGroups);

'''


def main() -> None:
    text = AIRPORT.read_text(encoding="utf-8")
    start = text.find(START)
    end = text.find(END, start)
    if start < 0 or end < 0:
        raise SystemExit("airport strategy-group block not found")
    AIRPORT.write_text(text[:start] + BLOCK + text[end:], encoding="utf-8")


if __name__ == "__main__":
    main()
