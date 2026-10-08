#!/bin/bash
#
# Extract the "PROTECT THE POD" letterforms from the two-line badge lockup
# (public/ptp_logotype.png) and reflow them onto a single line.
#
#   ./scripts/extract-logotype.sh
#
# Writes:
#   public/branding/ptp_logotype_line.png          THE kept small (preferred)
#   public/branding/ptp_logotype_line_uniform.png  every word at one cap height
#
# Requires ImageMagick 7 (`brew install imagemagick`).
#
# Why this is not a simple crop: the source art has an alpha channel, but the
# letters sit on an OPAQUE dark banner, so the cutout has to be derived from
# luminance. And the words are three different sizes in the original —
# PROTECT > POD > THE — so putting them on one line means rescaling each.
#
# The output is light chrome on transparency: it reads on dark surfaces and
# washes out on light ones. That is inherent to the source art.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/public/ptp_logotype.png"
OUT="$ROOT/public/branding"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

command -v magick >/dev/null || { echo "error: ImageMagick 7 (magick) not found" >&2; exit 1; }
[ -f "$SRC" ] || { echo "error: missing $SRC" >&2; exit 1; }
mkdir -p "$OUT"
cd "$WORK"

echo "==> Flattening source"
# Alpha is useless here (the banner is opaque), so composite onto black and
# work from luminance instead.
magick "$SRC" -background black -alpha remove -alpha off rgb.png

echo "==> Building soft alpha ramp"
# A soft ramp rather than a hard threshold: it drops the dark banner while
# keeping the chrome faces AND their dark bevels with clean anti-aliased
# edges. A hard cut chews ragged holes in the bottom of every letter.
magick rgb.png -colorspace gray -level 12%,48% alpha_soft.png

echo "==> Isolating glyphs via connected components"
# Keep only the 13 letter blobs. This is what removes the wings, the chevron
# and its light streaks — a purely geometric crop keeps catching slivers of
# them, because the chevron's arms tuck under THE and POD.
#
# These IDs are positional, tied to this exact source image and pipeline. To
# re-derive them after an art change, run:
#   magick rgb.png -colorspace gray -threshold 55% \
#     -define connected-components:area-threshold=120 \
#     -define connected-components:verbose=true -connected-components 8 null:
# and pick the gray(255) blobs on the two text rows (y~210 and y~322).
#        PROTECT: P R O T E C T   THE: T H E   POD: P O D
GLYPHS=1,8,2,3,4,5,6,169,170,167,166,165,168
magick rgb.png -colorspace gray -threshold 55% \
  -define connected-components:area-threshold=120 \
  -define connected-components:keep=$GLYPHS \
  -define connected-components:mean-color=true \
  -connected-components 8 \
  -fill black -draw "rectangle 0,306 1151,320" \
  glyphs_mask.png
# ^ The P and the final T each merge with a banner streak below the baseline;
#   blacking out the dead band between the two text rows clips both tails.

# Grow the glyph mask into a region selector, so it gates WHERE art is kept
# without clipping the soft edges the ramp just produced.
magick glyphs_mask.png -morphology Dilate Disk:4 -blur 0x1.5 region.png
magick alpha_soft.png region.png -compose Multiply -composite alpha.png
magick rgb.png alpha.png -alpha off -compose CopyOpacity -composite PNG32:letters.png

echo "==> Cutting words"
# Boxes measured off the glyph mask, with 4px bleed.
magick letters.png -crop 696x102+219+206 +repage PNG32:w_protect.png  # cap 93
magick letters.png -crop 194x71+331+320  +repage PNG32:w_the.png      # cap 61
magick letters.png -crop 253x84+549+318  +repage PNG32:w_pod.png      # cap 73

echo "==> Scaling to a common cap height"
# Ratios are like-for-like glyph comparisons, not word bounding boxes (those
# are skewed by round-letter overshoot):
#   POD O(73) vs PROTECT O(93) -> 1.2740
#   THE T(61) vs PROTECT T(93) -> 1.5246
magick w_pod.png -resize 127.40% PNG32:s_pod.png
magick w_the.png -resize 127.40% PNG32:s_the_small.png   # THE stays proportionally small
magick w_the.png -resize 152.46% PNG32:s_the_full.png    # THE normalised to full cap

echo "==> Composing"
GAP=38    # word space, at cap height 93
BASE=118  # cap baseline on the working canvas
CANVAS_H=140

# Per-image metrics: glyph left inset, cap-bottom from top, glyph right edge.
#   w_protect     inset 4  capbot 98   right 692
#   s_the_small   inset 5  capbot 84   right 242
#   s_the_full    inset 6  capbot 101  right 290
#   s_pod         inset 5  capbot 98   right 317
compose () {
  local out=$1 the=$2 the_inset=$3 the_capbot=$4 the_right=$5
  local t_x=$(( 692 + GAP - the_inset ))
  local d_x=$(( t_x + the_right + GAP - 5 ))
  local w=$(( d_x + 317 + 5 ))

  magick -size ${w}x${CANVAS_H} xc:none \
    w_protect.png -geometry +0+$(( BASE - 98 )) -composite \
    ${the}.png    -geometry +${t_x}+$(( BASE - the_capbot )) -composite \
    s_pod.png     -geometry +${d_x}+$(( BASE - 98 )) -composite \
    -trim +repage -bordercolor none -border 6 \
    -strip -define png:compression-level=9 \
    PNG32:"$out"
}

compose "$OUT/ptp_logotype_line.png"         s_the_small 5 84  242
compose "$OUT/ptp_logotype_line_uniform.png" s_the_full  6 101 290

echo
echo "Wrote:"
for f in "$OUT/ptp_logotype_line.png" "$OUT/ptp_logotype_line_uniform.png"; do
  printf '  %s  %s\n' "$(magick identify -format '%wx%h' "$f")" "${f#"$ROOT"/}"
done
