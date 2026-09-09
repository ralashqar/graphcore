"""Refresh the manifest from pinned Git blobs, unaffected by checkout line endings."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest_path = root / 'workers/game/motionbricks/release.json'
manifest = json.loads(manifest_path.read_bytes())
checkout = Path(sys.argv[1]).resolve()
for name in manifest['files']:
    blob = subprocess.check_output(['git', '-C', str(checkout), 'show', manifest['sourceRevision'] + ':' + name])
    if blob.startswith(b'version https://git-lfs.github.com/spec/v1\n'):
        digest = re.search(rb'^oid sha256:([a-f0-9]{64})$', blob, re.M)
        size = re.search(rb'^size ([0-9]+)$', blob, re.M)
        if not digest or not size:
            raise ValueError('Invalid LFS pointer: ' + name)
        manifest['files'][name] = {'bytes': int(size[1]), 'sha256': digest[1].decode()}
    else:
        manifest['files'][name] = {'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()}
encoded = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
manifest_path.write_bytes(encoded)
print(hashlib.sha256(encoded).hexdigest())
