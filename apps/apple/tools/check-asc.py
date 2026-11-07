# Checks App Store Connect's key before a build uses it, and says in words what's wrong with it (Xcode only says
# "401"). Never prints the secrets: only what's wrong with them.
#   ASC_KEY_ID=… ASC_ISSUER_ID=… APPLE_TEAM_ID=… python3 check-asc.py <the key, cleaned by clean-p8.py>
import base64, json, os, re, subprocess, sys, time, urllib.error, urllib.request

BUNDLE = 'com.budgiesocial.app'
# without what pasting can add around them (spaces, line breaks, invisible characters, quotes, a full stop)
raw = {k: os.environ.get(k, '') for k in ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'APPLE_TEAM_ID']}
key_id = re.sub(r'[^A-Za-z0-9]', '', raw['ASC_KEY_ID']).upper()
issuer = re.sub(r'[^0-9A-Fa-f-]', '', raw['ASC_ISSUER_ID'])
team = re.sub(r'[^A-Za-z0-9]', '', raw['APPLE_TEAM_ID']).upper()
for name, clean in [('ASC_KEY_ID', key_id), ('ASC_ISSUER_ID', issuer), ('APPLE_TEAM_ID', team)]:
    extra = len(raw[name]) - len(clean)
    if extra:
        print(f'{name}: left out {extra} character{"s" if extra > 1 else ""} that can\'t be part of it (spaces, invisible ones, punctuation)')
problems = []
if not re.fullmatch(r'[A-Z0-9]{10}', key_id):
    problems.append(f'ASC_KEY_ID should be the key\'s Key ID: 10 capital letters and digits (it has {len(key_id)} characters).')
if not re.fullmatch(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', issuer):
    problems.append(f'ASC_ISSUER_ID should be the Issuer ID shown above the list of Team Keys, 36 characters with dashes like 57246542-96fe-1a63-e053-0824d011072a (it has {len(issuer)} characters).')
if not re.fullmatch(r'[A-Z0-9]{10}', team):
    problems.append(f'APPLE_TEAM_ID should be the Team ID: 10 capital letters and digits (it has {len(team)} characters).')
if key_id and key_id == team:
    problems.append('ASC_KEY_ID is the same as APPLE_TEAM_ID: it should be the Key ID of the key made for GitHub.')
if problems:
    for p in problems:
        print('::error::' + p)
    sys.exit(1)


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def der_to_raw(der):
    # an ECDSA signature from openssl (DER: two integers) as JWT wants it: r and s, 32 bytes each
    i = 2 if der[1] < 0x80 else 3
    out = b''
    for _ in range(2):
        assert der[i] == 0x02
        n = der[i + 1]
        out += der[i + 2:i + 2 + n].lstrip(b'\0').rjust(32, b'\0')
        i += 2 + n
    return out


def token(claims):
    now = int(time.time())
    head = b64(json.dumps({'alg': 'ES256', 'kid': key_id, 'typ': 'JWT'}).encode())
    body = b64(json.dumps(dict(claims, iat=now, exp=now + 600, aud='appstoreconnect-v1')).encode())
    signed = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', sys.argv[1]], input=f'{head}.{body}'.encode(), capture_output=True)
    if signed.returncode:
        print('::error::The ASC_KEY_P8 secret isn\'t a key that can sign. Paste all of the .p8 file\'s text again.')
        sys.exit(1)
    return f'{head}.{body}.{b64(der_to_raw(signed.stdout))}'


url = f'https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]={BUNDLE}&limit=1'


def works(claims):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token(claims)}), timeout=30):
            return True
    except urllib.error.HTTPError:
        return False


req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token({'iss': issuer})})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        apps = json.load(r).get('data', [])
except urllib.error.HTTPError as e:
    try:
        err = (json.load(e).get('errors') or [{}])[0]
    except Exception:
        err = {}
    said = ' '.join(x for x in [err.get('code'), err.get('title')] if x)
    if e.code == 401 and works({'sub': 'user'}):
        print('::error::That key is an Individual Key, which can\'t make the signing certificates. In App Store Connect → Users and Access → '
              'Integrations → App Store Connect API, open Team Keys (not Individual Keys), make a key with Admin access, and put its Key ID '
              'and its file in ASC_KEY_ID and ASC_KEY_P8 (and the Issuer ID shown above Team Keys in ASC_ISSUER_ID).')
    elif e.code == 401:
        print('::error::Apple didn\'t accept the key (' + said + '). ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 have to be the same key\'s: '
              'one made in App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys '
              '(not Individual Keys, and not the notifications key from developer.apple.com), its Key ID, and the Issuer ID above that list.')
    elif e.code == 403:
        print('::error::Apple accepted the key, but it isn\'t allowed to do this (' + said + '). Make a Team Key with Admin access.')
    else:
        print(f'::error::App Store Connect answered {e.code} ({said}).')
    sys.exit(1)
if not apps:
    print(f'::error::The key works, but there\'s no app with the bundle id {BUNDLE} in App Store Connect yet (Apps → + → New App).')
    sys.exit(1)
print(f'App Store Connect accepts the key, and has the app ({BUNDLE}).')
