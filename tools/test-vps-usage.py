#!/usr/bin/env python3
"""Deterministic regression tests for VPS traffic accounting state transitions."""
from __future__ import annotations

import importlib.util
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "telegram-bot" / "vps_usage.py"
spec = importlib.util.spec_from_file_location("vps_usage", MODULE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

with tempfile.TemporaryDirectory() as td:
    mod.STATE = Path(td) / "vps-usage.json"
    mod._iface = lambda: "eth0"
    counters = iter([1000, 1300, 200, 500])
    mod._counters = lambda iface: next(counters)

    first = mod.snapshot()
    assert first["total_bytes"] == 0
    second = mod.snapshot()
    assert second["total_bytes"] == 300
    third = mod.snapshot()
    assert third["total_bytes"] == 500, third
    fourth = mod.snapshot()
    assert fourth["total_bytes"] == 800, fourth

with tempfile.TemporaryDirectory() as td:
    mod.STATE = Path(td) / "vps-usage.json"
    interfaces = iter(["eth0", "eth0", "ens3"])
    counters = iter([1000, 1500, 900000])
    mod._iface = lambda: next(interfaces)
    mod._counters = lambda iface: next(counters)

    mod.snapshot()
    second = mod.snapshot()
    third = mod.snapshot()
    assert second["total_bytes"] == 500
    assert third["total_bytes"] == 500, third
    assert third["interface"] == "ens3"

print("[PASS] VPS traffic state: baseline, normal delta, counter reset, and interface change")
