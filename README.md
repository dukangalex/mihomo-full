# mihomo-full

> **Public template** — 只提交占位值，不提交真实机场订阅、域名、UUID、密码、Bot Token 或节点信息。

`mihomo-full` 基于已有 **v2ray-agent** 落地节点 + 机场入口订阅，生成一个完整的 Mihomo 配置。公共配置以 `template.yaml` 为唯一基准；Airport 覆写脚本必须与公共配置保持一致，只有链式入口/落地所必需的差异允许存在。

## 核心设计

- **国内直连、境外链式代理**：未知目标不能因为分类失败而自动 DIRECT。
- **机场 = 前置入口；VPS = 最终出口**：两者角色严格分离。
- **`template.yaml` = 公共配置唯一真值**：DNS、TUN、sniffer、规则集、hosts 等公共行为不得在其他文件自行漂移。
- **固定公网订阅地址**：安装时只生成一次，后续更新机场、落地节点或重新生成配置都不改变地址。
- **地址不可从字面识别为节点**：不使用 hex、UUID、Base64、token、`proxy/node/sub/config` 等技术语义；采用高熵的普通英文词组路径。
- **v2ray-agent 独立保护**：本项目读取其 `clashMeta` 输出，不删除、不停止、不修改其服务或节点。
- **安全失败**：链式入口不可用时不自动退化为 DIRECT。
- **管理与回滚**：更换机场、规则集操作、配置审计和卸载均通过明确的管理边界完成。

## 两种用法

| 方案 | 用途 | VPS / v2ray-agent | 客户端 |
|---|---|---|---|
| **A：链式** | 机场入口 + VPS 最终出口 | 需要 | 导入安装器生成的一个固定 HTTPS 地址 |
| **B：仅机场** | 机场订阅覆写 | 不需要 | 使用 `airport_overwrite.js` |

## 方案 A：链式代理

```text
客户端
  ↓
Mihomo
  ↓
落地策略组
  ↓
VPS 落地节点（最终出口）
  ↓
机场前置入口
  ↓
目标服务
```

实际链路由 `dialer-proxy` 建立。**不要把机场入口误当成最终出口，也不要把 VPS 落地节点当作 DIRECT 备用。**

### 依赖

本仓库不会安装或接管 v2ray-agent。先自行安装并配置 v2ray-agent，使其产生 Mihomo/ClashMeta 可识别的本地 `clashMeta` 节点文件。

官方项目：<https://github.com/mack-a/v2ray-agent>

### 安装

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/dukangalex/mihomo-full/main/install.sh)
```

安装器会：

1. 固定到安装开始时解析出的单一 Git commit 快照。
2. 下载 `template.yaml`、生成器、管理器、卸载器和审计脚本。
3. 第一次安装生成两个独立的公网自然语言随机路径。
4. 将路径保存到 `/opt/mihomo-full/settings.conf`。
5. 后续更新只读取已保存路径，不重新生成。
6. 生成完整配置并执行最终安全审计。

### 公网订阅地址规范

实际地址不会在公开仓库中出现。示意：

```text
https://你的域名/assets/<普通英文随机词组>
```

例如视觉形态应类似普通资源路径，而不是：

```text
❌ /assets/7c4e91a82d6f0b37e5a194c8d20f6a31
❌ /proxy/xxxx
❌ /node/xxxx
❌ /subscribe/xxxx
❌ /config/xxxx
```

生成器使用安全随机源、无重复词抽样和技术语义黑名单。**示例字符串不会成为实际固定路径。**

公网路径属于访问凭据的一部分：不要发到公开仓库、Issue、日志或公共群组。

### Nginx

安装器会打印两个精确 `location`，分别对应完整配置和落地节点列表。只允许精确路径访问，未知 `/assets/` 路径返回 404。

完成后验证：

```bash
nginx -t && systemctl reload nginx
```

卸载器不会扫描并修改未知的 Nginx 配置；如果你把 location 手工写进现有 server，需要按原配置手工移除。

## 方案 B：仅机场

将 `airport_overwrite.js` 用于机场订阅覆写：

```text
https://raw.githubusercontent.com/dukangalex/mihomo-full/main/airport_overwrite.js
```

该脚本的公共 DNS、TUN、sniffer、hosts、rule-providers、sub-rules 等必须与 `template.yaml` 一致。允许的差异主要是机场自身策略组映射和链式专属行为。

## DNS 一致性原则

DNS 是公共配置的一部分，不能由 Airport 脚本自行发明第二套方案。

当前公共基准由 `template.yaml` 决定，包括：

- `proxy-server-nameserver`
- `direct-nameserver`
- `direct-nameserver-follow-policy`
- `nameserver-policy`
- `hosts`

特别是 DoH 使用的域名若存在启动期解析依赖，必须按照模板中的 `hosts` 设计处理；例如 `dns.google` 的固定映射必须与模板一致。

**不要在 Airport 脚本、README 或个人副本中自行恢复已经淘汰的 DNS 方案。**

## 落地节点

本项目不因为节点名称或协议名称自动排除 VMess、VLESS、Reality、Hysteria2、TUIC、Trojan、Shadowsocks、WireGuard 等。

正确测试方式是：

```text
机场入口 → VPS 落地 → 真实目标
```

应观察连接时间、抖动、丢包、长连接、视频/实时通信和高峰稳定性。一个节点“VPS 直连正常、机场 A → VPS 失败”并不代表该节点本身失效。

## 进阶玩法

> 本节面向已经完成基础部署、理解机场入口与 VPS 落地关系的用户。高级操作前建议先执行一次配置审计，并保留当前 `settings.conf` 与规则集备份。

### 1. 更换机场入口

不要直接编辑生成后的 `output/full-config.yaml`。统一使用：

```bash
mihomo-full
```

选择 **更换机场订阅**；或在脚本化场景使用：

```bash
mihomo-full --set-airport 'https://example.invalid/subscription'
```

该操作只改变机场入口数据，然后重新生成配置；**固定公网订阅地址不会改变**。

### 2. 更新 VPS 落地节点

v2ray-agent 继续作为节点提供方。更新后执行：

```bash
mihomo-full --generate
```

生成器重新读取 v2ray-agent 的 `clashMeta` 输出，并保持既定链式逻辑。不要把落地节点复制到公开仓库，也不要手工修改生成后的 `exit-nodes.yaml`。

### 3. 增加自定义规则集

规则集通过管理入口加入，而不是直接修改 `template.yaml`：

```bash
mihomo-full --rule-add NAME HTTPS_MRS_URL domain '国外服务'
```

例如：

```bash
mihomo-full --rule-add example-rules 'https://example.invalid/example.mrs' domain '国外服务'
```

支持 `domain` 或 `ipcidr`。核心安全规则不能被覆盖或禁用：

```text
cn
cn-ip
private-ip
geolocation-cn
geolocation-!cn
category-ads-all
sukka-phishing
```

禁用、恢复和查看：

```bash
mihomo-full --rules-list
mihomo-full --rule-disable NAME
mihomo-full --rule-restore NAME
```

### 4. 直接调用管理接口进行自动化

`manage.sh` 同时提供非交互参数，适合维护脚本或远程管理工具调用：

```bash
mihomo-full --generate
mihomo-full --audit
mihomo-full --check
```

自动化工具应优先调用这些受控入口，不要自行 `sed` 修改核心配置。

### 5. 查看固定公网路径

管理员可以在 VPS 上查看当前状态：

```bash
mihomo-full status
```

固定路径保存在私有 `settings.conf`。不要把输出截图、日志或完整 URL 发布到公开场所。客户端地址一旦泄露，应把它视为凭据泄露事件，而不是普通配置泄露。

### 6. 启用 Telegram Bot

Bot 是可选的管理前端。先复制公开模板到 VPS 私有配置，再按 `telegram-bot/README.md` 完成安装：

```bash
cp telegram-bot.example.env /opt/mihomo-full/telegram-bot.env
chmod 600 /opt/mihomo-full/telegram-bot.env
```

填写：

```text
TG_BOT_TOKEN=
TG_ADMIN_IDS=
VPS_MONTHLY_GB=0
VPS_EXPIRES_AT=
VPS_TRAFFIC_ALERT_PERCENT=80
VPS_TRAFFIC_INTERFACE=
```

Bot 可以显示 VPS 本地流量估算、月额度、到期时间和提醒状态，也可以执行受控的机场、落地、规则集和卸载操作。Bot Token、管理员 ID 和固定公网路径均不得进入 Git。

### 7. VPS 流量监控的正确理解

流量监控读取 VPS 本机网卡 RX/TX 计数器，并按自然月累计。遇到系统重启、计数器回退或网卡变化时，程序会重新建立 baseline，避免产生虚假增量。

它是**本机使用量估算**，不是 VPS 服务商账单。服务商可能只计算出站流量、使用不同计费周期或采用不同统计口径，因此账单仍以服务商为准。

### 8. 安全更新思路

建议每次更新都按以下顺序：

```text
备份私有配置
    ↓
获取同一 commit 快照
    ↓
更新文件
    ↓
重新生成
    ↓
配置完整性审计
    ↓
确认 Endpoint 未改变
    ↓
确认 v2ray-agent 未被修改
    ↓
再重启相关服务
```

不要直接覆盖整个 `/opt/mihomo-full`，也不要把运行目录的真实配置反向提交到 Git。

### 9. 测试链式故障保护

高级用户应主动测试“机场入口不可用”场景。目标不是保证永远有网，而是确认失败时不会偷偷变成 DIRECT：

```text
机场入口正常
  → VPS 落地
  → 目标

机场入口失败
  → 链式路径失败
  → 不自动 DIRECT
```

这项测试应在测试 VPS/测试客户端上进行，避免影响日常使用。

## 管理入口

安装完成后：

```bash
mihomo-full
```

当前管理入口包括：

1. 更换机场订阅
2. 更新 VPS 落地节点
3. 规则集管理
4. 查看状态
5. 配置完整性审计
6. **卸载 Mihomo Full**

更换机场不会改变客户端固定订阅地址。

## Telegram Bot

TG Bot 是管理入口的可选前端，不创建第二套代理配置。Bot 调用与 CLI 相同的管理逻辑，因此：

- 更换机场仍由 `generate.sh` 生成配置。
- 更新落地仍来自 v2ray-agent 的本地 `clashMeta`。
- 规则集仍受核心规则保护。
- 卸载仍调用 Mihomo Full 自身的安全卸载流程。
- Bot Token 和管理员 Telegram User ID 只保存在 VPS 私有环境。

### 创建 Bot

1. 在 Telegram 中打开官方 `@BotFather`。
2. 使用 `/newbot` 创建机器人。
3. 保存 Bot Token，**不要提交 GitHub**。
4. 获取自己的 Telegram User ID。
5. 在 VPS 上复制 `telegram-bot.example.env` 为私有配置，填写 Token 和管理员 ID。
6. 按 `telegram-bot/README.md` 安装并启用服务。

### Bot 功能

Bot 管理面以只读监控和明确确认的管理操作为原则。VPS 套餐数据可以记录：

- 月总流量额度
- 当前周期已用流量
- VPS 到期时间
- 剩余流量/剩余天数
- 流量和到期阈值提醒

这些数据用于管理和估算，**不等同于 VPS 服务商账单数据**。

Bot 不应在普通状态消息中自动泄露完整公网订阅 URL；查看/复制地址应属于明确的管理员操作。

## 卸载

CLI：

```bash
mihomo-full
```

选择：

```text
6) 卸载 Mihomo Full（不会删除 v2ray-agent）
```

也可以直接：

```bash
/opt/mihomo-full/uninstall.sh
```

卸载前必须输入：

```text
UNINSTALL
```

卸载器只删除 Mihomo Full 自身创建的资源，包括自身安装目录、管理命令链接以及本项目自己的 Bot service（如果存在）。

### v2ray-agent 硬保护

**严禁卸载器执行以下操作：**

```text
rm -rf /etc/v2ray-agent
systemctl stop v2ray-agent
systemctl disable v2ray-agent
```

`v2ray-agent` 的节点、配置和服务属于独立系统，卸载 Mihomo Full 后必须继续存在。

## 目录结构

```text
公开仓库
├── settings.conf
├── template.yaml
├── generate.sh
├── manage.sh
├── uninstall.sh
├── airport_overwrite.js
├── nginx-example.conf
├── telegram-bot/
├── tools/
└── .github/

VPS 运行目录
/opt/mihomo-full/
├── settings.conf              # 真实机场 URL + 固定公网路径
├── template.yaml
├── generate.sh
├── manage.sh
├── uninstall.sh
├── rulesets.local.conf
├── telegram-bot/              # 若启用 Bot
├── tools/
└── output/
    ├── full-config.yaml
    └── exit-nodes.yaml
```

`output/`、真实 `settings.conf` 和 Bot 私有配置不得提交到公开仓库。

## 一致性与审计

提交前应通过：

```text
template.yaml
    ↓
公共配置唯一真值
    ↓
airport_overwrite.js 独立比对
    ↓
generate.sh 只处理链式专属注入
    ↓
最终配置审计
    ↓
Endpoint 隐私审计
    ↓
卸载边界审计
```

仓库 CI 会检查：

- YAML 重复键/结构完整性
- Airport 与模板公共对象/标量一致性
- DNS 一致性
- 旧固定路径残留
- 旧 DNS 方案残留
- Endpoint 是否采用自然语言而非 hex/UUID/token
- Endpoint 生成器是否使用安全随机源
- `v2ray-agent` 是否受到卸载保护
- 核心规则保护是否存在
- 临时修复脚本是否误留在仓库

## 安全注意事项

1. 公开仓库永远只放占位值。
2. 固定公网订阅地址视为访问凭据的一部分。
3. 不要在 Issue、日志、截图或公开群组中泄露完整订阅地址。
4. 机场订阅 URL、Bot Token、控制器密钥和节点凭据不能进入 Git。
5. 链式失败不得自动回退到 DIRECT。
6. v2ray-agent 与 Mihomo Full 保持独立生命周期。
7. 修改公共 DNS/TUN/sniffer/rules 时，先修改 `template.yaml`，再同步 Airport，并立即运行一致性审计。
8. 不要为了“兼容”重新加入已经确认不适用的 `empty-fallback`、VMess 排除或其他旧逻辑。

## 日常维护

| 操作 | 方法 |
|---|---|
| 更换机场 | `mihomo-full` → 更换机场 |
| 更新落地 | `mihomo-full` → 更新 VPS 落地节点 |
| 规则集 | `mihomo-full` → 规则集管理 |
| 完整审计 | `mihomo-full` → 配置完整性审计 |
| 查看状态 | `mihomo-full` → 当前状态 |
| 卸载 | `mihomo-full` → 卸载 Mihomo Full |

## 免责声明

本项目仅提供配置生成、管理和审计示例。使用代理、隧道、Cloudflare、Telegram Bot 或第三方节点服务时，请遵守所在地法律法规以及相关服务条款。第三方项目的行为和风险以其各自官方项目为准。

## 鸣谢

- [mack-a / v2ray-agent](https://github.com/mack-a/v2ray-agent)
- [MetaCubeX / mihomo](https://github.com/MetaCubeX/mihomo)
- 相关规则集维护者及社区贡献者
