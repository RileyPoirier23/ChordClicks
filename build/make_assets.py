"""Generates the brand assets: icon.png/.ico, installer sidebar + header bitmaps. Run: python3 build/make_assets.py"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
OUT = os.path.dirname(os.path.abspath(__file__))
FONT_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
A, B = (139, 92, 246), (236, 72, 153)

def lerp(c1, c2, t): return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
def gradient(w, h, c1, c2, diag=True):
    g = Image.new('RGB', (w, h)); px = g.load()
    for y in range(h):
        for x in range(w):
            t = (x / w + y / h) / 2 if diag else y / h
            px[x, y] = lerp(c1, c2, t)
    return g

def logo(size):
    """Guitar-pick badge with a lightning bolt, drawn at 4x then downsampled."""
    S = size * 4; sc = S / 64
    pick = Image.new('L', (S, S), 0); d = ImageDraw.Draw(pick)
    # pick outline (polygon sampled from a bezier-ish shape)
    pts = []
    import math
    for i in range(361):
        a = math.radians(i); x = 32 + 27 * math.sin(a) * (1 - 0.12 * math.cos(a)) ** 1.0
        # teardrop: wide top, pointed bottom
        y = 32 - 29 * math.cos(a) * (1.0 if math.cos(a) > 0 else 1.0)
        k = (1 - math.cos(a)) / 2  # 0 top .. 1 bottom
        w = 27 * (1 - 0.78 * k ** 2.2)
        pts.append((32 + w * math.sin(a), 32 - 29 * math.cos(a) * (1.02)))
    d.polygon([(x * sc, y * sc) for x, y in pts], fill=255)
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0)); img.paste(gradient(S, S, A, B), (0, 0), pick)
    bolt = ImageDraw.Draw(img)
    bolt.polygon([(x * sc, y * sc) for x, y in [(36, 11), (19, 36), (29.5, 36), (26, 53), (45, 27), (34, 27), (39, 11)]], fill=(255, 255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)

def squircle_icon(size):
    S = size; bg = Image.new('RGBA', (S, S), (0, 0, 0, 0)); m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * .22), fill=255)
    base = gradient(S, S, (20, 20, 36), (10, 10, 18), diag=True); bg.paste(base, (0, 0), m)
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(glow).ellipse([S * .1, S * .1, S * .9, S * .9], fill=A + (110,))
    bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(S * .12)))
    lg = logo(int(S * .68)); bg.alpha_composite(lg, ((S - lg.width) // 2, int(S * .17)))
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0)); out.paste(bg, (0, 0), m); return out

icon = squircle_icon(1024)
icon.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon.png'))
icon.save(os.path.join(OUT, 'icon.ico'), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)])

def text_center(d, xy, s, font, fill):
    w = d.textlength(s, font=font); d.text((xy[0] - w / 2, xy[1]), s, font=font, fill=fill)

def sidebar(name, tag):
    W, H = 164, 314; S = 3
    img = gradient(W * S, H * S, (22, 16, 44), (9, 8, 18), diag=False).convert('RGBA')
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
    gd.ellipse([-60 * S, -40 * S, 140 * S, 140 * S], fill=A + (120,)); gd.ellipse([40 * S, 200 * S, 240 * S, 400 * S], fill=B + (90,))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(40 * S)))
    lg = logo(84 * S); img.alpha_composite(lg, ((W * S - lg.width) // 2, 42 * S))
    d = ImageDraw.Draw(img); f1 = ImageFont.truetype(FONT_B, 17 * S); f2 = ImageFont.truetype(FONT_B, 10 * S)
    text_center(d, (W * S / 2, 150 * S), 'CHORDCLICKS', f1, (255, 255, 255)); text_center(d, (W * S / 2, 172 * S), 'GUITAR PRACTICE', ImageFont.truetype(FONT_B, 12 * S), (200, 190, 255))
    d.rounded_rectangle([50 * S, 198 * S, 114 * S, 200 * S], radius=S, fill=B)
    text_center(d, (W * S / 2, 280 * S), tag, f2, (140, 138, 170))
    img.convert('RGB').resize((W, H), Image.LANCZOS).save(os.path.join(OUT, name), format='BMP')

sidebar('installerSidebar.bmp', 'chords · scales · solos'); sidebar('uninstallerSidebar.bmp', 'thanks for playing')

# header image (150x57) shown on the inner wizard pages
W, H, S = 150, 57, 4
h = gradient(W * S, H * S, (22, 16, 44), (60, 24, 84)).convert('RGBA'); lg = logo(34 * S); h.alpha_composite(lg, ((W - 40) * S, 11 * S))
d = ImageDraw.Draw(h); d.text((10 * S, 14 * S), 'CHORDCLICKS', font=ImageFont.truetype(FONT_B, 11 * S), fill=(255, 255, 255)); d.text((10 * S, 31 * S), 'GUITAR PRACTICE', font=ImageFont.truetype(FONT_B, 8 * S), fill=(210, 200, 255))
h.convert('RGB').resize((W, H), Image.LANCZOS).save(os.path.join(OUT, 'installerHeader.bmp'), format='BMP')
print('assets written to', OUT)
