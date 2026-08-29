#!/usr/bin/env python3
"""Mihomo-Full Telegram management bot.

Security model:
- Telegram user ID allow-list is mandatory.
- No arbitrary shell execution.
- Every mutating operation requires an explicit callback confirmation.
- Secrets are never echoed back to Telegram.
- All actual configuration work is delegated to the existing manage.sh/generate.sh.
"""
import os
import re
import subprocess
import time
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters

BASE = Path(os.environ.get("MIHOMO_FULL_DIR", "/opt/mihomo-full")).resolve()
MANAGE = BASE / "manage.sh"
GENERATE = BASE / "generate.sh"
SETTINGS = BASE / "settings.conf"
RULES = BASE / "rulesets.local.conf"
TOKEN = os.environ.get("TG_BOT_TOKEN", "")
ADMIN_IDS = {int(x.strip()) for x in os.environ.get("TG_ADMIN_IDS", "").split(",") if x.strip().isdigit()}

if not TOKEN or not ADMIN_IDS:
    raise SystemExit("TG_BOT_TOKEN and TG_ADMIN_IDS are required")


def allowed(update: Update) -> bool:
    user = update.effective_user
    return bool(user and user.id in ADMIN_IDS)


def menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🔄 更换机场订阅", callback_data="airport")],
        [InlineKeyboardButton("🚀 更新落地节点", callback_data="generate"), InlineKeyboardButton("📊 当前状态", callback_data="status")],
        [InlineKeyboardButton("📦 规则集管理", callback_data="rules")],
        [InlineKeyboardButton("🔗 链式状态检查", callback_data="chain")],
        [InlineKeyboardButton("🧪 配置完整性检查", callback_data="check")],
    ])


def run_allowed(action: str) -> tuple[int, str]:
    if action == "generate":
        cmd = ["bash", str(GENERATE)]
    elif action == "check":
        # Read-only syntax/structure checks; do not expose the full config.
        cmd = ["bash", "-c", f"test -s {str(SETTINGS)!r} && test -s {str(BASE / 'template.yaml')!r} && test -s {str(GENERATE)!r} && bash -n {str(GENERATE)!r} && bash -n {str(MANAGE)!r}"]
    elif action == "status":
        cmd = ["bash", str(MANAGE), "status"]
    else:
        return 2, "不允许的操作"
    p = subprocess.run(cmd, cwd=BASE, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120, check=False)
    # Never return credentials/subscription URLs to Telegram.
    output = re.sub(r'https://[^\s\"\']+', '[已隐藏 URL]', p.stdout or "")
    return p.returncode, output[-3500:]


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not allowed(update):
        return
    context.user_data.pop("pending", None)
    await update.message.reply_text("🤖 Mihomo-Full 管理入口\n\n请选择操作：", reply_markup=menu())


async def button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    if not allowed(update):
        await q.answer("无权限", show_alert=True)
        return
    await q.answer()
    action = q.data
    if action in {"airport", "generate"}:
        context.user_data["pending"] = action
        title = "更换机场订阅" if action == "airport" else "更新 VPS 落地节点"
        text = f"⚠️ {title}\n\n此操作会修改/重新生成配置。确认继续？"
        kb = InlineKeyboardMarkup([[InlineKeyboardButton("✅ 确认", callback_data="confirm"), InlineKeyboardButton("❌ 取消", callback_data="cancel")]])
        await q.edit_message_text(text, reply_markup=kb)
        return
    if action == "rules":
        await q.edit_message_text("📦 规则集管理\n\n为避免 Telegram 输入变成任意配置执行器，规则集增删替换仍通过本地规则管理器完成。这里提供只读状态和入口；后续可增加严格字段表单。", reply_markup=menu())
        return
    if action == "chain":
        await q.edit_message_text("🔗 链式状态\n\n当前版本执行只读完整性检查，不模拟第三方机场/VPS链路测速，避免把单点探测误报成完整链式可用性。", reply_markup=menu())
        return
    if action in {"status", "check"}:
        code, out = run_allowed(action)
        await q.edit_message_text(("✅ " if code == 0 else "❌ ") + out, reply_markup=menu())


async def confirm(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    if not allowed(update):
        await q.answer("无权限", show_alert=True)
        return
    await q.answer()
    action = context.user_data.pop("pending", None)
    if action == "generate":
        code, out = run_allowed("generate")
        await q.edit_message_text(("✅ " if code == 0 else "❌ ") + out, reply_markup=menu())
    elif action == "airport":
        context.user_data["awaiting_airport"] = True
        await q.edit_message_text("请输入新的 HTTPS 机场订阅地址。\n\n仅接受 HTTPS；收到后会再次确认，机器人不会把 URL 回显到消息中。", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ 取消", callback_data="cancel")]]))
    else:
        await q.edit_message_text("操作已取消。", reply_markup=menu())


async def text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not allowed(update) or not context.user_data.get("awaiting_airport"):
        return
    url = (update.message.text or "").strip()
    if not re.fullmatch(r"https://[^\s\"']+", url):
        await update.message.reply_text("❌ 请输入有效 HTTPS 订阅地址。")
        return
    context.user_data["awaiting_airport"] = False
    context.user_data["pending_url"] = url
    await update.message.reply_text("⚠️ 已收到新的订阅地址（不会显示具体 URL）。\n\n确认替换并重新生成？", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("✅ 确认替换", callback_data="confirm_airport"), InlineKeyboardButton("❌ 取消", callback_data="cancel")]]))


async def confirm_airport(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    if not allowed(update):
        await q.answer("无权限", show_alert=True)
        return
    await q.answer()
    url = context.user_data.pop("pending_url", None)
    if not url:
        await q.edit_message_text("订阅地址已过期，请重新操作。", reply_markup=menu())
        return
    # Update settings without exposing the URL to shell parsing or Telegram.
    lines = SETTINGS.read_text().splitlines() if SETTINGS.exists() else []
    replaced = False
    new_lines = []
    for line in lines:
        if line.startswith("AIRPORT_SUB_URL="):
            new_lines.append("AIRPORT_SUB_URL=" + repr(url))
            replaced = True
        else:
            new_lines.append(line)
    if not replaced:
        new_lines.append("AIRPORT_SUB_URL=" + repr(url))
    tmp = SETTINGS.with_suffix(".tmp")
    tmp.write_text("\n".join(new_lines) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, SETTINGS)
    code, out = run_allowed("generate")
    await q.edit_message_text(("✅ 机场更换完成\n" if code == 0 else "❌ 更换失败\n") + out, reply_markup=menu())


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    if not allowed(update):
        await q.answer("无权限", show_alert=True)
        return
    await q.answer()
    context.user_data.clear()
    await q.edit_message_text("已取消。", reply_markup=menu())


app = Application.builder().token(TOKEN).build()
app.add_handler(CommandHandler("start", start))
app.add_handler(CallbackQueryHandler(confirm_airport, pattern="^confirm_airport$"))
app.add_handler(CallbackQueryHandler(confirm, pattern="^confirm$"))
app.add_handler(CallbackQueryHandler(cancel, pattern="^cancel$"))
app.add_handler(CallbackQueryHandler(button))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text))
app.run_polling(allowed_updates=Update.ALL_TYPES)
