#!/usr/bin/env python3
"""Telegram UI for Mihomo-Full.

Thin remote UI over manage.sh. VPS traffic/expiry is read from a local
persistent tracker; no independent proxy configuration is maintained.
"""
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, MessageHandler, ContextTypes, filters

BASE = Path(os.environ.get("MIHOMO_FULL_DIR", "/opt/mihomo-full")).resolve()
MANAGE = BASE / "manage.sh"
TOKEN = os.environ.get("TG_BOT_TOKEN", "")
ADMIN_IDS = {int(x.strip()) for x in os.environ.get("TG_ADMIN_IDS", "").split(",") if x.strip().isdigit()}
if not TOKEN or not ADMIN_IDS:
    raise SystemExit("TG_BOT_TOKEN and TG_ADMIN_IDS are required")


def allowed(update):
    u = update.effective_user
    return bool(u and u.id in ADMIN_IDS)


def menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🔄 更换机场订阅", callback_data="airport")],
        [InlineKeyboardButton("🚀 更新落地节点", callback_data="generate"), InlineKeyboardButton("📊 当前状态", callback_data="status")],
        [InlineKeyboardButton("📈 VPS流量/到期", callback_data="vps")],
        [InlineKeyboardButton("📦 规则集管理", callback_data="rules")],
        [InlineKeyboardButton("🧪 配置完整性检查", callback_data="check")],
        [InlineKeyboardButton("🗑 卸载 Mihomo Full", callback_data="uninstall")],
    ])


def rules_menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("➕ 增加/替换", callback_data="rule_add")],
        [InlineKeyboardButton("⛔ 禁用", callback_data="rule_disable"), InlineKeyboardButton("♻️ 恢复默认", callback_data="rule_restore")],
        [InlineKeyboardButton("🔄 刷新", callback_data="rules"), InlineKeyboardButton("↩️ 返回", callback_data="home")],
    ])


def vps_menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📊 刷新流量", callback_data="vps_refresh")],
        [InlineKeyboardButton("📦 设置月流量", callback_data="vps_quota"), InlineKeyboardButton("⏳ 设置到期时间", callback_data="vps_expiry")],
        [InlineKeyboardButton("🔔 设置提醒阈值", callback_data="vps_alert")],
        [InlineKeyboardButton("↩️ 返回", callback_data="home")],
    ])


def confirm_menu(action):
    return InlineKeyboardMarkup([[InlineKeyboardButton("✅ 确认", callback_data=f"confirm:{action}"), InlineKeyboardButton("❌ 取消", callback_data="cancel")]])


def cancel_menu():
    return InlineKeyboardMarkup([[InlineKeyboardButton("❌ 取消", callback_data="cancel")]])


def run_manage(args, timeout=180):
    p = subprocess.run(["bash", str(MANAGE), *args], cwd=BASE, text=True,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout, check=False)
    out = re.sub(r'https://[^\s\"\']+', '[已隐藏 URL]', p.stdout or "")
    return p.returncode, out[-3500:]


def vps_report():
    try:
        import sys
        sys.path.insert(0, str(BASE / "telegram-bot"))
        from vps_usage import report
        return report()
    except Exception as exc:
        return {"error": str(exc)}


def format_vps():
    r = vps_report()
    if "error" in r:
        return "❌ VPS 流量统计暂不可用：" + r["error"]
    used_gb = r["used_bytes"] / 1024**3
    lines = ["📈 VPS 套餐与流量", "", f"统计周期：{r['period']}", f"主网卡：{r.get('interface') or '未识别'}", f"本周期已用：{used_gb:.2f} GiB"]
    if r["quota_gb"] > 0:
        lines += [f"月总额度：{r['quota_gb']:.2f} GiB", f"使用率：{r['percent']:.1f}%"]
        if r["percent"] >= r["alert_percent"]:
            lines.append(f"⚠️ 已达到 {r['alert_percent']:.0f}% 流量告警线")
        if r["percent"] >= 100:
            lines.append("🔴 已超过配置的月流量额度")
    else:
        lines.append("月总额度：未设置")
    if r["expiry"]:
        lines.append(f"到期时间：{r['expiry']}")
        if r["days_left"] is not None:
            if r["days_left"] < 0: lines.append("🔴 VPS 已到期")
            elif r["days_left"] <= 7: lines.append(f"⚠️ 剩余 {r['days_left']:.1f} 天")
            else: lines.append(f"剩余：{r['days_left']:.1f} 天")
    else:
        lines.append("到期时间：未设置")
    lines.append("\n说明：流量为 VPS 主网卡 RX+TX 本地统计，不等同于商家账单数据。")
    return "\n".join(lines)


def update_private_env(values):
    env_file = BASE / "telegram-bot.env"
    if not env_file.is_file(): raise RuntimeError("找不到 Telegram Bot 私有配置")
    lines = env_file.read_text(encoding="utf-8").splitlines()
    updates = {k: str(v) for k, v in values.items()}
    out, seen = [], set()
    for line in lines:
        if "=" in line and not line.lstrip().startswith("#"):
            key = line.split("=", 1)[0]
            if key in updates:
                out.append(f"{key}={updates[key]}"); seen.add(key); continue
        out.append(line)
    for key, value in updates.items():
        if key not in seen: out.append(f"{key}={value}")
    tmp = env_file.with_suffix(".tmp")
    tmp.write_text("\n".join(out) + "\n", encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(env_file)


def restart_bot():
    # Restart after the current Telegram update has been acknowledged. A synchronous
    # restart can terminate this process before the confirmation message is delivered.
    subprocess.Popen(
        ["bash", "-lc", "sleep 1; systemctl restart mihomo-full-bot.service"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


async def start(update, context):
    if not allowed(update): return
    context.user_data.clear()
    await update.message.reply_text("🤖 Mihomo-Full 管理入口\n\n请选择操作：", reply_markup=menu())


async def button(update, context):
    q = update.callback_query
    if not allowed(update): await q.answer("无权限", show_alert=True); return
    await q.answer()
    action = q.data
    if action in {"airport", "generate"}:
        context.user_data["pending"] = action
        title = "更换机场订阅" if action == "airport" else "更新 VPS 落地节点"
        await q.edit_message_text(f"⚠️ {title}\n\n此操作会修改/重新生成配置。确认继续？", reply_markup=confirm_menu(action))
    elif action == "rules":
        code, out = run_manage(["--rules-list"])
        await q.edit_message_text(("📦 当前本地规则覆盖：\n" + (out or "（无本地覆盖）"))[:4000], reply_markup=rules_menu())
    elif action == "check":
        code, out = run_manage(["--check"])
        await q.edit_message_text(("✅ " if code == 0 else "❌ ") + out, reply_markup=menu())
    elif action == "status":
        code, out = run_manage(["status"])
        await q.edit_message_text(("✅ " if code == 0 else "❌ ") + out, reply_markup=menu())
    elif action in {"vps", "vps_refresh"}:
        await q.edit_message_text(format_vps(), reply_markup=vps_menu())
    elif action == "vps_quota":
        context.user_data["awaiting_vps"] = "quota"
        current = vps_report().get("quota_gb", 0)
        await q.edit_message_text(f"请输入 VPS 每月总流量（GB）。\n\n当前：{current:g} GB\n\n只需输入数字，例如：500", reply_markup=cancel_menu())
    elif action == "vps_expiry":
        context.user_data["awaiting_vps"] = "expiry"
        current = vps_report().get("expiry") or "未设置"
        await q.edit_message_text(f"请输入 VPS 到期时间。\n\n当前：{current}\n\n格式：YYYY-MM-DD\n例如：2027-08-29", reply_markup=cancel_menu())
    elif action == "vps_alert":
        context.user_data["awaiting_vps"] = "alert"
        current = vps_report().get("alert_percent", 80)
        await q.edit_message_text(f"请输入流量提醒阈值（0-100）。\n\n当前：{current:g}%\n\n例如：80", reply_markup=cancel_menu())
    elif action == "uninstall":
        await q.edit_message_text("⚠️ 卸载 Mihomo Full\n\n只会删除 Mihomo Full 自身资源。\n明确不会删除、停止或修改 v2ray-agent。\n\n此操作不可逆，请确认。", reply_markup=confirm_menu("uninstall"))


async def confirm(update, context):
    q = update.callback_query
    if not allowed(update): await q.answer("无权限", show_alert=True); return
    await q.answer()
    _, action = q.data.split(":", 1)
    pending = context.user_data.get("pending")
    if pending != action and action != "uninstall":
        await q.edit_message_text("操作已过期，请重新选择。", reply_markup=menu()); return
    context.user_data.pop("pending", None)
    if action == "generate":
        code, out = run_manage(["--generate"])
        await q.edit_message_text(("✅ " if code == 0 else "❌ ") + out, reply_markup=menu())
    elif action == "airport":
        context.user_data["awaiting_airport"] = True
        await q.edit_message_text("请输入新的 HTTPS 机场订阅地址。\n\n收到后不会回显 URL，并会再次要求确认。", reply_markup=cancel_menu())
    elif action == "uninstall":
        await q.edit_message_text("⚠️ 最后确认\n\n请确认执行安全卸载。\n\n卸载完成后 Telegram Bot 也会停止。\n\nv2ray-agent 不会被此操作删除。", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🗑 确认卸载", callback_data="confirm:uninstall_final"), InlineKeyboardButton("❌ 取消", callback_data="cancel")]]))


async def uninstall_final(update, context):
    q = update.callback_query
    if not allowed(update):
        await q.answer("无权限", show_alert=True)
        return
    await q.answer()
    # The uninstall script performs its own ownership checks and expects the literal
    # UNINSTALL confirmation. Run it detached so the Bot can acknowledge the request
    # before systemd stops the Bot service itself.
    uninstall_script = BASE / "uninstall.sh"
    command = f"sleep 2; printf '%s\\n' UNINSTALL | bash {uninstall_script}"
    subprocess.Popen(["bash", "-lc", command], cwd=BASE, stdout=subprocess.DEVNULL,
                     stderr=subprocess.DEVNULL, start_new_session=True)
    context.user_data.clear()
    await q.edit_message_text(
        "🗑 已开始执行 Mihomo Full 安全卸载。\n\n"
        "Telegram Bot 将随服务一起停止。\n"
        "v2ray-agent 不会被删除、停止或修改。"
    )


async def text(update, context):
    if not allowed(update): return
    s = (update.message.text or "").strip()
    if context.user_data.get("awaiting_airport"):
        if not re.fullmatch(r"https://[^\s\"']+", s):
            await update.message.reply_text("❌ 只接受有效 HTTPS 订阅地址。", reply_markup=cancel_menu()); return
        context.user_data["awaiting_airport"] = False
        context.user_data["pending_url"] = s
        await update.message.reply_text("⚠️ 已收到新的订阅地址（不会显示具体 URL）。\n\n确认替换并重新生成？", reply_markup=confirm_menu("airport_url")); return

    awaiting_vps = context.user_data.get("awaiting_vps")
    if awaiting_vps:
        try:
            if awaiting_vps == "quota":
                value = float(s)
                if value < 0: raise ValueError
                update_private_env({"VPS_MONTHLY_GB": f"{value:g}"})
                message = f"✅ 月总流量已设置为 {value:g} GB。"
            elif awaiting_vps == "alert":
                value = float(s)
                if not 0 <= value <= 100: raise ValueError
                update_private_env({"VPS_TRAFFIC_ALERT_PERCENT": f"{value:g}"})
                message = f"✅ 流量提醒阈值已设置为 {value:g}%。"
            else:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s): raise ValueError
                datetime.strptime(s, "%Y-%m-%d")
                update_private_env({"VPS_EXPIRES_AT": s + "T23:59:59+00:00"})
                message = f"✅ VPS 到期时间已设置为 {s}。"
            context.user_data.pop("awaiting_vps", None)
            restart_bot()
            await update.message.reply_text(message, reply_markup=vps_menu())
        except (ValueError, RuntimeError, OSError):
            await update.message.reply_text("❌ 输入无效，请按提示重新输入。", reply_markup=cancel_menu())
        return

    rule_step = context.user_data.get("rule_step")
    if rule_step:
        try:
            if rule_step == "name":
                if not re.fullmatch(r"[A-Za-z0-9_-]+", s): raise ValueError("名称只能包含字母、数字、下划线和短横线")
                context.user_data["rule_name"] = s
                context.user_data["rule_step"] = "url"
                await update.message.reply_text("第 2/4 步：请输入规则集 HTTPS MRS 地址。", reply_markup=cancel_menu())
            elif rule_step == "url":
                if not re.fullmatch(r"https://[^\s\"'|]+", s): raise ValueError("必须是 HTTPS 地址")
                context.user_data["rule_url"] = s
                context.user_data["rule_step"] = "behavior"
                await update.message.reply_text("第 3/4 步：请选择规则集类型。", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("domain", callback_data="rule_behavior:domain"), InlineKeyboardButton("ipcidr", callback_data="rule_behavior:ipcidr")], [InlineKeyboardButton("❌ 取消", callback_data="cancel")]]))
            elif rule_step == "target":
                if not s or "|" in s or "," in s or "\n" in s or "\r" in s: raise ValueError("策略组名称不合法")
                args = ["--rule-add", context.user_data["rule_name"], context.user_data["rule_url"], context.user_data["rule_behavior"], s]
                context.user_data["pending_rule_args"] = args
                context.user_data.pop("rule_step", None)
                await update.message.reply_text("⚠️ 规则集信息已完整填写。\n\n确认写入并重新生成配置？", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("✅ 确认", callback_data="confirm_rule"), InlineKeyboardButton("❌ 取消", callback_data="cancel")]]))
        except ValueError as exc:
            await update.message.reply_text("❌ " + str(exc), reply_markup=cancel_menu())
        return

    action = context.user_data.pop("rule_action", None)
    if action:
        if not re.fullmatch(r"[A-Za-z0-9_-]+", s):
            await update.message.reply_text("❌ 规则集名称不合法。", reply_markup=rules_menu()); return
        args = ["--rule-disable" if action == "rule_disable" else "--rule-restore", s]
        context.user_data["pending_rule_args"] = args
        await update.message.reply_text("⚠️ 即将修改规则集配置。\n\n确认执行？", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("✅ 确认", callback_data="confirm_rule"), InlineKeyboardButton("❌ 取消", callback_data="cancel")]]))


async def confirm_airport(update, context):
    q = update.callback_query
    if not allowed(update): await q.answer("无权限", show_alert=True); return
    await q.answer()
    url = context.user_data.pop("pending_url", None)
    if not url:
        await q.edit_message_text("订阅地址已过期，请重新操作。", reply_markup=menu()); return
    code, out = run_manage(["--set-airport", url])
    await q.edit_message_text(("✅ 机场更换完成\n" if code == 0 else "❌ 更换失败\n") + out, reply_markup=menu())


async def confirm_mutation(update, context):
    q = update.callback_query
    if not allowed(update): await q.answer("无权限", show_alert=True); return
    await q.answer()
    args = context.user_data.pop("pending_rule_args", None)
    if not args:
        await q.edit_message_text("操作已过期，请重新选择。", reply_markup=menu()); return
    code, out = run_manage(args)
    await q.edit_message_text(("✅ " if code == 0 else "❌ ") + out, reply_markup=menu())


async def rule_flow(update, context):
    q = update.callback_query
    if not allowed(update): await q.answer("无权限", show_alert=True); return
    await q.answer()
    action = q.data
    if action == "rule_add":
        context.user_data.clear()
        context.user_data["rule_step"] = "name"
        await q.edit_message_text("增加/替换规则集\n\n第 1/4 步：请输入规则集名称。\n\n只能使用字母、数字、下划线和短横线。", reply_markup=cancel_menu())
    else:
        context.user_data["rule_action"] = action
        prompts = {"rule_disable": "请输入要禁用的规则集名称。核心安全规则不可禁用。", "rule_restore": "请输入要恢复默认的规则集名称。"}
        await q.edit_message_text(prompts[action], reply_markup=cancel_menu())


async def rule_behavior(update, context):
    q = update.callback_query
    if not allowed(update): await q.answer("无权限", show_alert=True); return
    await q.answer()
    context.user_data["rule_behavior"] = q.data.split(":", 1)[1]
    context.user_data["rule_step"] = "target"
    await q.edit_message_text("第 4/4 步：请输入命中策略组名称。\n\n例如：国外服务", reply_markup=cancel_menu())


async def cancel(update, context):
    q = update.callback_query
    if not allowed(update): await q.answer("无权限", show_alert=True); return
    await q.answer(); context.user_data.clear(); await q.edit_message_text("已取消。", reply_markup=menu())


async def home(update, context):
    q = update.callback_query
    if not allowed(update): await q.answer("无权限", show_alert=True); return
    await q.answer(); context.user_data.clear(); await q.edit_message_text("🤖 Mihomo-Full 管理入口", reply_markup=menu())


app = Application.builder().token(TOKEN).build()
app.add_handler(CommandHandler("start", start))
app.add_handler(CallbackQueryHandler(confirm_airport, pattern="^confirm:airport_url$"))
app.add_handler(CallbackQueryHandler(confirm, pattern="^confirm:(airport|generate|uninstall)$"))
app.add_handler(CallbackQueryHandler(uninstall_final, pattern="^confirm:uninstall_final$"))
app.add_handler(CallbackQueryHandler(confirm_mutation, pattern="^confirm_rule$"))
app.add_handler(CallbackQueryHandler(rule_behavior, pattern="^rule_behavior:(domain|ipcidr)$"))
app.add_handler(CallbackQueryHandler(cancel, pattern="^cancel$"))
app.add_handler(CallbackQueryHandler(rule_flow, pattern="^rule_(add|disable|restore)$"))
app.add_handler(CallbackQueryHandler(home, pattern="^home$"))
app.add_handler(CallbackQueryHandler(button))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text))
app.run_polling(allowed_updates=Update.ALL_TYPES)
