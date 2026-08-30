# Mihomo-Full Telegram 管理入口

这是 Mihomo-Full 的**附加远程管理入口**，不会替代原来的 `mihomo-full` CLI。

## 安全设计

- Telegram User ID 白名单是强制条件。
- 不提供任意 Shell/命令执行。
- 写操作需要二次确认。
- Bot 不主动回显机场订阅 URL、UUID、密码等秘密。
- Bot 只调用 Mihomo-Full 已定义的固定 Action。
- systemd 服务启用 `NoNewPrivileges`、`ProtectSystem=strict`、`ProtectHome` 和 `PrivateTmp`。
- Bot 是管理前端，不维护第二套 Mihomo 配置逻辑。

## 绑定 TG Bot

### 1. 在 Telegram 创建机器人

1. 打开官方 `@BotFather`。
2. 发送 `/newbot`。
3. 按提示设置 Bot 名称和 username。
4. 保存 BotFather 返回的 **Bot Token**。
5. **Token 只保存在 VPS 私有配置，绝对不要提交 GitHub。**

### 2. 获取自己的 Telegram User ID

使用你信任的 Telegram User ID 查询方式获取自己的数字 ID，然后只把这个数字填入管理员白名单。

> Bot 不接受“用户名”作为管理员身份；权限判断使用 Telegram User ID。

### 3. 配置 Bot

主项目安装完成后：

```bash
cp /opt/mihomo-full/telegram-bot.example.env /opt/mihomo-full/telegram-bot.env
chmod 600 /opt/mihomo-full/telegram-bot.env
nano /opt/mihomo-full/telegram-bot.env
```

填写：

```text
TG_BOT_TOKEN=从 BotFather 获得的 token
TG_ADMIN_IDS=你的 Telegram User ID

# VPS 套餐参数；购买 VPS 时确定
VPS_MONTHLY_GB=0
VPS_EXPIRES_AT=
VPS_TRAFFIC_ALERT_PERCENT=80
VPS_TRAFFIC_INTERFACE=
```

参数说明：

- `TG_BOT_TOKEN`：BotFather 提供的机器人 Token。
- `TG_ADMIN_IDS`：允许操作 Bot 的 Telegram 数字 User ID，多个 ID 用逗号分隔。
- `VPS_MONTHLY_GB`：VPS 月总流量额度，单位 GiB；`0` 表示不设置额度，仅统计使用量。
- `VPS_EXPIRES_AT`：VPS 到期时间，使用 ISO 8601；例如 `2026-12-31T23:59:59Z`；留空表示不设置。
- `VPS_TRAFFIC_ALERT_PERCENT`：流量告警百分比，例如 `80` 表示达到额度 80% 时提示。
- `VPS_TRAFFIC_INTERFACE`：可选的统计网卡，例如 `eth0`、`ens3`；留空则自动检测默认 IPv4 出口网卡。

安装：

```bash
bash /opt/mihomo-full/telegram-bot/install-telegram-bot.sh
systemctl status mihomo-full-bot
```

## 当前功能

打开 Bot 后发送 `/start`，管理员可以看到：

- 🔄 **更换机场订阅**：输入新的 HTTPS 订阅地址，地址不会在 Bot 消息中回显，并在执行前再次确认；最终调用主项目 `manage.sh`。
- 🚀 **更新落地节点**：重新读取 v2ray-agent 的 `clashMeta` 节点并生成配置。
- 📊 **当前状态**：查看 Mihomo-Full 当前状态；秘密 URL 会被隐藏。
- 📈 **VPS 流量/到期**：查看本自然月本机网卡 RX+TX 使用量、月额度、使用率、到期时间和剩余天数。
- 📦 **规则集管理**：增加/替换、禁用、恢复规则集；核心安全规则由主项目保护。
- 🧪 **配置完整性检查**：调用主项目检查入口。
- 🗑 **卸载 Mihomo Full**：Bot 只发起安全提示；最终卸载要求在服务器本地执行 `mihomo-full uninstall` 并输入 `UNINSTALL`，防止远程误删。

## VPS 流量监控

流量监控使用 VPS 本机网卡 RX+TX 计数器，按自然月累计。

例如：

```text
📈 VPS 套餐与流量

统计周期：2026-08
主网卡：eth0
本周期已用：123.45 GiB
月总额度：500.00 GiB
使用率：24.7%
到期时间：2026-12-31T23:59:59Z
剩余：124.3 天
```

如果达到 `VPS_TRAFFIC_ALERT_PERCENT`，Bot 会显示告警；达到或超过 100% 会显示超额提示。

### 统计口径

这是**VPS 本机使用量估算**，不是 VPS 服务商账单：

- 入站/出站是否计费由服务商决定。
- 服务商可能使用不同统计周期和计费口径。
- 本程序处理重启、计数器回退和网卡变化时会重新建立 baseline，避免跨 reset 产生虚假流量。

因此最终账单仍以 VPS 服务商后台为准。

## 规则集操作

Bot 规则集菜单对应主项目固定 Action：

```text
增加/替换
禁用
恢复默认
```

Bot 不提供任意命令执行。核心安全规则不能通过 Bot 绕过主项目保护。

复杂或批量维护建议直接使用 CLI：

```bash
mihomo-full
```

## 链式状态

Bot 的管理侧检查不会冒充完整链路测速。真实链路应在客户端/VPS 测试环境验证：

```text
机场入口 → VPS 落地 → 目标服务
```

如果机场入口失效，必须确认不会自动退化为 DIRECT。

## 运维

```bash
systemctl status mihomo-full-bot
journalctl -u mihomo-full-bot -f
systemctl restart mihomo-full-bot
```

Bot 配置文件：

```text
/opt/mihomo-full/telegram-bot.env
```

权限应保持：

```bash
chmod 600 /opt/mihomo-full/telegram-bot.env
```

## 卸载 Bot

仅卸载 Bot、保留 Mihomo-Full 主配置：

```bash
systemctl disable --now mihomo-full-bot
rm -f /etc/systemd/system/mihomo-full-bot.service
systemctl daemon-reload
```

这不会删除 `/opt/mihomo-full` 主项目。

如果要卸载**整个 Mihomo Full**，应使用主项目安全卸载器：

```bash
mihomo-full uninstall
```

然后按提示输入：

```text
UNINSTALL
```

**整个 Mihomo Full 卸载也不会删除、停止或修改 v2ray-agent。**

## Token 泄露处理

如果 Bot Token 泄露：

1. 立即在 BotFather 撤销旧 Token。
2. 生成新 Token。
3. 更新 VPS 上的 `/opt/mihomo-full/telegram-bot.env`。
4. 重启 Bot：

```bash
systemctl restart mihomo-full-bot
```

不要把旧 Token、新 Token 或完整 Bot 配置提交到 GitHub。
