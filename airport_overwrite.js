/**
 * 机场订阅覆写（TUN · 无链式）
 * 兼容旧版客户端脚本引擎（避免 find / ?. / 对象展开 / \u{} 正则）
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
  for (var raw of filteredRaw) {
    var n = normalizeProxyName(raw);
    var finalName = n.name;
    if (Object.prototype.hasOwnProperty.call(nameCount, finalName)) {
      var count = nameCount[finalName] + 1;
      nameCount[finalName] = count;
      finalName = "" + n.name + " #${count}";
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
  for (var r of activeRegions) {
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
  var privateGroup = { name: "🔒 私有网络", type: "select", proxies: ["DIRECT", SELECT_NAME], icon: "" };
  var domesticGroup = { name: "🇨🇳 国内服务", type: "select", proxies: ["DIRECT", SELECT_NAME].concat(regionNames), icon: "" };
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

  config["proxy-groups"] = [selectGroup, autoGroup, lbGroup, adBlockGroup, privateGroup, domesticGroup, aiGroup, mediaGroup, youtubeGroup, googleGroup, telegramGroup, microsoftGroup, appleGroup, steamGroup, tiktokGroup, twitterGroup, spotifyGroup, globalServiceGroup, fallbackGroup, remoteToolGroup].concat(regionGroups);

  var ruleProviderCommonDomain = { type: "http", format: "mrs", interval: 86400, behavior: "domain" };
  var ruleProviderCommonIpcidr = { type: "http", format: "mrs", interval: 86400, behavior: "ipcidr" };
  var ruleProviderClassical = { type: "http", behavior: "classical", interval: 86400 };
  var ruleProviderTextDomain = { type: "http", format: "text", interval: 86400, behavior: "domain" };

  var BASE_META = "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo";
  var BASE_BLACK = "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash";

  config["rule-providers"] = {
    private: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/private.mrs", path: "./ruleset/private.mrs" }),
    private_ip: assign({}, ruleProviderCommonIpcidr, { url: BASE_META + "/geoip/private.mrs", path: "./ruleset/private_ip.mrs" }),
    cn: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/cn.mrs", path: "./ruleset/cn.mrs" }),
    "geolocation-cn": assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/geolocation-cn.mrs", path: "./ruleset/geolocation-cn.mrs" }),
    games_cn: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/category-games@cn.mrs", path: "./ruleset/games_cn.mrs" }),
    apple_cn: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/apple@cn.mrs", path: "./ruleset/apple_cn.mrs" }),
    microsoft_cn: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/microsoft@cn.mrs", path: "./ruleset/microsoft_cn.mrs" }),
    ads: assign({}, ruleProviderCommonDomain, { url: "https://cdn.jsdelivr.net/gh/217heidai/adblockfilters@main/rules/adblockmihomolite.mrs", path: "./ruleset/ads.mrs" }),
    ai: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/category-ai-!cn.mrs", path: "./ruleset/ai.mrs" }),
    youtube: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/youtube.mrs", path: "./ruleset/youtube.mrs" }),
    google: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/google.mrs", path: "./ruleset/google.mrs" }),
    google_ip: assign({}, ruleProviderCommonIpcidr, { url: BASE_META + "/geoip/google.mrs", path: "./ruleset/google_ip.mrs" }),
    telegram: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/telegram.mrs", path: "./ruleset/telegram.mrs" }),
    telegram_ip: assign({}, ruleProviderCommonIpcidr, { url: BASE_META + "/geoip/telegram.mrs", path: "./ruleset/telegram_ip.mrs" }),
    microsoft: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/microsoft.mrs", path: "./ruleset/microsoft.mrs" }),
    github: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/github.mrs", path: "./ruleset/github.mrs" }),
    apple: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/apple.mrs", path: "./ruleset/apple.mrs" }),
    steam: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/steam.mrs", path: "./ruleset/steam.mrs" }),
    tiktok: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/tiktok.mrs", path: "./ruleset/tiktok.mrs" }),
    twitter: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/twitter.mrs", path: "./ruleset/twitter.mrs" }),
    twitter_ip: assign({}, ruleProviderCommonIpcidr, { url: BASE_META + "/geoip/twitter.mrs", path: "./ruleset/twitter_ip.mrs" }),
    spotify: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/spotify.mrs", path: "./ruleset/spotify.mrs" }),
    netflix: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/netflix.mrs", path: "./ruleset/netflix.mrs" }),
    netflix_ip: assign({}, ruleProviderCommonIpcidr, { url: BASE_META + "/geoip/netflix.mrs", path: "./ruleset/netflix_ip.mrs" }),
    disney: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/disney.mrs", path: "./ruleset/disney.mrs" }),
    hbo: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/hbo.mrs", path: "./ruleset/hbo.mrs" }),
    twitch: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/twitch.mrs", path: "./ruleset/twitch.mrs" }),
    gfw: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/gfw.mrs", path: "./ruleset/gfw.mrs" }),
    wechat: assign({}, ruleProviderClassical, { url: BASE_BLACK + "/WeChat/WeChat.yaml", path: "./ruleset/wechat.yaml" }),
    phishing: assign({}, ruleProviderTextDomain, { url: "https://ruleset.skk.moe/Clash/domainset/reject_phishing.txt", path: "./ruleset/phishing.txt" }),
    icloud: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/icloud.mrs", path: "./ruleset/icloud.mrs" }),
    gitlab: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/gitlab.mrs", path: "./ruleset/gitlab.mrs" }),
    facebook: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/facebook.mrs", path: "./ruleset/facebook.mrs" }),
    instagram: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/instagram.mrs", path: "./ruleset/instagram.mrs" }),
    linkedin: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/linkedin.mrs", path: "./ruleset/linkedin.mrs" }),
    discord: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/discord.mrs", path: "./ruleset/discord.mrs" }),
    epicgames: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/epicgames.mrs", path: "./ruleset/epicgames.mrs" }),
    ea: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/ea.mrs", path: "./ruleset/ea.mrs" }),
    ubisoft: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/ubisoft.mrs", path: "./ruleset/ubisoft.mrs" }),
    blizzard: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/blizzard.mrs", path: "./ruleset/blizzard.mrs" }),
    paypal: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/paypal.mrs", path: "./ruleset/paypal.mrs" }),
    aws: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/aws.mrs", path: "./ruleset/aws.mrs" }),
    azure: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/azure.mrs", path: "./ruleset/azure.mrs" }),
    dropbox: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/dropbox.mrs", path: "./ruleset/dropbox.mrs" }),
    onedrive: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/onedrive.mrs", path: "./ruleset/onedrive.mrs" }),
    scholar: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/category-scholar-!cn.mrs", path: "./ruleset/scholar.mrs" }),
    hulu: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/hulu.mrs", path: "./ruleset/hulu.mrs" }),
    amazon: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/amazon.mrs", path: "./ruleset/amazon.mrs" }),
    bahamut: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/bahamut.mrs", path: "./ruleset/bahamut.mrs" }),
    biliintl: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/biliintl.mrs", path: "./ruleset/biliintl.mrs" }),
    abema: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/abema.mrs", path: "./ruleset/abema.mrs" }),
    bbc: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/bbc.mrs", path: "./ruleset/bbc.mrs" }),
    cloudflare_ip: assign({}, ruleProviderCommonIpcidr, { url: BASE_META + "/geoip/cloudflare.mrs", path: "./ruleset/cloudflare_ip.mrs" }),
    fastly_ip: assign({}, ruleProviderCommonIpcidr, { url: BASE_META + "/geoip/fastly.mrs", path: "./ruleset/fastly_ip.mrs" }),
    tracker: assign({}, ruleProviderCommonDomain, { url: BASE_META + "/geosite/tracker.mrs", path: "./ruleset/tracker.mrs" })
  };

  config.rules = [
    // P0. TUN 私有IP快速通道（比常规RULE-SET匹配更早命中，减少无谓判断）
    "AND,((IN-TYPE,TUN),(RULE-SET,private_ip)),DIRECT",

    // P1. IPv6 全封堵（配合全局 ipv6:false 双重保险，宁可断网不泄露）
    "IP-CIDR6,::/0,REJECT-DROP,no-resolve",

    // 噪音日志清理：腾讯统计上报走非标端口，运营商QoS导致大量超时噪音，
    // 拦截不影响微信/腾讯任何正常功能
    "DOMAIN-SUFFIX,teg.tencent-cloud.net,REJECT-DROP",

    // ── 微信长连接域名白名单：断开会导致"无法使用当前WiFi"弹窗 ──
    "DOMAIN-SUFFIX,szlong.weixin.qq.com,DIRECT", "DOMAIN-SUFFIX,szminorshort.weixin.qq.com,DIRECT",
    "DOMAIN-SUFFIX,szshort.weixin.qq.com,DIRECT", "DOMAIN-SUFFIX,short.weixin.qq.com,DIRECT",

    // ── 家电/IoT品牌直连 ──
    "DOMAIN-SUFFIX,midea.com,🇨🇳 国内服务", "DOMAIN-SUFFIX,haier.com,🇨🇳 国内服务",
    "DOMAIN-SUFFIX,hisense.com,🇨🇳 国内服务", "DOMAIN-SUFFIX,tuya.com,🇨🇳 国内服务",

    // ── 推送SDK白名单：曾被广告规则集误杀导致App收不到推送 ──
    "DOMAIN-SUFFIX,jpush.cn,🇨🇳 国内服务", "DOMAIN-SUFFIX,jpush.io,🇨🇳 国内服务", "DOMAIN-SUFFIX,jiguang.cn,🇨🇳 国内服务",
    "DOMAIN,msg.umeng.com,🇨🇳 国内服务",
    "DOMAIN-SUFFIX,getui.com,🇨🇳 国内服务", "DOMAIN-SUFFIX,getui.net,🇨🇳 国内服务",

    // ── 小米账号/登录白名单：曾被广告规则集误杀导致登录/推送失败 ──
    "DOMAIN,account.xiaomi.com,🇨🇳 国内服务", "DOMAIN,passport.xiaomi.com,🇨🇳 国内服务",
    "DOMAIN,micloud.xiaomi.com,🇨🇳 国内服务", "DOMAIN,i.mi.com,🇨🇳 国内服务",

    // ── 微信服务器IP段显式优先：防"无法连接当前WiFi"弹窗 ──
    "IP-CIDR,101.226.0.0/16,🇨🇳 国内服务,no-resolve", "IP-CIDR,140.207.0.0/16,🇨🇳 国内服务,no-resolve",

    // ── 误杀白名单：必须放在广告拦截/国内兜底之前 ──
    // 这些域名历史上被广告规则集/国内规则集误收录过，前置放行避免功能异常
    "DOMAIN-SUFFIX,wx.qq.com,DIRECT",
    "DOMAIN-SUFFIX,pddpic.com,🇨🇳 国内服务",
    "DOMAIN,connectivitycheck.gstatic.com,🇨🇳 国内服务",
    "DOMAIN-SUFFIX,app-measurement.com,🌍 国外服务",
    "DOMAIN-SUFFIX,firebaselogging.googleapis.com,🌍 国外服务",
    "DOMAIN-SUFFIX,crashlytics.com,🌍 国外服务",
    "DOMAIN-SUFFIX,firebase.io,🌍 国外服务",
    "DOMAIN-SUFFIX,connect.facebook.net,🌍 国外服务",
    "DOMAIN-SUFFIX,a-cdn.anthropic.com,🤖 AI服务",
    "DOMAIN-SUFFIX,assets-proxy.anthropic.com,🤖 AI服务",
    "DOMAIN-SUFFIX,bing.com,🌍 国外服务",
    "DOMAIN,samsunghealth.com,🇨🇳 国内服务",
    "DOMAIN,userlocation.googleapis.com,🌍 国外服务", "DOMAIN,voilatile-pa.googleapis.com,🌍 国外服务",
    "DOMAIN,geller-pa.googleapis.com,🌍 国外服务", "DOMAIN,mobilemaps-pa-gz.googleapis.com,🌍 国外服务",
    "DOMAIN,in.appcenter.ms,🪟 Microsoft", "DOMAIN,mobile.events.data.microsoft.com,🪟 Microsoft",
    "DOMAIN,samsungosp.com,🇨🇳 国内服务",
    "DOMAIN,browser-intake-us5-datadoghq.com,🌍 国外服务",

    // ── 云存储/支付CDN 强制走代理（这两个域名常被国内规则集误收录成
    //    国内域名，实际是境外服务，误判会导致访问失败）──
    "DOMAIN-SUFFIX,cloudflarestorage.com,🌍 国外服务",
    "DOMAIN-SUFFIX,paddle.com,🌍 国外服务",

    // ── 精确广告拦截：三星系统级广告推送，域名级封堵比规则集更彻底 ──
    "DOMAIN,galaxystore.ad-survey.com,REJECT",
    "DOMAIN,dls2.bigdata.samsung.com.cn,REJECT",

    // ── 证券/保险类金融白名单：直连避免境外IP触发异地登录风控 ──
    "DOMAIN-SUFFIX,cpic.com.cn,🇨🇳 国内服务", "DOMAIN-SUFFIX,zhongan.com,🇨🇳 国内服务",
    "DOMAIN-SUFFIX,eastmoney.com,🇨🇳 国内服务", "DOMAIN-SUFFIX,htsc.com.cn,🇨🇳 国内服务",
    "DOMAIN-SUFFIX,gtja.com,🇨🇳 国内服务", "DOMAIN-SUFFIX,dingxiangyun.com,🇨🇳 国内服务",
    "DOMAIN-SUFFIX,rong360.com,🇨🇳 国内服务", "DOMAIN-SUFFIX,99bill.com,🇨🇳 国内服务",
    "DOMAIN-SUFFIX,chinapay.com,🇨🇳 国内服务", "DOMAIN-SUFFIX,yeepay.com,🇨🇳 国内服务",
    "DOMAIN-SUFFIX,jdpay.com,🇨🇳 国内服务",

    // ── STUN/TURN 域名+端口双重封堵（防WebRTC真实IP泄露）──
    "DOMAIN-REGEX,^(stun|turn|stuns|turns)\\.,REJECT-DROP",
    "DOMAIN-REGEX,[-.]stun[-.],REJECT-DROP",
    "DOMAIN-REGEX,[-.]turn[-.],REJECT-DROP",
    "AND,((NETWORK,UDP),(DST-PORT,3478-3480)),REJECT-DROP",
    "AND,((NETWORK,UDP),(DST-PORT,5349-5355)),REJECT-DROP",
    "AND,((NETWORK,UDP),(DST-PORT,19302-19305)),REJECT-DROP",
    "AND,((NETWORK,TCP),(DST-PORT,3478-3480)),REJECT-DROP",
    "AND,((NETWORK,TCP),(DST-PORT,5349-5355)),REJECT-DROP",

    // ── DNS 明文/加密泄露全端口封堵（境外DNS用REJECT-DROP静默丢包，
    //    不返回RST/ICMP，避免暴露"这里有拦截行为"这个可探测特征）──
    "AND,((NETWORK,UDP),(DST-PORT,53),(NOT,((GEOIP,CN)))),REJECT-DROP",
    "AND,((NETWORK,TCP),(DST-PORT,53),(NOT,((GEOIP,CN)))),REJECT-DROP",
    "AND,((NETWORK,UDP),(DST-PORT,853),(NOT,((GEOIP,CN)))),REJECT-DROP",
    "AND,((NETWORK,TCP),(DST-PORT,853),(NOT,((GEOIP,CN)))),REJECT-DROP",
    "DOMAIN,dns.google,REJECT-DROP", "DOMAIN,cloudflare-dns.com,REJECT-DROP",
    "DOMAIN,mozilla.cloudflare-dns.com,REJECT-DROP", "DOMAIN,dns.quad9.net,REJECT-DROP",
    "DOMAIN,doh.opendns.com,REJECT-DROP", "DOMAIN,dns.adguard.com,REJECT-DROP",
    "DOMAIN,doh.pub,REJECT-DROP", "DOMAIN,dns.alidns.com,REJECT-DROP", "DOMAIN,doh.360.cn,REJECT-DROP",

    // ── 明文协议境外封堵（防恶意软件/异常App通过代理外联明文协议）──
    "AND,((NETWORK,TCP),(DST-PORT,21),(NOT,((GEOIP,CN)))),REJECT-DROP",
    "AND,((NETWORK,TCP),(DST-PORT,23),(NOT,((GEOIP,CN)))),REJECT-DROP",
    "AND,((NETWORK,TCP),(DST-PORT,25),(NOT,((GEOIP,CN)))),REJECT-DROP",

    // 反钓鱼：钓鱼网站域名，来自 SukkaW/Surge 维护的反钓鱼列表
    "RULE-SET,phishing,REJECT-DROP",

    "RULE-SET,private,🔒 私有网络", "RULE-SET,private_ip,🔒 私有网络,no-resolve",
    // 苹果/微软/游戏 国内加速域名：硬编码直连，不经过"国内服务"分组
    // ——即使用户把"国内服务"手动切到别的选项，这几个域名依然天然直连，
    // 不受影响（这些是CDN加速用的国内专线域名，没有理由走代理）
    "RULE-SET,games_cn,DIRECT", "RULE-SET,apple_cn,DIRECT", "RULE-SET,microsoft_cn,DIRECT",
    "RULE-SET,ads,🛑 广告拦截",

    // QUIC：境内直连，境外一律拒绝逼迫回退TCP（否则绕过下方域名分流）
    "AND,((NETWORK,UDP),(DST-PORT,443),(GEOIP,CN)),🇨🇳 国内服务",
    "AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((GEOIP,CN)))),REJECT-DROP",

    // ── IP泄露检测网站强制走代理：必须在国内兜底之前，
    //    防止这类网站被误判成国内域名导致测试结果不准 ──
    "DOMAIN-SUFFIX,browserleaks.com,🌍 国外服务", "DOMAIN-SUFFIX,browserleaks.org,🌍 国外服务",
    "DOMAIN-SUFFIX,ipleak.net,🌍 国外服务", "DOMAIN-SUFFIX,dnsleaktest.com,🌍 国外服务",
    "DOMAIN-SUFFIX,dnsleak.com,🌍 国外服务", "DOMAIN-SUFFIX,whoer.net,🌍 国外服务",
    "DOMAIN-SUFFIX,whatismyipaddress.com,🌍 国外服务", "DOMAIN-SUFFIX,ipinfo.io,🌍 国外服务",
    "DOMAIN-SUFFIX,ip-api.com,🌍 国外服务", "DOMAIN-SUFFIX,ifconfig.me,🌍 国外服务",
    "DOMAIN-SUFFIX,ip.sb,🌍 国外服务", "DOMAIN-SUFFIX,ipify.org,🌍 国外服务",

    // 微信：rule-provider + 关键域名兜底
    "RULE-SET,wechat,DIRECT", "DOMAIN-SUFFIX,weixin.qq.com,DIRECT", "DOMAIN-SUFFIX,wechat.com,DIRECT", "DOMAIN-SUFFIX,servicewechat.com,DIRECT", "DOMAIN-SUFFIX,tenpay.com,DIRECT", "DOMAIN-SUFFIX,qq.com,DIRECT", "DOMAIN-SUFFIX,qpic.cn,DIRECT", "DOMAIN-SUFFIX,qlogo.cn,DIRECT", "DOMAIN-SUFFIX,gtimg.com,DIRECT", "PROCESS-NAME,com.tencent.mm,DIRECT",
    // "Weixin"后部分安装仍沿用旧进程名，两个都匹配更保险）
    "PROCESS-NAME-WILDCARD,*WeChat*,DIRECT", "PROCESS-NAME-WILDCARD,*Weixin*,DIRECT",

    // ── 银行/支付App 进程级强制直连（TUN模式下银行App能感知代理层存在，
    //    进程级DIRECT最彻底，比域名规则更可靠）──
    "PROCESS-NAME-WILDCARD,*com.icbc*,DIRECT", "PROCESS-NAME-WILDCARD,*com.ccb*,DIRECT",
    "PROCESS-NAME-WILDCARD,*com.boc*,DIRECT", "PROCESS-NAME-WILDCARD,*com.abchina*,DIRECT",
    "PROCESS-NAME-WILDCARD,*com.cmbchina*,DIRECT", "PROCESS-NAME-WILDCARD,*com.cmbc*,DIRECT",
    "PROCESS-NAME-WILDCARD,*com.bankcomm*,DIRECT", "PROCESS-NAME-WILDCARD,*com.psbc*,DIRECT",
    "PROCESS-NAME-WILDCARD,*com.spdb*,DIRECT", "PROCESS-NAME-WILDCARD,*com.cib*,DIRECT",
    "PROCESS-NAME-WILDCARD,*com.pingan*,DIRECT", "PROCESS-NAME-WILDCARD,*com.cgbchina*,DIRECT",
    "PROCESS-NAME-WILDCARD,*com.hxb*,DIRECT", "PROCESS-NAME-WILDCARD,*com.cebbank*,DIRECT",
    "PROCESS-NAME-WILDCARD,*com.citic*,DIRECT",
    "PROCESS-NAME-WILDCARD,*com.tenpay*,DIRECT", "PROCESS-NAME-WILDCARD,*com.unionpay*,DIRECT",
    "PROCESS-NAME-WILDCARD,*com.eg.android.Alipay*,DIRECT",
    // 12306：反爬虫/反代理检测极严格，经常直接拒绝走代理的连接，
    // 需要和银行同等级别的进程级直连保护
    "PROCESS-NAME-WILDCARD,*com.MobileTicket*,DIRECT",

    // ── 支付宝/银行 域名层硬编码直连：与上面的进程规则形成双重保护。
    //    进程识别在部分国产系统上不一定100%可靠，域名层单独兜底一次，
    //    不依赖末尾通用国内兜底规则（那条走的是可切换分组）──
    "DOMAIN-SUFFIX,alipay.com,DIRECT", "DOMAIN-SUFFIX,alipayobjects.com,DIRECT",
    "DOMAIN-SUFFIX,abchina.com,DIRECT", "DOMAIN-SUFFIX,abchina.com.cn,DIRECT",
    "DOMAIN-SUFFIX,icbc.com.cn,DIRECT", "DOMAIN-SUFFIX,ccb.com,DIRECT",
    "DOMAIN-SUFFIX,boc.cn,DIRECT", "DOMAIN-SUFFIX,bankofchina.com,DIRECT",
    "DOMAIN-SUFFIX,cmbchina.com,DIRECT", "DOMAIN-SUFFIX,bankcomm.com,DIRECT",
    "DOMAIN-SUFFIX,psbc.com,DIRECT", "DOMAIN-SUFFIX,spdb.com.cn,DIRECT",
    "DOMAIN-SUFFIX,cib.com.cn,DIRECT", "DOMAIN-SUFFIX,cmbc.com.cn,DIRECT",
    "DOMAIN-SUFFIX,pingan.com,DIRECT", "DOMAIN-SUFFIX,cgbchina.com.cn,DIRECT",
    "DOMAIN-SUFFIX,hxb.com.cn,DIRECT", "DOMAIN-SUFFIX,cebbank.com,DIRECT",
    "DOMAIN-SUFFIX,citicbank.com,DIRECT", "DOMAIN-SUFFIX,ecitic.com,DIRECT",
    "DOMAIN-SUFFIX,unionpay.com,DIRECT", "DOMAIN-SUFFIX,95516.com,DIRECT",
    "DOMAIN-SUFFIX,wechatpay.cn,DIRECT",
    // 微博：日活巨大，有异地登录风控历史，域名层硬编码直连
    "DOMAIN-SUFFIX,weibo.com,DIRECT", "DOMAIN-SUFFIX,weibocdn.com,DIRECT",
    // 12306 域名层
    "DOMAIN-SUFFIX,12306.cn,DIRECT",

    "RULE-SET,ai,🤖 AI服务",
    "RULE-SET,youtube,📺 YouTube",
    "RULE-SET,netflix,📺 Media", "RULE-SET,netflix_ip,📺 Media,no-resolve", "RULE-SET,disney,📺 Media", "RULE-SET,hbo,📺 Media", "RULE-SET,twitch,📺 Media",
    "RULE-SET,hulu,📺 Media", "RULE-SET,amazon,📺 Media", "RULE-SET,bahamut,📺 Media", "RULE-SET,biliintl,📺 Media", "RULE-SET,abema,📺 Media", "RULE-SET,bbc,📺 Media",
    "RULE-SET,google,🔍 Google", "RULE-SET,google_ip,🔍 Google,no-resolve",
    "RULE-SET,telegram,📲 Telegram", "RULE-SET,telegram_ip,📲 Telegram,no-resolve",
    "RULE-SET,github,🪟 Microsoft", "RULE-SET,microsoft,🪟 Microsoft", "RULE-SET,azure,🪟 Microsoft", "RULE-SET,onedrive,🪟 Microsoft",
    "RULE-SET,apple,🍎 Apple", "RULE-SET,icloud,🍎 Apple",
    "RULE-SET,steam,🎮 Steam", "RULE-SET,epicgames,🎮 Steam", "RULE-SET,ea,🎮 Steam", "RULE-SET,ubisoft,🎮 Steam", "RULE-SET,blizzard,🎮 Steam",
    "RULE-SET,tiktok,📱 TikTok",
    "RULE-SET,twitter,🐦 Twitter", "RULE-SET,twitter_ip,🐦 Twitter,no-resolve",
    "RULE-SET,spotify,🎵 Spotify",

    "RULE-SET,gitlab,🌍 国外服务", "RULE-SET,facebook,🌍 国外服务", "RULE-SET,instagram,🌍 国外服务",
    "RULE-SET,linkedin,🌍 国外服务", "RULE-SET,discord,🌍 国外服务", "RULE-SET,paypal,🌍 国外服务",
    "RULE-SET,aws,🌍 国外服务", "RULE-SET,dropbox,🌍 国外服务", "RULE-SET,scholar,🌍 国外服务",
    "RULE-SET,cloudflare_ip,🌍 国外服务,no-resolve", "RULE-SET,fastly_ip,🌍 国外服务,no-resolve",

    // BT Tracker：国内种子tracker走直连提升连接成功率
    "RULE-SET,tracker,🇨🇳 国内服务",

    // AWS中国区FCM边缘IP段：属于Google推送但走AWS中国区中转，
    // GEOIP,CN会误判为国内，这里显式提前指定走代理避免推送异常
    "IP-CIDR,54.223.0.0/16,🤖 AI服务,no-resolve",

    // ── 远控/内网穿透工具：进程级强制拒绝并静默丢包 ──
    // 请删除对应那一行，否则该工具将完全无法连接。
    // ── 远控/内网穿透工具：进程级路由到"🔧 远控工具"分组（默认REJECT-
    //    DROP静默拒绝，未来要用时在客户端里把该分组切成DIRECT即可，
    //    上的可执行文件名大多首字母大写，大小写敏感的匹配可能导致
    //    全小写写法在Windows上失效，两种大小写都写上更保险。
    "PROCESS-NAME-WILDCARD,*teamviewer*,🔧 远控工具", "PROCESS-NAME-WILDCARD,*TeamViewer*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*anydesk*,🔧 远控工具", "PROCESS-NAME-WILDCARD,*AnyDesk*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*rustdesk*,🔧 远控工具", "PROCESS-NAME-WILDCARD,*RustDesk*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*todesk*,🔧 远控工具", "PROCESS-NAME-WILDCARD,*ToDesk*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*sunlogin*,🔧 远控工具", "PROCESS-NAME-WILDCARD,*SunloginClient*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*oray*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*tailscale*,🔧 远控工具", "PROCESS-NAME-WILDCARD,*Tailscale*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*zerotier*,🔧 远控工具", "PROCESS-NAME-WILDCARD,*ZeroTier*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*frpc*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*frps*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*cloudflared*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*ngrok*,🔧 远控工具",
    "PROCESS-NAME-WILDCARD,*natapp*,🔧 远控工具",

    "RULE-SET,cn,🇨🇳 国内服务", "RULE-SET,geolocation-cn,🇨🇳 国内服务", "GEOIP,CN,🇨🇳 国内服务,no-resolve",
    "RULE-SET,gfw,🌍 国外服务",
    "MATCH,🐟 漏网之鱼"
  ];

  config.tun = {
    enable: true,
    // mixed：TCP 走 system、UDP 走 gvisor（2025–2026 社区主流推荐）
    stack: "mixed",
    "auto-route": true,
    "strict-route": true,
    "auto-redirect": false,
    "auto-detect-interface": true,
    "dns-hijack": ["any:53", "tcp://any:53"],
    "inet4-route-only": false,
    mtu: 1500,
    gso: false,
    "gso-max-size": 65536,
    "udp-timeout": 300
  };

  var DOMESTIC_DNS = ["223.5.5.5", "119.29.29.29"];

  config.dns = {
    enable: true, ipv6: false,
    "cache-algorithm": "arc",
    "prefer-h3": false,
    "use-hosts": true, "use-system-hosts": true,
    "enhanced-mode": "fake-ip", "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter-mode": "rule",
    "fake-ip-filter": [
      "DOMAIN-SUFFIX,abchina.com,real-ip", "DOMAIN-SUFFIX,abchina.com.cn,real-ip",
      "DOMAIN-SUFFIX,icbc.com.cn,real-ip", "DOMAIN-SUFFIX,ccb.com,real-ip",
      "DOMAIN-SUFFIX,boc.cn,real-ip", "DOMAIN-SUFFIX,bankofchina.com,real-ip",
      "DOMAIN-SUFFIX,cmbchina.com,real-ip", "DOMAIN-SUFFIX,bankcomm.com,real-ip",
      "DOMAIN-SUFFIX,psbc.com,real-ip", "DOMAIN-SUFFIX,spdb.com.cn,real-ip",
      "DOMAIN-SUFFIX,cib.com.cn,real-ip", "DOMAIN-SUFFIX,cmbc.com.cn,real-ip",
      "DOMAIN-SUFFIX,pingan.com,real-ip", "DOMAIN-SUFFIX,cgbchina.com.cn,real-ip",
      "DOMAIN-SUFFIX,hxb.com.cn,real-ip", "DOMAIN-SUFFIX,cebbank.com,real-ip",
      "DOMAIN-SUFFIX,citicbank.com,real-ip", "DOMAIN-SUFFIX,ecitic.com,real-ip",
      "DOMAIN-SUFFIX,unionpay.com,real-ip", "DOMAIN-SUFFIX,95516.com,real-ip",
      "DOMAIN-SUFFIX,alipay.com,real-ip", "DOMAIN-SUFFIX,alipayobjects.com,real-ip",
      "DOMAIN-SUFFIX,tenpay.com,real-ip", "DOMAIN-SUFFIX,wechatpay.cn,real-ip",
      "DOMAIN-SUFFIX,servicewechat.com,real-ip", "DOMAIN-SUFFIX,weixinbridge.com,real-ip",
      "DOMAIN-SUFFIX,weixin.qq.com,real-ip", "DOMAIN-SUFFIX,wx.qq.com,real-ip",
      // 银行风控SDK：这些需要拿到真实IP才能正常完成设备指纹校验
      "DOMAIN-SUFFIX,tongdun.net,real-ip", "DOMAIN-SUFFIX,ishumei.com,real-ip",
      "DOMAIN-SUFFIX,geetest.com,real-ip", "DOMAIN-SUFFIX,trustdevice.net,real-ip",
      "DOMAIN-SUFFIX,aegis.qq.com,real-ip", "DOMAIN-SUFFIX,jpush.cn,real-ip",
      "DOMAIN-SUFFIX,jpush.io,real-ip", "DOMAIN-SUFFIX,jiguang.cn,real-ip",
      "DOMAIN-SUFFIX,rongcloud.cn,real-ip", "DOMAIN-SUFFIX,rongcloud.com,real-ip",
      "DOMAIN-SUFFIX,umeng.com,real-ip", "DOMAIN-SUFFIX,umengcloud.com,real-ip",
      "DOMAIN-SUFFIX,yeepay.com,real-ip", "DOMAIN-SUFFIX,jdpay.com,real-ip",
      // 反诈/清算机构
      "DOMAIN-SUFFIX,gfbazc.com,real-ip", "DOMAIN-SUFFIX,netsunion.org.cn,real-ip",
      // 国内基础设施
      "GEOSITE,private,real-ip",
      "DOMAIN-SUFFIX,lan,real-ip",
      "DOMAIN,localhost.ptlogin2.qq.com,real-ip",
      // 三大运营商WiFi认证门户：fake-ip会导致认证页面无法弹出
      "DOMAIN-SUFFIX,10086.cn,real-ip", "DOMAIN-SUFFIX,10010.com,real-ip", "DOMAIN-SUFFIX,10000.cn,real-ip",
      // 网络连通性检测：fake-ip会让系统误判"无网络"
      "DOMAIN-SUFFIX,msftconnecttest.com,real-ip", "DOMAIN-SUFFIX,msftncsi.com,real-ip",
      "DOMAIN,captive.apple.com,real-ip", "DOMAIN,connectivitycheck.gstatic.com,real-ip",
      // 游戏主机NAT探测
      "DOMAIN-SUFFIX,srv.nintendo.net,real-ip",
      "DOMAIN-SUFFIX,stun.playstation.net,real-ip",
      "DOMAIN-SUFFIX,xboxlive.com,real-ip",
      "DOMAIN-KEYWORD,xbox,real-ip",
      // 国内主流品牌/服务：fake-ip会破坏这些服务自身的CDN调度精度
      "DOMAIN-SUFFIX,mi.com,real-ip", "DOMAIN-SUFFIX,xiaomi.com,real-ip", "DOMAIN-SUFFIX,miui.com,real-ip",
      "DOMAIN-SUFFIX,huawei.com,real-ip", "DOMAIN-SUFFIX,huaweicloud.com,real-ip", "DOMAIN-SUFFIX,hicloud.com,real-ip",
      "DOMAIN-SUFFIX,vivo.com,real-ip", "DOMAIN-SUFFIX,oppo.com,real-ip", "DOMAIN-SUFFIX,meizu.com,real-ip",
      "DOMAIN-SUFFIX,qq.com,real-ip", "DOMAIN-SUFFIX,wechat.com,real-ip", "DOMAIN-SUFFIX,tencent.com,real-ip",
      "DOMAIN-SUFFIX,qpic.cn,real-ip", "DOMAIN-SUFFIX,qlogo.cn,real-ip", "DOMAIN-SUFFIX,gtimg.com,real-ip",
      "DOMAIN-SUFFIX,myqcloud.com,real-ip",
      "DOMAIN-SUFFIX,taobao.com,real-ip", "DOMAIN-SUFFIX,tmall.com,real-ip", "DOMAIN-SUFFIX,alicdn.com,real-ip",
      "DOMAIN-SUFFIX,aliyun.com,real-ip", "DOMAIN-SUFFIX,amap.com,real-ip", "DOMAIN-SUFFIX,dingtalk.com,real-ip",
      "DOMAIN-SUFFIX,bytedance.com,real-ip", "DOMAIN-SUFFIX,byteimg.com,real-ip", "DOMAIN-SUFFIX,douyin.com,real-ip",
      "DOMAIN-SUFFIX,toutiao.com,real-ip",
      "DOMAIN-SUFFIX,baidu.com,real-ip", "DOMAIN-SUFFIX,bdstatic.com,real-ip", "DOMAIN-SUFFIX,bcebos.com,real-ip",
      "DOMAIN-SUFFIX,meituan.com,real-ip", "DOMAIN-SUFFIX,pinduoduo.com,real-ip", "DOMAIN-SUFFIX,jd.com,real-ip",
      "DOMAIN-SUFFIX,kuaishou.com,real-ip", "DOMAIN-SUFFIX,xiaohongshu.com,real-ip",
      "DOMAIN-SUFFIX,163.com,real-ip", "DOMAIN-SUFFIX,126.net,real-ip",
      "DOMAIN-SUFFIX,bilibili.com,real-ip",
      // 滴滴出行：位置敏感度和地图同级，fake-ip会导致叫车定位/派单异常
      "DOMAIN-SUFFIX,didichuxing.com,real-ip", "DOMAIN-SUFFIX,xiaojukeji.com,real-ip",
      // 饿了么
      "DOMAIN-SUFFIX,ele.me,real-ip",
      "DOMAIN-SUFFIX,mihoyo.com,real-ip", "DOMAIN-SUFFIX,hoyoverse.com,real-ip",
      // 阿里云盘：大文件传输对CDN调度精度敏感
      "DOMAIN-SUFFIX,aliyundrive.com,real-ip", "DOMAIN-SUFFIX,alipan.com,real-ip",
      // 微博：日活巨大，此前完全未覆盖
      "DOMAIN-SUFFIX,weibo.com,real-ip", "DOMAIN-SUFFIX,weibocdn.com,real-ip",
      // 知乎/喜马拉雅/豆瓣
      "DOMAIN-SUFFIX,zhihu.com,real-ip", "DOMAIN-SUFFIX,zhimg.com,real-ip",
      "DOMAIN-SUFFIX,ximalaya.com,real-ip", "DOMAIN-SUFFIX,douban.com,real-ip",
      // 国内 AI 服务商
      "DOMAIN-SUFFIX,deepseek.com,real-ip", "DOMAIN-SUFFIX,moonshot.cn,real-ip", "DOMAIN-SUFFIX,zhipuai.cn,real-ip",
      "DOMAIN-SUFFIX,chatglm.cn,real-ip", "DOMAIN-SUFFIX,minimax.chat,real-ip", "DOMAIN-SUFFIX,iflytek.com,real-ip",
      // 视频
      "DOMAIN-SUFFIX,iqiyi.com,real-ip", "DOMAIN-SUFFIX,youku.com,real-ip", "DOMAIN-SUFFIX,bilivideo.cn,real-ip",
      // 路由器管理后台
      "DOMAIN-SUFFIX,router.asus.com,real-ip", "DOMAIN-SUFFIX,tplinkwifi.net,real-ip",
      "DOMAIN-SUFFIX,tendawifi.com,real-ip", "DOMAIN-SUFFIX,routerlogin.com,real-ip", "DOMAIN-SUFFIX,tplogin.cn,real-ip",
      // 不代表这些工具被放行
      "DOMAIN-SUFFIX,todesk.com,real-ip", "DOMAIN-SUFFIX,teamviewer.com,real-ip",
      "DOMAIN-SUFFIX,anydesk.com,real-ip", "DOMAIN-SUFFIX,rustdesk.com,real-ip",
      // 本地回环/内部域名
      "DOMAIN,localhost.sec.qq.com,real-ip", "DOMAIN,localhost.work.weixin.qq.com,real-ip",
      // NTP
      "DOMAIN-SUFFIX,ntp.aliyun.com,real-ip", "DOMAIN-SUFFIX,ntp.tencent.com,real-ip",
      "DOMAIN-SUFFIX,pool.ntp.org,real-ip", "DOMAIN,time.cloudflare.com,real-ip",
      // 国内DoH自身（防死锁：解析DoH服务器域名不能依赖DoH本身）
      "DOMAIN,doh.pub,real-ip", "DOMAIN,dns.alidns.com,real-ip",
      // Google FCM推送：直连保持推送可用
      "DOMAIN,mtalk.google.com,real-ip",
      // 政务/铁路
      "DOMAIN-SUFFIX,gov.cn,real-ip", "DOMAIN-SUFFIX,12306.cn,real-ip",
      // 仍被端口层REJECT-DROP规则拦截，不会真正泄露
      "DOMAIN-SUFFIX,stun.l.google.com,real-ip", "DOMAIN,global.turn.twilio.com,real-ip",
      // IP-in-domain服务（如 1-2-3-4.sslip.io）
      "DOMAIN-SUFFIX,sslip.io,real-ip", "DOMAIN-SUFFIX,nip.io,real-ip",
      // PTR反向查询
      "DOMAIN-SUFFIX,in-addr.arpa,real-ip", "DOMAIN-SUFFIX,ip6.arpa,real-ip",
      // 补充：来自 SukkaW ruleset 的边缘情况
      "DOMAIN-SUFFIX,bogon,real-ip", "DOMAIN-SUFFIX,internal,real-ip", "DOMAIN-SUFFIX,localdomain,real-ip",
      "DOMAIN-KEYWORD,stun,real-ip", // 与端口层REJECT-DROP配合，仅消除DNS噪音
      "DOMAIN,lancache.steamcontent.com,real-ip", // Steam局域网加速探测
      "DOMAIN,dns.msftncsi.com,real-ip",
      // 显式兜底：未命中以上任何条目的境外域名 → fake-ip
      "MATCH,fake-ip"
    ],
    "default-nameserver": DOMESTIC_DNS,
    // 这条查询遵循下方路由规则走代理。用纯IP而非域名是关键：如果用
    // "dns.google"这种域名形式，会被下方泄露防护规则里的
    // 误伤，导致mihomo自己解析境外域名的请求也被拦掉
    nameserver: ["https://1.1.1.1/dns-query#RULES", "https://8.8.8.8/dns-query#RULES"],
    // 旁路观察者识别，双厂商(腾讯/阿里)冗余
    "proxy-server-nameserver": ["https://doh.pub/dns-query", "https://dns.alidns.com/dns-query"],
    "direct-nameserver": ["https://doh.pub/dns-query", "https://dns.alidns.com/dns-query"],
    "direct-nameserver-follow-policy": true,
    "respect-rules": true,
    "fast-queries": true,
    "query-v6": false,
    "nameserver-policy": {
      // 应用连尝试连接都不会尝试，日志更干净
      "geosite:category-ads-all": "rcode://name_error",
      "geosite:cn": DOMESTIC_DNS,
      "rule-set:cn": DOMESTIC_DNS,
      "rule-set:private": DOMESTIC_DNS,
      // 宽泛国内域名前缀兜底：减少冷门国内域名（不在geosite:cn库里的）
      // 误走境外DNS解析的情况
      "+.cn": DOMESTIC_DNS, "+.com.cn": DOMESTIC_DNS, "+.net.cn": DOMESTIC_DNS,
      "+.org.cn": DOMESTIC_DNS, "+.edu.cn": DOMESTIC_DNS, "+.gov.cn": DOMESTIC_DNS
    },
  };

  // （比如App硬编码IP直连）的情况下依然能按域名正确分流，
  // 提升规则匹配准确度，减少误判进国内/境外分组
  config.sniffer = {
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    // 域名才能正确匹配分流规则）
    "override-destination": true,
    sniff: {
      TLS: { ports: [443, 8443], "override-destination": true },
      HTTP: { ports: [80, "8080-8880"], "override-destination": true }
      // 关闭后减少部分内核历史上的 QUIC sniffer 崩溃面
    },
    // 强制嗅探（即使DNS已解析成功，仍以嗅探结果为准）：这几个服务
    // 域名量大且CDN共用IP池，仅靠DNS解析容易错判分组
    "force-domain": [
      "+.google.com", "+.youtube.com", "+.telegram.org", "+.openai.com",
      "+.anthropic.com", "+.twitter.com", "+.x.com"
    ],
    // 即使最终流量走DIRECT也可能触发风控。跳过嗅探=握手全程不经过分析，
    // 银行App感知不到Mihomo的存在。
    "skip-domain": [
      "+.unionpay.com", "+.95516.com", "+.alipay.com", "+.alipayobjects.com",
      "+.tenpay.com", "+.wechatpay.cn",
      "+.abchina.com", "+.abchina.com.cn", "+.icbc.com.cn", "+.ccb.com",
      "+.boc.cn", "+.bankofchina.com", "+.cmbchina.com", "+.bankcomm.com",
      "+.psbc.com", "+.spdb.com.cn", "+.cib.com.cn", "+.cmbc.com.cn",
      "+.pingan.com", "+.cgbchina.com.cn", "+.hxb.com.cn", "+.cebbank.com",
      "+.citicbank.com", "+.ecitic.com",
      "+.tongdun.net", "+.ishumei.com", "+.geetest.com", "+.trustdevice.net",
      "+.rongcloud.cn", "+.rongcloud.com", "+.umeng.com", "+.umengcloud.com",
      "+.jpush.cn", "+.jpush.io", "+.jiguang.cn",
      // 连通性检测：嗅探/劫持这些域名会导致系统误判"无网络"
      "+.msftconnecttest.com", "+.msftncsi.com", "captive.apple.com", "+.gstatic.com",
      // 路由器管理后台、本地/内网域名：嗅探无意义且可能干扰局域网管理
      "+.tplinkwifi.net", "+.tendawifi.com", "+.routerlogin.com", "+.tplogin.cn",
      "+.lan", "+.local", "+.home.arpa",
      // 当作伪域名走TLS SNI，不是真实可解析的域名。如果被嗅探功能当成
      // 必须让嗅探跳过这个特殊字符串
      "Mijia Cloud",
      // 12306：反爬虫检测极严格，跳过嗅探降低被识别为"存在中间层"的概率
      "+.12306.cn", "+.12306.gov.cn"
    ],
    "skip-dst-address": ["91.108.4.0/22", "91.108.8.0/22", "91.108.16.0/22", "149.154.160.0/20"]
  };

  config.hosts = {
    "cloudflare-dns.com": ["1.1.1.1", "1.0.0.1"], "dns.google": ["8.8.8.8", "8.8.4.4"],
    "services.googleapis.cn": ["services.googleapis.com"],
    // （会自动挑选包括gcore在内的最优CDN节点），如果它在国内网络环境下
    "+.mcdn.bilivideo.com": "0.0.0.0", "+.mcdn.bilivideo.cn": "0.0.0.0", "+.edge.mountaintoys.cn": "0.0.0.0", "+.h2.smtcdns.net": "0.0.0.0"
  };

  config["mixed-port"] = config["mixed-port"] || 17890;
  // （仅本机监听），而非无条件强制开放局域网——降低公共网络下被同网段
  // 设备探测到开放代理端口的风险。如需给家里其他设备共享代理，手动改回
  // allow-lan: true 即可。
  config["allow-lan"] = config["allow-lan"] !== undefined ? config["allow-lan"] : false;
  config["bind-address"] = config["bind-address"] || "127.0.0.1";
  config.ipv6 = false;
  config.mode = "rule";
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
    "allow-origins": ["http://127.0.0.1:19090", "http://localhost:19090"],
    "allow-private-network": false
  };
  config["external-ui"] = "ui";
  config["external-ui-url"] = "https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip";

  // 兜底规则会连带失效，因此单独指定镜像而非依赖客户端默认源
  config["geodata-mode"] = true;
  config["geodata-loader"] = "memconservative";
  config["geo-auto-update"] = true;
  config["geo-update-interval"] = 168;
  config["geox-url"] = {
    geoip: "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",
    geosite: "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",
    mmdb: "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.metadb",
    asn: "https://gcore.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb"
  };

  config.profile = { "store-selected": false, "store-fake-ip": false };
  config.ntp = { enable: false, "write-to-system": false, server: "ntp.aliyun.com", port: 123, interval: 30 };

  return config;
}

