"""Pinned downloads: public assets at build time, gated base at bounded startup."""
import argparse
import json
import os
from pathlib import Path
from huggingface_hub import snapshot_download

MODELS = [
    ('meta-llama/Meta-Llama-3-8B-Instruct', '8afb486c1db24fe5011ec46dfbe5b5dccdb575c2', '/models/base-encoder'),
    ('nvidia/Kimodo-SOMA-RP-v1.1', '6c9233af1180b8151e3c4703477104af5dce9dd5', '/models/Kimodo-SOMA-RP-v1.1'),
    ('McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp', '31474e395ada192e8ed1586db6be79fb3b70c9c0', '/models/encoder'),
    ('McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp-supervised', 'baa8ebf04a1c2500e61288e7dad65e8ae42601a7', '/models/adapter'),
]
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--public-only', action='store_true')
    parser.add_argument('--base-only', action='store_true')
    args = parser.parse_args()
    # Use a BuildKit secret mount. Never use Docker ARG/ENV for credentials:
    # those can persist in image metadata or build history.
    secret = Path('/run/secrets/HF_TOKEN')
    token = secret.read_text().strip() if secret.exists() else os.environ.get('HF_TOKEN')
    if not args.public_only and not token:
        raise RuntimeError('HF_TOKEN with authorized Meta-Llama-3-8B-Instruct access is required')
    selected = MODELS[1:] if args.public_only else MODELS[:1] if args.base_only else MODELS
    for repo, revision, directory in selected:
        snapshot_download(repo_id=repo, revision=revision, local_dir=directory, token=token, ignore_patterns=['original/*', '*.pth'])
    # The public MNTP repository contains adapters, not the gated base weights.
    # Resolve that dependency locally so runtime never follows an unpinned HEAD.
    path = Path('/models/encoder/adapter_config.json')
    config = json.loads(path.read_text())
    config['base_model_name_or_path'] = '/models/base-encoder'
    config['revision'] = None
    path.write_text(json.dumps(config))
    if not args.public_only:
        Path('/models/base-encoder/.graphcore-ready').write_text(MODELS[0][1])
