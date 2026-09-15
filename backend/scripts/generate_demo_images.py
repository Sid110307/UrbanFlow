import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "debris_images"
SIZE = (512, 512)


def _font(size):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def _base(bg_top, bg_bottom):
    img = Image.new("RGB", SIZE)
    top = Image.new("RGB", (1, SIZE[1]))
    for y in range(SIZE[1]):
        t = y / SIZE[1]
        color = tuple(int(bg_top[i] * (1 - t) + bg_bottom[i] * t) for i in range(3))
        top.putpixel((0, y), color)
    img = top.resize(SIZE)
    return img


def _caption(img, text):
    draw = ImageDraw.Draw(img)
    font = _font(28)
    draw.rectangle([(0, SIZE[1] - 54), (SIZE[0], SIZE[1])], fill=(0, 0, 0))
    draw.text((14, SIZE[1] - 44), text, fill=(255, 255, 255), font=font)


def make_plastic():
    img = _base((30, 90, 110), (10, 40, 60))
    draw = ImageDraw.Draw(img)
    random.seed(1)
    colors = [(230, 230, 230), (255, 80, 80), (250, 220, 60), (80, 170, 255)]
    for _ in range(14):
        x, y = random.randint(20, 460), random.randint(40, 400)
        w, h = random.randint(30, 70), random.randint(20, 45)
        color = random.choice(colors)
        draw.rounded_rectangle([x, y, x + w, y + h], radius=8, fill=color, outline=(0, 0, 0))
    img = img.filter(ImageFilter.SMOOTH)
    _caption(img, "Stormwater drain camera - plastic waste clogging grate")
    return img


def make_silt():
    img = _base((90, 65, 35), (60, 40, 20))
    draw = ImageDraw.Draw(img)
    random.seed(2)
    for _ in range(8):
        x, y = random.randint(0, 460), random.randint(150, 460)
        w = random.randint(80, 180)
        draw.ellipse([x, y, x + w, y + w * 0.4], fill=(70, 50, 25))
    img = img.filter(ImageFilter.GaussianBlur(3))
    _caption(img, "Stormwater drain camera - silt/sediment buildup, stagnant flow")
    return img


def make_construction():
    img = _base((110, 110, 110), (60, 60, 60))
    draw = ImageDraw.Draw(img)
    random.seed(3)
    for _ in range(10):
        x, y = random.randint(10, 420), random.randint(30, 420)
        w, h = random.randint(40, 90), random.randint(25, 60)
        gray = random.randint(120, 200)
        draw.rectangle([x, y, x + w, y + h], fill=(gray, gray, gray), outline=(30, 30, 30))
    _caption(img, "Stormwater drain camera - construction rubble/rebar blocking flow")
    return img


def make_none():
    img = _base((60, 140, 180), (30, 90, 130))
    _caption(img, "Stormwater drain camera - clear flow, no debris visible")
    return img


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    make_plastic().save(OUT_DIR / "plastic.png")
    make_silt().save(OUT_DIR / "silt.png")
    make_construction().save(OUT_DIR / "construction_debris.png")
    make_none().save(OUT_DIR / "none.png")
    print(f"wrote 4 demo images to {OUT_DIR}")


if __name__ == "__main__":
    main()
