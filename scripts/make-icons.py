#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成站点图标与社交分享图。

产出（全部提交进仓库，CI 不运行本脚本）：
  assets/favicon.svg          矢量图标（圆角+食字，走系统字体）
  assets/favicon.ico          16/32/48 多尺寸位图图标（标签页用，圆角透明）
  assets/apple-touch-icon.png 180×180，不透明白底方块（iOS 自己裁圆角）
  assets/icon-192.png         PWA 图标（满幅不透明，maskable 安全）
  assets/icon-512.png         PWA 图标
  assets/og.png               1200×630 社交分享预览图

用法：
  python3 scripts/make-icons.py
依赖：
  Pillow（python3 -m pip install pillow）
  macOS 中文字体（PingFang SC / Hiragino Sans GB），缺失时回退系统字体
"""

import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("需要 Pillow：python3 -m pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

BRAND = (47, 111, 79)          # #2f6f4f 品牌绿
BRAND_DARK = (34, 84, 60)      # 渐变收尾
WHITE = (255, 255, 255)

GLYPH = "食"
TITLE = "毕业生食谱"
VISION = "认真做饭，认真生活"
SUB = "把家常面食一样一样做明白"

# 中文字体候选：(路径, ttc 索引, 用途)
FONT_CANDIDATES = [
    ("/System/Library/Fonts/PingFang.ttc", 8),          # PingFang SC Semibold
    ("/System/Library/Fonts/PingFang.ttc", 5),          # PingFang SC Medium
    ("/System/Library/Fonts/PingFang.ttc", 2),          # PingFang SC Regular
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 2),  # Hiragino Sans GB W6
    ("/System/Library/Fonts/STHeiti Medium.ttc", 1),    # Heiti SC Medium
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 0),
    ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", 0),
]

LANCZOS = Image.Resampling.LANCZOS


def pick_font(size, candidates=None):
    """按候选顺序挑一个能用的中文字体。"""
    for path, index in (candidates or FONT_CANDIDATES):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=index)
            except Exception:
                continue
    print("！未找到中文字体，回退默认字体（中文可能显示为方块）", file=sys.stderr)
    return ImageFont.load_default()


def paste_centered(draw, text, font, box, fill):
    """在 box=(x0,y0,x1,y1) 内按视觉包围盒居中绘制文字。"""
    x0, y0, x1, y1 = box
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    x = x0 + (x1 - x0 - (r - l)) / 2 - l
    y = y0 + (y1 - y0 - (b - t)) / 2 - t
    draw.text((x, y), text, font=font, fill=fill)


def render_mark(size, rounded=True, opaque=False, glyph_ratio=0.60, ss=1024):
    """画一个品牌方块：绿底 + 白「食」。

    rounded  False 时铺满整块（给 iOS / Android 遮罩用）
    opaque   True 时不保留圆角外透明像素
    """
    img = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded and not opaque:
        d.rounded_rectangle([0, 0, ss - 1, ss - 1], radius=int(ss * 0.22), fill=BRAND + (255,))
    else:
        d.rectangle([0, 0, ss, ss], fill=BRAND + (255,))

    font = pick_font(int(ss * glyph_ratio))
    paste_centered(d, GLYPH, font, (0, 0, ss, ss), WHITE + (255,))

    if size != ss:
        img = img.resize((size, size), LANCZOS)
    return img


FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="{title}">
  <rect width="100" height="100" rx="22" fill="#2f6f4f"/>
  <text x="50" y="50" dy=".36em" text-anchor="middle" font-size="58" font-weight="600"
        fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC',
        'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif">{glyph}</text>
</svg>
"""


def make_favicon_svg():
    path = os.path.join(ASSETS, "favicon.svg")
    with open(path, "w", encoding="utf-8") as f:
        f.write(FAVICON_SVG.format(title=TITLE, glyph=GLYPH))
    return path


def make_favicon_ico():
    """多尺寸 ICO。每个尺寸单独渲染再缩放，小尺寸更锐利。"""
    path = os.path.join(ASSETS, "favicon.ico")
    sizes = [16, 32, 48, 64]
    frames = [render_mark(s, rounded=True, ss=1024) for s in sizes]
    frames[-1].save(path, format="ICO", sizes=[(s, s) for s in sizes])
    return path


def make_apple_touch_icon():
    path = os.path.join(ASSETS, "apple-touch-icon.png")
    render_mark(180, rounded=False, opaque=True).convert("RGB").save(path, optimize=True)
    return path


def make_pwa_icons():
    out = []
    for s in (192, 512):
        p = os.path.join(ASSETS, "icon-%d.png" % s)
        render_mark(s, rounded=False, opaque=True, glyph_ratio=0.56).convert("RGB").save(p, optimize=True)
        out.append(p)
    return out


def make_og():
    """1200×630 社交分享图。"""
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BRAND)
    d = ImageDraw.Draw(img)

    # 竖向渐变，避免大面积纯色
    for y in range(H):
        k = y / (H - 1)
        d.line(
            [(0, y), (W, y)],
            fill=tuple(int(BRAND[i] + (BRAND_DARK[i] - BRAND[i]) * k) for i in range(3)),
        )

    # 左侧白色品牌方块
    mark_size, mx, my = 150, 90, 150
    mark = Image.new("RGBA", (mark_size, mark_size), (0, 0, 0, 0))
    md = ImageDraw.Draw(mark)
    md.rounded_rectangle([0, 0, mark_size - 1, mark_size - 1], radius=int(mark_size * 0.22), fill=WHITE + (255,))
    paste_centered(md, GLYPH, pick_font(int(mark_size * 0.62)), (0, 0, mark_size, mark_size), BRAND + (255,))
    img.paste(mark, (mx, my), mark)

    f_title = pick_font(78)
    f_vision = pick_font(36)
    f_sub = pick_font(28)

    d.text((mx + mark_size + 36, my + 6), TITLE, font=f_title, fill=WHITE)
    d.text((mx + mark_size + 40, my + 108), VISION, font=f_vision, fill=(226, 238, 231))

    d.text((W - 90, H - 96), SUB, font=f_sub, fill=(196, 219, 205), anchor="rs")

    # 顶部一条浅色装饰线
    d.rectangle([0, 0, W, 8], fill=(95, 191, 141))

    path = os.path.join(ASSETS, "og.png")
    img.save(path, optimize=True)
    return path


def main():
    os.makedirs(ASSETS, exist_ok=True)
    files = [make_favicon_svg(), make_favicon_ico(), make_apple_touch_icon()]
    files += make_pwa_icons()
    files.append(make_og())
    for f in files:
        print("生成 %-34s %7d B" % (os.path.relpath(f, ROOT), os.path.getsize(f)))


if __name__ == "__main__":
    main()
