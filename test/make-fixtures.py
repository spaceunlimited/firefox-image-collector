"""Generates fixture images for manual testing into test/fixtures/img/.

Run: python3 test/make-fixtures.py [--huge]
--huge also writes the large images used for the size-limit tests (git-ignored).
"""
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent / "fixtures" / "img"
OUT.mkdir(parents=True, exist_ok=True)

try:
    FONT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 48)
except OSError:
    FONT = ImageFont.load_default()


def card(label, size=(640, 400), color=(59, 130, 246), alpha=False):
    mode = "RGBA" if alpha else "RGB"
    bg = (*color, 255) if alpha else color
    img = Image.new(mode, size, (0, 0, 0, 0) if alpha else bg)
    d = ImageDraw.Draw(img)
    if alpha:
        d.ellipse([20, 20, size[0] - 20, size[1] - 20], fill=bg)
    d.text((size[0] // 2, size[1] // 2), f"{label}\n{size[0]}×{size[1]}", fill="white", font=FONT, anchor="mm", align="center")
    return img


def save_webp(img, path):
    try:
        img.save(path, "WEBP", quality=85)
    except (KeyError, OSError):
        tmp = path.with_suffix(".tmp.png")
        img.save(tmp)
        subprocess.run(["cwebp", "-quiet", str(tmp), "-o", str(path)], check=True)
        tmp.unlink()


def save_avif(img, path):
    try:
        img.save(path, "AVIF", quality=70)
    except (KeyError, OSError):
        tmp = path.with_suffix(".tmp.png")
        img.save(tmp)
        subprocess.run(["avifenc", "-q", "70", str(tmp), str(path)], check=True, capture_output=True)
        tmp.unlink()


card("PNG", alpha=True).save(OUT / "photo.png")
shutil.copy(OUT / "photo.png", OUT / "photo-mirror.png")  # same bytes, different URL
card("JPEG", color=(234, 88, 12)).save(OUT / "photo.jpg", quality=88)
save_webp(card("WebP", color=(22, 163, 74)), OUT / "photo.webp")
save_avif(card("AVIF", color=(147, 51, 234)), OUT / "photo.avif")
card("BMP", size=(320, 200), color=(100, 116, 139)).save(OUT / "photo.bmp")

frames = [card(f"GIF {i + 1}/3", size=(320, 200), color=c) for i, c in enumerate([(220, 38, 38), (202, 138, 4), (37, 99, 235)])]
frames[0].save(OUT / "animated.gif", save_all=True, append_images=frames[1:], duration=500, loop=0)

for w in (320, 640, 1280):
    card(f"srcset {w}w", size=(w, w * 5 // 8), color=(13, 148, 136)).save(OUT / f"responsive-{w}.jpg", quality=85)
save_avif(card("picture AVIF", color=(147, 51, 234)), OUT / "picture.avif")
save_webp(card("picture WebP", color=(22, 163, 74)), OUT / "picture.webp")
card("picture JPEG", color=(234, 88, 12)).save(OUT / "picture.jpg", quality=85)
card("Lazy real image", color=(190, 24, 93)).save(OUT / "lazy-real.jpg", quality=85)
card("Cross-origin", color=(71, 85, 105)).save(OUT / "cross-origin.jpg", quality=85)
card("In iframe", size=(400, 250), color=(8, 145, 178)).save(OUT / "frame.png")

(OUT / "sized.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">'
    '<rect width="300" height="200" rx="16" fill="#f59e0b"/>'
    '<text x="150" y="110" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#fff">SVG 300×200</text></svg>'
)
(OUT / "unsized.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">'
    '<rect width="160" height="90" rx="8" fill="#0ea5e9"/>'
    '<text x="80" y="52" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#fff">SVG viewBox only</text></svg>'
)
(OUT / "broken.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"not really a png" * 4)

if "--huge" in sys.argv:
    Image.new("RGB", (9000, 9000), (30, 64, 175)).save(OUT / "huge.png", optimize=False)
    save_webp(Image.new("RGB", (8000, 6000), (21, 128, 61)), OUT / "huge.webp")

print("Wrote", len(list(OUT.iterdir())), "files to", OUT)
