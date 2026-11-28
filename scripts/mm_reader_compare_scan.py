"""Draw the scanned (picture) page used by scripts/mm-reader-compare.ts.

One Japanese maintenance table on an off-white page, with a little rotation, blur and noise so it looks like a
real scan rather than vector text. Output: a PNG the compare script embeds in page 5 of the 8-page test manual.

Run by the Deno script (python + Pillow); not used by any app code.
"""
from __future__ import annotations

import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1654, 2339  # A4 at 200 dpi
INK = (28, 30, 34)
GRID = (70, 74, 80)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msgothic.ttc",
    r"C:\Windows\Fonts\YuGothM.ttc",
    r"C:\Windows\Fonts\meiryo.ttc",
    r"C:\Windows\Fonts\arial.ttf",
]

ROWS = [
    ("エンジンオイル", "10,000", "12"),
    ("オイルフィルター", "10,000", "12"),
    ("スパークプラグ", "100,000", "60"),
    ("ブレーキフルード", "40,000", "24"),
    ("クーラント", "50,000", "48"),
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    raise SystemExit("no usable font found")


def main(out_path: str) -> None:
    page = Image.new("RGB", (W, H), (250, 249, 245))
    draw = ImageDraw.Draw(page)

    title_font = font(46)
    body_font = font(34)
    head_font = font(32)

    draw.text((190, 210), "定期交換部品一覧", font=title_font, fill=INK)
    draw.text((190, 285), "（メンテナンス表）", font=body_font, fill=INK)

    left, top, right = 170, 470, 1480
    col2, col3 = 1040, 1270
    row_h = 112
    bottom = top + row_h * (len(ROWS) + 1)

    # The table grid.
    for x in (left, col2, col3, right):
        draw.line([(x, top), (x, bottom)], fill=GRID, width=3)
    for i in range(len(ROWS) + 2):
        y = top + row_h * i
        draw.line([(left, y), (right, y)], fill=GRID, width=3)

    draw.text((left + 24, top + 30), "点検項目", font=head_font, fill=INK)
    draw.text((col2 + 24, top + 30), "距離 (km)", font=head_font, fill=INK)
    draw.text((col3 + 24, top + 30), "期間 (月)", font=head_font, fill=INK)

    for i, (part, km, months) in enumerate(ROWS, start=1):
        y = top + row_h * i + 32
        draw.text((left + 24, y), part, font=body_font, fill=INK)
        draw.text((col2 + 24, y), km, font=body_font, fill=INK)
        draw.text((col3 + 24, y), months, font=body_font, fill=INK)

    draw.text((190, bottom + 60), "※ 走行距離または期間のいずれか早い方で交換", font=body_font, fill=INK)

    # Look like a scan: a small tilt, a soft blur, a little grain.
    page = page.rotate(-0.35, resample=Image.BICUBIC, fillcolor=(250, 249, 245), expand=False)
    page = page.filter(ImageFilter.GaussianBlur(0.6))
    pixels = page.load()
    rng = random.Random(7)
    for _ in range(45000):
        x = rng.randrange(W)
        y = rng.randrange(H)
        r, g, b = pixels[x, y]
        d = rng.randint(-18, 18)
        pixels[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d)))

    page.save(out_path, "PNG")


if __name__ == "__main__":
    main(sys.argv[1])
