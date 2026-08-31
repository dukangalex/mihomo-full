# mihomo-full

> Mihomo Full 的安装与使用说明。

**License：** [MIT](./LICENSE)

**原则：能自动的绝不让你改配置文件；安全永远优先于省事。**  
订阅地址、机场链接、Bot Token 都是私密凭据，不要发到群聊、截图或 GitHub。

## 1. 安装

### 1.1 使用前必须完成的准备（按顺序做）

下面四步是**安装脚本无法替你省掉**的前提。做完再运行一键安装。

#### 步骤 A · VPS 与 v2ray-agent（落地节点）

1. 准备一台可 SSH 登录的 Linux VPS（建议常见 Debian / Ubuntu）。
2. 使用 **root**（或 `sudo -i`）登录。
3. 按 [v2ray-agent](https://github.com/mack-a/v2ray-agent) 官方说明安装并运行（本项目**不**安装、不升级、不卸载它）。
4. 用其菜单（常见为 `vasma`）添加至少一种入站/协议，确保已生成 clashMeta 订阅文件。
5. 在 VPS 上确认目录里有内容（路径以你实际安装为准，默认常见为）：

```bash
ls -la /etc/v2ray-agent/subscribe_local/clashMeta
```

有文件即可。若目录不存在或为空，先回到 v2ray-agent 完成节点配置，**不要急着装 Mihomo Full**。

#### 步骤 B · 域名解析到本机

1. 在域名服务商处添加 **A 记录**（或 AAAA）：主机名指向你的 VPS **公网 IP**。
2. 等待解析生效（通常几分钟，最长可能数小时）。
3. 在 VPS 上自检（把 `你的域名.com` 换成真实域名）：

```bash
# 应能解析到本机公网 IP
getent ahostsv4 你的域名.com || ping -c1 你的域名.com
```

解析不对时不要继续申请证书或安装，否则后续会失败。

#### 步骤 C · Nginx + HTTPS 证书（安全必做）

订阅必须走 **HTTPS**。脚本**不会**在无证书时用明文 HTTP 暴露配置。

1. 安装 Nginx（若尚未安装）：

```bash
# Debian / Ubuntu
apt update && apt install -y nginx

# RHEL / CentOS / Fedora
dnf install -y nginx
```

2. 启动并设置开机自启：

```bash
systemctl enable --now nginx
```

3. 安装 certbot 并签发证书（推荐）：

```bash
# Debian / Ubuntu
apt install -y certbot python3-certbot-nginx

# RHEL / CentOS
dnf install -y certbot python3-certbot-nginx
```

4. **确认防火墙 / 安全组已放行 80 和 443**（证书申请与 HTTPS 都依赖这两端口）。按下面逐项检查：

   **4.1 云厂商安全组 / 防火墙（几乎所有 VPS 都要查）**

   1. 登录云服务商控制台（如阿里云、腾讯云、AWS、Azure、Oracle、Vultr、Linode 等）。
   2. 找到该 VPS 实例绑定的 **安全组** / **Network ACL** / **Firewall rules**。
   3. 入站（Inbound）规则中应允许：
      - **TCP 80**（来源建议先 `0.0.0.0/0`，仅用于申请/续期证书；若你有固定 IP 也可收紧）
      - **TCP 443**（来源 `0.0.0.0/0`，否则外网无法访问 HTTPS 订阅）
   4. 若使用 IPv6，同时放行对应的 IPv6 入站 80/443。
   5. 保存规则后等待约 1 分钟再生效。

   **4.2 系统防火墙（在 VPS 上执行）**

   先看是否启用了防火墙：

   ```bash
   # Ubuntu/Debian 常见
   command -v ufw >/dev/null && ufw status verbose

   # RHEL/CentOS/Fedora 常见
   command -v firewall-cmd >/dev/null && firewall-cmd --state && firewall-cmd --list-all

   # 通用
   command -v iptables >/dev/null && iptables -L INPUT -n | head -30
   ```

   若 **ufw** 为 active，放行并重载：

   ```bash
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw reload
   ufw status
   ```

   若 **firewalld** 在运行：

   ```bash
   firewall-cmd --permanent --add-service=http
   firewall-cmd --permanent --add-service=https
   firewall-cmd --reload
   firewall-cmd --list-services
   ```

   **4.3 本机监听确认（可选但推荐）**

   ```bash
   ss -lntu | grep -E ':80|:443' || netstat -lntu | grep -E ':80|:443'
   ```

   看到 Nginx（或 certbot 临时）在听 80/443 即正常。若安全组已放行但这里无监听，先保证 `systemctl status nginx` 为 running。

   **4.4 外网探测（在你自己电脑上，可选）**

   ```bash
   # 把 IP 换成 VPS 公网 IP
   curl -sI --connect-timeout 5 http://VPS公网IP/ | head -5
   ```

   能连上（哪怕返回 404/301）说明 80 大致通；443 可在证书配好后用 `curl -sI https://你的域名` 验证。

5. 为域名申请证书（把 `你的域名.com` 换成真实域名）：

```bash
certbot --nginx -d 你的域名.com
```

按提示完成。成功后应存在：

```bash
ls /etc/letsencrypt/live/你的域名.com/fullchain.pem
ls /etc/letsencrypt/live/你的域名.com/privkey.pem
```

6. 若你使用自己购买的证书：在对应域名的 Nginx `server` 中配置好 `ssl_certificate` 与 `ssl_certificate_key`，并执行：

```bash
nginx -t && systemctl reload nginx
```

7. 浏览器访问 `https://你的域名.com` 应无证书告警（至少证书有效）。

**不要跳过本步。** 无有效 HTTPS 时，安装脚本会报错并再次打印操作指示。

#### 步骤 D · 机场订阅（入口）

1. 在机场用户中心复制 **Clash / Mihomo 订阅链接**。
2. 必须是以 `https://` 开头的地址。
3. 不要把完整链接发到公开群或提交到 GitHub。
4. 安装时粘贴一次即可；以后换机场用管理菜单，**不用改客户端固定地址**。

---

### 1.2 一键安装

确认 A～D 都完成后，在 VPS 上以 root 执行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/dukangalex/mihomo-full/main/install.sh)
```

按提示填写：

1. **机场订阅链接**（步骤 D）
2. **域名**（不要带 `https://`，例 `example.com`）
3. **clashMeta 目录**（默认路径直接回车即可）

确认摘要后回车。脚本将：

- 下载固定版本代码并生成配置  
- **自动**写入 Nginx 订阅路径并尝试 reload  
- 打印**唯一**需要导入客户端的固定 HTTPS 订阅地址  

> 固定地址只在首次安装时生成。以后更换机场、更新落地节点或更新项目时，一般不需要更换客户端订阅地址。

### 1.3 安装成功后怎么用

1. 复制终端里的 `https://你的域名/assets/...` 完整地址。  
2. 在 Clash Meta / Mihomo 等客户端中「从 URL 导入订阅」。  
3. 选中策略组后开始使用。  
4. 日常维护优先用：

```bash
go
```

---

## 2. Nginx 与 HTTPS（脚本自动 + 失败时怎么办）

安装脚本会**尽量自动**：

1. 检测域名是否已有 HTTPS 证书（Let's Encrypt 路径或站点中的 `ssl_certificate`）
2. 写入 `/etc/nginx/snippets/mihomo-full-assets.conf`
3. 在匹配的 `server_name` 站点中插入 `include`
4. 执行 `nginx -t` 并 reload

### 若提示没有证书

按终端里的【方式 A / B】操作，或回到上文 **步骤 C**，完成后再重新执行 1.2 的安装命令。

### 若提示找不到 server_name 站点

说明证书或 Nginx 已存在，但脚本没匹配到站点文件。按终端提示：

1. 打开该域名的 HTTPS `server { ... }` 配置  
2. 加入一行：

```nginx
include /etc/nginx/snippets/mihomo-full-assets.conf;
```

3. 执行：

```bash
nginx -t && systemctl reload nginx
```

### 手动复查

```bash
nginx -t
curl -fsSI "https://你的域名/你的订阅路径"
```

访问不存在的 `/assets/任意不存在路径` 应返回 **404**。

## 3. 管理入口

安装完成后，推荐统一使用：

```bash
go
```

进入管理菜单。

兼容入口仍可使用：

```bash
mihomo-full
```

### 管理菜单

进入 `go` 后可以：

1. 更换机场订阅
2. 更新 VPS 落地节点
3. 管理规则集
4. 查看当前状态
5. 执行配置完整性审计
6. 更新 Mihomo Full
7. 卸载 Mihomo Full

## 4. 更换机场

进入：

```text
go
→ 更换机场订阅
```

输入新的 HTTPS 机场订阅地址并确认。

更换完成后项目会自动重新生成配置。

**客户端原来的固定订阅地址不需要修改。**

也可以直接执行：

```bash
mihomo-full --set-airport 'https://example.invalid/subscription'
```

## 5. 更新 VPS 落地节点

更新 v2ray-agent 后，进入：

```text
go
→ 更新 VPS 落地节点
```

程序会重新读取 v2ray-agent 的 clashMeta 节点并生成配置。

客户端固定订阅地址不需要修改。

## 6. 规则集

进入：

```text
go
→ 规则集管理
```

可以选择：

- 查看当前覆盖
- 增加/替换规则集
- 禁用规则集
- 恢复模板默认

增加规则集时按照提示依次输入：

1. 规则集名称
2. HTTPS MRS 地址
3. 类型：`domain` 或 `ipcidr`
4. 命中策略组

不需要编辑 YAML。

核心安全规则不能通过管理入口关闭或覆盖。

## 7. 配置检查与审计

日常检查：

```bash
go
→ 配置完整性审计
```

也可以直接：

```bash
mihomo-full --check
mihomo-full --audit
```

如果检查失败，先不要继续重启服务或删除文件，根据终端提示处理。

## 8. 固定订阅地址

安装完成后会得到一个固定 HTTPS 地址。

地址形式类似：

```text
https://example.com/assets/普通英文词组...
```

它不是 UUID、十六进制字符串、Base64 字符串，也不会直接使用 `proxy`、`node`、`subscribe`、`config` 等明显的节点语义。

请把完整地址当作私有访问凭据保存。

不要发布到：

- GitHub
- Issue
- 公开群组
- 公开截图
- 公共日志

如果地址泄露，应尽快重新生成固定地址并重新配置客户端。

## 9. Telegram Bot

Telegram Bot 是可选的远程管理入口。

### 9.1 创建 Bot

1. 打开 Telegram。
2. 搜索官方 `@BotFather`。
3. 发送：

```text
/newbot
```

4. 按提示填写 Bot 名称。
5. 按提示填写 username。
6. 保存 BotFather 返回的 Bot Token。

**不要把 Token 发到公开群组或提交到 GitHub。**

### 9.2 获取 Telegram User ID

Bot 只用**数字 User ID** 识别管理员，**不能**用 `@用户名`。

按下面任一方式获取你自己的数字 ID：

**方式 A（推荐）**

1. 打开 Telegram，搜索 `@userinfobot`（或 `@getidsbot`）。
2. 进入对话，点击 **Start** / 发送 `/start`。
3. 机器人回复里的 **Id** / **Id** 一串纯数字（例如 `123456789`）就是你的 User ID。
4. 把这串数字记下来，安装 Bot 时填入「Telegram 管理员 User ID」。

**方式 B**

1. 搜索 `@RawDataBot`，发送任意消息。
2. 在返回的 JSON 里找到 `"id":` 后面的数字（在 `from` 或 `message` 对象中）。
3. 使用该数字作为管理员 User ID。

**注意：**

- User ID 是一串数字，不是 `@xxx` 用户名。
- 可填写多个管理员，用英文逗号分隔，例如：`123456789,987654321`。
- 只有列表中的 ID 才能操作 Bot；填错会导致你无法管理。

### 9.3 安装 Bot

在 VPS 上执行：

```bash
bash /opt/mihomo-full/telegram-bot/install-telegram-bot.sh
```

首次安装时程序会依次询问：

```text
Bot Token
Telegram 管理员 User ID
VPS 每月总流量 GB
VPS 到期时间
流量提醒阈值
```

其中：

- VPS 每月总流量是购买 VPS 时确定的套餐额度。
- 不清楚额度时可以填写 `0`，以后再设置。
- 不清楚到期时间时可以留空，以后再设置。
- 流量提醒阈值默认 80%。

统计网卡会自动检测默认 IPv4 出口网卡，一般不需要手动填写。

安装完成后，在 Telegram 打开 Bot，发送：

```text
/start
```

看到管理菜单即表示绑定成功。

### 9.4 Bot 功能

Bot 中可以使用：

- 更换机场订阅
- 更新 VPS 落地节点
- 查看当前状态
- 查看 VPS 流量
- 查看 VPS 到期时间
- 设置月总流量
- 设置到期时间
- 设置流量提醒阈值
- 增加/替换规则集
- 禁用规则集
- 恢复规则集
- 配置完整性检查
- 卸载 Telegram Bot
- 卸载 Mihomo Full

需要确认的操作会要求再次确认。

Bot 不提供任意 Shell 命令执行。

### 9.5 设置 VPS 月总流量

进入 Bot：

```text
📈 VPS流量/到期
→ 设置月流量
```

输入购买 VPS 时确定的月总流量。

例如：

```text
500
```

表示 500 GB。

### 9.6 设置 VPS 到期时间

进入：

```text
📈 VPS流量/到期
→ 设置到期时间
```

按照 Bot 提示输入日期或时间。

### 9.7 流量监控

Bot 显示的是 VPS 本机网卡统计值。

它适合用于日常提醒和估算，不等同于服务商后台账单。

最终计费以 VPS 服务商后台为准。

### 9.8 增加规则集

进入：

```text
📦 规则集
→ 增加/替换
```

按照 Bot 的四步提示完成即可，不需要输入 `|` 分隔格式，也不需要编辑配置文件。

### 9.9 卸载 Telegram Bot

进入：

```text
🤖 卸载 Telegram Bot
```

连续确认后，Bot 会自动停止并删除自己的服务、程序和私有配置。

不会删除 Mihomo Full 主配置。

不会删除、停止或修改 v2ray-agent。

### 9.10 卸载整个 Mihomo Full

进入：

```text
🗑 卸载 Mihomo Full
```

按照确认提示操作。

也可以在 VPS 上执行：

```bash
go
→ 卸载 Mihomo Full
```

或者：

```bash
mihomo-full uninstall
```

卸载器会要求最终确认。

**v2ray-agent 不会因为卸载 Mihomo Full 而被删除、停止或修改。**

## 10. Cloudflare 进阶玩法

以下两个玩法彼此独立，也不属于 Mihomo Full 的安装必需项。

### 10.1 Cloudflare EdgeTunnel

项目地址：

https://github.com/cmliu/edgetunnel

使用方法、部署方式和 Cloudflare 端配置请以该项目的官方说明为准。

本项目只提供该玩法的使用入口说明，不内置第三方项目代码。

### 10.2 Cloudflare Country-Specific IP Filter

项目地址：

https://github.com/alienwaregf/Cloudflare-Country-Specific-IP-Filter

使用方法和 IP 更新方式请以该项目的官方说明为准。

它与 EdgeTunnel 独立，可以单独使用。

## 11. 日常维护

### 查看状态

```bash
go
→ 查看当前状态
```

### 更新项目

```bash
go
→ 更新 Mihomo Full
```

更新前不需要删除现有安装。

### 重新生成配置

```bash
mihomo-full --generate
```

### 检查配置

```bash
mihomo-full --check
```

### 完整审计

```bash
mihomo-full --audit
```

## 12. 常见问题

### 机场换了，客户端地址需要重新导入吗？

不需要。

只要使用的是安装器生成的固定订阅地址，更换机场后地址保持不变。

### v2ray-agent 会被 Mihomo Full 接管吗？

不会。

Mihomo Full 使用 v2ray-agent 提供的 clashMeta 节点，不负责管理 v2ray-agent 自身。

### 卸载 Mihomo Full 会不会把 v2ray-agent 一起删掉？

不会。

Mihomo Full 的卸载器只处理本项目自己的资源。

### Bot Token 泄露怎么办？

立即在 BotFather 撤销旧 Token，生成新 Token，然后重新运行：

```bash
bash /opt/mihomo-full/telegram-bot/install-telegram-bot.sh
```

### 忘记了固定订阅地址怎么办？

在 VPS 上进入：

```bash
go
→ 查看当前状态
```

固定地址保存在 VPS 私有配置中。

不要把包含完整地址的终端截图公开。

### 不想使用 Telegram Bot 了怎么办？

在 Bot 中选择：

```text
🤖 卸载 Telegram Bot
```

只会移除 Bot，不会卸载 Mihomo Full。

## 13. 重要提醒（安全优先）

1. **安全永远优先于省事**：没有 HTTPS 证书时不要强行用 HTTP 暴露订阅。
2. 不要把真实机场订阅、节点凭据、Bot Token 或固定订阅地址提交到 GitHub，也不要发到群聊或公开截图。
3. 不要公开完整固定订阅地址；泄露后应视为凭据已曝光并尽快轮换。
4. 不要直接编辑生成后的 `output/full-config.yaml`。
5. 规则集优先通过 `go` 或 Telegram Bot 管理。
6. 不要手动删除 `/etc/v2ray-agent`；本项目不接管其生命周期。
7. 不要为了处理单个问题而删除现有功能或配置模块。

## 14. 相关项目

- v2ray-agent：https://github.com/mack-a/v2ray-agent
- Mihomo：https://github.com/MetaCubeX/mihomo
- Cloudflare EdgeTunnel：https://github.com/cmliu/edgetunnel
- Cloudflare Country-Specific IP Filter：https://github.com/alienwaregf/Cloudflare-Country-Specific-IP-Filter

## 15. 免责声明

1. 本项目按「现状」提供，作者与贡献者不就使用本软件产生的任何直接或间接损失承担责任，包括但不限于账号封禁、流量费用、服务中断、数据泄露或配置失误。
2. 你应遵守所在地法律法规及 VPS、机场、Telegram、域名等服务商的服务条款。本项目不提供任何形式的违法用途指导。
3. 网络代理、订阅与节点涉及隐私与安全风险；请自行评估并做好凭据保管。因密钥/订阅泄露造成的损失由使用者自行承担。
4. 第三方项目（如 v2ray-agent、Mihomo、Nginx、certbot、Telegram、以及下文鸣谢中的进阶玩法项目等）的行为与可用性以其官方说明为准，本项目不对其变更或故障负责。
5. 在公共模板仓库中，请只使用占位配置；切勿提交真实订阅、Token 或固定订阅完整 URL。

## 16. 鸣谢

感谢以下项目与社区（排名不分先后）：

- [v2ray-agent](https://github.com/mack-a/v2ray-agent) — VPS 多协议落地与 clashMeta 订阅生成
- [Mihomo (MetaCubeX)](https://github.com/MetaCubeX/mihomo) — 内核与规则能力
- [Nginx](https://nginx.org/) — 反向代理与静态订阅托管
- [Let's Encrypt](https://letsencrypt.org/) / [certbot](https://certbot.eff.org/) — 免费 HTTPS 证书
- [Cloudflare EdgeTunnel (cmliu/edgetunnel)](https://github.com/cmliu/edgetunnel) — 文档中引用的 Cloudflare 免费机场进阶玩法
- [Cloudflare Country-Specific IP Filter](https://github.com/alienwaregf/Cloudflare-Country-Specific-IP-Filter) — 文档中引用的 Cloudflare 优选 IP 进阶玩法
- 规则集与社区贡献者（广告/地理/防钓鱼等公开规则源）
- 所有提交 Issue、建议与测试反馈的用户

本仓库仅作入口说明与链接引用，不内置上述第三方项目的代码；使用方式以其官方仓库为准。

若你是相关项目作者，需要调整署名或链接，欢迎通过仓库 Issue 联系。

## 17. 许可证

本仓库源代码与文档以 **MIT License** 发布，详见根目录 [LICENSE](./LICENSE) 文件。

第三方项目（v2ray-agent、Mihomo、EdgeTunnel 等）仍遵循各自原有许可证，与本仓库许可相互独立。
