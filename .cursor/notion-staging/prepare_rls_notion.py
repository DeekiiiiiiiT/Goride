# -*- coding: utf-8 -*-
"""Split docs/rls-audit.md into Notion part pages with sync header.

Emoji section headers are rewritten to ASCII labels so Notion create is reliable.
Split matches prior staging: after first rides_fare_rules ALTER line.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "rls-audit.md"
OUT_DIR = Path(__file__).resolve().parent
HEADER = "*Synced from docs/rls-audit.md on 2026-07-18.*\n\n"

EMOJI_HEADERS = [
    ("### \U0001F6A8 Critical", "### CRITICAL"),
    ("### \u26A0\uFE0F High priority", "### HIGH PRIORITY"),
    ("### \u26A0 High priority", "### HIGH PRIORITY"),
    ("### \U0001F9F9 Cleanup & performance", "### CLEANUP & performance"),
    ("### \u2705 What's actually solid", "### SOLID — What's actually solid"),
]


def main() -> None:
    text = SRC.read_text(encoding="utf-8")
    for old, new in EMOJI_HEADERS:
        text = text.replace(old, new)

    marker = "ALTER VIEW public.rides_fare_rules SET (security_invoker = true);"
    idx = text.find(marker)
    if idx < 0:
        raise SystemExit("split marker not found")
    end_part1 = idx + len(marker)
    part1 = text[:end_part1].rstrip() + "\n"
    part2 = text[end_part1:].lstrip("\n")

    p1 = OUT_DIR / "rls-audit-part1-notion.md"
    p2 = OUT_DIR / "rls-audit-part2-notion.md"
    p1.write_text(HEADER + part1, encoding="utf-8")
    p2.write_text(HEADER + part2, encoding="utf-8")
    print(f"part1 chars={len(HEADER+part1)} lines={part1.count(chr(10))+1}")
    print(f"part2 chars={len(HEADER+part2)} lines={part2.count(chr(10))+1}")
    # sanity: no mojibake markers
    for label, content in (("p1", HEADER + part1), ("p2", HEADER + part2)):
        bad = any(s in content for s in ("â€", "ðŸ", "âš", "âœ"))
        print(f"{label} mojibake={bad}")


if __name__ == "__main__":
    main()
