
function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}
function ok(message) {
  console.log(`[PASS] ${message}`);
}

if (!output || typeof output !== "object") fail("main() did not return a configuration object");
if (!Array.isArray(output.proxies) || output.proxies.length !== 1) fail("airport proxy nodes were not preserved");
if (output.proxies[0]["dialer-proxy"] != null) fail("airport node retained dialer-proxy chain field");
if (output["proxy-groups"] && output["proxy-groups"].some(g => g && g.name === "CI Injected Group")) fail("input proxy-group leaked into output");
if (output.dns && output.dns.nameserver && output.dns.nameserver.includes("192.0.2.1")) fail("input DNS leaked into output");
if (output.rules && output.rules.includes("MATCH,DIRECT")) fail("input rules leaked into output");
if (JSON.stringify(output).includes("CI Forbidden Chain")) fail("forbidden chain marker leaked into output");

const groups = Array.isArray(output["proxy-groups"]) ? output["proxy-groups"] : [];
const requiredGroups = [
  "🚀 节点选择", "⚡ 自动选择", "🛑 广告拦截", "💬 AI 服务", "🤖 Claude AI",
  "📺 哔哩哔哩", "📹 油管视频", "🔍 谷歌服务", "🏠 私有网络", "🔒 国内服务",
  "📲 电报消息", "🐱 Github", "Ⓜ️ 微软服务", "🍏 苹果服务", "🌐 社交媒体",
  "🎬 流媒体", "🎮 游戏平台", "📚 教育资源", "💰 金融服务", "☁️ 云服务",
  "🌐 非中国", "🐟 漏网之鱼"
];
for (const name of requiredGroups) {
  if (!groups.some(g => g && g.name === name)) fail(`required strategy group missing: ${name}`);
}
if (!output.rules.some(rule => rule === "DOMAIN-SUFFIX,claude.ai,🤖 Claude AI")) fail("Claude.ai is not routed to the AI service group");
if (groups.some(g => g && ["🔰 节点选择", "🤖 AI服务", "🌍 国外服务"].includes(g.name))) fail("legacy strategy group remains");

const genericChoiceGroups = groups.filter(g => g && g.type === "select" && Array.isArray(g.proxies) && g.proxies.includes("DIRECT"));
const allowedDirectGroups = new Set(["🛑 广告拦截", "🔧 远控工具"]);
for (const group of genericChoiceGroups) {
  if (!allowedDirectGroups.has(group.name)) fail(`DIRECT exposed as a generic UI choice in group: ${group.name}`);
}

ok("full-overwrite input isolation");
ok("airport proxy preservation");
ok("chain field isolation");
ok("DIRECT UI invariant");