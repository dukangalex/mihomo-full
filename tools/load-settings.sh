#!/usr/bin/env bash
# 安全加载 Mihomo Full settings.conf：只解析白名单 KEY=VALUE，不执行配置内容。
set -euo pipefail

SETTINGS_FILE="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/settings.conf}"
[[ -f "$SETTINGS_FILE" ]] || { echo "[✗] 找不到配置文件: $SETTINGS_FILE" >&2; return 1 2>/dev/null || exit 1; }

# 允许的运行时配置键。新增键必须同步审计与文档。
readonly ALLOWED_KEYS='AIRPORT_SUB_URL FIXED_FULL_CONFIG_PATH FIXED_EXIT_NODES_PATH DOMAIN V2RAY_AGENT_CLASHMETA_DIR OUTPUT_DIR'

_load_settings_python() {
  python3 - "$SETTINGS_FILE" <<'PY'
import re, shlex, sys
from pathlib import Path

p = Path(sys.argv[1])
allowed = set('AIRPORT_SUB_URL FIXED_FULL_CONFIG_PATH FIXED_EXIT_NODES_PATH DOMAIN V2RAY_AGENT_CLASHMETA_DIR OUTPUT_DIR'.split())
seen = set()

for lineno, raw in enumerate(p.read_text(encoding='utf-8').splitlines(), 1):
    line = raw.strip()
    if not line or line.startswith('#'):
        continue
    m = re.fullmatch(r'([A-Za-z_][A-Za-z0-9_]*)=(.*)', line)
    if not m:
        raise SystemExit(f'非法配置行 {lineno}')
    key, encoded = m.groups()
    if key not in allowed:
        raise SystemExit(f'未知配置项 {key}（第 {lineno} 行）')
    if key in seen:
        raise SystemExit(f'重复配置项 {key}（第 {lineno} 行）')
    seen.add(key)
    try:
        parts = shlex.split(encoded, posix=True)
    except ValueError as e:
        raise SystemExit(f'{key} 引号格式错误：{e}')
    if len(parts) != 1:
        raise SystemExit(f'{key} 必须是单个值')
    value = parts[0]
    if '\x00' in value or '\n' in value or '\r' in value:
        raise SystemExit(f'{key} 含非法控制字符')
    print(f'{key}\t{value}')
PY
}

command -v python3 >/dev/null 2>&1 || { echo '[✗] 需要 python3' >&2; return 1 2>/dev/null || exit 1; }

while IFS=$'\t' read -r key value; do
  case " $ALLOWED_KEYS " in *" $key "*) ;; *) echo "[✗] 未授权配置项: $key" >&2; return 1 2>/dev/null || exit 1;; esac
  printf -v "$key" '%s' "$value"
  export "$key"
done < <(_load_settings_python)

[[ -n "${AIRPORT_SUB_URL:-}" ]] || { echo '[✗] 缺少 AIRPORT_SUB_URL' >&2; return 1 2>/dev/null || exit 1; }
[[ -n "${FIXED_FULL_CONFIG_PATH:-}" ]] || { echo '[✗] 缺少 FIXED_FULL_CONFIG_PATH' >&2; return 1 2>/dev/null || exit 1; }
[[ -n "${FIXED_EXIT_NODES_PATH:-}" ]] || { echo '[✗] 缺少 FIXED_EXIT_NODES_PATH' >&2; return 1 2>/dev/null || exit 1; }
[[ -n "${DOMAIN:-}" ]] || { echo '[✗] 缺少 DOMAIN' >&2; return 1 2>/dev/null || exit 1; }
[[ -n "${V2RAY_AGENT_CLASHMETA_DIR:-}" ]] || { echo '[✗] 缺少 V2RAY_AGENT_CLASHMETA_DIR' >&2; return 1 2>/dev/null || exit 1; }
[[ -n "${OUTPUT_DIR:-}" ]] || { echo '[✗] 缺少 OUTPUT_DIR' >&2; return 1 2>/dev/null || exit 1; }
