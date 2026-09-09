"""Verify every model, normalization and skeleton artifact before deserialization."""
import hashlib
import json
from pathlib import Path

def verify(root, manifest_path):
    manifest_bytes = Path(manifest_path).read_bytes()
    manifest = json.loads(manifest_bytes)
    for name, expected in manifest['files'].items():
        path = Path(root) / name
        if path.stat().st_size != expected['bytes']:
            raise ValueError('Pinned artifact size mismatch: ' + name)
        digest = hashlib.sha256()
        with path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''): digest.update(chunk)
        if digest.hexdigest() != expected['sha256']:
            raise ValueError('Pinned artifact hash mismatch: ' + name)
    return hashlib.sha256(manifest_bytes).hexdigest(), manifest

if __name__ == '__main__':
    import sys
    digest, _ = verify(sys.argv[1], Path(__file__).with_name('release.json'))
    print('Verified MotionBricks manifest ' + digest)
