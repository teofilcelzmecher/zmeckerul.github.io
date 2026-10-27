"""Build the standalone Budgie site (repo root = the app, m3/ beside it) from the source branch.

Usage: python3 nook/tools/build-site.py <source repo root> <output folder, e.g. a nook-early-access-website clone>
It rewrites ../m3/ paths to m3/, adds noindex, and copies the app, legal pages, m3, fonts, server, LICENSE and SECURITY.md.
"""
import os, shutil, sys
src, out = sys.argv[1], sys.argv[2]
for d in ['js', 'm3', 'm3/fonts', 'm3/vendor']:
    os.makedirs(os.path.join(out, d), exist_ok=True)
fix = lambda text: text.replace('href="../m3/"', 'href="m3/index.html"').replace('../m3/', 'm3/')
for page in ['index.html', 'terms.html', 'privacy.html', 'licenses.html']:
    html = fix(open(f'{src}/nook/{page}').read())
    html = html.replace('<meta name="viewport"', '<meta name="robots" content="noindex">\n  <meta name="viewport"', 1)
    open(f'{out}/{page}', 'w').write(html)
for f in ['app.css', 'legal.css', 'LICENSE', 'SECURITY.md']:
    shutil.copy(f'{src}/nook/{f}', f'{out}/{f}')
for f in os.listdir(f'{src}/nook/js'):
    open(f'{out}/js/{f}', 'w').write(fix(open(f'{src}/nook/js/{f}').read()))
for f in ['m3.css', 'm3.js', 'm3-shapes.js', 'index.html', 'LICENSE-shapes.txt', 'LICENSE', 'README.md']:
    shutil.copy(f'{src}/m3/{f}', f'{out}/m3/{f}')
for d in ['fonts', 'vendor']:
    for f in os.listdir(f'{src}/m3/{d}'):
        shutil.copy(f'{src}/m3/{d}/{f}', f'{out}/m3/{d}/{f}')
# the server travels with the site, so the laptop can clone one repository (never its data folder)
os.makedirs(f'{out}/server', exist_ok=True)
for f in os.listdir(f'{src}/nook/server'):
    if os.path.isfile(f'{src}/nook/server/{f}'):
        shutil.copy(f'{src}/nook/server/{f}', f'{out}/server/{f}')
open(f'{out}/.nojekyll', 'w').write('')
open(f'{out}/.gitignore', 'w').write('server/data/\n*.db\n*.db-wal\n*.db-shm\n')
open(f'{out}/robots.txt', 'w').write('User-agent: *\nDisallow: /\n')
open(f'{out}/README.md', 'w').write(
    '# Budgie\n\nA community app built on Material 3 Expressive. Early access: you need an invite code to get in.\n\n'
    'Plain HTML, CSS and JS with no build step, and a small Node server in `server/` (see server/README.md). Nothing is loaded from other companies.\n\n'
    'See [Terms of Use](terms.html) and [Privacy Policy](privacy.html).\n\nBudgie is not open source: see [LICENSE](LICENSE). Security problems: see [SECURITY.md](SECURITY.md).\n')
