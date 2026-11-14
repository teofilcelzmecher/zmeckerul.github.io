# The App Store Connect key from the secret, as a clean .p8 whatever pasting did to it (on a phone, its lines are often
# joined, its dashes turned into long ones, or spaces added): its own letters between BEGIN and END, wrapped again.
#   ASC_KEY_P8=... python3 clean-p8.py <out file>
import os, re, sys, textwrap
raw = os.environ.get('ASC_KEY_P8', '')
m = re.search(r'BEGIN\s*PRIVATE\s*KEY(.*?)END\s*PRIVATE\s*KEY', raw, re.S | re.I)
body = re.sub(r'[^A-Za-z0-9+/=]', '', m.group(1) if m else raw)
pem = '-----BEGIN PRIVATE KEY-----\n' + '\n'.join(textwrap.wrap(body, 64)) + '\n-----END PRIVATE KEY-----\n'
fd = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, pem.encode())
os.close(fd)
# how much of it there is says what went wrong (an App Store Connect key has about 184 letters); never the key itself
print(f'key: {len(body)} letters' + ('' if m else ', no BEGIN/END PRIVATE KEY lines found'))
