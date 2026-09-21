#!/usr/bin/env python3
"""Synchronize template public behavior into the non-chain Airport overwrite."""
from __future__ import annotations
import argparse, json, re
from pathlib import Path
import yaml
ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "template.yaml"
AIRPORT = ROOT / "airport_overwrite.js"
COMMON_OBJECTS = ("tun", "dns", "sniffer", "hosts", "rule-providers", "rules", "sub-rules")
COMMON_SCALARS = ("mode", "allow-lan", "bind-address", "mixed-port", "log-level", "ipv6", "unified-delay", "tcp-concurrent", "keep-alive-interval", "keep-alive-idle", "disable-keep-alive", "find-process-mode", "etag-support", "external-controller", "global-ua", "geodata-mode", "geodata-loader", "geo-auto-update", "geo-update-interval", "profile", "ntp", "experimental", "external-controller-cors", "geox-url")
FORBIDDEN_CHAIN_MARKERS = ("EXIT_NODES", "EXIT_URL", "落地优选出口", "fallback.*落地", "dialer-proxy", "proxy-dialer")

def js(value): return json.dumps(value, ensure_ascii=False, indent=2, separators=(",", ": "))

def _find_assignment(text, marker):
    found=[]
    for pattern in (f'config["{marker}"] =', f"config.{marker} ="):
        i=text.find(pattern)
        if i>=0: found.append((i,pattern))
    return min(found,key=lambda x:x[0]) if found else (-1,None)

def replace_assignment(text, marker, value):
    start,prefix=_find_assignment(text,marker)
    if start<0: raise RuntimeError(f"assignment not found: {marker}")
    eq=text.find("=",start,start+len(prefix)+3); i=eq+1
    while i<len(text) and text[i].isspace(): i+=1
    if i>=len(text) or text[i] not in "[{": raise RuntimeError(f"assignment is not object/array: {marker}")
    opening=text[i]; closing="]" if opening=="[" else "}"; depth=0; quote=None; escape=False; j=i
    while j<len(text):
        c=text[j]
        if quote:
            if escape: escape=False
            elif c=="\\": escape=True
            elif c==quote: quote=None
        else:
            if c in "'\"`": quote=c
            elif c==opening: depth+=1
            elif c==closing:
                depth-=1
                if depth==0:
                    j+=1
                    while j<len(text) and text[j].isspace(): j+=1
                    if j<len(text) and text[j]==";": j+=1
                    break
        j+=1
    else: raise RuntimeError(f"unterminated assignment: {marker}")
    return text[:start]+f'config["{marker}"] = {js(value)};'+text[j:]

def replace_scalar(text, marker, value):
    start,prefix=_find_assignment(text,marker); value_js=js(value)
    if start<0:
        needle="\n  return config;"
        if needle not in text: raise RuntimeError("return config marker not found")
        return text.replace(needle,f'\n  config["{marker}"] = {value_js};\n'+needle,1)
    eq=text.find("=",start,start+len(prefix)+3); i=eq+1
    while i<len(text) and text[i].isspace(): i+=1
    if i>=len(text): raise RuntimeError(f"invalid assignment: {marker}")
    if text[i] in "[{": return replace_assignment(text,marker,value)
    if text[i] in "'\"`":
        quote=text[i]; j=i+1; escape=False
        while j<len(text):
            ch=text[j]
            if escape: escape=False
            elif ch=="\\": escape=True
            elif ch==quote:
                j+=1
                while j<len(text) and text[j].isspace(): j+=1
                if j<len(text) and text[j]==";": j+=1
                break
            j+=1
        else: raise RuntimeError(f"unterminated string assignment: {marker}")
    else:
        j=text.find(";",i)
        if j<0: raise RuntimeError(f"unterminated scalar assignment: {marker}")
        j+=1
    return text[:start]+f'config["{marker}"] = {value_js};'+text[j:]

def add_assignment(text,marker,value):
    needle="\n  return config;"
    if needle not in text: raise RuntimeError("return config marker not found")
    return text.replace(needle,f'\n  config["{marker}"] = {js(value)};\n'+needle,1)

def upsert_object(text,marker,value):
    start,_=_find_assignment(text,marker)
    return replace_assignment(text,marker,value) if start>=0 else add_assignment(text,marker,value)

def enforce_full_overwrite_contract(text):
    replacement=('  var sourceConfig = config || {};\n  var originalProxies = sourceConfig.proxies || [];\n'
                 '  // Full-overwrite contract: every airport-supplied field except proxies is discarded.\n  config = {};')
    if replacement in text: return text
    already=('  var sourceConfig = config || {};\n  var originalProxies = sourceConfig.proxies || [];\n  config = {};')
    if already in text:
        return text.replace(already, replacement, 1)
    anchor='  var originalProxies = config.proxies || [];'
    if anchor not in text: raise RuntimeError("full-overwrite anchor not found: expected config.proxies capture")
    if '  var sourceConfig = config || {};' in text or '  // Full-overwrite contract:' in text: raise RuntimeError("partial full-overwrite transformation detected")
    return text.replace(anchor,replacement,1)

def ensure_airport_node_sanitizer(text):
    marker="  // BEGIN AIRPORT NODE SANITIZER"
    if marker in text: return text
    needle="\n  return config;"
    block='''
  // BEGIN AIRPORT NODE SANITIZER
  if (config.proxies && config.proxies.length) {
    var airportChainKey = "dialer-" + "proxy";
    var airportLegacyChainKey = "proxy-" + "dialer";
    for (var api = 0; api < config.proxies.length; api++) {
      var airportProxy = config.proxies[api];
      if (!airportProxy || typeof airportProxy !== "object") continue;
      if (airportProxy[airportChainKey] != null) delete airportProxy[airportChainKey];
      if (airportProxy[airportLegacyChainKey] != null) delete airportProxy[airportLegacyChainKey];
    }
  }
  // END AIRPORT NODE SANITIZER
'''
    if needle not in text: raise RuntimeError("return config marker not found for airport node sanitizer")
    return text.replace(needle,block+needle,1)

def restore_airport_exceptions(text):
    text=re.sub(r'^\s*"geosite:category-ads-all":\s*"rcode://name_error",\s*\n',"",text,flags=re.MULTILINE)
    text=re.sub(r'^\s*var privateGroup = .*?;\s*\n',"",text,flags=re.MULTILINE)
    text=re.sub(r'^\s*var domesticGroup = .*?;\s*\n',"",text,flags=re.MULTILINE)
    return text

RULESET_TARGET = {
    "google-gemini": "💬 AI Services",
    "anthropic": "💬 AI Services",
    "openai": "💬 AI Services",
    "category-ai-!cn": "💬 AI Services",
    "category-ads-all": "🛑 广告拦截",
    "youtube": "📹 YouTube",
    "google": "🔍 Google",
    "google-ip": "🔍 Google",
    "googlefcm": "🔔 FCM",
    "github": "默认代理",
    "gitlab": "默认代理",
    "apple": "🍏 Apple",
    "icloud": "🍏 Apple",
    "microsoft": "Ⓜ️ Microsoft",
    "telegram": "📲 Telegram",
    "telegram-ip": "📲 Telegram",
    "tiktok": "📱 TikTok",
    "twitter": "🐦 Twitter",
    "twitter-ip": "🐦 Twitter",
    "facebook": "📘 Meta",
    "facebook-ip": "📘 Meta",
    "instagram": "📘 Meta",
    "meta": "📘 Meta",
    "line": "💬 Line",
    "discord": "默认代理",
    "snapchat": "默认代理",
    "linkedin": "默认代理",
    "netflix": "📺 Netflix",
    "netflix-ip": "📺 Netflix",
    "spotify": "🎵 Spotify",
    "hulu": "默认代理",
    "disney": "默认代理",
    "hbo": "默认代理",
    "amazon": "默认代理",
    "bahamut": "默认代理",
    "biliintl": "📺 Bilibili",
    "bilibili": "📺 Bilibili",
    "abema": "默认代理",
    "bbc": "默认代理",
    "steam": "🎮 Steam",
    "epicgames": "🎮 Steam",
    "ea": "🎮 Steam",
    "ubisoft": "🎮 Steam",
    "blizzard": "🎮 Steam",
    "paypal": "默认代理",
    "cryptocurrency": "🪙 Crypto",
    "aws": "默认代理",
    "azure": "默认代理",
    "dropbox": "默认代理",
    "onedrive": "默认代理",
    "cloudflare-ip": "默认代理",
    "cloudfront-ip": "默认代理",
    "fastly-ip": "默认代理",
    "category-scholar-!cn": "默认代理",
    "pikpak": "📦 PikPak",
    "geolocation-!cn": "默认代理",
}
GROUP_TARGET = {
    "AI服务": "💬 AI Services",
    "国外服务": "默认代理",
    "流媒体": "默认代理",
    "漏网之鱼": "🐟 Final",
    "远控工具": "🔧 远控工具",
}
DOMAIN_TARGET = {
    "claude.ai": "💬 AI Services",
    "anthropic.com": "💬 AI Services",
    "a-cdn.anthropic.com": "💬 AI Services",
    "assets-proxy.anthropic.com": "💬 AI Services",
    "gemini.google.com": "💬 AI Services",
    "aistudio.google.com": "💬 AI Services",
}
PROCESS_TARGET = {
    "*revanced*": "📹 YouTube",
    "*youtube*": "📹 YouTube",
}
REQUIRED_AIRPORT_GROUPS = (
    "默认代理", "🚀 节点选择", "⚡ 自动选择", "⚖️ 负载均衡", "直连",
    "🛑 广告拦截", "🔧 远控工具", "💬 AI Services", "🔔 FCM", "📺 Bilibili",
    "📹 YouTube", "🔍 Google", "📲 Telegram", "Ⓜ️ Microsoft", "🍏 Apple",
    "📱 TikTok", "🐦 Twitter", "📘 Meta", "💬 Line", "📺 Netflix", "🎬 Emby",
    "🎵 Spotify", "🎮 Steam", "📦 PikPak", "🪙 Crypto", "📖 EHentai", "🐟 Final",
)
BANNED_AIRPORT_GROUPS = (
    "✨ Gemini", "🤖 Claude AI", "🏠 私有网络", "🔒 国内服务", "🐱 Github",
    "🌐 社交媒体", "🎬 流媒体", "🎮 游戏平台", "📚 教育资源", "💰 金融服务",
    "☁️ 云服务", "🌐 非中国",
)
DEAD_RULESET_URLS = (
    "/geo/geosite/gemini.mrs",
    "/geo/geosite/claude.mrs",
    "/geo/geoip/youtube.mrs",
)
BILIBILI_RULE = "RULE-SET,bilibili,📺 Bilibili"
AIRPORT_ONLY_RULES = (
    "DOMAIN-SUFFIX,mb3admin.com,🎬 Emby",
    "DOMAIN-SUFFIX,nubebelle.com,🎬 Emby",
    "DOMAIN-KEYWORD,emby,🎬 Emby",
    "PROCESS-NAME,com.mb.android,🎬 Emby",
    "PROCESS-NAME,tv.emby.embyatv,🎬 Emby",
    "PROCESS-NAME,com.hush.yamby,🎬 Emby",
    "PROCESS-NAME,com.jellycine.app,🎬 Emby",
    "PROCESS-NAME,com.mountains.hills,🎬 Emby",
    "PROCESS-NAME,RodelPlayer.App.exe,🎬 Emby",
    "PROCESS-NAME,com.feifeiduck.capyplayer,🎬 Emby",
    "DOMAIN-SUFFIX,e-hentai.org,📖 EHentai",
    "DOMAIN-SUFFIX,exhentai.org,📖 EHentai",
    "DOMAIN-SUFFIX,ehgt.org,📖 EHentai",
    "DOMAIN-SUFFIX,hath.network,📖 EHentai",
    "DOMAIN-SUFFIX,e-hentai.to,📖 EHentai",
)


def remap_one_rule(rule):
    if not isinstance(rule, str):
        return rule
    parts = rule.split(",")
    if len(parts) < 2:
        return rule
    no_resolve = parts[-1] == "no-resolve" and len(parts) >= 3
    target_idx = -2 if no_resolve else -1
    kind = parts[0]
    if kind == "RULE-SET" and len(parts) >= 3 and parts[1] in RULESET_TARGET:
        parts[target_idx] = RULESET_TARGET[parts[1]]
        return ",".join(parts)
    if kind in ("DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD") and len(parts) >= 3 and parts[1] in DOMAIN_TARGET:
        parts[target_idx] = DOMAIN_TARGET[parts[1]]
        return ",".join(parts)
    if kind.startswith("PROCESS-NAME") and len(parts) >= 3 and parts[1] in PROCESS_TARGET:
        parts[target_idx] = PROCESS_TARGET[parts[1]]
        return ",".join(parts)
    if parts[target_idx] in GROUP_TARGET:
        parts[target_idx] = GROUP_TARGET[parts[target_idx]]
    return ",".join(parts)


def remap_airport_rules(rules):
    out = []
    seen = set()
    injected = False
    extras_injected = False
    for rule in rules or []:
        mapped = remap_one_rule(rule)
        if (
            not injected
            and isinstance(mapped, str)
            and mapped.startswith("SUB-RULE,")
            and BILIBILI_RULE not in seen
        ):
            out.append(BILIBILI_RULE)
            seen.add(BILIBILI_RULE)
            injected = True
        if (
            not extras_injected
            and isinstance(mapped, str)
            and mapped.startswith("MATCH,")
        ):
            for extra in AIRPORT_ONLY_RULES:
                if extra not in seen:
                    out.append(extra)
                    seen.add(extra)
            extras_injected = True
        if mapped in seen:
            continue
        seen.add(mapped)
        out.append(mapped)
    if not injected and BILIBILI_RULE not in seen:
        out.append(BILIBILI_RULE)
    if not extras_injected:
        for extra in AIRPORT_ONLY_RULES:
            if extra not in seen:
                out.append(extra)
                seen.add(extra)
    return out


def tune_sub_rules(sub):
    if not isinstance(sub, dict):
        return sub
    drop = {"RULE-SET,bilibili,DIRECT", BILIBILI_RULE}
    out = {}
    for key, rules in sub.items():
        cleaned = []
        for rule in rules or []:
            if rule in drop:
                continue
            cleaned.append(rule)
        out[key] = cleaned
    return out


def apply_airport_strategy_groups(text):
    start=text.find('  var AUTO_NAME = "♻️ 自动选择";')
    if start < 0:
        start=text.find('  var AUTO_NAME = "⚡ 自动选择";')
    end=text.find('  var ruleProviderCommonDomain =',start)
    if start<0 or end<0: raise RuntimeError("airport strategy-group block not found")
    block='''  var AUTO_NAME = "⚡ 自动选择";
  var LB_NAME = "⚖️ 负载均衡";
  var SELECT_NAME = "🚀 节点选择";
  var DEFAULT_NAME = "默认代理";
  var DIRECT_GROUP = "直连";
  var autoGroup = { name: AUTO_NAME, type: "url-test", "include-all": true, "exclude-type": "DIRECT", url: "https://www.gstatic.com/generate_204", interval: 180, tolerance: 35, icon: "" };
  var lbGroup = { name: LB_NAME, type: "load-balance", strategy: "sticky-sessions", "include-all": true, "exclude-type": "DIRECT", url: "https://www.gstatic.com/generate_204", interval: 180, icon: "" };
  var selectGroup = { name: SELECT_NAME, type: "select", proxies: [AUTO_NAME, LB_NAME].concat(regionNames), icon: "" };
  var defaultGroup = { name: DEFAULT_NAME, type: "select", proxies: [AUTO_NAME, LB_NAME].concat(regionNames).concat([SELECT_NAME]), icon: "" };
  var directGroup = { name: DIRECT_GROUP, type: "select", proxies: ["DIRECT"], icon: "" };
  var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT-DROP", "REJECT", DIRECT_GROUP], icon: "" };
  var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", DEFAULT_NAME, DIRECT_GROUP], icon: "" };
  var aiGroup = { name: "💬 AI Services", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var fcmGroup = { name: "🔔 FCM", type: "select", proxies: [DIRECT_GROUP, DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var bilibiliGroup = { name: "📺 Bilibili", type: "select", proxies: [DIRECT_GROUP, DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var youtubeGroup = { name: "📹 YouTube", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var googleGroup = { name: "🔍 Google", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var telegramGroup = { name: "📲 Telegram", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var microsoftGroup = { name: "Ⓜ️ Microsoft", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME, DIRECT_GROUP], icon: "" };
  var appleGroup = { name: "🍏 Apple", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME, DIRECT_GROUP], icon: "" };
  var tiktokGroup = { name: "📱 TikTok", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var twitterGroup = { name: "🐦 Twitter", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var metaGroup = { name: "📘 Meta", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var lineGroup = { name: "💬 Line", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var netflixGroup = { name: "📺 Netflix", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var embyGroup = { name: "🎬 Emby", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME, DIRECT_GROUP], icon: "" };
  var spotifyGroup = { name: "🎵 Spotify", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME, DIRECT_GROUP], icon: "" };
  var steamGroup = { name: "🎮 Steam", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME, DIRECT_GROUP], icon: "" };
  var pikpakGroup = { name: "📦 PikPak", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME, DIRECT_GROUP], icon: "" };
  var cryptoGroup = { name: "🪙 Crypto", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME], icon: "" };
  var ehentaiGroup = { name: "📖 EHentai", type: "select", proxies: [DEFAULT_NAME, AUTO_NAME, SELECT_NAME, DIRECT_GROUP], icon: "" };
  var fallbackGroup = { name: "🐟 Final", type: "select", proxies: [DEFAULT_NAME, DIRECT_GROUP, AUTO_NAME, SELECT_NAME], icon: "" };
  config["proxy-groups"] = [defaultGroup, selectGroup, autoGroup, lbGroup, directGroup, adBlockGroup, remoteToolGroup, aiGroup, fcmGroup, bilibiliGroup, youtubeGroup, googleGroup, telegramGroup, microsoftGroup, appleGroup, tiktokGroup, twitterGroup, metaGroup, lineGroup, netflixGroup, embyGroup, spotifyGroup, steamGroup, pikpakGroup, cryptoGroup, ehentaiGroup, fallbackGroup];

'''
    return text[:start]+block+text[end:]

def map_airport_targets(text):
    # Rules are remapped in Python before JSON dump. Keep a conservative
    # leftover-name pass so unsynced template group names never leak.
    for src, dst in GROUP_TARGET.items():
        text = re.sub(r"," + re.escape(src) + r'(?=")', "," + dst, text)
        text = text.replace("," + src + ",no-resolve", "," + dst + ",no-resolve")
    return text

def assert_no_chain_features(text):
    for marker in FORBIDDEN_CHAIN_MARKERS:
        if re.search(marker,text,flags=re.IGNORECASE): raise RuntimeError("forbidden chain-mode feature remains in Airport overwrite: "+marker)
    for group in ("落地优选出口","前置机场","VPS落地","EXIT_NODES"):
        if group in text: raise RuntimeError("forbidden chain-mode group remains in Airport overwrite: "+group)

def validate_airport(text):
    required=('config["rule-providers"]','config["rules"]','config["sub-rules"]','config["tun"]','config["dns"]','config["sniffer"]','config["global-ua"]','config["geox-url"]')
    for marker in required:
        if marker not in text: raise RuntimeError(f"post-sync sanity check failed: {marker}")
    if 'var sourceConfig = config || {};' not in text or 'var originalProxies = sourceConfig.proxies || [];' not in text: raise RuntimeError("airport full-overwrite contract is missing")
    if text.count('  config = {};')!=1: raise RuntimeError("airport full-overwrite contract must reset config exactly once")
    if text.find('  config = {};')<text.find('  var originalProxies = sourceConfig.proxies || []'): raise RuntimeError("airport proxies must be captured before config reset")
    if '"RULE-SET,category-ads-all,🛑 广告拦截"' not in text: raise RuntimeError("airport ad rule is not connected to the ad group")
    if '"DOMAIN-SUFFIX,claude.ai,💬 AI Services"' not in text: raise RuntimeError("Claude.ai rule is missing")
    if '"RULE-SET,youtube,📹 YouTube"' not in text: raise RuntimeError("YouTube must route to the dedicated YouTube group")
    if '"RULE-SET,google,🔍 Google"' not in text: raise RuntimeError("Google must route to the dedicated Google group")
    if BILIBILI_RULE not in text and '"RULE-SET,bilibili,📺 Bilibili"' not in text: raise RuntimeError("Bilibili must route to the dedicated Bilibili group")
    if '"DOMAIN-KEYWORD,emby,🎬 Emby"' not in text: raise RuntimeError("Emby must route to the dedicated Emby group")
    if '"DOMAIN-SUFFIX,e-hentai.org,📖 EHentai"' not in text: raise RuntimeError("EHentai must route to the dedicated EHentai group")
    if '"PROCESS-NAME-WILDCARD,*AnyDesk*,🔧 远控工具"' not in text: raise RuntimeError("remote-control processes must stay on the remote-control group")
    for group in REQUIRED_AIRPORT_GROUPS:
        if ('"' + group + '"') not in text and ("'" + group + "'") not in text:
            raise RuntimeError("required airport group missing: " + group)
    for group in BANNED_AIRPORT_GROUPS:
        if 'name: "' + group + '"' in text or "name: '" + group + "'" in text:
            raise RuntimeError("homogeneous/forbidden airport group remains: " + group)
    if 'name: "🔰 节点选择"' in text or 'name: "🤖 AI服务"' in text or 'name: "🌍 国外服务"' in text: raise RuntimeError("legacy airport strategy groups remain")
    if 'exclude-type: vmess' in text: raise RuntimeError("protocol exclusion must not exist")
    if '  // BEGIN AIRPORT NODE SANITIZER' not in text or 'airportChainKey' not in text: raise RuntimeError("airport node chain-field sanitizer is missing")
    if '"geosite:category-ads-all": "rcode://name_error"' in text: raise RuntimeError("ad DNS NXDOMAIN would defeat DIRECT")
    for dead in DEAD_RULESET_URLS:
        if dead in text: raise RuntimeError("dead MetaCubeX ruleset URL remains: " + dead)
    assert_no_chain_features(text)

def transform(template,airport):
    result=enforce_full_overwrite_contract(airport)
    for key in COMMON_OBJECTS:
        if key not in template: raise RuntimeError(f"template missing required section: {key}")
        if key == "rules":
            result=upsert_object(result, key, remap_airport_rules(template[key]))
        elif key == "sub-rules":
            result=upsert_object(result, key, tune_sub_rules(template[key]))
        else:
            result=upsert_object(result,key,template[key])
    for key in COMMON_SCALARS:
        if key in template: result=replace_scalar(result,key,template[key])
    result=restore_airport_exceptions(result)
    result=upsert_object(result, "rules", remap_airport_rules(template["rules"]))
    result=apply_airport_strategy_groups(result)
    result=map_airport_targets(result)
    result=ensure_airport_node_sanitizer(result)
    validate_airport(result)
    return result

def parse_args():
    parser=argparse.ArgumentParser(description="Synchronize template public behavior into airport_overwrite.js")
    parser.add_argument("--check",action="store_true",help="validate synchronization without writing the file")
    return parser.parse_args()

def main():
    args=parse_args(); template=yaml.safe_load(TEMPLATE.read_text(encoding="utf-8")); original=AIRPORT.read_text(encoding="utf-8")
    first=transform(template,original); second=transform(template,first)
    if first!=second: raise RuntimeError("Airport synchronization is not idempotent: second pass changes the output")
    if args.check:
        if first!=original: raise RuntimeError("Airport overwrite is out of sync; run the synchronizer without --check")
        print("airport_overwrite.js synchronized")
        print("idempotence check: PASS; non-chain hard gate: PASS; full-overwrite contract: PASS; strategy-group contract: PASS; sync check: PASS"); return
    if first!=original:
        tmp=AIRPORT.with_suffix(AIRPORT.suffix+".tmp"); tmp.write_text(first,encoding="utf-8"); tmp.replace(AIRPORT); print("airport_overwrite.js synchronized")
    else: print("airport_overwrite.js already synchronized")
    print("idempotence check: PASS; non-chain hard gate: PASS; full-overwrite contract: PASS; strategy-group contract: PASS")

if __name__=="__main__": main()
