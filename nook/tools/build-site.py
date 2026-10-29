"""Build the standalone Budgie site (repo root = the app, m3/ beside it) from the source branch.

Usage: python3 nook/tools/build-site.py <source repo root> <output folder, e.g. a nook-early-access-website clone>
It rewrites ../m3/ paths to m3/, refreshes the pages' script fingerprints, writes ads.txt when AdSense is
set up in js/config.js, and copies the app, legal pages, m3, fonts (the design system's and the name fonts), server (with its vendor folder), LICENSE and SECURITY.md.
"""
import os, re, shutil, sys
sys.dont_write_bytecode = True  # no __pycache__ left behind in the repository
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from csp import rehash
src, out = sys.argv[1], sys.argv[2]
for d in ['js', 'm3', 'm3/fonts', 'm3/vendor']:
    os.makedirs(os.path.join(out, d), exist_ok=True)
fix = lambda text: text.replace('href="../m3/"', 'href="m3/index.html"').replace('../m3/', 'm3/')
for page in ['index.html', 'terms.html', 'privacy.html', 'licenses.html']:
    html = rehash(fix(open(f'{src}/nook/{page}').read()))
    open(f'{out}/{page}', 'w').write(html)
for f in ['app.css', 'legal.css', 'LICENSE', 'SECURITY.md', 'og.png']:
    shutil.copy(f'{src}/nook/{f}', f'{out}/{f}')
# the fonts people can pick for their names, with their licences
os.makedirs(f'{out}/fonts', exist_ok=True)
for f in os.listdir(f'{src}/nook/fonts'):
    shutil.copy(f'{src}/nook/fonts/{f}', f'{out}/fonts/{f}')
for f in os.listdir(f'{src}/nook/js'):
    if os.path.isdir(f'{src}/nook/js/{f}'):
        # js/lang/: the app in other languages (1.0)
        os.makedirs(f'{out}/js/{f}', exist_ok=True)
        for g in os.listdir(f'{src}/nook/js/{f}'):
            open(f'{out}/js/{f}/{g}', 'w').write(open(f'{src}/nook/js/{f}/{g}').read())
        continue
    open(f'{out}/js/{f}', 'w').write(fix(open(f'{src}/nook/js/{f}').read()))
for f in ['m3.css', 'm3.js', 'm3-shapes.js', 'index.html', 'LICENSE-shapes.txt', 'LICENSE', 'README.md']:
    shutil.copy(f'{src}/m3/{f}', f'{out}/m3/{f}')
for d in ['fonts', 'vendor']:
    for f in os.listdir(f'{src}/m3/{d}'):
        shutil.copy(f'{src}/m3/{d}/{f}', f'{out}/m3/{d}/{f}')
# the server travels with the site, so the laptop can clone one repository (never its data folder),
# with vendor/: the picture and text checkers' libraries, ready to run with nothing to install
os.makedirs(f'{out}/server', exist_ok=True)
for f in os.listdir(f'{src}/nook/server'):
    if os.path.isfile(f'{src}/nook/server/{f}'):
        shutil.copy(f'{src}/nook/server/{f}', f'{out}/server/{f}')
shutil.rmtree(f'{out}/server/vendor', ignore_errors=True)
shutil.copytree(f'{src}/nook/server/vendor', f'{out}/server/vendor')
open(f'{out}/.nojekyll', 'w').write('')
open(f'{out}/.gitignore', 'w').write('server/data/\n*.db\n*.db-wal\n*.db-shm\n')
open(f'{out}/robots.txt', 'w').write('User-agent: *\nAllow: /\n')
# AdSense wants this file at the root of the site, naming the publisher allowed to sell its ad space
pub = re.search(r"client: '(ca-pub-\d+)'", open(f'{src}/nook/js/config.js').read())
if pub:
    open(f'{out}/ads.txt', 'w').write(f"google.com, {pub.group(1).replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n")
elif os.path.exists(f'{out}/ads.txt'):
    os.remove(f'{out}/ads.txt')
open(f'{out}/README.md', 'w').write(
    '# Budgie\n\nA community app built on Material 3 Expressive, with nests (communities), posts, comments, friends and chats.\n\n'
    'Plain HTML, CSS and JS with no build step, and a small Node server in `server/` (see server/README.md). The only code from another company is Google AdSense, for ads between posts, and only once it is switched on in js/config.js.\n\n'
    'See [Terms of Use](terms.html) and [Privacy Policy](privacy.html).\n\nBudgie is not open source: see [LICENSE](LICENSE). Security problems: see [SECURITY.md](SECURITY.md).\n')
