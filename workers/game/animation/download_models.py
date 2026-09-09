"""Build-time only downloads. Runtime is offline and never follows model HEAD."""
from huggingface_hub import snapshot_download

MODELS = [
    ('nvidia/Kimodo-SOMA-RP-v1.1', '6c9233af1180b8151e3c4703477104af5dce9dd5', '/models/Kimodo-SOMA-RP-v1.1'),
    ('McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp', '31474e395ada192e8ed1586db6be79fb3b70c9c0', '/models/encoder'),
    ('McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp-supervised', 'baa8ebf04a1c2500e61288e7dad65e8ae42601a7', '/models/adapter'),
]
if __name__ == '__main__':
    for repo, revision, directory in MODELS:
        snapshot_download(repo_id=repo, revision=revision, local_dir=directory)
