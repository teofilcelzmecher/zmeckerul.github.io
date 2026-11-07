# App Store signing for the build machine, through App Store Connect's key: no Mac of your own and no registered
# devices needed (Xcode's automatic signing wants a development profile first, which needs a registered device).
#
#   asc-sign.py setup <dir>     makes an Apple Distribution and a Mac Installer Distribution certificate (fresh keys,
#                               made here), and App Store profiles for iPhone/iPad and Mac with them. Writes
#                               <dir>/dist.p12, <dir>/installer.p12, the profiles, and <dir>/env (names for the build)
#   asc-sign.py cleanup <dir>   revokes those certificates and deletes those profiles (what's already uploaded isn't
#                               affected: Apple signs what it sends out itself)
#
# Needs ASC_KEY_ID, ASC_ISSUER_ID and AuthKey.p8 (cleaned by clean-p8.py) at $ASC_KEY_PATH.
import base64, json, os, re, subprocess, sys, time, urllib.error, urllib.request

API = 'https://api.appstoreconnect.apple.com/v1'
BUNDLE = 'com.budgiesocial.app'
KEY_ID = re.sub(r'[^A-Za-z0-9]', '', os.environ['ASC_KEY_ID']).upper()
ISSUER = re.sub(r'[^0-9A-Fa-f-]', '', os.environ['ASC_ISSUER_ID'])
KEY = os.environ['ASC_KEY_PATH']
P12_PASS = 'budgie-ci'


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def der_to_raw(der):
    i = 2 if der[1] < 0x80 else 3
    out = b''
    for _ in range(2):
        n = der[i + 1]
        out += der[i + 2:i + 2 + n].lstrip(b'\0').rjust(32, b'\0')
        i += 2 + n
    return out


def token():
    now = int(time.time())
    head = b64(json.dumps({'alg': 'ES256', 'kid': KEY_ID, 'typ': 'JWT'}).encode())
    body = b64(json.dumps({'iss': ISSUER, 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'}).encode())
    sig = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', KEY], input=f'{head}.{body}'.encode(), capture_output=True, check=True).stdout
    return f'{head}.{body}.{b64(der_to_raw(sig))}'


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read()
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        try:
            errs = json.load(e).get('errors') or []
        except Exception:
            errs = []
        said = '; '.join(' '.join(x for x in [err.get('title'), err.get('detail')] if x) for err in errs)
        raise SystemExit(f'::error::App Store Connect said {e.code} to {method} {path.split("?")[0]}: {said}')


def run(*cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def setup(d):
    os.makedirs(d, exist_ok=True)
    state = {'certificates': [], 'profiles': []}
    save = lambda: json.dump(state, open(os.path.join(d, 'state.json'), 'w'))
    bundles = call('GET', f'/bundleIds?filter[identifier]={BUNDLE}&limit=20')['data']
    bundle = next((b for b in bundles if b['attributes']['identifier'] == BUNDLE), None)
    if not bundle:
        raise SystemExit(f'::error::There\'s no App ID {BUNDLE} on developer.apple.com (Certificates, Identifiers & Profiles → Identifiers).')
    names = {}
    for kind, file in [('DISTRIBUTION', 'dist'), ('MAC_INSTALLER_DISTRIBUTION', 'installer')]:
        keyfile, csr = os.path.join(d, file + '.key'), os.path.join(d, file + '.csr')
        run('openssl', 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyfile, '-subj', '/CN=Budgie build', '-out', csr)
        cert = call('POST', '/certificates', {'data': {'type': 'certificates', 'attributes': {'certificateType': kind, 'csrContent': open(csr).read()}}})['data']
        state['certificates'].append(cert['id'])
        save()
        der = os.path.join(d, file + '.cer')
        open(der, 'wb').write(base64.b64decode(cert['attributes']['certificateContent']))
        pem = os.path.join(d, file + '.pem')
        run('openssl', 'x509', '-inform', 'DER', '-in', der, '-out', pem)
        subject = run('openssl', 'x509', '-in', pem, '-noout', '-subject', '-nameopt', 'multiline').stdout.decode()
        names[file] = re.search(r'commonName\s*=\s*(.+)', subject).group(1).strip()
        # macOS's own openssl, whose .p12 the keychain can read
        run('/usr/bin/openssl', 'pkcs12', '-export', '-inkey', keyfile, '-in', pem, '-out', os.path.join(d, file + '.p12'), '-passout', 'pass:' + P12_PASS)
        os.remove(keyfile)
    dist_id = state['certificates'][0]
    run_id = os.environ.get('GITHUB_RUN_ID', str(int(time.time())))
    profiles = {}
    for kind, platform in [('IOS_APP_STORE', 'ios'), ('MAC_APP_STORE', 'mac')]:
        name = f'Budgie {platform} build {run_id}'
        p = call('POST', '/profiles', {'data': {'type': 'profiles', 'attributes': {'name': name, 'profileType': kind},
                                                'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bundle['id']}},
                                                                  'certificates': {'data': [{'type': 'certificates', 'id': dist_id}]}}}})['data']
        state['profiles'].append(p['id'])
        save()
        ext = 'mobileprovision' if platform == 'ios' else 'provisionprofile'
        content = base64.b64decode(p['attributes']['profileContent'])
        for folder in ['~/Library/Developer/Xcode/UserData/Provisioning Profiles', '~/Library/MobileDevice/Provisioning Profiles']:
            folder = os.path.expanduser(folder)
            os.makedirs(folder, exist_ok=True)
            open(os.path.join(folder, f'{p["attributes"]["uuid"]}.{ext}'), 'wb').write(content)
        profiles[platform] = name
    with open(os.path.join(d, 'env'), 'w') as f:
        f.write(f'SIGN_DIST={names["dist"]}\nSIGN_INSTALLER={names["installer"]}\n'
                f'PROFILE_IOS={profiles["ios"]}\nPROFILE_MAC={profiles["mac"]}\nP12_PASS={P12_PASS}\n')
    # (their names hold the account's legal name, which the build's public log never shows)
    print('Made an Apple Distribution and a Mac Installer Distribution certificate, and App Store profiles for iPhone/iPad and Mac.')


def cleanup(d):
    try:
        state = json.load(open(os.path.join(d, 'state.json')))
    except Exception:
        return print('Nothing to clean up.')
    for pid in state['profiles']:
        call('DELETE', f'/profiles/{pid}')
    for cid in state['certificates']:
        call('DELETE', f'/certificates/{cid}')
    print(f'Removed {len(state["profiles"])} profiles and revoked {len(state["certificates"])} certificates made for this build.')


if __name__ == '__main__':
    {'setup': setup, 'cleanup': cleanup}[sys.argv[1]](sys.argv[2])
