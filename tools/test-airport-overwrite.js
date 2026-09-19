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
if (!Array.isArray(output.proxies) || output.proxies.length !== 1) fail("airport proxy nodes were not preserved");
if (output.proxies[0]["dialer-proxy"] != null) fail("airport node retained dialer-proxy chain field");
if (output["proxy-groups"].some(g => g && g.name === "CI Injected Group")) fail("input proxy-group leaked into output");
if (output.dns && output.dns.nameserver && output.dns.nameserver.includes("192.0.2.1")) fail("input DNS leaked into output");
if (output.rules && output.rules.includes("MATCH,DIRECT")) fail("input rules leaked into output");
if (JSON.stringify(output).includes("CI Forbidden Chain")) fail("forbidden chain marker leaked into output");

const groups = Array.isArray(output["proxy-groups"]) ? output["proxy-groups"] : [];
const requiredGroups = [
  "🚀 节点选择", "⚡ 自动选择", "🛑 广告拦截", "💬 AI 服务", "🤖 Claude AI",
  "📺 哔哩哔哩", "📹 油管视频", "🔍 谷歌服务", "🏠 私有网络", "🔒 国内服务",
  "🔧 远控工具", "📲 电报消息", "🐱 Github", "Ⓜ️ 微软服务", "🍏 苹果服务",
  "🌐 社交媒体", "🎬 流媒体", "🎮 游戏平台", "📚 教育资源", "💰 金融服务",
  "☁️ 云服务", "🌐 非中国", "🐟 漏网之鱼"
];
for (const name of requiredGroups) {
  if (!groups.some(g => g && g.name === name)) fail(`required strategy group missing: ${name}`);
}
if (!output.rules.some(rule => rule === "DOMAIN-SUFFIX,claude.ai,🤖 Claude AI")) fail("Claude.ai is not routed to the dedicated Claude AI group");
if (groups.some(g => g && ["🔰 节点选择", "🤖 AI服务", "🌍 国外服务"].includes(g.name))) fail("legacy strategy group remains");

const byName = name => groups.find(g => g && g.name === name);
const serviceGroups = [
  "💬 AI 服务", "🤖 Claude AI", "📺 哔哩哔哩", "📹 油管视频", "🔍 谷歌服务",
  "📲 电报消息", "🐱 Github", "Ⓜ️ 微软服务", "🍏 苹果服务", "🌐 社交媒体",
  "🎬 流媒体", "🎮 游戏平台", "📚 教育资源", "💰 金融服务", "☁️ 云服务",
  "🌐 非中国", "🐟 漏网之鱼"
];
for (const name of serviceGroups) {
  const group = byName(name);
  if (!group || !Array.isArray(group.proxies)) fail(`service group has no proxy list: ${name}`);
  if (group.proxies.includes("DIRECT")) fail(`DIRECT must not appear in non-China service group: ${name}`);
  if (group.proxies[0] !== "⚡ 自动选择") fail(`total-node auto selection must be first: ${name}`);
  if (group.proxies[group.proxies.length - 1] !== "🚀 节点选择") fail(`node selection must be last: ${name}`);
}

const ad = byName("🛑 广告拦截");
if (!ad.proxies.includes("DIRECT")) fail("DIRECT exception missing from ad blocking group");
if (!ad.proxies.includes("REJECT-DROP")) fail("REJECT-DROP default missing from ad blocking group");
const remote = byName("🔧 远控工具");
if (!remote.proxies.includes("DIRECT")) fail("DIRECT exception missing from remote-control group");

const select = byName("🚀 节点选择");
if (!select.proxies.includes("DIRECT")) fail("node selection group lost DIRECT fallback");

const numbered = sandbox.__airportMain({
  proxies: [
    { name: "HK1", type: "vless", server: "198.51.100.21", port: 443 },
    { name: "US03", type: "vless", server: "198.51.100.22", port: 443 },
  ],
});
const numberedGroups = Array.isArray(numbered["proxy-groups"]) ? numbered["proxy-groups"] : [];
if (!numberedGroups.some(g => g && g.name === "🇭🇰 香港节点")) fail("HK1 should match Hong Kong");
if (!numberedGroups.some(g => g && g.name === "🇺🇸 美国节点")) fail("US03 should match United States");

ok("full-overwrite input isolation");
ok("airport proxy preservation");
ok("chain field isolation");
ok("strategy-group contract");
ok("non-China groups exclude DIRECT");
ok("ad/remote DIRECT exceptions preserved");
ok("numbered region node tags");
