#!/usr/bin/env python3
# Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
"""Budgie's icon font (1.6): the icons its own code uses, cut out of Material Symbols Rounded (m3/fonts).

The whole font is 5.3 MB, nine tenths of everything a first visit downloads, for some 4,300 icons of which
Budgie uses about 600. This keeps those, with fill (0 to 1), weight (400 to 600) and optical size (20 to 48) still
adjustable as the app animates them, and the grade fixed at 0 as the app draws it: about 270 KB.

    python3 nook/tools/icons.py

writes nook/fonts/icons.woff2 (the font app.css wears), nook/js/icon-names.js (the icons it has, which the app
checks pages against) and nook/tools/icons-all.txt (every icon in the whole font, which build-site.py checks the
code against). Run it again after adding an icon to the code: build-site.py says when one is missing. Should a page
still show an icon the font doesn't have (one someone chose, kept on the server from long ago), the app fetches the
whole font then and draws every icon from it (js/ui.js), so an icon is never drawn wrong.

Needs fontTools with brotli: pip install fonttools brotli
"""
import io, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FULL = os.path.join(ROOT, 'm3', 'fonts', 'material-symbols-rounded.woff2')
OUT_FONT = os.path.join(ROOT, 'nook', 'fonts', 'icons.woff2')
OUT_NAMES = os.path.join(ROOT, 'nook', 'js', 'icon-names.js')
OUT_ALL = os.path.join(ROOT, 'nook', 'tools', 'icons-all.txt')


def sources():
    """the app's code, its pages and styles (not other languages' words, the tools or other people's libraries), the
    design system's script, and the desktop app's own windows"""
    for top, dirs, files in os.walk(os.path.join(ROOT, 'nook')):
        dirs[:] = [d for d in dirs if d not in ('vendor', 'lang', 'tools', 'node_modules', 'data')]
        for f in files:
            if re.search(r'\.(js|html|css)$', f) and f != 'icon-names.js':
                yield os.path.join(top, f)
    yield os.path.join(ROOT, 'm3', 'm3.js')
    desktop = os.path.join(ROOT, 'apps', 'desktop')
    if os.path.isdir(desktop):
        for f in os.listdir(desktop):
            if re.search(r'\.(js|html)$', f):
                yield os.path.join(desktop, f)


def words():
    """every word in the code that could be an icon's name: a name is only ever written whole (never put together
    from parts), so this finds them all, and a few more besides (words in comments that are also icons)"""
    found = set()
    for path in sources():
        with open(path, encoding='utf-8', errors='ignore') as f:
            found |= set(re.findall(r'[a-z][a-z0-9_]*', f.read()))
    return found


def used_in_code(all_names):
    return sorted(w for w in words() if w in all_names)


def ligatures(font):
    """the font's icons: each name (written in the font's letters) and the glyph it turns into"""
    cmap = font.getBestCmap()
    letter = {glyph: chr(code) for code, glyph in cmap.items()}
    names = {}
    for lookup in font['GSUB'].table.LookupList.Lookup:
        for table in lookup.SubTable:
            if lookup.LookupType == 7:
                table = table.ExtSubTable
            for first, ligs in getattr(table, 'ligatures', {}).items():
                for lig in ligs:
                    names[''.join(letter.get(g, '') for g in [first] + list(lig.Component))] = lig.LigGlyph
    return names


def main():
    from fontTools.ttLib import TTFont
    from fontTools import subset
    from fontTools.varLib import instancer

    full = TTFont(FULL)
    names = ligatures(full)
    keep = used_in_code(names)
    options = subset.Options()
    options.layout_features = ['*']
    # only the names kept turn into icons (with closure, every name would, as every letter is kept)
    options.layout_closure = False
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.glyph_names = True
    cutter = subset.Subsetter(options)
    cutter.populate(glyphs=[names[n] for n in keep], text='abcdefghijklmnopqrstuvwxyz0123456789_ ')
    cutter.subset(full)
    # (cut first, then fix the grade: the other way round, fontTools trips over the letters, which don't vary)
    buffer = io.BytesIO()
    full.flavor = None
    full.save(buffer)
    buffer.seek(0)
    small = instancer.instantiateVariableFont(TTFont(buffer), {'GRAD': 0, 'wght': (400, 600)})
    small.flavor = 'woff2'
    small.save(OUT_FONT)
    with open(OUT_NAMES, 'w') as f:
        f.write('// Made by nook/tools/icons.py: the icons in Budgie\'s own icon font (fonts/icons.woff2). js/ui.js fetches\n'
                '// the whole Material Symbols font when a page shows one that isn\'t here.\n'
                f"window.NOOK_ICON_NAMES = '{' '.join(keep)}';\n")
    with open(OUT_ALL, 'w') as f:
        f.write('\n'.join(sorted(names)) + '\n')
    print(f'{len(keep)} of {len(names)} icons, {os.path.getsize(OUT_FONT) // 1024} KB (the whole font: {os.path.getsize(FULL) // 1024} KB)')


def missing():
    """icons the code uses that the font doesn't have yet (no fontTools needed): for build-site.py"""
    try:
        with open(OUT_ALL) as f:
            all_names = set(f.read().split())
        with open(OUT_NAMES) as f:
            have = set(re.search(r"NOOK_ICON_NAMES = '([^']*)'", f.read()).group(1).split())
    except (OSError, AttributeError):
        return []
    return [n for n in used_in_code(all_names) if n not in have]


if __name__ == '__main__':
    main()
