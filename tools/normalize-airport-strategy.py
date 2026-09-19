#!/usr/bin/env python3
"""Normalize Airport strategy groups after the mature synchronization step.

The synchronization generator remains the source of the complete Airport
configuration. This small post-sync normalization only enforces the Airport
UI policy: non-China service groups never expose DIRECT directly; they expose
(total-node auto selection, detected region groups, node selection).
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
AIRPORT = ROOT / "airport_overwrite.js"

START = '  var AUTO_NAME = "⚡ 自动选择";'
END = '  var ruleProviderCommonDomain ='


def main() -> None:
    text = AIRPORT.read_text(encoding="utf-8")
    start = text.find(START)
    end = text.find(END, start)
    if start < 0 or end < 0:
        raise SystemExit("airport strategy-group block not found")

    block = '''  var AUTO_NAME = "⚡ 自动选择";
  var SELECT_NAME = "🚀 节点选择";
  var autoGroup = { name: AUTO_NAME, type: "url-test", "include-all": true, url: "http://www.gstatic.com/generate_204", interval: 300, tolerance: 50, icon: "" };
  var selectGroup = { name: SELECT_NAME, type: "select", proxies: [AUTO_NAME, "DIRECT"].concat(config.proxies.map(function(p) { return p.name; })), icon: "" };

  // Airport service groups: no DIRECT in non-China traffic groups.
  // Each group exposes: total-node auto selection -> detected region groups -> node selection.
  var serviceProxies = [AUTO_NAME].concat(regionNames).concat([SELECT_NAME]);
  var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT-DROP", "REJECT", "DIRECT"], icon: "" };
  var aiGroup = { name: "💬 AI 服务", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var claudeGroup = { name: "🤖 Claude AI", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var bilibiliGroup = { name: "📺 哔哩哔哩", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var youtubeGroup = { name: "📹 油管视频", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var googleGroup = { name: "🔍 谷歌服务", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var privateNetworkGroup = { name: "🏠 私有网络", type: "select", proxies: ["DIRECT", SELECT_NAME], icon: "" };
  var domesticServiceGroup = { name: "🔒 国内服务", type: "select", proxies: ["DIRECT", SELECT_NAME], icon: "" };
  var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", "DIRECT"], icon: "" };
  var telegramGroup = { name: "📲 电报消息", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var githubGroup = { name: "🐱 Github", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var microsoftGroup = { name: "Ⓜ️ 微软服务", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var appleGroup = { name: "🍏 苹果服务", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var socialGroup = { name: "🌐 社交媒体", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var streamingGroup = { name: "🎬 流媒体", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var gamesGroup = { name: "🎮 游戏平台", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var educationGroup = { name: "📚 教育资源", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var financeGroup = { name: "💰 金融服务", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var cloudGroup = { name: "☁️ 云服务", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var nonChinaGroup = { name: "🌐 非中国", type: "select", proxies: serviceProxies.slice(), icon: "" };
  var fallbackGroup = { name: "🐟 漏网之鱼", type: "select", proxies: serviceProxies.slice(), icon: "" };
  config["proxy-groups"] = [selectGroup, autoGroup, adBlockGroup, aiGroup, claudeGroup, bilibiliGroup, youtubeGroup, googleGroup, privateNetworkGroup, domesticServiceGroup, remoteToolGroup, telegramGroup, githubGroup, microsoftGroup, appleGroup, socialGroup, streamingGroup, gamesGroup, educationGroup, financeGroup, cloudGroup, nonChinaGroup, fallbackGroup].concat(regionGroups);

'''
    AIRPORT.write_text(text[:start] + block + text[end:], encoding="utf-8")


if __name__ == "__main__":
    main()
