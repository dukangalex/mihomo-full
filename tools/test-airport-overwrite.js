#!/usr/bin/env node
/*
 * Regression test for airport_overwrite.js.
 * The airport script is a complete overwrite: only proxy nodes are accepted
 * from the incoming subscription; chain/runtime/provider-specific fields must
 * not leak into the generated configuration.
 */
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("airport_overwrite.js", "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${source}\nthis.__airportMain = main;`, sandbox, { filename: "airport_overwrite.js" });

const input = {
  mode: "global",
  mixedPort: 9999,
  proxies: [
    {
      name: "CI Airport Node",
      type: "vless",
      server: "198.51.100.20",
      port: 443,
      uuid: "00000000-0000-0000-0000-000000000000",
      "dialer-proxy": "CI Forbidden Chain",
    },
  ],
  dns: { enable: false, nameserver: ["192.0.2.1"] },
  "proxy-groups": [{ name: "CI Injected Group", type: "select", proxies: ["DIRECT"] }],
  rules: ["MATCH,DIRECT"],
};

const output = sandbox.__airportMain(input);

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
const genericChoiceGroups = groups.filter(g => g && g.type === "select" && Array.isArray(g.proxies) && g.proxies.includes("DIRECT"));
const allowedDirectGroups = new Set(["🛑 广告拦截", "🔧 远控工具"]);
for (const group of genericChoiceGroups) {
  if (!allowedDirectGroups.has(group.name)) fail(`DIRECT exposed as a generic UI choice in group: ${group.name}`);
}

ok("full-overwrite input isolation");
ok("airport proxy preservation");
ok("chain field isolation");
ok("DIRECT UI invariant");
