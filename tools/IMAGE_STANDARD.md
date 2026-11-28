# NAL product image standard

All product photographs on naltx.com use one canvas, one background, and one scale. New photos should be run through the normalizer before they appear on the site. Do not upload raw Square or vendor files straight to the catalog.

## Visual rules

- **Canvas:** square, **1200 × 1200** pixels.
- **Background:** clean **pure white** (`#FFFFFF`). No black, green, gray gradient, patterned paper, or leftover studio marks.
- **Subject:** the product only (or the product with a genuine included accessory, such as a mount shown in the same shot). Centered horizontally and vertically.
- **Padding and scale:** the product’s bounding box is sized so its longer side fills **80%** of the canvas (10% padding on every side). Every photo uses this same ratio so a row of thumbnails lines up.
- **File:** `img/products/<Square item id>.webp`. Keep each file **under 150 KB** (the script targets this automatically).
- **Marketing extras:** crop out certification logos, “colours available” labels, color-chip bars, inset thumbnails, and other graphic overlays. If a composite also shows a real accessory that ships with the item, you may keep it (see overrides below).

## How the storefront uses the files

`app.js` loads `img/products/manifest.json` and prefers the processed file for that product id. If a product has no processed file, the Square image URL is used as a fallback. Product cards, product pages, the homepage promotion carousel, category tiles, and the cart all follow this rule.

When Shirley adds or replaces a photo later:

1. Save the source file as `<Square item id>.jpg` (or `.png`) — the id is the catalog item id, for example `MTTKAMPNNC7HTDPD3F55GR6Y`.
2. From the site root, with a Python environment that has Pillow, numpy, and ideally rembg (`pip install "rembg[cpu]" pillow numpy`):

   ```bash
   python tools/normalize_product_images.py \
     --sources /path/to/new-photos \
     --out img/products \
     --contact-sheet tools/product-images-contact-sheet.jpg
   ```

   Or pass a JSON map of `{ "id", "slug", "file" }` with `--map`.

3. Open the contact sheet and inspect every image. If a cutout is wrong, add an entry to `tools/image-overrides.json` and run the script again. Supported overrides (keyed by slug or item id):

   - `"method": "rembg" | "trim" | "canvas"` — force background removal, edge-flood trim, or “keep the photo / only trim empty margins.”
   - `"crop": [left, top, right, bottom]` — pixel crop before processing.
   - `"polygon": [[x,y], ...]` and optional `"polygonGrow"` — mask the subject to a polygon (used when rembg would eat a white fixture, e.g. the backlit panel).

4. Copy the new or replaced `img/products/<id>.webp` plus the updated `manifest.json` (and this folder’s contact sheet if you regenerated it) up to the site. No Worker change is required.

The script will use **rembg** when the background is black, colored, or mixed, and a careful edge trim when the background is already white. White fixtures on white backgrounds are handled conservatively so the body of the light is not eaten. Always do a visual check; rembg is a helper, not a guarantee.

## Homepage promotion images

Promotion slides use the same processed product photos.

- Every promotion image shows a **price overlay** on the photo: the live catalog price as a **dollar amount only** (for example `$32.28`, or `$30.95 – $54.43` when a product has a range). No “from,” and no other caption on the price badge.
- The overlay is rendered by the site (not baked into the WebP), so it always follows the live feed.
- The carousel is built automatically: the curated `HOME_PROMOS` list runs first, then every **clearance** and **sale** product from the live catalog (same clearance rule as the rest of the site, including Flood Light [HG. SALE] and Parking/Street Decorative HG [SALE]). Products already in the curated list are not repeated. Products with no image are skipped. When clearance or sale items change in the catalog, the promotion area updates on the next load — no manual slide list edit.

## Current set

A contact sheet of the processed catalog is kept at `tools/product-images-contact-sheet.jpg`. Nine catalog items have no source photo (several clearance SKUs, the display wall pack, and three lightbox kits); they keep the placeholder until a photo is added and run through this script.
