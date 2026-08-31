# mihomo-full

> Mihomo Full 的安装与使用说明。

## 1. 安装

### 使用前准备

请先准备：

- 一台已经安装并正常运行 **v2ray-agent** 的 VPS。
- 一个已经解析到 VPS 的域名。
- 一个 HTTPS 机场订阅地址。
- VPS 上可正常使用 Nginx，且该域名**已具备 HTTPS 证书**（推荐 Let's Encrypt / certbot）。

本项目不会安装、升级、接管或卸载 v2ray-agent。

### 开始安装

以 root 身份执行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/dukangalex/mihomo-full/main/install.sh)
```

按屏幕提示填写：

1. 机场订阅链接
2. 域名
3. v2ray-agent 的 clashMeta 目录（多数情况直接回车）

安装完成后会显示固定 HTTPS 订阅地址。

> 固定地址只在首次安装时生成。以后更换机场、更新落地节点或更新项目时，不需要更换客户端订阅地址。

## 2. Nginx 与 HTTPS

安装脚本会**尽量自动**：

1. 检测域名是否已有 HTTPS 证书（Let's Encrypt 或站点中的 `ssl_certificate`）
2. 写入 `/etc/nginx/snippets/mihomo-full-assets.conf`
3. 在匹配的 `server_name` 站点中插入 `include`
4. 执行 `nginx -t` 并 reload

若**没有证书**或**找不到对应站点配置**，脚本会**报错退出**并打印可执行的操作指示（例如用 certbot 签发后再重新运行安装），不会在无 HTTPS 时强行上线订阅。

手动复查：

```bash
nginx -t
curl -fsSI "https://你的域名/你的订阅路径"
```

访问不存在的 `/assets/` 路径应返回 404。

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

## 13. 重要提醒

1. 不要把真实机场订阅、节点凭据、Bot Token 或固定订阅地址提交到 GitHub。
2. 不要公开完整固定订阅地址。
3. 不要直接编辑生成后的 `output/full-config.yaml`。
4. 规则集优先通过 `go` 或 Telegram Bot 管理。
5. 不要手动删除 `/etc/v2ray-agent`。
6. 不要为了处理单个问题而删除现有功能或配置模块。

## 14. 相关项目

- v2ray-agent：https://github.com/mack-a/v2ray-agent
- Mihomo：https://github.com/MetaCubeX/mihomo
- Cloudflare EdgeTunnel：https://github.com/cmliu/edgetunnel
- Cloudflare Country-Specific IP Filter：https://github.com/alienwaregf/Cloudflare-Country-Specific-IP-Filter
