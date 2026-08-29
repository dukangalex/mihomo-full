#!/usr/bin/env python3
"""Small persistent VPS traffic/expiry tracker for Mihomo-Full Telegram UI.

Traffic is measured on the primary default-route interface as RX+TX bytes.
This is VPS interface accounting, not a provider billing API.
"""
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

STATE = Path(os.environ.get("MIHOMO_FULL_DIR", "/opt/mihomo-full")) / "telegram-bot" / "vps-usage.json"


def _now():
    return datetime.now(timezone.utc)


def _period():
    return _now().strftime("%Y-%m")


def _iface():
    explicit = os.environ.get("VPS_TRAFFIC_INTERFACE", "").strip()
    if explicit:
        return explicit
    try:
        out = subprocess.check_output(["ip", "-4", "route", "get", "1.1.1.1"], text=True, timeout=3)
        parts = out.split()
        if "dev" in parts:
            return parts[parts.index("dev") + 1]
    except Exception:
        pass
    return None


def _counters(iface):
    if not iface:
        return None
    p = Path("/sys/class/net") / iface / "statistics"
    try:
        return int((p / "rx_bytes").read_text().strip()) + int((p / "tx_bytes").read_text().strip())
    except (OSError, ValueError):
        return None


def _load():
    try:
        return json.loads(STATE.read_text())
    except (OSError, ValueError):
        return {}


def _save(data):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    os.chmod(tmp, 0o600)
    tmp.replace(STATE)


def snapshot():
    now = _now()
    period = now.strftime("%Y-%m")
    iface = _iface()
    current = _counters(iface)
    data = _load()
    if data.get("period") != period:
        data = {"period": period, "total_bytes": 0, "last_counter": None, "interface": iface}
    last = data.get("last_counter")
    if current is not None:
        if isinstance(last, int) and current >= last:
            data["total_bytes"] = int(data.get("total_bytes", 0)) + current - last
        elif isinstance(last, int) and current < last:
            # Counter reset/reboot: retain accumulated usage and start a new baseline.
            data["total_bytes"] = int(data.get("total_bytes", 0)) + current
        data["last_counter"] = current
        data["interface"] = iface
    data["updated_at"] = now.isoformat()
    _save(data)
    return data


def report():
    data = snapshot()
    quota_gb = float(os.environ.get("VPS_MONTHLY_GB", "0") or 0)
    alert = float(os.environ.get("VPS_TRAFFIC_ALERT_PERCENT", "80") or 80)
    used = int(data.get("total_bytes", 0))
    quota_bytes = int(quota_gb * 1024**3) if quota_gb > 0 else 0
    pct = (used / quota_bytes * 100) if quota_bytes else None
    expiry = os.environ.get("VPS_EXPIRES_AT", "").strip()
    days = None
    if expiry:
        try:
            exp = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            days = (exp - _now()).total_seconds() / 86400
        except ValueError:
            days = None
    return {"period": data.get("period"), "interface": data.get("interface"), "used_bytes": used,
            "quota_gb": quota_gb, "percent": pct, "alert_percent": alert,
            "expiry": expiry, "days_left": days}
