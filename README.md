# mihomo-full

基于 [v2ray-agent](https://github.com/mack-a/v2ray-agent) 落地节点 + 机场入口订阅，生成**固定地址、无 `.yaml` 后缀**的完整 Mihomo 配置；另附纯机场场景的订阅覆写脚本。

---

## 目录

- [两种用法](#两种用法)
- [方案 A：链式代理（机场入口 + VPS 落地）](#方案-a链式代理机场入口--vps-落地)
- [方案 B：仅机场（覆写脚本）](#方案-b仅机场覆写脚本)
- [进阶玩法（Cloudflare）](#进阶玩法cloudflare)
- [目录结构](#目录结构)
- [日常维护](#日常维护)
- [注意事项](#注意事项)
- [鸣谢](#鸣谢)

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

- 机场订阅写在 `settings.conf`，可随时改
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

按提示填写：

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

（私有仓库或 raw 受限时，可改为本地文件路径。）

### 能力概要

- 地区三层分组（自动 / 负载 / 选择）及 AI、流媒体等功能组
- 银行 / 微信进程直连，STUN、DNS 泄露封堵，远控默认 `REJECT-DROP`
- 公告类伪节点名称排除
- url-test 健康检查：`interval: 180`，`tolerance: 35`，`timeout: 3000`，`expected-status: 204`

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
- 部署方式以官方 README 为准（Workers 粘贴、Pages 上传、或 GitHub 连接均可）。
- 与本仓库的关系：生成的订阅可当作方案 A 的**机场入口订阅**填入 `AIRPORT_SUB_URL`，或单独在客户端使用；**不能**替代 v2ray-agent 的 VPS 落地。

### 2. Cloudflare 国家/地区 IP 筛选

- 用于筛选指定国家或地区的 IP，便于做优选列表、降低延迟或匹配目标区域。
- 适合：给 edgetunnel 的 ProxyIP、自建节点或测速脚本提供候选 IP。
- 请遵守该项目说明与当地法律法规；建议绑定自定义域，勿用于未授权场景。

### 使用注意

- 以上均为**独立开源项目**，安装、变量、配额与风控以各自仓库文档为准。
- CF 免费额度、封锁策略会变化；进阶玩法适合折腾与备用，主用链路仍建议方案 A（VPS 落地）或可信机场。
- 本仓库不内嵌其代码，仅作文档推荐与组合说明。

---

## 目录结构

```text
/opt/mihomo-full/
├── settings.conf          # 用户配置（机场订阅、域名）
├── template.yaml          # 链式完整配置模板
├── generate.sh            # 生成 / 更新落地与完整配置
├── install.sh             # 一键安装
├── nginx-example.conf     # Nginx 参考
├── airport_overwrite.js   # 仅机场覆写脚本
└── output/
    ├── full-config.yaml   # 主订阅内容
    └── exit-nodes.yaml    # 落地节点列表
```

---

## 日常维护

| 操作 | 命令 / 做法 |
|------|-------------|
| 只更新落地节点 | `/opt/mihomo-full/generate.sh` |
| 更换机场订阅 | 编辑 `settings.conf` 中 `AIRPORT_SUB_URL`，再执行 `generate.sh` |
| 主订阅地址 | **不必改**；客户端继续用原固定链接 |

---

## 注意事项

1. 落地节点生成时会排除 VMess。
2. 完整配置通过第二个固定路径拉取落地列表，客户端只需导入主订阅。
3. Nginx 示例已带 `Cache-Control: no-cache`，避免缓存旧节点。
4. 仓库内均为占位配置，不含真实订阅或节点；VPS 上的 `settings.conf` 请勿再提交回公开仓库。

---

## 鸣谢

- **[mack-a / v2ray-agent](https://github.com/mack-a/v2ray-agent)** — VPS 协议管理与本地 clashMeta 订阅；本项目落地读取建立在其工作流之上
- [MetaCubeX / mihomo](https://github.com/MetaCubeX/mihomo) 及社区贡献者
- meta-rules-dat 与相关 ruleset 维护者
- [cmliu / edgetunnel](https://github.com/cmliu/edgetunnel) — Cloudflare 边缘隧道进阶方案
- [alienwaregf / Cloudflare-Country-Specific-IP-Filter](https://github.com/alienwaregf/Cloudflare-Country-Specific-IP-Filter) — 按国家/地区筛选 CF 相关 IP

| 问题类型 | 反馈位置 |
|----------|----------|
| v2ray-agent 安装 / 协议 | [mack-a/v2ray-agent](https://github.com/mack-a/v2ray-agent) |
| edgetunnel / CF IP 筛选 | 对应上游仓库 |
| 本仓库配置生成 / 固定订阅 / 覆写脚本 | 本仓库 Issue |
