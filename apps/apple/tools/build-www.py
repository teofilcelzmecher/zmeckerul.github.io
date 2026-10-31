"""Build the screens of Budgie's app for iPhone, iPad and Mac (apps/apple/www) from the website's source.

Usage: python3 apps/apple/tools/build-www.py
The app is Budgie's own pages, built the same way as the website (nook/tools/build-site.py), and then:
  - without the server, robots.txt, sitemap.xml and other files that are only for the website;
  - with no ads (the App Store's rules for ads are not the website's, and Budgie's apps have none);
  - with the Apple layer, native/native.js and native.css: haptics, notifications, the share sheet, windows, menus,
    Handoff and iPhone Duo's fold. It's loaded only here, so the website itself never changes for the app.
The Xcode project (project.yml) copies www into the app as it is; the app serves it at budgie://app/.
"""
import os, re, shutil, subprocess, sys, tempfile
sys.dont_write_bytecode = True

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)  # apps/apple
REPO = os.path.dirname(os.path.dirname(APP))  # the source repository
WWW = os.path.join(APP, 'www')
sys.path.insert(0, os.path.join(REPO, 'nook', 'tools'))
from csp import rehash

with tempfile.TemporaryDirectory() as site:
    subprocess.run([sys.executable, os.path.join(REPO, 'nook', 'tools', 'build-site.py'), REPO, site], check=True)
    shutil.rmtree(WWW, ignore_errors=True)
    # only what the app shows: the pages and what they load
    keep = ['index.html', 'terms.html', 'privacy.html', 'licenses.html', '404.html', 'app.css', 'legal.css', 'og.png', 'LICENSE', 'js', 'm3', 'fonts']
    os.makedirs(WWW)
    for name in keep:
        src = os.path.join(site, name)
        (shutil.copytree if os.path.isdir(src) else shutil.copy)(src, os.path.join(WWW, name))

# no ads in the app
config = os.path.join(WWW, 'js', 'config.js')
text = open(config).read()
text, n = re.subn(r"client: '[^']*'", "client: ''", text)
assert n == 1, 'js/config.js: no ads.client to switch off'
open(config, 'w').write(text)

# the Apple layer, loaded right after the config, before anything else of the app's
shutil.copy(os.path.join(APP, 'native', 'native.css'), os.path.join(WWW, 'native.css'))
shutil.copy(os.path.join(APP, 'native', 'native.js'), os.path.join(WWW, 'js', 'native.js'))
index = os.path.join(WWW, 'index.html')
html = open(index).read()
html, n = re.subn(r"'js/config\.js',", "'js/config.js','js/native.js',", html)
assert n == 1, 'index.html: the loader no longer lists js/config.js'
html, n = re.subn(r'(<link rel="stylesheet" href="app\.css">)', r'\1\n  <link rel="stylesheet" href="native.css">', html)
assert n == 1, 'index.html: no app.css link'
# the page knows it's in the app from its first script, before anything is drawn
html, n = re.subn(r"<script>var h=document\.documentElement;", "<script>var h=document.documentElement;h.classList.add('app','app-apple');", html)
assert n == 1, 'index.html: the first script changed'
open(index, 'w').write(rehash(html))
print('built', WWW)
