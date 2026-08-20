# Assets

Department identity images, copied from the live department site so the portal
reads as part of it. Re-fetch from these URLs if an original is ever needed:

| File | Source | Original | Committed |
|---|---|---|---|
| `dept-banner.jpg` | `https://www.yorktownfire.org/images/yorktownfire_top.jpg` | 1200×220, 245 KB | recompressed, 128 KB |
| `dept-divider.jpg` | `https://www.yorktownfire.org/images/divider.jpg` | 960×35, 17 KB | recompressed, 8 KB |
| `dept-patch.jpg` | cropped from the banner above (x1024 y14, 165×190) | — | 18 KB |

Recompressed with `sips` at quality 70–80; compared against the originals by eye
with no visible degradation. The banner is the heaviest thing the page loads, so
if it needs to get lighter, reduce it further rather than adding other images.

The patch is cropped out separately because the full banner's wordmark becomes
illegible below roughly 640px, where the layout uses a CSS-built banner plus this
patch instead.
