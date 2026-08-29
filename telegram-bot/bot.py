#!/usr/bin/env python3
"""Telegram UI for Mihomo-Full.

This is a thin remote UI over manage.sh. It does not maintain an independent
configuration engine and never exposes arbitrary shell execution.
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
        [InlineKeyboardButton("📦 规则集管理", callback_data="rules")],
        [InlineKeyboardButton("🧪 配置完整性检查", callback_data="check")],
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
    """Fixed action dispatch; user text is passed as an argv item, never shell code."""
    p = subprocess.run(["bash", str(MANAGE), *args], cwd=BASE, text=True,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout, check=False)
    out = re.sub(r'https://[^\s\"\']+', '[已隐藏 URL]', p.stdout or "")
    return p.returncode, out[-3500:]


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


async def confirm(update, context):
    q = update.callback_query
    if not allowed(update): await q.answer("无权限", show_alert=True); return
    await q.answer()
    _, action = q.data.split(":", 1)
    pending = context.user_data.get("pending")
    if pending != action:
        await q.edit_message_text("操作已过期，请重新选择。", reply_markup=menu()); return
    context.user_data.pop("pending", None)
    if action == "generate":
        # generate.sh performs the final generated-config audit itself.
        # Do not block regeneration because an older output file is stale/broken.
        code, out = run_manage(["--generate"])
        await q.edit_message_text(("✅ " if code == 0 else "❌ ") + out, reply_markup=menu())
    elif action == "airport":
        context.user_data["awaiting_airport"] = True
        await q.edit_message_text("请输入新的 HTTPS 机场订阅地址。\n\n收到后不会回显 URL，并会再次要求确认。", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ 取消", callback_data="cancel")]]))


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
app.add_handler(CallbackQueryHandler(confirm, pattern="^confirm:(airport|generate)$"))
app.add_handler(CallbackQueryHandler(confirm_mutation, pattern="^confirm_rule$"))
app.add_handler(CallbackQueryHandler(cancel, pattern="^cancel$"))
app.add_handler(CallbackQueryHandler(rule_flow, pattern="^rule_(add|disable|restore)$"))
app.add_handler(CallbackQueryHandler(home, pattern="^home$"))
app.add_handler(CallbackQueryHandler(button))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text))
app.run_polling(allowed_updates=Update.ALL_TYPES)
