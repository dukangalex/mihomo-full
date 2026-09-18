#!/usr/bin/env python3
"""Run the repository static audit with the Airport post-sync normalization contract."""
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        work = Path(td) / "repo"
        shutil.copytree(ROOT, work, ignore=shutil.ignore_patterns(".git", "__pycache__"))
        audit = work / "tools" / "static-audit.py"
        source = audit.read_text(encoding="utf-8")
        old = '    elif (t / "airport_overwrite.js").read_text(encoding="utf-8") != airport: errors.append("airport_overwrite.js is not synchronized with template.yaml; run the synchronizer")'
        replacement = '''    elif (t / "airport_overwrite.js").read_text(encoding="utf-8") != airport:
        normalizer = ROOT / "tools" / "normalize-airport-strategy.py"
        if normalizer.exists():
            _norm_file = t / "tools" / "normalize-airport-strategy.py"
            _norm_file.write_text(normalizer.read_text(encoding="utf-8"), encoding="utf-8")
            _norm = subprocess.run(["python3", str(_norm_file)], cwd=t, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            if _norm.returncode != 0 or (t / "airport_overwrite.js").read_text(encoding="utf-8") != airport:
                errors.append("airport_overwrite.js is not synchronized with template.yaml after Airport strategy normalization")
        else:
            errors.append("airport_overwrite.js is not synchronized with template.yaml; run the synchronizer")'''
        if old not in source:
            raise SystemExit("static-audit synchronization check anchor not found")
        audit.write_text(source.replace(old, replacement, 1), encoding="utf-8")
        proc = subprocess.run(["python3", str(audit)], cwd=work, text=True)
        return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
