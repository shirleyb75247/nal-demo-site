#!/usr/bin/env python3
"""Normalize NAL product photos to the storefront image standard.

See tools/IMAGE_STANDARD.md for the visual rules this script enforces.

Typical use (from the site root):

    python tools/normalize_product_images.py \\
        --sources /path/to/source-images \\
        --map tools/image-source-map.json \\
        --out img/products \\
        --contact-sheet tools/product-images-contact-sheet.jpg

Each source file should be named <product-id>.<ext> (Square catalog item id),
or listed in a JSON map of {id, slug, file}.

Dependencies: Pillow, numpy, and optionally rembg (background removal).
If rembg is missing, the script falls back to edge-flood trimming.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

CANVAS = 1200
PAD_RATIO = 0.10
MAX_BYTES = 150 * 1024
WEBP_QUALITY_START = 82
WHITE = (255, 255, 255)
ALPHA_CUTOFF = 12

# Products that are mostly white fixtures: rembg often eats the body.
# Prefer careful edge-trim unless the background is clearly colored/black.
WHITE_BODY_HINTS = (
    "panel",
    "ceiling",
    "tube",
    "batten",
    "canopy",
    "shop-light",
)


def load_rgba(path: Path) -> Image.Image:
    im = Image.open(path)
    if im.mode in ("P", "L"):
        im = im.convert("RGBA")
    elif im.mode != "RGBA":
        im = im.convert("RGBA")
    return im


def corner_stats(im: Image.Image, inset: int = 6, size: int = 18):
    arr = np.asarray(im.convert("RGB"), dtype=np.int16)
    h, w, _ = arr.shape
    s = min(size, h // 4, w // 4)
    i = min(inset, max(0, min(h, w) // 8))
    patches = [
        arr[i : i + s, i : i + s],
        arr[i : i + s, w - i - s : w - i],
        arr[h - i - s : h - i, i : i + s],
        arr[h - i - s : h - i, w - i - s : w - i],
    ]
    means = [p.reshape(-1, 3).mean(axis=0) for p in patches]
    mean = np.mean(means, axis=0)
    spread = float(np.mean([np.linalg.norm(m - mean) for m in means]))
    brightness = float(mean.mean())
    saturation = float(np.mean(np.max(means, axis=1) - np.min(means, axis=1)))
    return {
        "mean": mean,
        "spread": spread,
        "brightness": brightness,
        "saturation": saturation,
        "consistent": spread < 28,
    }


def background_kind(im: Image.Image) -> str:
    st = corner_stats(im)
    if st["consistent"] and st["brightness"] < 40:
        return "black"
    if st["consistent"] and st["saturation"] > 35 and st["brightness"] < 200:
        return "colored"
    if st["consistent"] and st["brightness"] >= 230 and st["saturation"] < 18:
        return "white"
    if st["brightness"] >= 210 and st["saturation"] < 25:
        return "offwhite"
    return "mixed"


def rembg_cutout(im: Image.Image, session) -> Image.Image | None:
    if session is None:
        return None
    from rembg import remove

    try:
        out = remove(im, session=session, alpha_matting=True,
                     alpha_matting_foreground_threshold=240,
                     alpha_matting_background_threshold=10,
                     alpha_matting_erode_size=10)
        if not isinstance(out, Image.Image):
            out = Image.open(out)
        return out.convert("RGBA")
    except Exception as exc:
        print("  rembg failed, falling back:", exc)
        return None


def flood_trim(im: Image.Image, tol: int = 28) -> Image.Image:
    """Treat edge-connected near-background pixels as transparent, keep the rest."""
    rgb = np.asarray(im.convert("RGB"), dtype=np.int16)
    h, w, _ = rgb.shape
    st = corner_stats(im)
    bg = st["mean"].astype(np.int16)
    diff = np.linalg.norm(rgb - bg, axis=2)
    # also treat very light pixels as background when the corners are light
    if st["brightness"] >= 200:
        light = rgb.min(axis=2) >= 245
        diff = np.where(light, 0, diff)
    visitable = diff <= tol
    seen = np.zeros((h, w), dtype=bool)
    stack = []
    for x in range(w):
        if visitable[0, x]:
            stack.append((0, x))
        if visitable[h - 1, x]:
            stack.append((h - 1, x))
    for y in range(h):
        if visitable[y, 0]:
            stack.append((y, 0))
        if visitable[y, w - 1]:
            stack.append((y, w - 1))
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not visitable[y, x]:
            continue
        seen[y, x] = True
        stack.extend(((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    # slight contract so leftover fringe is less visible
    out = im.convert("RGBA")
    arr = np.array(out)
    arr[..., 3] = np.minimum(arr[..., 3], alpha)
    # paint near-white remaining fringe toward white where very transparent-adjacent
    return Image.fromarray(arr, "RGBA")


def canvas_pad(im: Image.Image, margin_tol: int = 8) -> Image.Image:
    """Keep the photo as-is; trim only nearly-identical outer margins, then treat as opaque."""
    if im.mode == "RGBA":
        a = im.getchannel("A")
        if a.getextrema()[0] < 250:
            box = a.getbbox()
            return im.crop(box) if box else im
    rgb = im.convert("RGB")
    arr = np.asarray(rgb)
    h, w, _ = arr.shape
    # trim rows/cols that are almost a single color matching the corner
    bg = corner_stats(im)["mean"]
    diff = np.linalg.norm(arr.astype(np.int16) - bg.astype(np.int16), axis=2)
    row_empty = (diff < margin_tol).mean(axis=1) > 0.98
    col_empty = (diff < margin_tol).mean(axis=0) > 0.98
    ys = np.where(~row_empty)[0]
    xs = np.where(~col_empty)[0]
    if len(xs) == 0 or len(ys) == 0:
        out = rgb.convert("RGBA")
        return out
    cropped = rgb.crop((int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1)).convert("RGBA")
    return cropped


def bbox_from_alpha(im: Image.Image, cutoff: int = ALPHA_CUTOFF):
    a = np.asarray(im.getchannel("A"))
    ys, xs = np.where(a > cutoff)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def mask_coverage(im: Image.Image) -> float:
    a = np.asarray(im.getchannel("A"))
    return float((a > ALPHA_CUTOFF).mean())


def place_on_square(im: Image.Image, canvas: int = CANVAS, pad_ratio: float = PAD_RATIO) -> Image.Image:
    box = bbox_from_alpha(im)
    if not box:
        bg = Image.new("RGB", (canvas, canvas), WHITE)
        return bg
    cropped = im.crop(box)
    # Drop nearly-empty transparent margins already cropped; scale to inner box
    inner = int(round(canvas * (1 - 2 * pad_ratio)))
    cw, ch = cropped.size
    scale = min(inner / cw, inner / ch)
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    cropped = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    # Composite onto pure white (flatten transparency against white)
    bg = Image.new("RGBA", (canvas, canvas), WHITE + (255,))
    x = (canvas - nw) // 2
    y = (canvas - nh) // 2
    bg.alpha_composite(cropped, (x, y))
    return bg.convert("RGB")


def save_webp(im: Image.Image, dest: Path, max_bytes: int = MAX_BYTES) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    quality = WEBP_QUALITY_START
    while quality >= 50:
        im.save(dest, "WEBP", quality=quality, method=6)
        size = dest.stat().st_size
        if size <= max_bytes:
            return size
        quality -= 6
    # last resort: slightly smaller canvas
    smaller = im.resize((1000, 1000), Image.Resampling.LANCZOS)
    smaller.save(dest, "WEBP", quality=70, method=6)
    return dest.stat().st_size


def pick_method(slug: str, kind: str, rembg_im: Image.Image | None, trim_im: Image.Image) -> str:
    slug_l = (slug or "").lower()
    white_body = any(h in slug_l for h in WHITE_BODY_HINTS)
    if rembg_im is None:
        return "trim"
    cov_r = mask_coverage(rembg_im)
    cov_t = mask_coverage(trim_im)
    # rembg ate the subject
    if cov_r < 0.04:
        return "trim"
    # white fixtures on white: rembg often chews the body; prefer trim unless bg is clearly not white
    if white_body and kind in ("white", "offwhite") and cov_r < cov_t * 0.7:
        return "trim"
    # clearly non-white backgrounds: rembg is the right tool
    if kind in ("black", "colored", "mixed"):
        return "rembg"
    # otherwise use rembg if it produced a reasonable cutout
    if cov_r >= 0.06:
        return "rembg"
    return "trim"


def process_one(path: Path, slug: str, session, overrides: dict) -> tuple[Image.Image, str]:
    im = load_rgba(path)
    ov = overrides.get(slug) or overrides.get(path.stem) or {}
    if ov.get("crop"):
        im = im.crop(tuple(ov["crop"]))
    if ov.get("polygon"):
        from PIL import ImageDraw, ImageFilter
        mask = Image.new("L", im.size, 0)
        ImageDraw.Draw(mask).polygon([tuple(pt) for pt in ov["polygon"]], fill=255)
        grow = int(ov.get("polygonGrow", 3))
        if grow:
            # MaxFilter requires an odd size
            k = grow if grow % 2 else grow + 1
            mask = mask.filter(ImageFilter.MaxFilter(max(3, k)))
        im = im.convert("RGBA")
        im.putalpha(mask)
        # already isolated: treat as canvas (do not rembg/trim)
        if not ov.get("method"):
            ov["method"] = "canvas"
    kind = background_kind(im)
    force = ov.get("method")
    trim_im = flood_trim(im)
    rembg_im = None
    if force not in ("trim", "canvas"):
        rembg_im = rembg_cutout(im, session)
    method = force or pick_method(slug, kind, rembg_im, trim_im)
    if method == "canvas":
        chosen = canvas_pad(im)
        method = "canvas/" + kind
    else:
        chosen = rembg_im if method == "rembg" and rembg_im is not None else trim_im
        if method == "rembg" and rembg_im is not None and mask_coverage(rembg_im) < 0.03:
            chosen = trim_im
            method = "trim"
        method = f"{method}/{kind}"
    out = place_on_square(chosen)
    return out, method


def contact_sheet(items: list[tuple[str, Image.Image]], dest: Path, cols: int = 6, thumb: int = 260):
    if not items:
        return
    pad, label = 10, 36
    rows = (len(items) + cols - 1) // cols
    W = cols * (thumb + pad) + pad
    H = rows * (thumb + label + pad) + pad
    sheet = Image.new("RGB", (W, H), "#e6e6e6")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 14)
    except Exception:
        font = ImageFont.load_default()
    for i, (caption, im) in enumerate(items):
        r, c = divmod(i, cols)
        x = pad + c * (thumb + pad)
        y = pad + r * (thumb + label + pad)
        t = im.copy()
        t.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
        bg = Image.new("RGB", (thumb, thumb), WHITE)
        bg.paste(t, ((thumb - t.size[0]) // 2, (thumb - t.size[1]) // 2))
        # faint grid so white-on-white is visible on the sheet
        draw.rectangle((x, y, x + thumb - 1, y + thumb - 1), outline="#cccccc")
        sheet.paste(bg, (x, y))
        draw.rectangle((x, y + thumb, x + thumb, y + thumb + label), fill="#1b1b1b")
        draw.text((x + 6, y + thumb + 10), caption[:32], fill="white", font=font)
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest, "JPEG", quality=88)
    print("contact sheet:", dest, sheet.size)


def collect_jobs(args) -> list[dict]:
    jobs = []
    if args.map:
        data = json.loads(Path(args.map).read_text())
        for row in data:
            if not row.get("file"):
                continue
            jobs.append({"id": row["id"], "slug": row.get("slug") or row["id"], "file": Path(row["file"])})
        return jobs
    src = Path(args.sources)
    for p in sorted(src.iterdir()):
        if p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}:
            continue
        jobs.append({"id": p.stem, "slug": p.stem, "file": p})
    return jobs


def main():
    ap = argparse.ArgumentParser(description="Normalize product images to the NAL storefront standard.")
    ap.add_argument("--sources", default="", help="Folder of source images named <product-id>.ext")
    ap.add_argument("--map", default="", help="JSON list of {id, slug, file}")
    ap.add_argument("--out", default="img/products")
    ap.add_argument("--contact-sheet", default="tools/product-images-contact-sheet.jpg")
    ap.add_argument("--overrides", default="tools/image-overrides.json")
    ap.add_argument("--no-rembg", action="store_true")
    args = ap.parse_args()

    overrides = {}
    ovp = Path(args.overrides)
    if ovp.exists():
        overrides = json.loads(ovp.read_text())

    session = None
    if not args.no_rembg:
        try:
            from rembg import new_session
            session = new_session("u2net")
            print("rembg session: u2net")
        except Exception as exc:
            print("rembg unavailable, using trim fallback:", exc)

    jobs = collect_jobs(args)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {}
    sheet_items = []
    for job in jobs:
        src = Path(job["file"])
        if not src.exists():
            print("missing source", src)
            continue
        print("process", job["slug"], src.name)
        im, method = process_one(src, job["slug"], session, overrides)
        dest = out_dir / (job["id"] + ".webp")
        size = save_webp(im, dest)
        manifest[job["id"]] = {
            "file": dest.as_posix() if not dest.is_absolute() else f"img/products/{job['id']}.webp",
            "slug": job["slug"],
            "bytes": size,
            "method": method,
        }
        # keep a relative path in the manifest for the site
        manifest[job["id"]]["file"] = f"img/products/{job['id']}.webp"
        print(f"  -> {dest.name} {size} bytes ({method})")
        if size > MAX_BYTES:
            print("  WARNING: still over 150 KB")
        sheet_items.append((f"{job['slug']}  {method}", im))

    man_path = out_dir / "manifest.json"
    man_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print("manifest:", man_path, "count", len(manifest))
    contact_sheet(sheet_items, Path(args.contact_sheet))


if __name__ == "__main__":
    sys.exit(main() or 0)
