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

def apply_airport_strategy_groups(text):
    start=text.find('  var AUTO_NAME = "♻️ 自动选择";')
    if start < 0:
        start=text.find('  var AUTO_NAME = "⚡ 自动选择";')
    end=text.find('  var ruleProviderCommonDomain =',start)
    if start<0 or end<0: raise RuntimeError("airport strategy-group block not found")
    block='''  var AUTO_NAME = "⚡ 自动选择";
  var SELECT_NAME = "🚀 节点选择";
  var autoGroup = { name: AUTO_NAME, type: "url-test", "include-all": true, url: "http://www.gstatic.com/generate_204", interval: 300, tolerance: 50, icon: "" };
  var selectGroup = { name: SELECT_NAME, type: "select", proxies: [AUTO_NAME, "DIRECT"].concat(config.proxies.map(function(p) { return p.name; })), icon: "" };
  var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT", "DIRECT"], icon: "" };
  var aiGroup = { name: "💬 AI 服务", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var bilibiliGroup = { name: "📺 哔哩哔哩", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var youtubeGroup = { name: "📹 油管视频", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var googleGroup = { name: "🔍 谷歌服务", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", "DIRECT"], icon: "" };
  var privateNetworkGroup = { name: "🏠 私有网络", type: "select", proxies: ["DIRECT", SELECT_NAME], icon: "" };
  var domesticServiceGroup = { name: "🔒 国内服务", type: "select", proxies: ["DIRECT", SELECT_NAME], icon: "" };
  var telegramGroup = { name: "📲 电报消息", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var githubGroup = { name: "🐱 Github", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var microsoftGroup = { name: "Ⓜ️ 微软服务", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var appleGroup = { name: "🍏 苹果服务", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var socialGroup = { name: "🌐 社交媒体", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var streamingGroup = { name: "🎬 流媒体", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var gamesGroup = { name: "🎮 游戏平台", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var educationGroup = { name: "📚 教育资源", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var financeGroup = { name: "💰 金融服务", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var cloudGroup = { name: "☁️ 云服务", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var nonChinaGroup = { name: "🌐 非中国", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  var fallbackGroup = { name: "🐟 漏网之鱼", type: "select", proxies: [SELECT_NAME, AUTO_NAME, "DIRECT"], icon: "" };
  config["proxy-groups"] = [selectGroup, autoGroup, adBlockGroup, aiGroup, bilibiliGroup, youtubeGroup, googleGroup, privateNetworkGroup, domesticServiceGroup, remoteToolGroup, telegramGroup, githubGroup, microsoftGroup, appleGroup, socialGroup, streamingGroup, gamesGroup, educationGroup, financeGroup, cloudGroup, nonChinaGroup, fallbackGroup];

'''
    text=text[:start]+block+text[end:]
    target_map={"AI服务":"💬 AI 服务","国外服务":"🌐 非中国","流媒体":"🎬 流媒体","漏网之鱼":"🐟 漏网之鱼","远控工具":"🔧 远控工具","📺 YouTube":"📹 油管视频","🔍 Google":"🔍 谷歌服务","📲 Telegram":"📲 电报消息","🪟 Microsoft":"Ⓜ️ 微软服务","🍎 Apple":"🍏 苹果服务","🎮 Steam":"🎮 游戏平台","📱 TikTok":"🌐 社交媒体","🐦 Twitter":"🌐 社交媒体","🎵 Spotify":"🎬 流媒体"}
    for src,dst in target_map.items():
        text=text.replace(","+src+",",","+dst+",").replace(","+src+",no-resolve",","+dst+",no-resolve")
    return text

def map_airport_targets(text):
    mappings={"AI服务":"💬 AI 服务","国外服务":"🌐 非中国","流媒体":"🎬 流媒体","漏网之鱼":"🐟 漏网之鱼","远控工具":"🌐 非中国"}
    for src,dst in mappings.items():
        text=re.sub(r","+re.escape(src)+r'(?=")',","+dst,text)
        text=text.replace(","+src+",no-resolve",","+dst+",no-resolve")
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
    if '"DOMAIN-SUFFIX,claude.ai,💬 AI 服务"' not in text: raise RuntimeError("Claude.ai rule is missing")
    required_groups=("🚀 节点选择","⚡ 自动选择","🛑 广告拦截","💬 AI 服务","📺 哔哩哔哩","📹 油管视频","🔍 谷歌服务","🏠 私有网络","🔒 国内服务","📲 电报消息","🐱 Github","Ⓜ️ 微软服务","🍏 苹果服务","🌐 社交媒体","🎬 流媒体","🎮 游戏平台","📚 教育资源","💰 金融服务","☁️ 云服务","🌐 非中国","🐟 漏网之鱼")
    declared_groups = set(re.findall(r'var\s+\w+Group\s*=\s*\{\s*name:\s*"([^"]+)"', text))
    missing_groups = [group for group in required_groups if group not in declared_groups]
    if missing_groups:
        raise RuntimeError("required airport group missing: " + ", ".join(missing_groups))
    if 'config["proxy-groups"] = [' not in text:
        raise RuntimeError("airport proxy-groups assignment is missing")
    if 'name: "🔰 节点选择"' in text or 'name: "🤖 AI服务"' in text or 'name: "🌍 国外服务"' in text: raise RuntimeError("legacy airport strategy groups remain")
    if 'exclude-type: vmess' in text: raise RuntimeError("protocol exclusion must not exist")
    if '  // BEGIN AIRPORT NODE SANITIZER' not in text or 'airportChainKey' not in text: raise RuntimeError("airport node chain-field sanitizer is missing")
    if '"geosite:category-ads-all": "rcode://name_error"' in text: raise RuntimeError("ad DNS NXDOMAIN would defeat DIRECT")
    assert_no_chain_features(text)

def transform(template,airport):
    result=enforce_full_overwrite_contract(airport)
    for key in COMMON_OBJECTS:
        if key not in template: raise RuntimeError(f"template missing required section: {key}")
        result=upsert_object(result,key,template[key])
    for key in COMMON_SCALARS:
        if key in template: result=replace_scalar(result,key,template[key])
    result=restore_airport_exceptions(result)
    result=apply_airport_strategy_groups(result)
    result=upsert_object(result, "rules", template["rules"])
    claude_rule = '  "DOMAIN-SUFFIX,claude.ai,💬 AI 服务",'
    if claude_rule not in result:
        rules_anchor = '  config["rules"] = ['
        if rules_anchor not in result:
            raise RuntimeError("Airport rules anchor missing")
        result = result.replace(rules_anchor, rules_anchor + "\n" + claude_rule, 1)
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