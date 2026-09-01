/**
 * 机场订阅覆写（TUN · 无链式）
 * 兼容旧版客户端脚本引擎（避免 find / ?. / 对象展开 / \\u{} 正则）
 * 公共规则目标由末尾同步层映射到机场现有策略组，禁止创建重复组
 */
function main(config) {
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
      }
    }
    return target;
  }

  var regionMatchCache = {};

  var REGIONS = [
    { key: "hk", name: "🇭🇰 香港节点", flag: "🇭🇰", jsPattern: "🇭🇰|香港|HKG?|hong\\s*kong", filter: "(?i)(🇭🇰|香港|HKG?|hong\\s*kong)", icon: "" },
    { key: "tw", name: "🇹🇼 台湾节点", flag: "🇹🇼", jsPattern: "🇹🇼|台湾|TWN?|taiwan", filter: "(?i)(🇹🇼|台湾|TWN?|taiwan)", icon: "" },
    { key: "jp", name: "🇯🇵 日本节点", flag: "🇯🇵", jsPattern: "🇯🇵|日本|JPN?|japan|tokyo|osaka|东京|大阪", filter: "(?i)(🇯🇵|日本|JPN?|japan|tokyo|osaka|东京|大阪)", icon: "" },
    { key: "kr", name: "🇰🇷 韩国节点", flag: "🇰🇷", jsPattern: "🇰🇷|韩国|KR|korea|seoul|首尔", filter: "(?i)(🇰🇷|韩国|KR|korea|seoul|首尔)", icon: "" },
    { key: "sg", name: "🇸🇬 新加坡节点", flag: "🇸🇬", jsPattern: "🇸🇬|新加坡|狮城|SGP?|singapore", filter: "(?i)(🇸🇬|新加坡|狮城|SGP?|singapore)", icon: "" },
    { key: "us", name: "🇺🇸 美国节点", flag: "🇺🇸", jsPattern: "🇺🇸|美国|USA?|america|united\\s*states|los\\s*angeles|洛杉矶|san\\s*jose|圣何塞", filter: "(?i)(🇺🇸|美国|USA?|america|united\\s*states|los\\s*angeles|洛杉矶|san\\s*jose|圣何塞)", icon: "" },
    { key: "uk", name: "🇬🇧 英国节点", flag: "🇬🇧", jsPattern: "🇬🇧|英国|GB|united\\s*kingdom|london|伦敦", filter: "(?i)(🇬🇧|英国|GB|united\\s*kingdom|london|伦敦)", icon: "" },
    { key: "de", name: "🇩🇪 德国节点", flag: "🇩🇪", jsPattern: "🇩🇪|德国|DE|germany|frankfurt|法兰克福", filter: "(?i)(🇩🇪|德国|DE|germany|frankfurt|法兰克福)", icon: "" },
    { key: "nl", name: "🇳🇱 荷兰节点", flag: "🇳🇱", jsPattern: "🇳🇱|荷兰|NL|nether?lands|amsterdam|阿姆斯特丹", filter: "(?i)(🇳🇱|荷兰|NL|nether?lands|amsterdam|阿姆斯特丹)", icon: "" },
    { key: "my", name: "🇲🇾 马来西亚节点", flag: "🇲🇾", jsPattern: "🇲🇾|马来西亚|MY|malaysia|kuala\\s*lumpur|吉隆坡", filter: "(?i)(🇲🇾|马来西亚|MY|malaysia|kuala\\s*lumpur|吉隆坡)", icon: "" }
  ];

  function getMatchedRegions(proxyName) {
    proxyName = String(proxyName || "");
    if (regionMatchCache[proxyName]) return regionMatchCache[proxyName];
    var regions = [];
    for (var i = 0; i < REGIONS.length; i++) {
      var r = REGIONS[i];
      try {
        if (new RegExp(r.jsPattern, "i").test(proxyName)) regions.push(r);
      } catch (e) {}
    }
    regionMatchCache[proxyName] = regions;
    return regions;
  }

  function extractFlag(name) {
    // Regional Indicator Symbol pairs (emoji flags), engine-safe (no \\u{} /u)
    var s = String(name || "");
    for (var i = 0; i < s.length - 1; i++) {
      var a = s.charCodeAt(i);
      var b = s.charCodeAt(i + 1);
      // UTF-16 surrogates for U+1F1E6..U+1F1FF
      if (a >= 0xD83C && a <= 0xD83C && b >= 0xDDE6 && b <= 0xDDFF) {
        // high surrogate is always 0xD83C for this block
      }
      if (a === 0xD83C && b >= 0xDDE6 && b <= 0xDDFF) {
        var j = i + 2;
        if (j < s.length - 1 && s.charCodeAt(j) === 0xD83C && s.charCodeAt(j + 1) >= 0xDDE6 && s.charCodeAt(j + 1) <= 0xDDFF) {
          return s.substring(i, i + 4);
        }
      }
    }
    return "";
  }

  function normalizeProxyName(proxy) {
    var originalName = String((proxy && proxy.name) != null ? proxy.name : "");
    var flag = extractFlag(originalName);
    var nameWithoutFlag = (flag ? originalName.split(flag).join("") : originalName).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    var matched = getMatchedRegions(originalName);
    var regionFlag = flag;
    if (!regionFlag) {
      for (var i = 0; i < matched.length; i++) {
        if (matched[i].flag) { regionFlag = matched[i].flag; break; }
      }
    }
    var normalizedName = regionFlag ? (regionFlag + " " + nameWithoutFlag) : nameWithoutFlag;
    if (normalizedName !== originalName) regionMatchCache[normalizedName] = matched;
    if (normalizedName === originalName) return proxy;
    var out = {};
    for (var k in proxy) {
      if (Object.prototype.hasOwnProperty.call(proxy, k)) out[k] = proxy[k];
    }
    out.name = normalizedName;
    return out;
  }

  var originalProxies = config.proxies || [];

  // 排除明显非节点的「公告/说明/营销」行（机场订阅常见垃圾项）。
  // 与早期「误杀真实节点」的激进过滤不同：本正则针对群/客服/流量/到期/
  var excludeFilter =
    /群|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|访问|支持|教程|关注|更新|作者|加入|超时|收藏|福利|邀请|好友|失联|选择|剩余|公益|发布|DIZTNA|通路|登录|禁止|定时|渠道|牢记|永久|余额|阁下|本站|刷新|导航|建议|重置|以下|防失联|⚠️|@|\bexpire\b|\bhttps?:\/\/|\.com|\btraffic\b/i;

  // 1) 去掉 direct/reject/rematch 占位类型
  // 2) 去掉名称命中 excludeFilter 的公告伪节点
  var filteredRaw = originalProxies.filter(function(proxy) {
    var type = String(proxy.type != null ? proxy.type : "").toLowerCase();
    if (type === "direct" || type === "reject" || type === "rematch") return false;
    var name = String(proxy.name != null ? proxy.name : "");
    if (excludeFilter.test(name)) return false;
    return true;
  });

  // 不做字段级去重：过滤后的节点全部保留。
  // 唯一处理：mihomo 要求显示名唯一，标准化后撞名则追加 #2/#3。
  // 顺带统计各地区是否有节点，无节点的地区不生成分组。
  var nameCount = {};
  var normalizedProxies = [];
  var regionsWithNodes = {};
  var hasOtherRegionNodes = false;
  for (var rawIndex = 0; rawIndex < filteredRaw.length; rawIndex++) { var raw = filteredRaw[rawIndex];
    var n = normalizeProxyName(raw);
    var finalName = n.name;
    if (Object.prototype.hasOwnProperty.call(nameCount, finalName)) {
      var count = nameCount[finalName] + 1;
      nameCount[finalName] = count;
      finalName = n.name + " #" + count;
    } else {
      nameCount[finalName] = 1;
    }
    if (finalName === n.name) {
      normalizedProxies.push(n);
    } else {
      var n2 = {};
      for (var nk in n) { if (Object.prototype.hasOwnProperty.call(n, nk)) n2[nk] = n[nk]; }
      n2.name = finalName;
      normalizedProxies.push(n2);
    }

    var matched = getMatchedRegions(raw.name || "");
    if (matched.length > 0) {
      for (var mi = 0; mi < matched.length; mi++) { regionsWithNodes[matched[mi].name] = true; }
    } else {
      hasOtherRegionNodes = true;
    }
  }

  config.proxies = normalizedProxies.length > 0 ? normalizedProxies : originalProxies;

  var allRegionKeywords = REGIONS.map(function(r) { return r.jsPattern; }).join("|");
  var OTHER_REGION_NAME = "🌐 其他地区";

  // 每个地区拆成三层：
  //   {地区}-自动选择（url-test，内部用，不对外暴露）
  //   {地区}-负载均衡（load-balance，内部用，不对外暴露）
  //   {地区}（select，其他分组实际引用的名字不变，但内部只有以上两个
  //          选项可选，不再罗列该地区下的每个原始节点做手动选择）
  function buildRegionTrio(name, matchField) {
    var autoName = "" + name + "-自动选择";
    var lbName = "" + name + "-负载均衡";
    var common = { "include-all": true, url: "https://www.gstatic.com/generate_204", interval: 180, timeout: 3000, "expected-status": 204, icon: "", hidden: true };
    var auto = { name: autoName, type: "url-test", tolerance: 35, "max-failed-times": 2 };
    var lb = { name: lbName, type: "load-balance", strategy: "sticky-sessions" };
    for (var ck in common) { if (Object.prototype.hasOwnProperty.call(common, ck)) { auto[ck] = common[ck]; lb[ck] = common[ck]; } }
    for (var mk in matchField) { if (Object.prototype.hasOwnProperty.call(matchField, mk)) { auto[mk] = matchField[mk]; lb[mk] = matchField[mk]; } }
    var select = { name, type: "select", proxies: [autoName, lbName], icon: "" };
    return [auto, lb, select];
  }

  var regionGroups = [];
  var activeRegions = REGIONS.filter(function(r) { return Object.prototype.hasOwnProperty.call(regionsWithNodes, r.name); });
  for (var ri = 0; ri < activeRegions.length; ri++) { var r = activeRegions[ri];
    regionGroups.push.apply(regionGroups, buildRegionTrio(r.name, { filter: r.filter }));
  }
  if (hasOtherRegionNodes) {
    regionGroups.push.apply(regionGroups, buildRegionTrio(OTHER_REGION_NAME, { "exclude-filter": "(?i)(" + allRegionKeywords + ")" }));
  }

  // 供其他分组引用的"地区选择入口"名字列表：只包含实际生成了分组的地区，
  // 没有节点的地区不会出现在这里，其他分组也就不会引用到不存在的分组名
  var regionNames = activeRegions.map(function(r) { return r.name; });
  if (hasOtherRegionNodes) regionNames.push(OTHER_REGION_NAME);
  var regionNamesNoHK = regionNames.filter(function(n) { return n !== "🇭🇰 香港节点" && n !== "🇹🇼 台湾节点"; });

  var AUTO_NAME = "♻️ 自动选择";
  var LB_NAME = "⚖️ 负载均衡";
  var SELECT_NAME = "🔰 节点选择";

  var autoGroup = { name: AUTO_NAME, type: "url-test", "include-all": true, url: "https://www.gstatic.com/generate_204", interval: 180, tolerance: 35, timeout: 3000, "expected-status": 204, "max-failed-times": 2, icon: "" };
  var lbGroup = { name: LB_NAME, type: "load-balance", strategy: "sticky-sessions", "include-all": true, url: "https://www.gstatic.com/generate_204", interval: 180, timeout: 3000, "expected-status": 204, icon: "" };
  var selectGroup = { name: SELECT_NAME, type: "select", proxies: [AUTO_NAME, LB_NAME].concat(regionNames), icon: "" };
  var adBlockGroup = { name: "🛑 广告拦截", type: "select", proxies: ["REJECT", "DIRECT"], icon: "" };
  var aiGroup = { name: "🤖 AI服务", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNamesNoHK), icon: "" };
  var mediaGroup = { name: "📺 Media", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var youtubeGroup = { name: "📺 YouTube", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var googleGroup = { name: "🔍 Google", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var telegramGroup = { name: "📲 Telegram", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var microsoftGroup = { name: "🪟 Microsoft", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var appleGroup = { name: "🍎 Apple", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var steamGroup = { name: "🎮 Steam", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var tiktokGroup = { name: "📱 TikTok", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var twitterGroup = { name: "🐦 Twitter", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var spotifyGroup = { name: "🎵 Spotify", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var globalServiceGroup = { name: "🌍 国外服务", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  var fallbackGroup = { name: "🐟 漏网之鱼", type: "select", proxies: [SELECT_NAME, AUTO_NAME].concat(regionNames), icon: "" };
  // 直接在客户端里把这个分组切成 DIRECT 即可，不需要再回来改脚本
  var remoteToolGroup = { name: "🔧 远控工具", type: "select", proxies: ["REJECT-DROP", "DIRECT"], icon: "" };

  config["proxy-groups"] = [selectGroup, autoGroup, lbGroup, adBlockGroup, aiGroup, mediaGroup, youtubeGroup, googleGroup, telegramGroup, microsoftGroup, appleGroup, steamGroup, tiktokGroup, twitterGroup, spotifyGroup, globalServiceGroup, fallbackGroup, remoteToolGroup].concat(regionGroups);

  var ruleProviderCommonDomain = { type: "http", format: "mrs", interval: 86400, behavior: "domain" };
  var ruleProviderCommonIpcidr = { type: "http", format: "mrs", interval: 86400, behavior: "ipcidr" };
  var ruleProviderClassical = { type: "http", behavior: "classical", interval: 86400 };
  var ruleProviderTextDomain = { type: "http", format: "text", interval: 86400, behavior: "domain" };

  var BASE_META = "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo";
  var BASE_BLACK = "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash";

  config["rule-providers"] = {
  "category-ads-all": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/category-ads-all.mrs",
    "path": "./ruleset/category-ads-all.mrs"
  },
  "category-ai-!cn": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/category-ai-!cn.mrs",
    "path": "./ruleset/category-ai-!cn.mrs"
  },
  "openai": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/openai.mrs",
    "path": "./ruleset/openai.mrs"
  },
  "bilibili": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/bilibili.mrs",
    "path": "./ruleset/bilibili.mrs"
  },
  "geolocation-cn": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/geolocation-cn.mrs",
    "path": "./ruleset/geolocation-cn.mrs"
  },
  "cn": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/cn.mrs",
    "path": "./ruleset/cn.mrs"
  },
  "youtube": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/youtube.mrs",
    "path": "./ruleset/youtube.mrs"
  },
  "netflix": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/netflix.mrs",
    "path": "./ruleset/netflix.mrs"
  },
  "hulu": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/hulu.mrs",
    "path": "./ruleset/hulu.mrs"
  },
  "disney": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/disney.mrs",
    "path": "./ruleset/disney.mrs"
  },
  "hbo": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/hbo.mrs",
    "path": "./ruleset/hbo.mrs"
  },
  "amazon": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/amazon.mrs",
    "path": "./ruleset/amazon.mrs"
  },
  "bahamut": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/bahamut.mrs",
    "path": "./ruleset/bahamut.mrs"
  },
  "spotify": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/spotify.mrs",
    "path": "./ruleset/spotify.mrs"
  },
  "tiktok": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/tiktok.mrs",
    "path": "./ruleset/tiktok.mrs"
  },
  "biliintl": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/biliintl.mrs",
    "path": "./ruleset/biliintl.mrs"
  },
  "abema": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/abema.mrs",
    "path": "./ruleset/abema.mrs"
  },
  "bbc": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/bbc.mrs",
    "path": "./ruleset/bbc.mrs"
  },
  "google": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/google.mrs",
    "path": "./ruleset/google.mrs"
  },
  "github": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/github.mrs",
    "path": "./ruleset/github.mrs"
  },
  "gitlab": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/gitlab.mrs",
    "path": "./ruleset/gitlab.mrs"
  },
  "apple": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/apple.mrs",
    "path": "./ruleset/apple.mrs"
  },
  "microsoft": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/microsoft.mrs",
    "path": "./ruleset/microsoft.mrs"
  },
  "facebook": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/facebook.mrs",
    "path": "./ruleset/facebook.mrs"
  },
  "instagram": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/instagram.mrs",
    "path": "./ruleset/instagram.mrs"
  },
  "twitter": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/twitter.mrs",
    "path": "./ruleset/twitter.mrs"
  },
  "linkedin": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/linkedin.mrs",
    "path": "./ruleset/linkedin.mrs"
  },
  "discord": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/discord.mrs",
    "path": "./ruleset/discord.mrs"
  },
  "snapchat": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/snap.mrs",
    "path": "./ruleset/snapchat.mrs"
  },
  "icloud": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/icloud.mrs",
    "path": "./ruleset/icloud.mrs"
  },
  "apple-cn": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/apple-cn.mrs",
    "path": "./ruleset/apple-cn.mrs"
  },
  "microsoft-cn": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/microsoft@cn.mrs",
    "path": "./ruleset/microsoft-cn.mrs"
  },
  "steam": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/steam.mrs",
    "path": "./ruleset/steam.mrs"
  },
  "epicgames": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/epicgames.mrs",
    "path": "./ruleset/epicgames.mrs"
  },
  "ea": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/ea.mrs",
    "path": "./ruleset/ea.mrs"
  },
  "ubisoft": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/ubisoft.mrs",
    "path": "./ruleset/ubisoft.mrs"
  },
  "blizzard": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/blizzard.mrs",
    "path": "./ruleset/blizzard.mrs"
  },
  "steam-cn": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/steam@cn.mrs",
    "path": "./ruleset/steam-cn.mrs"
  },
  "category-games-cn": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/category-games@cn.mrs",
    "path": "./ruleset/category-games-cn.mrs"
  },
  "paypal": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/paypal.mrs",
    "path": "./ruleset/paypal.mrs"
  },
  "aws": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/aws.mrs",
    "path": "./ruleset/aws.mrs"
  },
  "azure": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/azure.mrs",
    "path": "./ruleset/azure.mrs"
  },
  "dropbox": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/dropbox.mrs",
    "path": "./ruleset/dropbox.mrs"
  },
  "onedrive": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/onedrive.mrs",
    "path": "./ruleset/onedrive.mrs"
  },
  "category-scholar-!cn": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/category-scholar-!cn.mrs",
    "path": "./ruleset/category-scholar-!cn.mrs"
  },
  "tracker": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/tracker.mrs",
    "path": "./ruleset/tracker.mrs"
  },
  "geolocation-!cn": {
    "type": "http",
    "format": "mrs",
    "behavior": "domain",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/geolocation-!cn.mrs",
    "path": "./ruleset/geolocation-!cn.mrs"
  },
  "private-ip": {
    "type": "http",
    "format": "mrs",
    "behavior": "ipcidr",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/private.mrs",
    "path": "./ruleset/private-ip.mrs"
  },
  "cn-ip": {
    "type": "http",
    "format": "mrs",
    "behavior": "ipcidr",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cn.mrs",
    "path": "./ruleset/cn-ip.mrs"
  },
  "google-ip": {
    "type": "http",
    "format": "mrs",
    "behavior": "ipcidr",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/google.mrs",
    "path": "./ruleset/google-ip.mrs"
  },
  "telegram-ip": {
    "type": "http",
    "format": "mrs",
    "behavior": "ipcidr",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/telegram.mrs",
    "path": "./ruleset/telegram-ip.mrs"
  },
  "netflix-ip": {
    "type": "http",
    "format": "mrs",
    "behavior": "ipcidr",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/netflix.mrs",
    "path": "./ruleset/netflix-ip.mrs"
  },
  "facebook-ip": {
    "type": "http",
    "format": "mrs",
    "behavior": "ipcidr",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/facebook.mrs",
    "path": "./ruleset/facebook-ip.mrs"
  },
  "twitter-ip": {
    "type": "http",
    "format": "mrs",
    "behavior": "ipcidr",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/twitter.mrs",
    "path": "./ruleset/twitter-ip.mrs"
  },
  "cloudflare-ip": {
    "type": "http",
    "format": "mrs",
    "behavior": "ipcidr",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cloudflare.mrs",
    "path": "./ruleset/cloudflare-ip.mrs"
  },
  "cloudfront-ip": {
    "type": "http",
    "format": "mrs",
    "behavior": "ipcidr",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cloudfront.mrs",
    "path": "./ruleset/cloudfront-ip.mrs"
  },
  "fastly-ip": {
    "type": "http",
    "format": "mrs",
    "behavior": "ipcidr",
    "interval": 604800,
    "url": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/fastly.mrs",
    "path": "./ruleset/fastly-ip.mrs"
  },
  "sukka-phishing": {
    "type": "http",
    "behavior": "domain",
    "format": "text",
    "interval": 86400,
    "url": "https://ruleset.skk.moe/Clash/domainset/reject_phishing.txt",
    "path": "./ruleset/sukka-phishing.txt"
  },
  "cryptocurrency": {
    "type": "http",
    "behavior": "classical",
    "format": "yaml",
    "interval": 86400,
    "url": "https://gcore.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Cryptocurrency/Cryptocurrency.yaml",
    "path": "./ruleset/cryptocurrency.yaml"
  }
};

  config["rules"] = [
  "AND,((IN-TYPE,TUN),(RULE-SET,private-ip)),DIRECT",
  "IP-CIDR6,::/0,REJECT-DROP,no-resolve",
  "DOMAIN-SUFFIX,tongdun.net,DIRECT",
  "DOMAIN-SUFFIX,tongduncdn.com,DIRECT",
  "DOMAIN-SUFFIX,ishumei.com,DIRECT",
  "DOMAIN-SUFFIX,riskradar.net,DIRECT",
  "DOMAIN-SUFFIX,geetest.com,DIRECT",
  "DOMAIN-SUFFIX,trustdevice.net,DIRECT",
  "DOMAIN-SUFFIX,aegis.qq.com,DIRECT",
  "DOMAIN-SUFFIX,rongcloud.cn,DIRECT",
  "DOMAIN-SUFFIX,rongcloud.com,DIRECT",
  "DOMAIN-SUFFIX,umeng.com,DIRECT",
  "DOMAIN-SUFFIX,umengcloud.com,DIRECT",
  "DOMAIN-SUFFIX,antpay.com,DIRECT",
  "DOMAIN-SUFFIX,alipay.com,DIRECT",
  "DOMAIN-SUFFIX,alipayobjects.com,DIRECT",
  "DOMAIN-SUFFIX,12306.cn,DIRECT",
  "DOMAIN-SUFFIX,railway12306.cn,DIRECT",
  "DOMAIN-SUFFIX,chinatax.gov.cn,DIRECT",
  "DOMAIN-SUFFIX,fuwu.nhsa.gov.cn,DIRECT",
  "DOMAIN-SUFFIX,gjzwfw.gov.cn,DIRECT",
  "DOMAIN-SUFFIX,xiaojukeji.com,DIRECT",
  "DOMAIN-SUFFIX,didichuxing.com,DIRECT",
  "DOMAIN-SUFFIX,work.weixin.qq.com,DIRECT",
  "DOMAIN-SUFFIX,meeting.tencent.com,DIRECT",
  "DOMAIN-SUFFIX,taobao.com,DIRECT",
  "DOMAIN-SUFFIX,jd.com,DIRECT",
  "DOMAIN-SUFFIX,pinduoduo.com,DIRECT",
  "DOMAIN-SUFFIX,meituan.com,DIRECT",
  "DOMAIN-SUFFIX,dianping.com,DIRECT",
  "DOMAIN-SUFFIX,ele.me,DIRECT",
  "DOMAIN-SUFFIX,amap.com,DIRECT",
  "DOMAIN-SUFFIX,baidu.com,DIRECT",
  "DOMAIN-SUFFIX,xiaohongshu.com,DIRECT",
  "DOMAIN-SUFFIX,kuaishou.com,DIRECT",
  "DOMAIN-SUFFIX,163.com,DIRECT",
  "DOMAIN-SUFFIX,weibo.com,DIRECT",
  "DOMAIN-SUFFIX,zhihu.com,DIRECT",
  "DOMAIN-SUFFIX,ctrip.com,DIRECT",
  "DOMAIN-SUFFIX,qunar.com,DIRECT",
  "DOMAIN-SUFFIX,sf-express.com,DIRECT",
  "DOMAIN-SUFFIX,dingtalk.com,DIRECT",
  "DOMAIN-SUFFIX,feishu.cn,DIRECT",
  "DOMAIN-SUFFIX,xuexi.cn,DIRECT",
  "DOMAIN-SUFFIX,chsi.com.cn,DIRECT",
  "DOMAIN-SUFFIX,servicewechat.com,DIRECT",
  "DOMAIN-SUFFIX,icbc.com.cn,DIRECT",
  "DOMAIN-SUFFIX,ccb.com,DIRECT",
  "DOMAIN-SUFFIX,boc.cn,DIRECT",
  "DOMAIN-SUFFIX,bankofchina.com,DIRECT",
  "DOMAIN-SUFFIX,abchina.com,DIRECT",
  "DOMAIN-SUFFIX,abchina.com.cn,DIRECT",
  "DOMAIN-SUFFIX,cmbchina.com,DIRECT",
  "DOMAIN-SUFFIX,cmbi.com.cn,DIRECT",
  "DOMAIN-SUFFIX,bankcomm.com,DIRECT",
  "DOMAIN-SUFFIX,psbc.com,DIRECT",
  "DOMAIN-SUFFIX,spdb.com.cn,DIRECT",
  "DOMAIN-SUFFIX,cib.com.cn,DIRECT",
  "DOMAIN-SUFFIX,cmbc.com.cn,DIRECT",
  "DOMAIN-SUFFIX,pingan.com,DIRECT",
  "DOMAIN-SUFFIX,cgbchina.com.cn,DIRECT",
  "DOMAIN-SUFFIX,hxb.com.cn,DIRECT",
  "DOMAIN-SUFFIX,cebbank.com,DIRECT",
  "DOMAIN-SUFFIX,citicbank.com,DIRECT",
  "DOMAIN-SUFFIX,ecitic.com,DIRECT",
  "DOMAIN-SUFFIX,unionpaysecure.com,DIRECT",
  "DOMAIN-SUFFIX,pingan.com.cn,DIRECT",
  "DOMAIN-SUFFIX,gfbazc.com,DIRECT",
  "DOMAIN-SUFFIX,fzuol.com,DIRECT",
  "DOMAIN-SUFFIX,netsunion.org.cn,DIRECT",
  "DOMAIN-SUFFIX,cpic.com.cn,DIRECT",
  "DOMAIN-SUFFIX,zhongan.com,DIRECT",
  "DOMAIN-SUFFIX,eastmoney.com,DIRECT",
  "DOMAIN-SUFFIX,htsc.com.cn,DIRECT",
  "DOMAIN-SUFFIX,gtja.com,DIRECT",
  "DOMAIN-SUFFIX,dingxiangyun.com,DIRECT",
  "DOMAIN-SUFFIX,dingxiangyun.cn,DIRECT",
  "DOMAIN-SUFFIX,rong360.com,DIRECT",
  "DOMAIN-SUFFIX,yzf.com.cn,DIRECT",
  "DOMAIN-SUFFIX,99bill.com,DIRECT",
  "DOMAIN-SUFFIX,chinapay.com,DIRECT",
  "DOMAIN-SUFFIX,yeepay.com,DIRECT",
  "DOMAIN-SUFFIX,jdpay.com,DIRECT",
  "DOMAIN-SUFFIX,weixin.qq.com,DIRECT",
  "DOMAIN-SUFFIX,wx.qq.com,DIRECT",
  "DOMAIN-SUFFIX,weixin.com,DIRECT",
  "DOMAIN-SUFFIX,wxs.qq.com,DIRECT",
  "DOMAIN-SUFFIX,pddpic.com,DIRECT",
  "DOMAIN-SUFFIX,samsunghealth.com,DIRECT",
  "DOMAIN,connectivitycheck.gstatic.com,DIRECT",
  "DOMAIN,userlocation.googleapis.com,🌍 国外服务",
  "DOMAIN,voilatile-pa.googleapis.com,🌍 国外服务",
  "DOMAIN,geller-pa.googleapis.com,🌍 国外服务",
  "DOMAIN,mobilemaps-pa-gz.googleapis.com,🌍 国外服务",
  "DOMAIN-SUFFIX,app-measurement.com,🌍 国外服务",
  "DOMAIN-SUFFIX,firebaselogging.googleapis.com,🌍 国外服务",
  "DOMAIN-SUFFIX,in.appcenter.ms,🌍 国外服务",
  "DOMAIN-SUFFIX,mobile.events.data.microsoft.com,🌍 国外服务",
  "DOMAIN-SUFFIX,connect.facebook.net,🌍 国外服务",
  "DOMAIN-SUFFIX,a-cdn.anthropic.com,🤖 AI服务",
  "DOMAIN-SUFFIX,assets-proxy.anthropic.com,🤖 AI服务",
  "DOMAIN-SUFFIX,bing.com,🌍 国外服务",
  "DOMAIN-SUFFIX,samsungosp.com,DIRECT",
  "DOMAIN-SUFFIX,crashlytics.com,🌍 国外服务",
  "DOMAIN-SUFFIX,firebase.io,🌍 国外服务",
  "DOMAIN,browser-intake-us5-datadoghq.com,🌍 国外服务",
  "RULE-SET,sukka-phishing,REJECT-DROP",
  "RULE-SET,category-ads-all,🛑 广告拦截",
  "DOMAIN,galaxystore.ad-survey.com,REJECT",
  "DOMAIN,dls2.bigdata.samsung.com.cn,REJECT",
  "RULE-SET,private-ip,DIRECT,no-resolve",
  "DOMAIN-REGEX,^(stun|turn|stuns|turns)\\.,REJECT-DROP",
  "DOMAIN-REGEX,[-.]stun[-.],REJECT-DROP",
  "DOMAIN-REGEX,[-.]turn[-.],REJECT-DROP",
  "DOMAIN-REGEX,[-.]stuns[-.],REJECT-DROP",
  "DOMAIN-REGEX,[-.]turns[-.],REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,53),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,53),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,853),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,853),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,21),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,23),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,25),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,110),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,143),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,3478-3480)),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,5349-5355)),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,19302-19305)),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,3478-3480)),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,5349-5355)),REJECT-DROP",
  "AND,((NETWORK,TCP),(DST-PORT,19302-19305)),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,1900),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,5353),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "AND,((NETWORK,UDP),(DST-PORT,443),(RULE-SET,cn-ip)),DIRECT",
  "AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((RULE-SET,cn-ip)))),REJECT-DROP",
  "IP-CIDR,54.223.0.0/16,🌍 国外服务,no-resolve",
  "IP-CIDR,52.80.168.0/24,🌍 国外服务,no-resolve",
  "DOMAIN-SUFFIX,browserleaks.com,🌍 国外服务",
  "DOMAIN-SUFFIX,browserleaks.org,🌍 国外服务",
  "DOMAIN-SUFFIX,ipleak.net,🌍 国外服务",
  "DOMAIN-SUFFIX,dnsleaktest.com,🌍 国外服务",
  "DOMAIN-SUFFIX,dnsleak.com,🌍 国外服务",
  "DOMAIN-SUFFIX,whoer.net,🌍 国外服务",
  "DOMAIN-SUFFIX,whatismyipaddress.com,🌍 国外服务",
  "DOMAIN-SUFFIX,ipinfo.io,🌍 国外服务",
  "DOMAIN-SUFFIX,ip-api.com,🌍 国外服务",
  "DOMAIN-SUFFIX,myip.com,🌍 国外服务",
  "DOMAIN-SUFFIX,ifconfig.me,🌍 国外服务",
  "DOMAIN-SUFFIX,ifconfig.co,🌍 国外服务",
  "DOMAIN-SUFFIX,ipecho.net,🌍 国外服务",
  "DOMAIN-SUFFIX,ip.sb,🌍 国外服务",
  "DOMAIN-SUFFIX,ipleak.com,🌍 国外服务",
  "DOMAIN-SUFFIX,dnsleaktest.org,🌍 国外服务",
  "DOMAIN-SUFFIX,browserleaks.info,🌍 国外服务",
  "DOMAIN-SUFFIX,whatismyip.com,🌍 国外服务",
  "DOMAIN-SUFFIX,ipify.org,🌍 国外服务",
  "DOMAIN-SUFFIX,api.ipify.org,🌍 国外服务",
  "DOMAIN-SUFFIX,ipapi.co,🌍 国外服务",
  "DOMAIN-SUFFIX,ipwho.is,🌍 国外服务",
  "DOMAIN-SUFFIX,ident.me,🌍 国外服务",
  "DOMAIN-SUFFIX,cloudflarestorage.com,🌍 国外服务",
  "DOMAIN-SUFFIX,paddle.com,🌍 国外服务",
  "SUB-RULE,(NETWORK,tcp),DOMESTIC_DOMAIN",
  "SUB-RULE,(NETWORK,udp),DOMESTIC_DOMAIN",
  "SUB-RULE,(NETWORK,tcp),DOMESTIC_IP",
  "SUB-RULE,(NETWORK,udp),DOMESTIC_IP",
  "PROCESS-NAME-WILDCARD,*revanced*,🌍 国外服务",
  "PROCESS-NAME-WILDCARD,*youtube*,🌍 国外服务",
  "PROCESS-NAME-WILDCARD,*com.android.bank*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.icbc*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.ccb*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.boc*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.abchina*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.cmbchina*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.cmbc*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.bankcomm*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.psbc*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.spdb*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.cib*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.pingan*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.cgbchina*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.hxb*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.cebbank*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.citic*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.tenpay*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.tencent.mm*,DIRECT",
  "PROCESS-NAME-WILDCARD,*WeChat*,DIRECT",
  "PROCESS-NAME-WILDCARD,*Weixin*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.MobileTicket*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.hicorenational.antifraud*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.service.android.gov.cn*,DIRECT",
  "PROCESS-NAME-WILDCARD,*cn.hsa.app*,DIRECT",
  "PROCESS-NAME-WILDCARD,*cn.gov.tax.its*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.greenpoint.android.mc10086*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.sinovatech.unicom.ui*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.ct.client*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.unionpay*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.eg.android.Alipay*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.chinamworld*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.bankabc*,DIRECT",
  "PROCESS-NAME-WILDCARD,*cmb.pb*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.yitong.mbank*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.cgb.mobilebank*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.czbank*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.bjrcb*,DIRECT",
  "PROCESS-NAME-WILDCARD,*com.android.mobilebank*,DIRECT",
  "PROCESS-NAME-WILDCARD,*AnyDesk*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*ToDesk*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*TeamViewer*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*RustDesk*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*rustdesk*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*tailscale*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*tailscaled*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*zerotier*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*ngrok*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*frpc*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*frps*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*cloudflared*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*natapp*,🔧 远控工具",
  "PROCESS-NAME-WILDCARD,*nblink*,🔧 远控工具",
  "RULE-SET,icloud,🌍 国外服务",
  "RULE-SET,apple,🌍 国外服务",
  "RULE-SET,microsoft,🌍 国外服务",
  "RULE-SET,openai,🤖 AI服务",
  "RULE-SET,category-ai-!cn,🤖 AI服务",
  "RULE-SET,netflix,📺 Media",
  "RULE-SET,netflix-ip,📺 Media,no-resolve",
  "RULE-SET,hulu,📺 Media",
  "RULE-SET,disney,📺 Media",
  "RULE-SET,hbo,📺 Media",
  "RULE-SET,amazon,📺 Media",
  "RULE-SET,bahamut,📺 Media",
  "RULE-SET,youtube,📺 Media",
  "RULE-SET,tiktok,📺 Media",
  "RULE-SET,biliintl,📺 Media",
  "RULE-SET,abema,📺 Media",
  "RULE-SET,bbc,📺 Media",
  "RULE-SET,spotify,📺 Media",
  "RULE-SET,google,🌍 国外服务",
  "RULE-SET,google-ip,🌍 国外服务,no-resolve",
  "RULE-SET,github,🌍 国外服务",
  "RULE-SET,gitlab,🌍 国外服务",
  "RULE-SET,facebook,🌍 国外服务",
  "RULE-SET,instagram,🌍 国外服务",
  "RULE-SET,twitter,🌍 国外服务",
  "RULE-SET,twitter-ip,🌍 国外服务,no-resolve",
  "RULE-SET,linkedin,🌍 国外服务",
  "RULE-SET,discord,🌍 国外服务",
  "RULE-SET,snapchat,🌍 国外服务",
  "RULE-SET,telegram-ip,🌍 国外服务,no-resolve",
  "RULE-SET,facebook-ip,🌍 国外服务,no-resolve",
  "RULE-SET,cloudflare-ip,🌍 国外服务,no-resolve",
  "RULE-SET,cloudfront-ip,🌍 国外服务,no-resolve",
  "RULE-SET,fastly-ip,🌍 国外服务,no-resolve",
  "RULE-SET,steam,🌍 国外服务",
  "RULE-SET,epicgames,🌍 国外服务",
  "RULE-SET,ea,🌍 国外服务",
  "RULE-SET,ubisoft,🌍 国外服务",
  "RULE-SET,blizzard,🌍 国外服务",
  "RULE-SET,paypal,🌍 国外服务",
  "RULE-SET,aws,🌍 国外服务",
  "RULE-SET,azure,🌍 国外服务",
  "RULE-SET,dropbox,🌍 国外服务",
  "RULE-SET,onedrive,🌍 国外服务",
  "RULE-SET,cryptocurrency,🌍 国外服务",
  "RULE-SET,category-scholar-!cn,🌍 国外服务",
  "RULE-SET,geolocation-!cn,🌍 国外服务",
  "MATCH,🐟 漏网之鱼"
];

  config["tun"] = {
  "enable": true,
  "stack": "mixed",
  "auto-route": true,
  "auto-redirect": false,
  "strict-route": true,
  "auto-detect-interface": true,
  "inet4-route-only": false,
  "mtu": 1500,
  "gso": false,
  "gso-max-size": 65536,
  "udp-timeout": 300,
  "dns-hijack": [
    "any:53",
    "tcp://any:53"
  ]
};

  var DOMESTIC_DNS = ["223.5.5.5", "223.6.6.6"];

  config["dns"] = {
  "enable": true,
  "listen": "127.0.0.1:1053",
  "ipv6": false,
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "198.18.0.1/16",
  "fake-ip-cache-size": 4096,
  "ttl": 600,
  "min-ttl": 60,
  "max-ttl": 3600,
  "cache-size": 8192,
  "cache-algorithm": "arc",
  "prefer-h3": false,
  "use-hosts": true,
  "use-system-hosts": false,
  "disable-qtype-65": true,
  "fake-ip-filter-mode": "rule",
  "fake-ip-filter": [
    "DOMAIN-SUFFIX,abchina.com,real-ip",
    "DOMAIN-SUFFIX,icbc.com.cn,real-ip",
    "DOMAIN-SUFFIX,ccb.com,real-ip",
    "DOMAIN-SUFFIX,boc.cn,real-ip",
    "DOMAIN-SUFFIX,cmbchina.com,real-ip",
    "DOMAIN-SUFFIX,bankcomm.com,real-ip",
    "DOMAIN-SUFFIX,psbc.com,real-ip",
    "DOMAIN-SUFFIX,spdb.com.cn,real-ip",
    "DOMAIN-SUFFIX,cib.com.cn,real-ip",
    "DOMAIN-SUFFIX,cmbc.com.cn,real-ip",
    "DOMAIN-SUFFIX,pingan.com,real-ip",
    "DOMAIN-SUFFIX,cgbchina.com.cn,real-ip",
    "DOMAIN-SUFFIX,hxb.com.cn,real-ip",
    "DOMAIN-SUFFIX,cebbank.com,real-ip",
    "DOMAIN-SUFFIX,citicbank.com,real-ip",
    "DOMAIN-SUFFIX,ecitic.com,real-ip",
    "DOMAIN-SUFFIX,bankofchina.com,real-ip",
    "DOMAIN-SUFFIX,cmbi.com.cn,real-ip",
    "DOMAIN-SUFFIX,netsunion.org.cn,real-ip",
    "DOMAIN-SUFFIX,gfbazc.com,real-ip",
    "DOMAIN-SUFFIX,fzuol.com,real-ip",
    "DOMAIN-SUFFIX,mps.gov.cn,real-ip",
    "DOMAIN-SUFFIX,unionpay.com,real-ip",
    "DOMAIN-SUFFIX,95516.com,real-ip",
    "DOMAIN-SUFFIX,alipay.com,real-ip",
    "DOMAIN-SUFFIX,alipayobjects.com,real-ip",
    "DOMAIN-SUFFIX,tenpay.com,real-ip",
    "DOMAIN-SUFFIX,wechatpay.cn,real-ip",
    "DOMAIN-SUFFIX,servicewechat.com,real-ip",
    "DOMAIN-SUFFIX,weixinbridge.com,real-ip",
    "DOMAIN-SUFFIX,url.cn,real-ip",
    "DOMAIN-SUFFIX,tongdun.net,real-ip",
    "DOMAIN-SUFFIX,tongduncdn.com,real-ip",
    "DOMAIN-SUFFIX,ishumei.com,real-ip",
    "DOMAIN-SUFFIX,geetest.com,real-ip",
    "DOMAIN-SUFFIX,trustdevice.net,real-ip",
    "DOMAIN-SUFFIX,aegis.qq.com,real-ip",
    "DOMAIN-SUFFIX,antpay.com,real-ip",
    "DOMAIN-SUFFIX,riskradar.net,real-ip",
    "DOMAIN-SUFFIX,abchina.com.cn,real-ip",
    "DOMAIN-SUFFIX,jpush.cn,real-ip",
    "DOMAIN-SUFFIX,jpush.io,real-ip",
    "DOMAIN-SUFFIX,jiguang.cn,real-ip",
    "DOMAIN-SUFFIX,rongcloud.cn,real-ip",
    "DOMAIN-SUFFIX,rongcloud.com,real-ip",
    "DOMAIN-SUFFIX,umeng.com,real-ip",
    "DOMAIN-SUFFIX,umengcloud.com,real-ip",
    "DOMAIN-SUFFIX,dingxiangyun.com,real-ip",
    "DOMAIN-SUFFIX,dingxiangyun.cn,real-ip",
    "DOMAIN-SUFFIX,rong360.com,real-ip",
    "DOMAIN-SUFFIX,yzf.com.cn,real-ip",
    "DOMAIN-SUFFIX,99bill.com,real-ip",
    "DOMAIN-SUFFIX,chinapay.com,real-ip",
    "DOMAIN-SUFFIX,yeepay.com,real-ip",
    "DOMAIN-SUFFIX,jdpay.com,real-ip",
    "DOMAIN-SUFFIX,weixin.qq.com,real-ip",
    "DOMAIN-SUFFIX,wx.qq.com,real-ip",
    "DOMAIN-SUFFIX,weixin.com,real-ip",
    "RULE-SET,category-ads-all,fake-ip",
    "RULE-SET,geolocation-cn,real-ip",
    "RULE-SET,cn,real-ip",
    "RULE-SET,bilibili,real-ip",
    "GEOSITE,cn,real-ip",
    "DOMAIN-SUFFIX,localhost,real-ip",
    "DOMAIN-SUFFIX,local,real-ip",
    "DOMAIN-SUFFIX,lan,real-ip",
    "DOMAIN-SUFFIX,internal,real-ip",
    "DOMAIN-SUFFIX,localdomain,real-ip",
    "DOMAIN-SUFFIX,home.arpa,real-ip",
    "DOMAIN-SUFFIX,example,real-ip",
    "DOMAIN-SUFFIX,invalid,real-ip",
    "DOMAIN-SUFFIX,test,real-ip",
    "DOMAIN-SUFFIX,msftconnecttest.com,real-ip",
    "DOMAIN-SUFFIX,msftncsi.com,real-ip",
    "DOMAIN,captive.apple.com,real-ip",
    "DOMAIN,connectivitycheck.gstatic.com,real-ip",
    "DOMAIN-SUFFIX,gstatic.com,real-ip",
    "DOMAIN-SUFFIX,10086.cn,real-ip",
    "DOMAIN-SUFFIX,10010.com,real-ip",
    "DOMAIN-SUFFIX,10000.cn,real-ip",
    "DOMAIN-SUFFIX,minorshield.qq.com,real-ip",
    "DOMAIN-SUFFIX,icloud.com.cn,real-ip",
    "DOMAIN-SUFFIX,apple.com.cn,real-ip",
    "DOMAIN-SUFFIX,mzstatic.com.cn,real-ip",
    "DOMAIN,gsa.apple.com,real-ip",
    "DOMAIN,configuration.apple.com,real-ip",
    "DOMAIN,mesu.apple.com,real-ip",
    "DOMAIN,time.apple.com,real-ip",
    "DOMAIN-SUFFIX,windowsupdate.com,real-ip",
    "DOMAIN-SUFFIX,update.microsoft.com,real-ip",
    "DOMAIN-SUFFIX,download.microsoft.com,real-ip",
    "DOMAIN-SUFFIX,microsoft.com.cn,real-ip",
    "DOMAIN-SUFFIX,chinacloudapi.cn,real-ip",
    "DOMAIN-SUFFIX,azure.cn,real-ip",
    "DOMAIN-SUFFIX,microsoftonline.cn,real-ip",
    "DOMAIN-SUFFIX,msftauth.net,real-ip",
    "DOMAIN,time.windows.com,real-ip",
    "DOMAIN-SUFFIX,mi.com,real-ip",
    "DOMAIN-SUFFIX,xiaomi.com,real-ip",
    "DOMAIN-SUFFIX,miui.com,real-ip",
    "DOMAIN-SUFFIX,micloud.com,real-ip",
    "DOMAIN-SUFFIX,mi-img.com,real-ip",
    "DOMAIN-SUFFIX,miwifi.com,real-ip",
    "DOMAIN-SUFFIX,xiaomiev.com,real-ip",
    "DOMAIN-SUFFIX,huawei.com,real-ip",
    "DOMAIN-SUFFIX,huaweicloud.com,real-ip",
    "DOMAIN-SUFFIX,hicloud.com,real-ip",
    "DOMAIN-SUFFIX,vmall.com,real-ip",
    "DOMAIN-SUFFIX,honor.com,real-ip",
    "DOMAIN-SUFFIX,vivo.com,real-ip",
    "DOMAIN-SUFFIX,vivoglobal.com,real-ip",
    "DOMAIN-SUFFIX,oppo.com,real-ip",
    "DOMAIN-SUFFIX,oppomobile.com,real-ip",
    "DOMAIN-SUFFIX,meizu.com,real-ip",
    "DOMAIN-SUFFIX,samsung.com.cn,real-ip",
    "DOMAIN-SUFFIX,samsungapps.com,real-ip",
    "DOMAIN-SUFFIX,samsungcloud.com,real-ip",
    "DOMAIN-SUFFIX,samsungknox.com,real-ip",
    "DOMAIN-SUFFIX,samsungdm.com,real-ip",
    "DOMAIN-SUFFIX,qq.com,real-ip",
    "DOMAIN-SUFFIX,wechat.com,real-ip",
    "DOMAIN-SUFFIX,tencent.com,real-ip",
    "DOMAIN-SUFFIX,tencent-cloud.com,real-ip",
    "DOMAIN-SUFFIX,qpic.cn,real-ip",
    "DOMAIN-SUFFIX,qlogo.cn,real-ip",
    "DOMAIN-SUFFIX,gtimg.com,real-ip",
    "DOMAIN-SUFFIX,gdtimg.com,real-ip",
    "DOMAIN-SUFFIX,myqcloud.com,real-ip",
    "DOMAIN-SUFFIX,taobao.com,real-ip",
    "DOMAIN-SUFFIX,tmall.com,real-ip",
    "DOMAIN-SUFFIX,tbcdn.cn,real-ip",
    "DOMAIN-SUFFIX,alicdn.com,real-ip",
    "DOMAIN-SUFFIX,aliyun.com,real-ip",
    "DOMAIN-SUFFIX,amap.com,real-ip",
    "DOMAIN-SUFFIX,autonavi.com,real-ip",
    "DOMAIN-SUFFIX,ele.me,real-ip",
    "DOMAIN-SUFFIX,dingtalk.com,real-ip",
    "DOMAIN-SUFFIX,1688.com,real-ip",
    "DOMAIN-SUFFIX,bytedance.com,real-ip",
    "DOMAIN-SUFFIX,byteimg.com,real-ip",
    "DOMAIN-SUFFIX,tosv.com,real-ip",
    "DOMAIN-SUFFIX,douyin.com,real-ip",
    "DOMAIN-SUFFIX,iesdouyin.com,real-ip",
    "DOMAIN-SUFFIX,pstatp.com,real-ip",
    "DOMAIN-SUFFIX,snssdk.com,real-ip",
    "DOMAIN-SUFFIX,volccdn.com,real-ip",
    "DOMAIN-SUFFIX,toutiao.com,real-ip",
    "DOMAIN-SUFFIX,ixigua.com,real-ip",
    "DOMAIN-SUFFIX,baidu.com,real-ip",
    "DOMAIN-SUFFIX,bdstatic.com,real-ip",
    "DOMAIN-SUFFIX,bdimg.com,real-ip",
    "DOMAIN-SUFFIX,bcebos.com,real-ip",
    "DOMAIN-SUFFIX,meituan.com,real-ip",
    "DOMAIN-SUFFIX,meituan.net,real-ip",
    "DOMAIN-SUFFIX,dianping.com,real-ip",
    "DOMAIN-SUFFIX,pinduoduo.com,real-ip",
    "DOMAIN-SUFFIX,jd.com,real-ip",
    "DOMAIN-SUFFIX,jdcdn.com,real-ip",
    "DOMAIN-SUFFIX,kuaishou.com,real-ip",
    "DOMAIN-SUFFIX,ksyun.com,real-ip",
    "DOMAIN-SUFFIX,xiaohongshu.com,real-ip",
    "DOMAIN-SUFFIX,xhscdn.com,real-ip",
    "DOMAIN-SUFFIX,netease.com,real-ip",
    "DOMAIN-SUFFIX,163.com,real-ip",
    "DOMAIN-SUFFIX,126.net,real-ip",
    "DOMAIN-SUFFIX,unionpaysecure.com,real-ip",
    "DOMAIN-SUFFIX,pingan.com.cn,real-ip",
    "DOMAIN-SUFFIX,cpic.com.cn,real-ip",
    "DOMAIN-SUFFIX,zhongan.com,real-ip",
    "DOMAIN-SUFFIX,eastmoney.com,real-ip",
    "DOMAIN-SUFFIX,htsc.com.cn,real-ip",
    "DOMAIN-SUFFIX,gtja.com,real-ip",
    "DOMAIN-SUFFIX,deepseek.com,real-ip",
    "DOMAIN-SUFFIX,deepseek.ai,real-ip",
    "DOMAIN-SUFFIX,moonshot.cn,real-ip",
    "DOMAIN-SUFFIX,kimichat.com,real-ip",
    "DOMAIN-SUFFIX,zhipuai.cn,real-ip",
    "DOMAIN-SUFFIX,chatglm.cn,real-ip",
    "DOMAIN-SUFFIX,baichuan-ai.com,real-ip",
    "DOMAIN-SUFFIX,sensetime.com,real-ip",
    "DOMAIN-SUFFIX,minimax.chat,real-ip",
    "DOMAIN-SUFFIX,stepfun.com,real-ip",
    "DOMAIN-SUFFIX,iflytek.com,real-ip",
    "DOMAIN-SUFFIX,bilivideo.cn,real-ip",
    "DOMAIN-SUFFIX,iqiyi.com,real-ip",
    "DOMAIN-SUFFIX,youku.com,real-ip",
    "DOMAIN-SUFFIX,asusrouter.com,real-ip",
    "DOMAIN-SUFFIX,router.asus.com,real-ip",
    "DOMAIN-SUFFIX,tplinkwifi.net,real-ip",
    "DOMAIN-SUFFIX,tendawifi.com,real-ip",
    "DOMAIN-SUFFIX,routerlogin.com,real-ip",
    "DOMAIN-SUFFIX,tplogin.cn,real-ip",
    "DOMAIN-SUFFIX,hiwifi.com,real-ip",
    "DOMAIN-SUFFIX,phicomm.me,real-ip",
    "DOMAIN-SUFFIX,local.adguard.org,real-ip",
    "DOMAIN-SUFFIX,plex.direct,real-ip",
    "DOMAIN-SUFFIX,ts.net,real-ip",
    "DOMAIN-SUFFIX,todesk.com,real-ip",
    "DOMAIN-SUFFIX,oray.com,real-ip",
    "DOMAIN-SUFFIX,sunlogin.com,real-ip",
    "DOMAIN-SUFFIX,teamviewer.com,real-ip",
    "DOMAIN-SUFFIX,anydesk.com,real-ip",
    "DOMAIN-SUFFIX,rustdesk.com,real-ip",
    "DOMAIN,localhost.ptlogin2.qq.com,real-ip",
    "DOMAIN,localhost.sec.qq.com,real-ip",
    "DOMAIN,localhost.work.weixin.qq.com,real-ip",
    "DOMAIN-SUFFIX,market.xiaomi.com,real-ip",
    "DOMAIN-SUFFIX,pool.ntp.org,real-ip",
    "DOMAIN-SUFFIX,ntp.org,real-ip",
    "DOMAIN-SUFFIX,ntp.aliyun.com,real-ip",
    "DOMAIN-SUFFIX,ntp1.aliyun.com,real-ip",
    "DOMAIN-SUFFIX,ntp.tencent.com,real-ip",
    "DOMAIN-SUFFIX,ntp.ubuntu.com,real-ip",
    "DOMAIN-SUFFIX,time.nist.gov,real-ip",
    "DOMAIN,time.cloudflare.com,real-ip",
    "DOMAIN,doh.pub,real-ip",
    "DOMAIN,dns.alidns.com,real-ip",
    "DOMAIN,mtalk.google.com,real-ip",
    "DOMAIN-SUFFIX,gov.cn,real-ip",
    "DOMAIN-SUFFIX,edu.cn,real-ip",
    "DOMAIN-SUFFIX,12306.cn,real-ip",
    "DOMAIN-SUFFIX,chinatax.gov.cn,real-ip",
    "DOMAIN-SUFFIX,fuwu.nhsa.gov.cn,real-ip",
    "DOMAIN-SUFFIX,gjzwfw.gov.cn,real-ip",
    "DOMAIN-SUFFIX,xiaojukeji.com,real-ip",
    "DOMAIN-SUFFIX,didichuxing.com,real-ip",
    "DOMAIN-SUFFIX,work.weixin.qq.com,real-ip",
    "DOMAIN-SUFFIX,meeting.tencent.com,real-ip",
    "DOMAIN-SUFFIX,weibo.com,real-ip",
    "DOMAIN-SUFFIX,zhihu.com,real-ip",
    "DOMAIN-SUFFIX,ctrip.com,real-ip",
    "DOMAIN-SUFFIX,qunar.com,real-ip",
    "DOMAIN-SUFFIX,sf-express.com,real-ip",
    "DOMAIN-SUFFIX,feishu.cn,real-ip",
    "DOMAIN-SUFFIX,xuexi.cn,real-ip",
    "DOMAIN-SUFFIX,chsi.com.cn,real-ip",
    "DOMAIN-SUFFIX,railway12306.cn,real-ip",
    "DOMAIN-SUFFIX,mcdn.bilivideo.cn,real-ip",
    "DOMAIN-SUFFIX,szbdyd.com,real-ip",
    "DOMAIN-SUFFIX,battlenet.com.cn,real-ip",
    "DOMAIN-SUFFIX,blzstatic.cn,real-ip",
    "DOMAIN-SUFFIX,wotgame.cn,real-ip",
    "DOMAIN-SUFFIX,wggames.cn,real-ip",
    "DOMAIN-SUFFIX,wowsgame.cn,real-ip",
    "DOMAIN-SUFFIX,stun.l.google.com,real-ip",
    "DOMAIN-SUFFIX,stun1.l.google.com,real-ip",
    "DOMAIN-SUFFIX,stun2.l.google.com,real-ip",
    "DOMAIN-SUFFIX,stun3.l.google.com,real-ip",
    "DOMAIN-SUFFIX,stun4.l.google.com,real-ip",
    "DOMAIN,global.turn.twilio.com,real-ip",
    "DOMAIN-SUFFIX,stun.playstation.net,real-ip",
    "DOMAIN-SUFFIX,stun.syncthing.net,real-ip",
    "DOMAIN-SUFFIX,sslip.io,real-ip",
    "DOMAIN-SUFFIX,nip.io,real-ip",
    "DOMAIN-SUFFIX,m2m,real-ip",
    "DOMAIN-SUFFIX,bogon,real-ip",
    "DOMAIN-SUFFIX,in-addr.arpa,real-ip",
    "DOMAIN-SUFFIX,ip6.arpa,real-ip",
    "MATCH,fake-ip"
  ],
  "respect-rules": true,
  "fast-queries": true,
  "query-v6": false,
  "default-nameserver": [
    "tls://223.5.5.5",
    "tls://223.6.6.6",
    "tls://1.12.12.12",
    "tls://120.53.53.53"
  ],
  "proxy-server-nameserver": [
    "https://doh.pub/dns-query",
    "https://223.5.5.5/dns-query"
  ],
  "nameserver": [
    "https://dns.google/dns-query#RULES",
    "https://1.1.1.1/dns-query#RULES"
  ],
  "direct-nameserver": [
    "https://doh.pub/dns-query",
    "https://223.5.5.5/dns-query"
  ],
  "direct-nameserver-follow-policy": true,
  "nameserver-policy": {
    "rule-set:cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "rule-set:geolocation-cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "rule-set:bilibili": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "geosite:cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.net.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.org.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.edu.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.gov.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.mi.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.xiaomi.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.miui.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.micloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.mi-img.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.miwifi.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.xiaomiev.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.huawei.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.huaweicloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.hicloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.vmall.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.honor.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.vivo.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.vivoglobal.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.oppo.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.oppomobile.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.meizu.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.samsung.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.samsungapps.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.samsungcloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.samsungknox.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.samsungdm.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.qq.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.wechat.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.weixin.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.wx.qq.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tencent.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tencent-cloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.qpic.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.qlogo.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.gtimg.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.gdtimg.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.myqcloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.wechatpay.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.alipay.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.alipayobjects.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.taobao.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tmall.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tbcdn.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.alicdn.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.aliyun.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.amap.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.autonavi.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.ele.me": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.dingtalk.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.1688.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.bytedance.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.byteimg.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tosv.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.douyin.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.iesdouyin.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.pstatp.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.snssdk.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.volccdn.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.toutiao.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.ixigua.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.feishu.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.feishu.net": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.volces.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.baidu.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.bdstatic.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.bdimg.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.bcebos.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.iqiyi.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.iqiyipic.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.baidubce.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tenpay.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.unionpay.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.unionpaysecure.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.95516.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.icbc.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.ccb.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.boc.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.cmbchina.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.abchina.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.bankcomm.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.psbc.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.spdb.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.cmbc.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.cib.com.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.tongdun.net": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.ishumei.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.geetest.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.trustdevice.net": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.rongcloud.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.rongcloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.umeng.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.umengcloud.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.servicewechat.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.weixinbridge.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.url.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.aegis.qq.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.deepseek.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.deepseek.ai": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.moonshot.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.kimichat.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.zhipuai.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.chatglm.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.baichuan-ai.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.sensetime.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.minimax.chat": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.stepfun.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.iflytek.com": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.12306.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "+.railway12306.cn": [
      "https://doh.pub/dns-query",
      "https://223.5.5.5/dns-query"
    ],
    "geosite:google": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "geosite:youtube": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "geosite:telegram": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.twitter.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.t.co": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.x.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.openai.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.chatgpt.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.oaistatic.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.oaiusercontent.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.anthropic.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.claude.ai": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.gemini.google.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "+.aistudio.google.com": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ],
    "geosite:geolocation-!cn": [
      "https://8.8.8.8/dns-query#RULES",
      "https://1.1.1.1/dns-query#RULES"
    ]
  }
};

  // （比如App硬编码IP直连）的情况下依然能按域名正确分流，
  // 提升规则匹配准确度，减少误判进国内/境外分组
  config["sniffer"] = {
  "enable": true,
  "force-dns-mapping": true,
  "parse-pure-ip": true,
  "override-destination": true,
  "sniff": {
    "HTTP": {
      "ports": [
        80,
        "8080-8880"
      ],
      "enable": true,
      "override-destination": true
    },
    "TLS": {
      "ports": [
        443,
        8443
      ],
      "enable": true,
      "override-destination": true
    }
  },
  "force-domain": [
    "+.google.com",
    "+.youtube.com",
    "+.telegram.org",
    "+.openai.com",
    "+.anthropic.com",
    "+.twitter.com",
    "+.x.com",
    "+.googlevideo.com",
    "+.ytimg.com",
    "+.chatgpt.com",
    "+.claude.ai"
  ],
  "skip-dst-address": [
    "91.105.192.0/23",
    "91.108.4.0/22",
    "91.108.8.0/21",
    "91.108.16.0/21",
    "91.108.56.0/22",
    "95.161.64.0/20",
    "149.154.160.0/20",
    "185.76.151.0/24"
  ],
  "skip-domain": [
    "geosite:cn",
    "geosite:geolocation-cn",
    "geosite:category-ads-all",
    "geosite:category-games-cn",
    "+.gstatic.com",
    "+.msftconnecttest.com",
    "+.msftncsi.com",
    "+.captive.apple.com",
    "+.router.asus.com",
    "+.tplogin.cn",
    "+.hiwifi.com",
    "+.phicomm.me",
    "+.local",
    "+.lan",
    "+.home.arpa",
    "+.unionpay.com",
    "+.95516.com",
    "+.alipay.com",
    "+.alipayobjects.com",
    "+.tenpay.com",
    "+.wechatpay.cn",
    "+.abchina.com",
    "+.abchina.com.cn",
    "+.icbc.com.cn",
    "+.ccb.com",
    "+.boc.cn",
    "+.bankofchina.com",
    "+.cmbchina.com",
    "+.bankcomm.com",
    "+.psbc.com",
    "+.spdb.com.cn",
    "+.cib.com.cn",
    "+.cmbc.com.cn",
    "+.pingan.com",
    "+.cgbchina.com.cn",
    "+.hxb.com.cn",
    "+.cebbank.com",
    "+.citicbank.com",
    "+.ecitic.com",
    "+.gfbazc.com",
    "+.fzuol.com",
    "+.netsunion.org.cn",
    "+.tongdun.net",
    "+.ishumei.com",
    "+.geetest.com",
    "+.trustdevice.net",
    "+.rongcloud.cn",
    "+.rongcloud.com",
    "+.umeng.com",
    "+.umengcloud.com",
    "+.tongduncdn.com",
    "+.dingxiangyun.com",
    "+.dingxiangyun.cn",
    "+.rong360.com",
    "+.99bill.com",
    "+.chinapay.com",
    "+.yeepay.com",
    "+.jdpay.com",
    "+.unionpaysecure.com",
    "+.pingan.com.cn",
    "+.aegis.qq.com",
    "+.riskradar.net",
    "+.cpic.com.cn",
    "+.zhongan.com",
    "+.eastmoney.com",
    "+.htsc.com.cn",
    "+.gtja.com",
    "+.jpush.cn",
    "+.jpush.io",
    "+.jiguang.cn",
    "+.weixin.qq.com",
    "+.wx.qq.com",
    "+.servicewechat.com",
    "+.12306.cn",
    "+.railway12306.cn",
    "+.chinatax.gov.cn",
    "+.fuwu.nhsa.gov.cn",
    "+.gjzwfw.gov.cn",
    "+.xiaojukeji.com",
    "+.didichuxing.com",
    "+.work.weixin.qq.com",
    "+.meeting.tencent.com",
    "+.taobao.com",
    "+.jd.com",
    "+.pinduoduo.com",
    "+.meituan.com",
    "+.dianping.com",
    "+.ele.me",
    "+.amap.com",
    "+.baidu.com",
    "+.xiaohongshu.com",
    "+.kuaishou.com",
    "+.163.com",
    "+.weibo.com",
    "+.zhihu.com",
    "+.ctrip.com",
    "+.qunar.com",
    "+.sf-express.com",
    "+.dingtalk.com",
    "+.feishu.cn",
    "+.xuexi.cn",
    "+.chsi.com.cn"
  ]
};

  config["hosts"] = {
  "dns.alidns.com": [
    "223.5.5.5",
    "223.6.6.6"
  ],
  "doh.pub": [
    "1.12.12.12",
    "120.53.53.53"
  ],
  "dns.google": [
    "8.8.8.8",
    "8.8.4.4"
  ],
  "cloudflare-dns.com": [
    "1.1.1.1",
    "1.0.0.1"
  ]
};

  config["mixed-port"] = 17890;
  // （仅本机监听），而非无条件强制开放局域网——降低公共网络下被同网段
  // 设备探测到开放代理端口的风险。如需给家里其他设备共享代理，手动改回
  // allow-lan: true 即可。
  config["allow-lan"] = false;
  config["bind-address"] = "127.0.0.1";
  config["ipv6"] = false;
  config["mode"] = "rule";
  config["log-level"] = "info";
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["keep-alive-interval"] = 15;
  config["keep-alive-idle"] = 15;
  config["disable-keep-alive"] = false;
  config["find-process-mode"] = "strict";
  config["etag-support"] = true;
  config["experimental"] = {
  "quic-go-disable-gso": false,
  "quic-go-disable-ecn": false
};
  config["external-controller"] = "127.0.0.1:19090";
  // CORS防护：只允许本地origin访问控制器，防止CDN被劫持/投毒后
  // 其JS通过CORS读取本地控制器数据（节点列表、连接记录等敏感信息）
  config["external-controller-cors"] = {
  "allow-origins": [
    "http://127.0.0.1:19090",
    "https://127.0.0.1:19090",
    "http://localhost:19090",
    "https://localhost:19090"
  ],
  "allow-private-network": false
};
  config["external-ui"] = "ui";
  config["external-ui-url"] = "https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip";

  // 兜底规则会连带失效，因此单独指定镜像而非依赖客户端默认源
  config["geodata-mode"] = false;
  config["geodata-loader"] = "memconservative";
  config["geo-auto-update"] = true;
  config["geo-update-interval"] = 168;
  config["geox-url"] = {
  "geoip": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",
  "geosite": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",
  "mmdb": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.metadb",
  "asn": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb"
};

  config["profile"] = {
  "store-selected": false,
  "store-fake-ip": false
};
  config["ntp"] = {
  "enable": false,
  "write-to-system": false,
  "server": "ntp.aliyun.com",
  "port": 123,
  "interval": 30
};

  config["sub-rules"] = {
  "DOMESTIC_DOMAIN": [
    "DOMAIN-SUFFIX,teg.tencent-cloud.net,REJECT-DROP",
    "DOMAIN-SUFFIX,szlong.weixin.qq.com,DIRECT",
    "DOMAIN-SUFFIX,szminorshort.weixin.qq.com,DIRECT",
    "DOMAIN-SUFFIX,szshort.weixin.qq.com,DIRECT",
    "DOMAIN-SUFFIX,sz.weixin.qq.com,DIRECT",
    "DOMAIN-SUFFIX,long.weixin.qq.com,DIRECT",
    "DOMAIN-SUFFIX,short.weixin.qq.com,DIRECT",
    "DOMAIN-SUFFIX,weixin.qq.com,DIRECT",
    "DOMAIN-SUFFIX,servicewechat.com,DIRECT",
    "DOMAIN-SUFFIX,weixinbridge.com,DIRECT",
    "DOMAIN-SUFFIX,url.cn,DIRECT",
    "DOMAIN-SUFFIX,midea.com,DIRECT",
    "DOMAIN-SUFFIX,smartmidea.net,DIRECT",
    "DOMAIN-SUFFIX,haier.net,DIRECT",
    "DOMAIN-SUFFIX,haier.com,DIRECT",
    "DOMAIN-SUFFIX,hisense.com,DIRECT",
    "DOMAIN-SUFFIX,yeelight.com,DIRECT",
    "DOMAIN-SUFFIX,aqara.com,DIRECT",
    "DOMAIN-SUFFIX,tuya.com,DIRECT",
    "DOMAIN-SUFFIX,tuyaus.com,DIRECT",
    "DOMAIN-SUFFIX,tcl.com,DIRECT",
    "DOMAIN-SUFFIX,jpush.cn,DIRECT",
    "DOMAIN-SUFFIX,jpush.io,DIRECT",
    "DOMAIN-SUFFIX,jiguang.cn,DIRECT",
    "DOMAIN,msg.umeng.com,DIRECT",
    "DOMAIN-SUFFIX,getui.com,DIRECT",
    "DOMAIN-SUFFIX,getui.net,DIRECT",
    "DOMAIN-SUFFIX,gepush.com,DIRECT",
    "DOMAIN,account.xiaomi.com,DIRECT",
    "DOMAIN,passport.xiaomi.com,DIRECT",
    "DOMAIN,micloud.xiaomi.com,DIRECT",
    "DOMAIN,i.mi.com,DIRECT",
    "DOMAIN,auth.be.sec.miui.com,DIRECT",
    "DOMAIN,idm.api.io.mi.com,DIRECT",
    "DOMAIN,api.installer.xiaomi.com,DIRECT",
    "DOMAIN,flash.sec.miui.com,DIRECT",
    "DOMAIN,mazu.sec.miui.com,DIRECT",
    "DOMAIN,ccc.sys.miui.com,DIRECT",
    "DOMAIN,register.xmpush.xiaomi.com,DIRECT",
    "RULE-SET,geolocation-cn,DIRECT",
    "RULE-SET,cn,DIRECT",
    "RULE-SET,bilibili,DIRECT",
    "RULE-SET,apple-cn,DIRECT",
    "RULE-SET,microsoft-cn,DIRECT",
    "GEOSITE,cn,DIRECT",
    "RULE-SET,steam-cn,DIRECT",
    "RULE-SET,category-games-cn,DIRECT",
    "RULE-SET,tracker,DIRECT"
  ],
  "DOMESTIC_IP": [
    "IP-CIDR,101.226.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,140.207.0.0/16,DIRECT,no-resolve",
    "RULE-SET,cn-ip,DIRECT,no-resolve",
    "GEOIP,CN,DIRECT,no-resolve"
  ]
};

  // BEGIN AUTO-SYNC: template.yaml common behavior
  var CANONICAL = {
  "mode": "rule",
  "allow-lan": false,
  "bind-address": "127.0.0.1",
  "mixed-port": 17890,
  "log-level": "info",
  "ipv6": false,
  "unified-delay": true,
  "tcp-concurrent": true,
  "keep-alive-interval": 15,
  "keep-alive-idle": 15,
  "disable-keep-alive": false,
  "find-process-mode": "strict",
  "etag-support": true,
  "external-controller": "127.0.0.1:19090",
  "global-ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "geodata-mode": true,
  "geodata-loader": "memconservative",
  "geo-auto-update": true,
  "geo-update-interval": 168,
  "profile": {
    "store-selected": false,
    "store-fake-ip": false
  },
  "ntp": {
    "enable": false,
    "write-to-system": false,
    "server": "ntp.aliyun.com",
    "port": 123,
    "interval": 30
  },
  "experimental": {
    "quic-go-disable-gso": false,
    "quic-go-disable-ecn": false
  },
  "external-controller-cors": {
    "allow-origins": [
      "http://127.0.0.1:19090",
      "https://127.0.0.1:19090",
      "http://localhost:19090",
      "https://localhost:19090"
    ],
    "allow-private-network": false
  },
  "geox-url": {
    "geoip": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",
    "geosite": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",
    "mmdb": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.metadb",
    "asn": "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb"
  }
};
  config["mode"] = CANONICAL["mode"];
  config["allow-lan"] = CANONICAL["allow-lan"];
  config["bind-address"] = CANONICAL["bind-address"];
  config["mixed-port"] = CANONICAL["mixed-port"];
  config["log-level"] = CANONICAL["log-level"];
  config["ipv6"] = CANONICAL["ipv6"];
  config["unified-delay"] = CANONICAL["unified-delay"];
  config["tcp-concurrent"] = CANONICAL["tcp-concurrent"];
  config["keep-alive-interval"] = CANONICAL["keep-alive-interval"];
  config["keep-alive-idle"] = CANONICAL["keep-alive-idle"];
  config["disable-keep-alive"] = CANONICAL["disable-keep-alive"];
  config["find-process-mode"] = CANONICAL["find-process-mode"];
  config["etag-support"] = CANONICAL["etag-support"];
  config["external-controller"] = CANONICAL["external-controller"];
  config["global-ua"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  config["geodata-mode"] = CANONICAL["geodata-mode"];
  config["geodata-loader"] = CANONICAL["geodata-loader"];
  config["geo-auto-update"] = CANONICAL["geo-auto-update"];
  config["geo-update-interval"] = CANONICAL["geo-update-interval"];
  config["profile"] = CANONICAL["profile"];
  config["ntp"] = CANONICAL["ntp"];
  config["experimental"] = CANONICAL["experimental"];
  config["external-controller-cors"] = CANONICAL["external-controller-cors"];
  config["geox-url"] = CANONICAL["geox-url"];
  // 机场模式必须保留与主配置一致的远控工具例外：规则层允许该组使用 DIRECT，\n  // 但 UI 不额外暴露 DIRECT 作为通用节点选择项。\n  // 公共同步只覆盖安全底层配置；机场原有策略组及其名称/节点选择逻辑不再被改写。
  // 机场模式明确保留：广告拦截 DIRECT、远控工具 DIRECT。
  // 私有网络/国内服务 DIRECT 只存在于底层规则，不提供用户策略组。
  // 链式模式的功能组名称与机场模式不同，因此仅将公共规则目标映射到现有机场组名。
  var TARGET_MAP = {
    "AI服务": "🤖 AI服务",
    "国外服务": "🌍 国外服务",
    "流媒体": "📺 Media",
    "漏网之鱼": "🐟 漏网之鱼",
    "远控工具": "🔧 远控工具"
  };
  function mapRuleTargets(list) {
    if (!list || !list.map) return list;
    return list.map(function (rule) {
      if (typeof rule !== "string") return rule;
      var parts = rule.split(",");
      if (parts.length < 2) return rule;
      var targetIndex = parts.length - 1;
      if (parts[targetIndex] === "no-resolve" && parts.length >= 3) targetIndex--;
      var target = parts[targetIndex];
      if (TARGET_MAP[target]) parts[targetIndex] = TARGET_MAP[target];
      return parts.join(",");
    });
  }
  if (config["rules"]) config["rules"] = mapRuleTargets(config["rules"]);
  if (config["sub-rules"]) {
    for (var sr in config["sub-rules"]) {
      if (Object.prototype.hasOwnProperty.call(config["sub-rules"], sr)) {
        config["sub-rules"][sr] = mapRuleTargets(config["sub-rules"][sr]);
      }
    }
  }
  // END AUTO-SYNC: template.yaml common behavior

  return config;
}

