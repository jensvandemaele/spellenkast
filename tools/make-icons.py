# Maakt de app-iconen (PNG) en een SVG-versie. Gebruik: python3 tools/make-icons.py
from PIL import Image, ImageDraw
import os
out = os.path.join(os.path.dirname(__file__), '..', 'app', 'icons')
BG = (47, 111, 104); C = [(244, 241, 234), (237, 189, 143), (220, 189, 98), (138, 166, 216)]

def draw(size, pad_frac, rounded):
    s = 4  # supersampling
    S = size * s
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * .22), fill=BG)
    else:
        d.rectangle([0, 0, S, S], fill=BG)
    pad = S * pad_frac; gap = S * .05
    cell = (S - 2 * pad - gap) / 2
    for i in range(4):
        x = pad + (i % 2) * (cell + gap); y = pad + (i // 2) * (cell + gap)
        d.rounded_rectangle([x, y, x + cell, y + cell], radius=int(cell * .2), fill=C[i])
    return img.resize((size, size), Image.LANCZOS)

draw(192, .2, True).save(f'{out}/icon-192.png')
draw(512, .2, True).save(f'{out}/icon-512.png')
draw(512, .28, False).save(f'{out}/icon-maskable-512.png')
draw(180, .2, False).convert('RGB').save(f'{out}/apple-touch-icon.png')
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#2f6f68"/>
<rect x="20" y="20" width="27.5" height="27.5" rx="5.5" fill="#f4f1ea"/><rect x="52.5" y="20" width="27.5" height="27.5" rx="5.5" fill="#edbd8f"/>
<rect x="20" y="52.5" width="27.5" height="27.5" rx="5.5" fill="#dcbd62"/><rect x="52.5" y="52.5" width="27.5" height="27.5" rx="5.5" fill="#8aa6d8"/></svg>'''
open(f'{out}/icon.svg', 'w').write(svg)
print('iconen gemaakt')
