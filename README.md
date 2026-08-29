# mihomo-full

> **Public template** — sample values only. Never commit real airport URLs, domains, or node secrets. Use **Use this template** / Fork, then fill secrets **only on your VPS**.

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

## 方案 A：链式代理（机场入口 + VPS 落地）

### 效果

- 客户端**只导入一个固定链接**，即可拿到完整规则、DNS、银行保护与链式代理
- 订阅路径形如普通静态资源，**不带 `.yaml`**：

  ```text
  https://你的域名/assets/static/a7f3c21e9b
  ```

- 机场订阅写在 VPS 本地 `settings.conf`，可随时改
- 一键更新**只刷新 VPS 落地节点**，主订阅地址不变

### 依赖

本仓库的安装脚本**不会**安装 v2ray-agent，只在已有落地节点之上生成 Mihomo 配置。

落地由 **[v2ray-agent](https://github.com/mack-a/v2ray-agent)**（[mack-a](https://github.com/mack-a)）管理；本项目读取其本地 clashMeta 目录中的节点，再与机场入口合并。

### 安装顺序

**1. 安装并配置 v2ray-agent**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/mack-a/v2ray-agent/master/install.sh)
```

完成后执行 `vasma`，添加落地协议（推荐 VLESS Reality / Vision、Hysteria2 等）。生成配置时会**自动排除 VMess**。

**2. 安装本仓库**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/dukangalex/mihomo-full/main/install.sh)
```

按提示填写（内容只保存在**本机** `settings.conf`）：

| 填写项 | 含义 |
|--------|------|
| **机场订阅链接** | 你的机场 Clash / Mihomo 订阅 URL，用作链式**入口** |
| **域名** | 已解析到**这台 VPS**、并已用 Nginx（或同类）提供 HTTPS 的域名。用于拼出客户端要导入的固定订阅地址，以及配置内部拉取落地节点的第二个地址。填写时**不要**带 `https://`，也不要带路径，例如 `example.com` 或 `sub.example.com`。一般与你在 v2ray-agent 里使用的域名相同。 |
| **clashMeta 目录** | v2ray-agent 生成本地节点文件的目录，默认 `/etc/v2ray-agent/subscribe_local/clashMeta`，多数情况直接回车即可 |

**3. 配置 Nginx**

将脚本打印的 `location` 粘贴进**该域名**对应的站点配置（与上面填写的域名一致），然后：

```bash
nginx -t && systemctl reload nginx
```

也可参考仓库内 `nginx-example.conf`。

**4. 客户端**

只导入脚本最后给出的固定 HTTPS 地址（形如 `https://你填写的域名/assets/static/a7f3c21e9b`）。

### 与 v2ray-agent 的关系

| 项目 | 说明 |
|------|------|
| 节点来源 | `V2RAY_AGENT_CLASHMETA_DIR` 下的本地订阅文件 |
| 更新落地 | 在 v2ray-agent 中改协议后执行 `generate.sh` |
| 互不覆盖 | 只读节点，不修改 v2ray-agent 自身配置 |

v2ray-agent 的安装与协议问题请到其[官方仓库](https://github.com/mack-a/v2ray-agent)反馈。

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
- 部署方式以官方 README 为准。
- 与本仓库：生成的订阅可当作方案 A 的**机场入口**填入 `AIRPORT_SUB_URL`，或单独在客户端使用；**不能**替代 v2ray-agent 的 VPS 落地。

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
├── install.sh             # 一键安装（写入 VPS 本地）
├── nginx-example.conf
├── airport_overwrite.js
└── .gitignore             # 忽略 output/ 与本地密钥形文件

VPS 运行时（勿提交公开仓）
/opt/mihomo-full/
├── settings.conf          # 含真实机场 URL
├── template.yaml
├── generate.sh
└── output/
    ├── full-config.yaml   # 会嵌入机场 URL
    └── exit-nodes.yaml
```

---

## 安全与可复现性

- `install.sh` 下载的仓库文件固定到已审计 commit，而不是跟随 `main` 漂移；升级前应重新审核并更新 pin。
- 公开模板不包含任何真实订阅、UUID、域名密码或控制器密钥。
- `airport_overwrite.js` 不使用 `empty-fallback`，并保持 ES5 语法子集，避免旧版脚本引擎加载失败。
- VMess 按节点实际 `type` 使用 `exclude-type` 排除，不依赖节点名称。
- DNSPod 使用官方域名 DoH `doh.pub`，不再依赖 IP DoH；阿里公共 DNS 使用 `dns.alidns.com`。

## 日常维护

| 操作 | 命令 / 做法 |
|------|-------------|
| 只更新落地节点 | `/opt/mihomo-full/generate.sh` |
| 更换机场订阅 | 编辑 VPS 上 `settings.conf` 中 `AIRPORT_SUB_URL`，再执行 `generate.sh` |
| 主订阅地址 | **不必改**；客户端继续用原固定链接 |

---

## 注意事项

1. 落地节点生成时会按实际协议类型排除 VMess；不要仅通过节点名称判断协议类型。
2. 完整配置通过第二个固定路径拉取落地列表，客户端只需导入主订阅。
3. Nginx 示例已带 `Cache-Control: no-cache`，避免缓存旧节点。
4. **公开模板纪律**：仓库内只保留占位符；真实订阅、域名、节点仅存在于你的 VPS。
5. `generate.sh` 会拒绝仍为 `REPLACE_…` / `example.com` 的占位配置，避免误生成。
6. 安装器使用固定 commit；升级模板时请同步更新安装器中的 commit pin。
7. 固定路径 `a7f3c21e9b` / `e9b2f1a7c3` 可自行更换，须与 Nginx 一致。

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
- [cmliu / edgetunnel](https://github.com/cmliu/edgetunnel) — Cloudflare 边缘隧道进阶方案
- [alienwaregf / Cloudflare-Country-Specific-IP-Filter](https://github.com/alienwaregf/Cloudflare-Country-Specific-IP-Filter) — 按国家/地区筛选 CF 相关 IP

| 问题类型 | 反馈位置 |
|----------|----------|
| v2ray-agent 安装 / 协议 | [mack-a/v2ray-agent](https://github.com/mack-a/v2ray-agent) |
| edgetunnel / CF IP 筛选 | 对应上游仓库 |
| 本仓库配置生成 / 固定订阅 / 覆写脚本 | 本仓库 Issue |
