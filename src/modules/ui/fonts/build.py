"""Build the UI's Noto Serif TC subset from charset.txt (written by `node subset.mjs --write`).

    python build.py <dir>

<dir> is the `files/` folder of `npm pack @fontsource/noto-serif-tc@5.3.1`. Its numbered slices
(noto-serif-tc-<n>-<weight>-normal.woff2) together hold the whole font; the single "chinese-traditional" file lacks the
full-width punctuation. Every slice that carries a wanted character is cut down to those characters and the pieces are
merged into one woff2 per weight. Needs fonttools and brotli (`uv pip install fonttools brotli`).
Layout tables are dropped (the UI sets vertical text one character per block and needs no kerning), which also keeps
the merge trivial.
"""
import glob
import os
import sys
import tempfile

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
BOLD = '青島北'  # weight 700: the title seal and the compass north only (keep in step with subset.mjs and ui.css)


def build(src_dir, weight, chars, out):
    want = {ord(c) for c in chars}
    left = set(want)
    parts = []
    with tempfile.TemporaryDirectory() as tmp:
        slices = [p for p in glob.glob(os.path.join(src_dir, f'noto-serif-tc-*-{weight}-normal.woff2'))
                  if os.path.basename(p).split('-')[3].isdigit()]
        for path in sorted(slices):
            font = TTFont(path)
            hit = want & set(font.getBestCmap())
            if not hit:
                continue
            left -= hit
            opts = subset.Options()
            opts.layout_features = []
            opts.hinting = False
            opts.notdef_outline = True
            opts.name_IDs = [1, 2, 4, 6, 13, 14]
            opts.drop_tables += ['DSIG', 'GSUB', 'GPOS', 'GDEF', 'BASE', 'vhea', 'vmtx', 'VORG']
            sub = subset.Subsetter(opts)
            sub.populate(unicodes=hit)
            sub.subset(font)
            part = os.path.join(tmp, f'{len(parts)}.ttf')
            font.flavor = None
            font.save(part)
            parts.append(part)
        if left:
            sys.exit(f'weight {weight}: not in any slice: ' + ''.join(sorted(map(chr, left))))
        merged = Merger().merge(parts) if len(parts) > 1 else TTFont(parts[0])
        merged['OS/2'].usWeightClass = weight
        merged.flavor = 'woff2'
        merged.save(out)
    print(f'{os.path.basename(out)}: {len(want)} characters from {len(parts)} slices, {os.path.getsize(out) / 1024:.1f} KB')


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    text = ''.join(open(os.path.join(HERE, 'charset.txt'), encoding='utf8').read().split())
    full = ''.join(map(chr, range(0x20, 0x7f))) + text
    for weight, chars in ((400, full), (500, full), (700, BOLD)):
        build(sys.argv[1], weight, chars, os.path.join(HERE, f'noto-serif-tc-ui-{weight}.woff2'))


if __name__ == '__main__':
    main()
