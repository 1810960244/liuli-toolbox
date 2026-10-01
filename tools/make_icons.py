#!/usr/bin/env python3
# 生成百宝箱 App 图标（渐变底 + 白色"宝"字），供 PWA / 安卓 / iOS 使用
import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(BASE, '..', 'icons'))
os.makedirs(OUT, exist_ok=True)

C1 = (91, 140, 255)    # #5b8cff
C2 = (139, 92, 246)    # #8b5cf6

FONT_CANDIDATES = [
    '/usr/share/fonts/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc',
]

def load_font(size):
    for fp in FONT_CANDIDATES:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size, index=0)
            except Exception:
                continue
    return ImageFont.load_default()

def make(size):
    img = Image.new('RGB', (size, size), C1)
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        color = (int(C1[0] + (C2[0]-C1[0])*t), int(C1[1] + (C2[1]-C1[1])*t), int(C1[2] + (C2[2]-C1[2])*t))
        d.line([(0, y), (size, y)], fill=color)
    font = load_font(int(size * 0.56))
    text = '宝'
    bb = d.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (size - tw) / 2 - bb[0]
    y = (size - th) / 2 - bb[1] - size * 0.02
    d.text((x, y), text, font=font, fill=(255, 255, 255))
    img.save(os.path.join(OUT, 'icon-%d.png' % size), 'PNG')

for s in (512, 192, 180):
    make(s)
print('icons done ->', OUT)
