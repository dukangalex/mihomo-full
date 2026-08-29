#!/usr/bin/env python3
"""Telegram UI for Mihomo-Full.

Thin remote UI over manage.sh. VPS traffic/expiry is read from a local
persistent tracker; no independent proxy configuration is maintained.
"""
import os
import re
import subprocess
from pathlib import Path
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters

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


def confirm_menu(action):
    return InlineKeyboardMarkup([[InlineKeyboardButton("✅ 确认", callback_data=f"confirm:{action}"), InlineKeyboardButton("❌ 取消", callback_data="cancel")]])


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
        lines.append(f"月总额度：{r['quota_gb']:.2f} GiB")
        lines.append(f"使用率：{r['percent']:.1f}%")
        if r["percent"] >= r["alert_percent"]:
            lines.append(f"⚠️ 已达到 {r['alert_percent']:.0f}% 流量告警线")
        if r["percent"] >= 100:
            lines.append("🔴 已超过配置的月流量额度")
    else:
        lines.append("月总额度：未设置")
    if r["expiry"]:
        lines.append(f"到期时间：{r['expiry']}")
        if r["days_left"] is not None:
            if r["days_left"] < 0:
                lines.append("🔴 VPS 已到期")
            elif r["days_left"] <= 7:
                lines.append(f"⚠️ 剩余 {r['days_left']:.1f} 天")
            else:
                lines.append(f"剩余：{r['days_left']:.1f} 天")
    else:
        lines.append("到期时间：未设置")
    lines.append("\n说明：流量为 VPS 主网卡 RX+TX 本地统计，不等同于商家账单数据。")
    return "\n".join(lines)


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
    elif action == "vps":
        await q.edit_message_text(format_vps(), reply_markup=menu())
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
        await q.edit_message_text("请输入新的 HTTPS 机场订阅地址。\n\n收到后不会回显 URL，并会再次要求确认。", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ 取消", callback_data="cancel")]]))
    elif action == "uninstall":
        await q.edit_message_text("⚠️ 最后确认\n\n卸载需要在服务器本地执行安全确认。请在 SSH/控制台运行：\n\n  mihomo-full uninstall\n\n并输入 UNINSTALL。\n\nv2ray-agent 不会被此操作删除。", reply_markup=menu())


async def text(update, context):
    if not allowed(update): return
    s = (update.message.text or "").strip()
    if context.user_data.get("awaiting_airport"):
        if not re.fullmatch(r"https://[^\s\"']+", s):
            await update.message.reply_text("❌ 只接受有效 HTTPS 订阅地址。", reply_markup=menu()); return
        context.user_data["awaiting_airport"] = False
        context.user_data["pending_url"] = s
        await update.message.reply_text("⚠️ 已收到新的订阅地址（不会显示具体 URL）。\n\n确认替换并重新生成？", reply_markup=confirm_menu("airport_url"))
        return
    action = context.user_data.pop("rule_action", None)
    if not action: return
    try:
        if action == "rule_add":
            parts = [x.strip() for x in s.split("|", 3)]
            if len(parts) != 4: raise ValueError("格式：名称 | HTTPS MRS URL | domain/ipcidr | 策略组")
            args = ["--rule-add", *parts]
        else:
            if not re.fullmatch(r"[A-Za-z0-9_-]+", s): raise ValueError("规则集名称不合法")
            args = ["--rule-disable" if action == "rule_disable" else "--rule-restore", s]
    except ValueError as e:
        await update.message.reply_text("❌ " + str(e), reply_markup=rules_menu()); return
    context.user_data["pending_rule"] = action
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
    action = context.user_data.pop("pending_rule", None)
    args = context.user_data.pop("pending_rule_args", None)
    if not action or not args:
        await q.edit_message_text("操作已过期，请重新选择。", reply_markup=menu()); return
    code, out = run_manage(args)
    await q.edit_message_text(("✅ " if code == 0 else "❌ ") + out, reply_markup=menu())


async def rule_flow(update, context):
    q = update.callback_query
    if not allowed(update): await q.answer("无权限", show_alert=True); return
    await q.answer()
    action = q.data
    context.user_data["rule_action"] = action
    prompts = {"rule_add": "请发送：名称 | HTTPS MRS URL | domain/ipcidr | 策略组", "rule_disable": "请输入要禁用的规则集名称。核心安全规则不可禁用。", "rule_restore": "请输入要恢复默认的规则集名称。"}
    await q.edit_message_text(prompts[action], reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ 取消", callback_data="cancel")]]))


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
app.add_handler(CallbackQueryHandler(confirm_mutation, pattern="^confirm_rule$"))
app.add_handler(CallbackQueryHandler(cancel, pattern="^cancel$"))
app.add_handler(CallbackQueryHandler(rule_flow, pattern="^rule_(add|disable|restore)$"))
app.add_handler(CallbackQueryHandler(home, pattern="^home$"))
app.add_handler(CallbackQueryHandler(button))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text))
app.run_polling(allowed_updates=Update.ALL_TYPES)
