"""Write the fingerprints of a page's inline <script>s into its Content-Security-Policy.

Usage: python3 nook/tools/csp.py <page.html>...
The policy allows only those scripts (and, through 'strict-dynamic', what they load), so this runs
after any change to them; the site build runs it on every page it writes.
"""
import base64, hashlib, re, sys


def rehash(html):
    scripts = re.findall(r'<script>(.*?)</script>', html, re.S)
    hashes = ' '.join("'sha256-%s'" % base64.b64encode(hashlib.sha256(s.encode('utf-8')).digest()).decode() for s in scripts)
    return re.sub(r"('strict-dynamic') (?:'sha256-[^']*' ?)+", lambda m: m.group(1) + ' ' + hashes + ' ', html, count=1)


if __name__ == '__main__':
    for path in sys.argv[1:]:
        text = open(path, encoding='utf-8').read()
        open(path, 'w', encoding='utf-8').write(rehash(text))
        print('fingerprinted', path)
