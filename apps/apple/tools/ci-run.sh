#!/bin/bash
# For the build machine's checks: Budgie on an iPhone, an iPhone Duo and an iPad in the simulator, and on the Mac,
# signed out and then signed in to the test server (tools/ci-seed.js), with a screenshot of each and what the page
# reported (tools: -BudgieDiagnostics). Then checks the reports: the page loaded, from the app's own address, could
# use the camera and microphone for calls, reached the server, and had no errors.
#   apps/apple/tools/ci-run.sh <token> <out dir>
set -uo pipefail
TOKEN="$1"
OUT="$2"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP_IOS="$HERE/build/Build/Products/Debug-iphonesimulator/Budgie.app"
APP_MAC="$HERE/build/Build/Products/Debug/Budgie.app"
API="http://127.0.0.1:8799"
mkdir -p "$OUT"

RUNTIME=$(xcrun simctl list runtimes -j | python3 -c "
import json, sys
r = [x for x in json.load(sys.stdin)['runtimes'] if x.get('isAvailable') and x.get('platform') == 'iOS']
r.sort(key=lambda x: [int(p) for p in x['version'].split('.')])
print(r[-1]['identifier'] if r else '')")
echo "iOS runtime: $RUNTIME"

shoot() { # udid, name, phase
  sleep 16
  xcrun simctl io "$1" screenshot "$OUT/$2-$3.png" >/dev/null 2>&1
  local data
  data=$(xcrun simctl get_app_container "$1" com.budgiesocial.app data 2>/dev/null)
  [ -f "$data/Documents/budgie-diagnostics.json" ] && cp "$data/Documents/budgie-diagnostics.json" "$OUT/$2-$3.json"
}

for PATTERN in 'iPhone [0-9]+ Pro Max$' 'iPhone Duo' 'iPad Pro 13'; do
  read -r TYPE NAME < <(xcrun simctl list devicetypes -j | python3 -c "
import json, re, sys
t = [x for x in json.load(sys.stdin)['devicetypes'] if re.search(r'$PATTERN', x['name'])]
print(t[-1]['identifier'], t[-1]['name'].replace(' ', '-')) if t else print('', '')")
  if [ -z "$TYPE" ]; then echo "no simulator like '$PATTERN'"; continue; fi
  echo "== $NAME"
  UDID=$(xcrun simctl create "Budgie $NAME" "$TYPE" "$RUNTIME") || continue
  xcrun simctl boot "$UDID"
  xcrun simctl bootstatus "$UDID" -b >/dev/null
  xcrun simctl install "$UDID" "$APP_IOS"
  xcrun simctl launch "$UDID" com.budgiesocial.app -BudgieAPI "$API" -BudgieQuiet YES -BudgieDiagnostics 1 >/dev/null
  shoot "$UDID" "$NAME" welcome
  xcrun simctl terminate "$UDID" com.budgiesocial.app
  xcrun simctl launch "$UDID" com.budgiesocial.app -BudgieAPI "$API" -BudgieToken "$TOKEN" -BudgieQuiet YES -BudgieDiagnostics 1 >/dev/null
  shoot "$UDID" "$NAME" home
  xcrun simctl shutdown "$UDID"
done

echo "== Mac"
open -n "$APP_MAC" --args -BudgieAPI "$API" -BudgieToken "$TOKEN" -BudgieQuiet YES -BudgieDiagnostics "$OUT/Mac-home.json"
sleep 20
screencapture -x "$OUT/Mac-home.png" || echo "no screenshot of the Mac's screen"
osascript -e 'quit app "Budgie"' >/dev/null 2>&1 || pkill -x Budgie

# what the page said, on each
python3 - "$OUT" <<'EOF'
import glob, json, os, sys
problems = 0
reports = sorted(glob.glob(os.path.join(sys.argv[1], '*.json')))
if not reports:
    print('no reports'); sys.exit(1)
for path in reports:
    r = json.load(open(path))
    name = os.path.basename(path)[:-5]
    want = {
        'its own address': r.get('origin') == 'budgie://app',
        'calls can use the camera': r.get('secure') is True and r.get('media') is True,
        'no errors': not r.get('errors'),
    }
    if name.endswith('-home'):
        want['signed in, past the welcome page'] = r.get('signedIn') is True and r.get('gated') is False
    for what, good in want.items():
        print(('ok  ' if good else 'FAIL'), name, what)
        problems += not good
    print('    ', json.dumps({k: r.get(k) for k in ['title', 'hash', 'width', 'height', 'native']}))
sys.exit(1 if problems else 0)
EOF
