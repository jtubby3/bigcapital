"""Fail CI on tracked private environment files or high-confidence credential patterns."""
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
patterns = {
    'private key': r'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----',
    'GitHub token': r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})',
    'AWS access key': r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'Stripe live key': r'\b[rs]k_live_[A-Za-z0-9]{15,}',
    'Telegram bot token': r'\b\d{7,12}:[A-Za-z0-9_-]{30,}\b',
}
hits = []
paths = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z']).decode().split('\0')
for name in filter(None, paths):
    path = root / name
    if path.name == '.env' or path.suffix in ('.key', '.p12', '.pfx'):
        hits.append((name, 1, 'private deployment file'))
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 2_000_000:
        continue
    try:
        text = path.read_text()
    except UnicodeError:
        continue
    for kind, expression in patterns.items():
        for match in re.finditer(expression, text):
            hits.append((name, text.count('\n', 0, match.start()) + 1, kind))
for name, line, kind in hits:
    print(f'{name}:{line}: {kind} detected; value withheld')
if hits:
    raise SystemExit(1)
print('Tracked source credential checks passed. Manual review is still required for business data.')
