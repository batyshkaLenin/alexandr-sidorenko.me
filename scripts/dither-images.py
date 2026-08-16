#!/usr/bin/env python3
"""Build the dithered derivatives of every published image (T129, §30).

    scripts/dither-images.py

The pipeline is the one the design system describes:

    source image
        ↓ dominant, meaningful hue
        ↓ nearest muted hue family of the system
        ↓ fixed luminance ladder
        ↓ five-tone palette
        ↓ ordered dithering (Bayer 8×8)

What is fixed: the algorithm, the number of tones, the saturation ceiling, the
darkest and lightest ends of the ladder, and the contrast behaviour. What varies
per image is the hue family alone — that is what "adaptive hue from image"
means, as opposed to one hardcoded duotone for the whole site.

Dithering is resolution-bound: the pattern is made of single pixels, so
resampling it turns texture into mud. Each rung of the responsive ladder is
therefore dithered from the source separately, never derived from another rung.
That is also why the derivatives are palette PNG and never go through Hugo's
WebP conversion — lossy compression of a dither pattern is the same mistake in
another form.

Every image is classified as a photograph or a graphic (§30.3): screenshots,
diagrams, charts and QR codes live on flat colour fields, which is measurable
rather than a matter of taste. `image_style: auto` dithers photographs and
leaves graphics alone; the classification is recorded in the manifest so a
material can disagree with it explicitly.

Runs by hand, like scripts/fetch-lastfm.py: the output is committed, so a build
never depends on Pillow. Re-running it only touches images whose source has
changed. `scripts/check-dither-contract.py` is the gate that catches a source
replaced without a re-run, and needs no image library to do it.
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SOURCE_DIR = ASSETS / "assets"
MANIFEST = ROOT / "data" / "dither.json"

# The same ladders the layouts publish photographs at: the article column in
# layouts/_markup/render-image.html, the identity panel in layouts/home.html.
WIDTHS = [400, 600, 800, 1200]
PORTRAIT_WIDTHS = [320, 640, 848]

# The tokens of the treatment. Every image on the site is dithered onto five
# tones at these lightnesses and this saturation; the only thing an image
# chooses for itself is which hue those tones are built from. Handpicking each
# family separately is exactly what this replaces — it let saturation drift
# between families, so two photographs treated "the same way" were not.
#
# The ladder stops short of both ends: pure black would fill the dark half of a
# photograph with a hole, and pure white would glare out of a dark page.
TONES = 5
LIGHTNESS = [0.04, 0.16, 0.32, 0.53, 0.82]
SATURATION = 0.28
NEUTRAL_SATURATION = 0.05

# Hue families, as fractions of the colour wheel. `neutral` is not a hue: it is
# what an image gets when it has no colour worth following.
FAMILY_HUE = {"sky": 0.58, "forest": 0.33, "warm": 0.97, "amber": 0.10}


def palette(family: str) -> list[tuple[int, int, int]]:
    hue = FAMILY_HUE.get(family, 0.58)
    saturation = NEUTRAL_SATURATION if family == "neutral" else SATURATION
    return [
        tuple(round(channel * 255) for channel in colorsys.hls_to_rgb(hue, lightness, saturation))
        for lightness in LIGHTNESS
    ]


BAYER_8 = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
]


def pixels_of(image: Image.Image, size: int = 128) -> list[tuple[int, int, int]]:
    """A square sample of the image, resampled without inventing colours.

    Nearest-neighbour matters for classify(): any smooth filter blends new
    intermediate values into a flat graphic and makes it look photographic.
    """
    small = image.convert("RGB").resize((size, size), Image.NEAREST)
    data = small.load()
    return [data[x, y] for y in range(size) for x in range(size)]


def pick_family(sample: list[tuple[int, int, int]]) -> str:
    """The hue family the image itself asks for.

    Pixels too grey, too dark or too blown out to carry a hue are ignored:
    averaging them in pulls every photograph towards the same muddy middle.
    """
    x = y = saturation_sum = 0.0
    counted = 0
    for r, g, b in sample:
        h, lightness, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if s < 0.18 or lightness < 0.08 or lightness > 0.94:
            continue
        angle = h * 2 * math.pi
        x += s * math.cos(angle)
        y += s * math.sin(angle)
        saturation_sum += s
        counted += 1

    if counted < len(sample) // 16:
        return "neutral"
    if saturation_sum / counted < 0.2:
        return "neutral"

    hue = (math.atan2(y, x) / (2 * math.pi)) % 1.0
    best, best_distance = "neutral", 1.0
    for name, family_hue in FAMILY_HUE.items():
        distance = abs(hue - family_hue)
        distance = min(distance, 1 - distance)
        if distance < best_distance:
            best, best_distance = name, distance
    return best


def classify(sample: list[tuple[int, int, int]]) -> str:
    """photo or graphic (§30.3), by how flat the image's colour field is.

    A screenshot, a diagram, a chart or a QR code is built from a handful of
    exact colours covering large areas. A photograph is a cloud of near-unique
    values, because sensors and JPEG both add noise everywhere. Counting exact
    colours separates the two without asking anyone to label images by hand.

    Measured on this corpus: photographs hold 2800-12000 distinct colours in a
    128x128 sample with the eight commonest covering 1-23% of it; a chart holds
    2 colours and a screenshot 61, both above 97%. Nothing sits near the line.
    Two tests rather than one, because a JPEG screenshot picks up noise and
    passes the first while its flat background still fails the second.
    """
    counts: dict[tuple[int, int, int], int] = {}
    for pixel in sample:
        counts[pixel] = counts.get(pixel, 0) + 1
    top = sum(sorted(counts.values(), reverse=True)[:8]) / len(sample)
    return "graphic" if len(counts) < 1000 or top > 0.5 else "photo"


def dither(image: Image.Image, width: int, tones: list[tuple[int, int, int]]) -> Image.Image:
    """Ordered dithering of the source onto the family's luminance ladder."""
    grey = image.convert("L")
    if grey.width != width:
        height = max(1, round(grey.height * width / grey.width))
        grey = grey.resize((width, height), Image.LANCZOS)

    source = grey.load()
    out = Image.new("P", grey.size)
    flat: list[int] = []
    for colour in tones:
        flat.extend(colour)
    flat.extend([0] * (768 - len(flat)))
    out.putpalette(flat)
    target = out.load()

    levels = len(tones) - 1
    for y in range(grey.height):
        row = BAYER_8[y % 8]
        for x in range(grey.width):
            threshold = (row[x % 8] + 0.5) / 64 - 0.5
            value = source[x, y] / 255 * levels + threshold
            target[x, y] = min(levels, max(0, int(round(value))))
    return out


def sources() -> list[tuple[Path, list[int], bool]]:
    """Every image to dither, with the shape the layout asks it for.

    Body images take the article ladder untouched. The portrait is its own
    case: the home layout crops it square and publishes a different ladder, and
    a derivative has to match the file it replaces — a landscape dither behind
    a square frame would be cropped twice, once here and once by the browser.
    """
    found = [
        (path, WIDTHS, False)
        for path in sorted(SOURCE_DIR.rglob("*"))
        if path.suffix.lower() in {".jpg", ".jpeg", ".png"} and ".dither-" not in path.name
    ]
    portrait = ASSETS / "avatar.jpg"
    if portrait.exists():
        found.append((portrait, PORTRAIT_WIDTHS, True))
    return found


def public_path(source: Path) -> str:
    """The address the image is published at — how content refers to it."""
    return "/" + str(source.relative_to(ASSETS))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def square(image: Image.Image) -> Image.Image:
    side = min(image.width, image.height)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    return image.crop((left, top, left + side, top + side))


def build(source: Path, widths: list[int], crop_square: bool) -> dict:
    """Dither one source into every rung the layout asks for.

    The source digest goes into each file name on purpose: these derivatives
    are served with a year of `immutable`, which is only honest when replacing
    the photograph replaces the address too. Without it a new portrait would
    stay invisible to everyone who had seen the old one.
    """
    fingerprint = digest(source)
    with Image.open(source) as opened:
        image = square(opened) if crop_square else opened
        sample = pixels_of(image)
        family = pick_family(sample)
        kind = classify(sample)
        wanted = [w for w in widths if w <= image.width] or [image.width]
        variants = []
        for width in wanted:
            out = dither(image, width, palette(family))
            target = source.with_name(f"{source.stem}.dither-{width}.{fingerprint}.png")
            out.save(target, optimize=True)
            variants.append(
                {
                    "width": out.width,
                    "height": out.height,
                    "path": str(target.relative_to(ASSETS)),
                }
            )
    return {"source": fingerprint, "family": family, "kind": kind, "variants": variants}


def main() -> int:
    argparse.ArgumentParser(description="Dither published images (§30).").parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    updated: dict[str, dict] = {}

    for source, widths, crop_square in sources():
        key = public_path(source)
        known = manifest.get(key)
        current = known is not None and known.get("source") == digest(source)
        if current:
            current = all((ASSETS / v["path"]).exists() for v in known["variants"])
        if current:
            updated[key] = known
            continue

        updated[key] = build(source, widths, crop_square)
        print(f"{key}: {updated[key]['family']}, {updated[key]['kind']}")

    for stale in sorted(ASSETS.rglob("*.dither-*.png")):
        if not any(ASSETS / v["path"] == stale for e in updated.values() for v in e["variants"]):
            stale.unlink()
            print(f"{stale.relative_to(ROOT)}: удалён, исходника больше нет")

    MANIFEST.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
