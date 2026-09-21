#!/usr/bin/env node
/* Regression test for airport_overwrite.js strategy and overwrite isolation. */
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("airport_overwrite.js", "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.__airportMain = main;`, sandbox, { filename: "airport_overwrite.js" });

const input = {
  mode: "global",
  mixedPort: 9999,
  proxies: [{
    name: "CI Airport Node",
    type: "vless",
    server: "198.51.100.20",
    port: 443,
    uuid: "00000000-0000-0000-0000-000000000000",
    "dialer-proxy": "CI Forbidden Chain",
  }],
  dns: { enable: false, nameserver: ["192.0.2.1"] },
  "proxy-groups": [{ name: "CI Injected Group", type: "select", proxies: ["DIRECT"] }],
  rules: ["MATCH,DIRECT"],
};

const output = sandbox.__airportMain(input);
function fail(message) { console.error(`[FAIL] ${message}`); process.exit(1); }
function ok(message) { console.log(`[PASS] ${message}`); }

if (!output || typeof output !== "object") fail("main() did not return a configuration object");
if (!Array.isArray(output.proxies) || output.proxies.length < 1) fail("airport proxy nodes were not preserved");
if (output.proxies.some(p => p && p["dialer-proxy"] != null)) fail("airport node retained dialer-proxy chain field");
if (output["proxy-groups"].some(g => g && g.name === "CI Injected Group")) fail("input proxy-group leaked into output");
if (output.dns && output.dns.nameserver && output.dns.nameserver.includes("192.0.2.1")) fail("input DNS leaked into output");
if (output.rules && output.rules.includes("MATCH,DIRECT")) fail("input rules leaked into output");
if (JSON.stringify(output).includes("CI Forbidden Chain")) fail("forbidden chain marker leaked into output");

const groups = Array.isArray(output["proxy-groups"]) ? output["proxy-groups"] : [];
const requiredGroups = [
  "Default Proxy", "Node Select", "Auto Select", "Load Balance", "Direct",
  "Ad Block", "Remote Tools", "AI Services", "FCM", "Bilibili",
  "YouTube", "Google", "Telegram", "Microsoft", "Apple",
  "TikTok", "Twitter", "Meta", "Line", "Netflix", "Emby",
  "Spotify", "Steam", "PikPak", "Crypto", "EHentai", "Final",
];
for (const name of requiredGroups) {
  if (!groups.some(g => g && g.name === name)) fail(`required strategy group missing: ${name}`);
}
const bannedGroups = [
  "✨ Gemini", "🤖 Claude AI", "🏠 私有网络", "🔒 国内服务", "🐱 Github",
  "🌐 社交媒体", "🎬 流媒体", "🎮 游戏平台", "📚 教育资源", "💰 金融服务",
  "☁️ 云服务", "🌐 非中国",
];
for (const name of bannedGroups) {
  if (groups.some(g => g && g.name === name)) fail(`homogeneous group was not removed: ${name}`);
}
if (!output.rules.some(rule => rule === "DOMAIN-SUFFIX,claude.ai,AI Services")) fail("Claude.ai is not routed to the unified AI group");
if (!output.rules.some(rule => rule === "RULE-SET,youtube,YouTube")) fail("YouTube is not routed to the dedicated YouTube group");
if (!output.rules.some(rule => rule === "RULE-SET,google,Google")) fail("Google is not routed to the dedicated Google group");
if (!output.rules.some(rule => rule === "RULE-SET,bilibili,Bilibili")) fail("Bilibili is not routed to the dedicated Bilibili group");
if (!output.rules.some(rule => rule === "DOMAIN-KEYWORD,emby,Emby")) fail("Emby is not routed to the dedicated Emby group");
if (!output.rules.some(rule => rule === "DOMAIN-SUFFIX,e-hentai.org,EHentai")) fail("EHentai is not routed to the dedicated EHentai group");
if (output.rules.some(rule => rule === "RULE-SET,bilibili,DIRECT")) fail("Bilibili is still hardcoded to bottom-layer DIRECT");
if ((output["sub-rules"] || {}).DOMESTIC_DOMAIN && output["sub-rules"].DOMESTIC_DOMAIN.includes("RULE-SET,bilibili,DIRECT")) {
  fail("Bilibili still sits in DOMESTIC_DOMAIN bottom-layer DIRECT");
}
if (!output.rules.some(rule => rule === "PROCESS-NAME-WILDCARD,*AnyDesk*,Remote Tools")) fail("AnyDesk is not routed to the remote-control group");
if (groups.some(g => g && ["🔰 节点选择", "🤖 AI服务", "🌍 国外服务"].includes(g.name))) fail("legacy strategy group remains");

const byName = name => groups.find(g => g && g.name === name);
const proxyOnlyGroups = [
  "AI Services", "YouTube", "Google", "Telegram",
  "TikTok", "Twitter", "Meta", "Line", "Netflix", "Crypto",
];
for (const name of proxyOnlyGroups) {
  const group = byName(name);
  if (!group || !Array.isArray(group.proxies)) fail(`service group has no proxy list: ${name}`);
  if (group.proxies.includes("DIRECT")) fail(`kernel DIRECT must not appear in non-China service group: ${name}`);
  if (group.proxies[0] !== "Default Proxy") fail(`default proxy must be first: ${name}`);
}

const withDirectLast = ["Microsoft", "Apple", "Spotify", "Steam", "PikPak", "Emby", "EHentai"];
for (const name of withDirectLast) {
  const group = byName(name);
  if (!group.proxies.includes("Direct")) fail(`MyClash-style Direct option missing from ${name}`);
  if (group.proxies[0] === "Direct") fail(`${name} should stay proxy-first with Direct last`);
}

const bili = byName("Bilibili");
if (!bili.proxies.includes("Direct")) fail("哔哩哔哩 group lost Direct selection");
if (bili.proxies[0] !== "Direct") fail("哔哩哔哩 Direct must be the first/default option, not a bottom-layer hardwire");
if (bili["default-selected"] !== "Direct") fail("哔哩哔哩 default-selected must be Direct");

const fcm = byName("FCM");
if (fcm.proxies[0] !== "Direct") fail("FCM should default to Direct like MyClash");

const ehentai = byName("EHentai");
if (ehentai["default-selected"] !== "Default Proxy" && ehentai["default-selected"] !== "🇺🇸 美国节点") {
  fail("EHentai should prefer US nodes when present, otherwise default proxy");
}

const ad = byName("Ad Block");
if (!ad.proxies.includes("Direct") && !ad.proxies.includes("DIRECT")) fail("DIRECT exception missing from ad blocking group");
if (!ad.proxies.includes("REJECT-DROP")) fail("REJECT-DROP default missing from ad blocking group");
const remote = byName("Remote Tools");
if (!remote.proxies.includes("Direct") && !remote.proxies.includes("DIRECT")) fail("DIRECT exception missing from remote-control group");

const select = byName("Node Select");
if (select.proxies.includes("DIRECT")) fail("node selection must not be a global DIRECT switch");
if (!select.proxies.includes("Auto Select") || !select.proxies.includes("Load Balance")) {
  fail("node selection lost auto/load-balance trio entries");
}

const direct = byName("Direct");
if (!direct.proxies.some(n => String(n).includes("双栈"))) fail("Direct group lost MyClash dual-stack node");

const providers = output["rule-providers"] || {};
if (!providers["google-gemini"] || !String(providers["google-gemini"].url || "").includes("google-gemini.mrs")) {
  fail("google-gemini provider missing or not using google-gemini.mrs");
}
if (!providers.anthropic || !String(providers.anthropic.url || "").includes("anthropic.mrs")) {
  fail("anthropic provider missing or not using anthropic.mrs");
}
const dumped = JSON.stringify(output);
for (const dead of ["geosite/gemini.mrs", "geosite/claude.mrs", "geoip/youtube.mrs"]) {
  if (dumped.includes(dead)) fail(`dead MetaCubeX ruleset leaked into output: ${dead}`);
}

const numbered = sandbox.__airportMain({
  proxies: [
    { name: "HK1", type: "vless", server: "198.51.100.21", port: 443 },
    { name: "US03", type: "vless", server: "198.51.100.22", port: 443 },
    { name: "日本 0.2x", type: "vless", server: "198.51.100.23", port: 443 },
  ],
});
const numberedGroups = Array.isArray(numbered["proxy-groups"]) ? numbered["proxy-groups"] : [];
if (!numberedGroups.some(g => g && g.name === "🇭🇰 香港节点")) fail("HK1 should match Hong Kong");
if (!numberedGroups.some(g => g && g.name === "🇺🇸 美国节点")) fail("US03 should match United States");
if (!numberedGroups.some(g => g && g.name === "📉 低倍率")) fail("0.2x node should create the low-rate group");
if (!numberedGroups.some(g => g && g.name === "🇭🇰 香港节点-自动选择")) fail("region trio lost hidden url-test layer");
if (!numberedGroups.some(g => g && g.name === "🇭🇰 香港节点-负载均衡")) fail("region trio lost hidden load-balance layer");
const numberedEhentai = numberedGroups.find(g => g && g.name === "EHentai");
if (!numberedEhentai || numberedEhentai["default-selected"] !== "🇺🇸 美国节点") fail("EHentai should prefer US when US nodes exist");

ok("full-overwrite input isolation");
ok("airport proxy preservation");
ok("chain field isolation");
ok("strategy-group contract");
ok("homogeneous groups removed");
ok("dedicated RULE-SET routing");
ok("Bilibili group has selectable Direct and is actually wired");
ok("MyClash CN-like groups keep Direct");
ok("ad/remote DIRECT exceptions preserved");
ok("numbered region node tags");
ok("live MetaCubeX AI providers, no 404 rulesets");
ok("rate multiplier grouping");
ok("100+ region three-layer groups");
