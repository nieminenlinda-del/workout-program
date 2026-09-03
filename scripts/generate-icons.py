#!/usr/bin/env python3
"""Generate PWA PNG icons from a simple barbell mark."""
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    import subprocess
    import sys

    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image, ImageDraw


OUT = Path(__file__).resolve().parent.parent / "public"


def paint(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (12, 13, 16, 255))
    d = ImageDraw.Draw(img)
    s = size / 64
    def r(x, y, w, h, fill):
        d.rounded_rectangle([x * s, y * s, (x + w) * s, (y + h) * s], radius=max(2, int(2 * s)), fill=fill)

    r(10, 29, 44, 6, (232, 160, 74, 255))
    r(6, 22, 8, 20, (244, 240, 230, 255))
    r(12, 18, 6, 28, (196, 92, 38, 255))
    r(50, 22, 8, 20, (244, 240, 230, 255))
    r(46, 18, 6, 28, (196, 92, 38, 255))
    return img


def main() -> None:
    OUT.mkdir(exist_ok=True)
    paint(192).save(OUT / "pwa-192.png")
    paint(512).save(OUT / "pwa-512.png")
    paint(180).save(OUT / "apple-touch-icon.png")


if __name__ == "__main__":
    main()
