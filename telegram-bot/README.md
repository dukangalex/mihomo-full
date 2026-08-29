# Mihomo-Full Telegram 管理入口

这是 Mihomo-Full 的**附加远程管理入口**，不会替代原来的 `mihomo-full` CLI。

## 安全设计

- Telegram User ID 白名单是强制条件。
- 不提供任意 Shell/命令执行。
- 所有写操作都需要 Telegram 二次确认。
- Bot 不主动回显机场订阅 URL、UUID、密码等秘密。
- Bot 只调用 Mihomo-Full 已定义的固定 Action。
- systemd 服务启用 `NoNewPrivileges`、`ProtectSystem=strict`、`ProtectHome` 和 `PrivateTmp`。

## 安装

先完成主项目安装，再执行：

```bash
cp /opt/mihomo-full/telegram-bot.example.env /opt/mihomo-full/telegram-bot.env
chmod 600 /opt/mihomo-full/telegram-bot.env
nano /opt/mihomo-full/telegram-bot.env
```

填写：

```text
TG_BOT_TOKEN=从 BotFather 获得的 token
TG_ADMIN_IDS=你的 Telegram User ID
```

然后：

```bash
bash /opt/mihomo-full/telegram-bot/install-telegram-bot.sh
```

获取自己的 Telegram User ID 后再填写白名单；**不要把 Bot Token 提交到 GitHub。**

## 当前菜单

- 🔄 更换机场订阅：输入新 HTTPS URL，二次确认后更新本地 settings 并重新生成配置。
- 🚀 更新落地节点：重新读取 v2ray-agent `clashMeta` 节点并生成配置。
- 📊 当前状态：查看管理器状态，不显示完整秘密。
- 📦 规则集管理：当前提供安全入口；复杂规则修改仍建议使用 CLI，后续可扩展为严格字段表单。
- 🔗 链式状态检查：当前只做管理侧只读检查，不把单点探测冒充完整链式测速。
- 🧪 配置完整性检查：检查核心文件存在性及 shell 语法。

## 运维

```bash
systemctl status mihomo-full-bot
journalctl -u mihomo-full-bot -f
systemctl restart mihomo-full-bot
```

卸载机器人不会删除 Mihomo-Full 主配置：

```bash
systemctl disable --now mihomo-full-bot
rm -f /etc/systemd/system/mihomo-full-bot.service
systemctl daemon-reload
```

如 Bot Token 泄露，应立即在 BotFather 撤销并重新生成 Token，同时更新 VPS 上的 `telegram-bot.env`。
