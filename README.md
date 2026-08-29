# mihomo-full

> **Public template** — sample values only. Never commit real airport URLs, domains, UUIDs, passwords, or node secrets. Use **Use this template** / Fork, then fill secrets **only on your VPS**.

基于 [v2ray-agent](https://github.com/mack-a/v2ray-agent) 落地节点 + 机场入口订阅，生成**固定地址、无 `.yaml` 后缀**的完整 Mihomo 配置；另附纯机场场景的订阅覆写脚本。

---

## 目录

- [公共模板使用说明](#公共模板使用说明)
- [两种用法](#两种用法)
- [方案 A：链式代理（机场入口 + VPS 落地）](#方案-a链式代理机场入口--vps-落地)
- [方案 B：仅机场（覆写脚本）](#方案-b仅机场覆写脚本)
- [进阶玩法（Cloudflare）](#进阶玩法cloudflare)
- [目录结构](#目录结构)
- [日常维护](#日常维护)
- [注意事项](#注意事项)
- [免责声明](#免责声明)
- [鸣谢](#鸣谢)

---

## 公共模板使用说明

| 要点 | 说明 |
|------|------|
| **如何用** | GitHub → **Use this template** 生成自己的仓库，或 Fork 后在本机/VPS 使用 |
| **仓库内有什么** | 仅占位配置与脚本；**不含**真实订阅、UUID、域名密码 |
| **秘密写在哪** | 只写在 VPS 上的 `/opt/mihomo-full/settings.conf`（由 `install.sh` 生成） |
| **禁止** | 把填好订阅的 `settings.conf`、`output/full-config.yaml` 推回任何**公开**仓库 |
| **生成物** | `output/` 已被 `.gitignore` 忽略；生成后的 YAML 会嵌入你的机场 URL |

---

## 两种用法

| 方案 | 适用场景 | 需要 VPS / v2ray-agent | 客户端怎么用 |
|------|----------|------------------------|--------------|
| **A. 链式** | 机场作入口 + 自建美西等落地 | 需要 | 导入一个固定订阅 URL |
| **B. 仅机场** | 只用机场，不要落地链 | 不需要 | 订阅挂 `airport_overwrite.js` 覆写 |

---

## 最终公共行为（链式与纯机场）

除链式模式专属的 VPS 落地 / dialer-proxy 外，两种模式保持相同的安全底线：

- **广告拦截**：默认 `REJECT`，保留局部 `DIRECT` 例外。只有免费站点因广告拦截出现页面/播放/登录/功能异常时，才临时切换。
- **远控工具**：默认拒绝；保留“代理/机场出口 + DIRECT”局部选择。仅在 P2P、UDP、设备发现或内网穿透与 TUN/代理冲突时主动切换 DIRECT。
- **私有网络**：底层规则 `DIRECT`，不提供“私有网络代理”用户按钮。
- **国内服务**：规则集 + CN IP 底层 `DIRECT`，不提供“国内服务代理”用户按钮；未知目标不会因为分类失败而自动直连。
- **未知/境外目标**：继续进入代理安全默认路径。
- **节点协议**：不按 VMess、Shadowsocks、Trojan、VLESS、Hysteria/Hysteria2、TUIC 等协议名称自动排除；落地节点以实际完整链路测试决定。
- **机场策略组**：airport_overwrite.js 保留机场原有地区、自动选择、负载均衡、手动选择、流媒体等 UI，不由公共同步器重构。
- **规则引用**：机场模式会把链式配置中的“AI服务/国外服务/流媒体/漏网之鱼”等目标映射到机场现有策略组名称，避免 `proxy group not found`。
- **链式关系**：机场只是前置入口，VPS 落地节点才是最终出口；前置与落地的选择不能混淆。

广告 DIRECT 是局部例外，**不是全局 DIRECT 开关**。钓鱼、恶意域名和明文泄露封堵规则仍保持强制阻断。

---

## 方案 A：链式代理（机场入口 + VPS 落地）

### 效果

```text
客户端 → Mihomo → 落地策略组 → VPS 落地节点 → 机场入口 → 目标
```

实际链式关系由 `dialer-proxy` 决定：落地节点的上游连接通过「前置优选入口」建立。换句话说，**机场是前置入口，VPS 落地节点是最终出口**，不能把两者角色混淆。

客户端**只导入一个固定链接**，即可获得完整规则、DNS 与链式代理；订阅路径形如普通静态资源，不带 `.yaml`：

```text
https://你的域名/assets/static/<随机20位十六进制路径>
```

机场订阅写在 VPS 本地 `settings.conf`，可随时更换；更新落地节点不会改变客户端主订阅地址。

### 依赖

本仓库的安装脚本**不会安装 v2ray-agent**，只在已有落地节点基础上生成 Mihomo 配置。

落地由 **[v2ray-agent](https://github.com/mack-a/v2ray-agent)** 管理；本项目读取其本地 `clashMeta` 目录中的节点，并将其作为 `provider_exit` 候选池。

**v2ray-agent 官方项目：** https://github.com/mack-a/v2ray-agent

安装与协议管理以其官方项目说明为准。安装完成后通常通过 `vasma` 管理协议，并确保本地 `clashMeta` 目录能够生成 Mihomo/ClashMeta 可识别的节点。

### 安装顺序

**1. 安装并配置 v2ray-agent**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/mack-a/v2ray-agent/master/install.sh)
```

完成后执行 `vasma` 添加和维护落地协议。

> **本仓库现在不会按协议类型自动排除节点。** VMess、VLESS、Reality、Hysteria2、TUIC、Trojan、Shadowsocks、WireGuard 等，只要 v2ray-agent 输出为 Mihomo 可识别的有效节点，都会进入落地候选池。具体是否适合 `dialer-proxy` 链式，应通过实际链路测试判断。

**2. 安装本仓库**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/dukangalex/mihomo-full/main/install.sh)
```

按提示填写机场订阅、域名和 `clashMeta` 目录。

**3. 配置 Nginx**

将脚本打印的 `location` 粘贴进对应站点配置，然后：

```bash
nginx -t && systemctl reload nginx
```

也可参考仓库内 `nginx-example.conf`。

**4. 客户端**

只导入脚本最后给出的固定 HTTPS 地址。

### 与 v2ray-agent 的关系

| 项目 | 说明 |
|------|------|
| 节点来源 | `V2RAY_AGENT_CLASHMETA_DIR` 下的本地订阅文件 |
| 更新落地 | 在 v2ray-agent 中改协议后执行 `generate.sh` |
| 节点筛选 | **不按协议名称/类型武断排除**，由实际链式测试决定 |
| 互不覆盖 | 只读节点，不修改 v2ray-agent 自身配置 |

v2ray-agent 的安装、协议与服务问题请到其[官方仓库](https://github.com/mack-a/v2ray-agent)查看说明。

---

## 落地节点选择：链式配置最重要的操作

### 正确理解“入口”和“落地”

```text
前置优选入口
    ↓
机场节点 —— 负责承载到落地节点的连接
    ↓
VPS 落地节点 —— 最终出口
    ↓
目标服务
```

所以选择落地节点时，不能只看 VPS 节点自身的直连测速。

### 推荐选择方法

**第一步：测试完整链路**

```text
机场入口 → VPS 落地节点 → 目标
```

**第二步：比较真实业务表现**

重点观察：

- 首次连接时间
- 延迟与抖动
- 下载 / 上传速度
- 丢包与断流
- 长连接稳定性
- 视频、实时通信、UDP 等实际表现
- 高峰时段稳定性

**第三步：保留多个候选**

`落地优选出口` 用于自动选择；`落地手动选择` 用于人工固定节点。建议保留至少两个经过实际链式验证的候选，降低单点故障风险。

### 不要只根据协议名称删节点

不同机场入口对不同传输协议的承载能力可能不同。例如某个节点可能：

```text
VPS 单独连接：正常
机场 A → VPS：失败
机场 B → VPS：正常
```

此时节点并不等于“失效”。应该先更换机场入口，再判断落地协议本身。

因此本仓库**不在 `generate.sh` 中自动排除 VMess 或其他协议**。

---

## 方案 B：仅机场（覆写脚本）

不需要 VPS 落地时，在客户端为机场订阅启用脚本覆写，指向：

```text
https://raw.githubusercontent.com/dukangalex/mihomo-full/main/airport_overwrite.js
```

（若使用自己的 Template 副本，请改成**你的仓库** raw 地址。）

### 能力概要

- 地区三层分组（自动 / 负载 / 选择）及 AI、流媒体等功能组
- 银行 / 微信进程直连，STUN、DNS 泄露封堵，远控默认 `REJECT-DROP`
- 公告类伪节点名称排除
- url-test：`interval: 180`，`tolerance: 35`，`timeout: 3000`，`expected-status: 204`

---

## 进阶玩法（Cloudflare）

在已有「机场 / VPS 链式」之外，可结合 Cloudflare 做**低成本入口**或**优选 IP**，与本仓库配置互补（不替代本仓库安装流程）。

| 项目 | 作用 | 仓库 |
|------|------|------|
| **edgetunnel** | 在 CF Workers / Pages 上部署边缘隧道，提供 VLESS / Trojan / SS 等节点与订阅，可作为免费或备用「入口」 | [cmliu/edgetunnel](https://github.com/cmliu/edgetunnel) |
| **Country IP Filter** | 按国家/地区筛选 Cloudflare 相关 IP，用于优选、测速或给隧道/节点填更合适的出口 IP | [alienwaregf/Cloudflare-Country-Specific-IP-Filter](https://github.com/alienwaregf/Cloudflare-Country-Specific-IP-Filter) |

### 1. edgetunnel（CF 边缘隧道）

- 基于 Cloudflare Workers / Pages 的边缘解密与转发方案，带管理面板与订阅生成。
- 适合：没有稳定 VPS、或需要一条**额外入口**与现有机场/落地搭配时。
- 部署方式以其官方 README 为准。
- 与本仓库：生成的订阅可作为方案 A 的**机场入口**填入 `AIRPORT_SUB_URL`，或单独在客户端使用；**不能**替代 v2ray-agent 管理的 VPS 落地节点。

### 2. Cloudflare 国家/地区 IP 筛选

- 用于筛选指定国家或地区的 IP，便于做优选列表或匹配目标区域。
- 请遵守该项目说明与当地法律法规；建议绑定自定义域。

### 使用注意

- 以上为**独立开源项目**，安装、变量、配额与风控以各自仓库为准。
- CF 免费额度与策略会变化；进阶玩法适合备用，主用仍建议方案 A 或可信机场。
- 本仓库不内嵌其代码，仅作文档推荐。

---

## 目录结构

```text
仓库（公开模板）
├── settings.conf          # 占位示例，勿填真实订阅后推送
├── template.yaml          # 链式配置模板（含 __占位符__）
├── generate.sh            # 生成脚本
├── manage.sh              # 小白管理入口：更换机场 / 规则集管理
├── rulesets.local.conf    # 本地规则覆盖模板（勿填真实环境后提交）
├── install.sh             # 一键安装（写入 VPS 本地）
├── nginx-example.conf
├── airport_overwrite.js
└── .gitignore

VPS 运行时（勿提交公开仓）
/opt/mihomo-full/
├── settings.conf          # 含真实机场 URL
├── template.yaml
├── generate.sh
├── manage.sh
├── rulesets.local.conf
└── output/
    ├── full-config.yaml   # 会嵌入机场 URL
    └── exit-nodes.yaml
```

---

## 安全与可复现性

- `install.sh` 下载的核心文件固定到已审核 commit，而不是跟随 `main` 漂移；升级前应重新审核并更新 pin。
- 公开模板不包含任何真实订阅、UUID、域名密码或控制器密钥。
- `airport_overwrite.js` 不使用 `empty-fallback`，并保持 ES5 语法子集，避免旧版脚本引擎加载失败。
- 落地节点**不按协议类型武断排除**；最终以完整链式测试结果选择。
- DNSPod 使用官方域名 DoH `doh.pub`，不再依赖 IP DoH；阿里公共 DNS 使用 `dns.alidns.com`。

## 日常维护

| 操作 | 命令 / 做法 |
|------|-------------|
| 只更新落地节点 | `/opt/mihomo-full/generate.sh` |
| 更换机场订阅 | 执行 `mihomo-full`，选择「更换机场订阅」；会自动重新生成，固定订阅地址不变 |
| 规则源失效/增加备用规则 | 执行 `mihomo-full` →「规则集管理」→ 增加/替换/禁用/恢复 |
| 本地规则覆盖 | `/opt/mihomo-full/rulesets.local.conf`；不要提交真实环境文件 |
| 主订阅地址 | **不必改**；客户端继续用原固定链接 |

---

## 注意事项

1. 落地节点生成时**不按协议类型排除**；所有有效节点进入候选池。
2. 完整配置通过第二个固定路径拉取落地列表，客户端只需导入主订阅。
3. Nginx 示例已带 `Cache-Control: no-cache`，避免缓存旧节点。
4. **公开模板纪律**：仓库内只保留占位符；真实订阅、域名、节点仅存在于你的 VPS。
5. `generate.sh` 会拒绝仍为 `REPLACE_…` / `example.com` 的占位配置，避免误生成。
6. 安装器使用固定 commit；升级模板时请同步更新安装器中的 commit pin。
7. 固定路径 `a7f3c21e9b` / `e9b2f1a7c3` 可自行更换，须与 Nginx 一致。
8. 如果机场入口全部不可用，不能把落地节点当作 DIRECT 备用路径；应保持链式失败。

---

## 免责声明

- 本仓库仅提供配置生成与客户端规则示例，供学习与研究。
- 使用代理、隧道、Cloudflare Workers 等须遵守**所在地及服务商**的法律法规与条款。
- 作者与贡献者不对使用本仓库产生的任何后果负责。
- 第三方项目（v2ray-agent、edgetunnel 等）的行为与风险以其各自仓库为准。

---

## 鸣谢

- **[mack-a / v2ray-agent](https://github.com/mack-a/v2ray-agent)** — VPS 协议管理与本地 clashMeta 订阅
- [MetaCubeX / mihomo](https://github.com/MetaCubeX/mihomo) 及社区贡献者
- meta-rules-dat 与相关 ruleset 维护者
- [cmliu / edgetunnel](https://github.com/cmliu/edgetunnel) — Cloudflare 边缘隧道进阶玩法
- [alienwaregf / Cloudflare-Country-Specific-IP-Filter](https://github.com/alienwaregf/Cloudflare-Country-Specific-IP-Filter) — Cloudflare IP 筛选工具
