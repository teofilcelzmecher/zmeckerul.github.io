#!/usr/bin/env python3
# Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
"""
Budgie in the Arch User Repository (AUR), as budgie-social-bin: the PKGBUILD that installs a release's .deb (its
files, launcher and icons, unchanged), and the .SRCINFO the AUR reads, with each download's checksum.

  python3 apps/desktop/tools/aur.py <version> <amd64.deb> <arm64.deb> <LICENSE> <out dir>

The desktop app's release workflow runs it and attaches both files to the release; apps/desktop/README.md says how
to put them on the AUR (once), after which Arch people install Budgie with `yay -S budgie-social-bin`.
"""
import hashlib
import pathlib
import sys

REPO = 'teofilcelzmecher/zmeckerul.github.io'
DEPENDS = ['gtk3', 'nss', 'alsa-lib', 'libxss', 'libxtst', 'libnotify', 'at-spi2-core', 'util-linux-libs', 'libsecret', 'xdg-utils']


def sha(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def main():
    version, deb_x64, deb_arm, license_file, out = sys.argv[1:6]
    out = pathlib.Path(out)
    out.mkdir(parents=True, exist_ok=True)
    base = f'https://github.com/{REPO}/releases/download/desktop-v{version}'
    lic = f'https://raw.githubusercontent.com/{REPO}/desktop-v{version}/apps/desktop/LICENSE'
    sums = {'x86_64': sha(deb_x64), 'aarch64': sha(deb_arm), 'license': sha(license_file)}
    quote = lambda xs: ' '.join(f"'{x}'" for x in xs)
    pkgbuild = f"""# Maintainer: teofilcelzmecher <217388809+teofilcelzmecher@users.noreply.github.com>
# Budgie for Linux: small, friendly communities, chats and calls (budgiesocial.com). Made from the release's .deb.
pkgname=budgie-social-bin
pkgver={version}
pkgrel=1
pkgdesc='Budgie: small, friendly communities, chats and calls (budgiesocial.com)'
arch=('x86_64' 'aarch64')
url='https://budgiesocial.com'
license=('LicenseRef-Budgie')
depends=({quote(DEPENDS)})
provides=('budgie-social')
conflicts=('budgie-social')
options=('!strip' '!debug')
source=("LICENSE-$pkgver::{lic.replace(version, '$pkgver')}")
source_x86_64=("budgie-social-$pkgver-amd64.deb::{base.replace(version, '$pkgver')}/budgie-social-amd64.deb")
source_aarch64=("budgie-social-$pkgver-arm64.deb::{base.replace(version, '$pkgver')}/budgie-social-arm64.deb")
noextract=("${{source_x86_64[0]%%::*}}" "${{source_aarch64[0]%%::*}}")
sha256sums=('{sums['license']}')
sha256sums_x86_64=('{sums['x86_64']}')
sha256sums_aarch64=('{sums['aarch64']}')

package() {{
  local deb="budgie-social-$pkgver-amd64.deb"
  [[ $CARCH == aarch64 ]] && deb="budgie-social-$pkgver-arm64.deb"
  # a .deb holds its files in data.tar.*: the app in /opt/Budgie, its launcher and its icons
  bsdtar -xOf "$deb" 'data.tar.*' | bsdtar -xf - -C "$pkgdir"
  install -d "$pkgdir/usr/bin"
  ln -s /opt/Budgie/budgie-social "$pkgdir/usr/bin/budgie-social"
  # Arch's kernels have user namespaces, so Chromium's sandbox needs no setuid helper
  chmod 0755 "$pkgdir/opt/Budgie/chrome-sandbox"
  install -Dm644 "LICENSE-$pkgver" "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}}
"""
    srcinfo = f"""pkgbase = budgie-social-bin
\tpkgdesc = Budgie: small, friendly communities, chats and calls (budgiesocial.com)
\tpkgver = {version}
\tpkgrel = 1
\turl = https://budgiesocial.com
\tarch = x86_64
\tarch = aarch64
\tlicense = LicenseRef-Budgie
""" + ''.join(f'\tdepends = {d}\n' for d in DEPENDS) + f"""\tprovides = budgie-social
\tconflicts = budgie-social
\toptions = !strip
\toptions = !debug
\tsource = LICENSE-{version}::{lic}
\tsha256sums = {sums['license']}
\tnoextract = budgie-social-{version}-amd64.deb
\tnoextract = budgie-social-{version}-arm64.deb
\tsource_x86_64 = budgie-social-{version}-amd64.deb::{base}/budgie-social-amd64.deb
\tsha256sums_x86_64 = {sums['x86_64']}
\tsource_aarch64 = budgie-social-{version}-arm64.deb::{base}/budgie-social-arm64.deb
\tsha256sums_aarch64 = {sums['aarch64']}

pkgname = budgie-social-bin
"""
    (out / 'PKGBUILD').write_text(pkgbuild)
    (out / '.SRCINFO').write_text(srcinfo)
    print('PKGBUILD and .SRCINFO for', version)


if __name__ == '__main__':
    main()
