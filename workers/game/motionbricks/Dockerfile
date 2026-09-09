# syntax=docker/dockerfile:1.7
FROM python:3.11.11-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYNPUT_BACKEND=dummy HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 MPLBACKEND=Agg
RUN apt-get update && apt-get install -y --no-install-recommends git git-lfs ca-certificates libgomp1 build-essential linux-libc-dev && rm -rf /var/lib/apt/lists/*
COPY workers/game/motionbricks/requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r /app/requirements.lock
RUN GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/NVlabs/GR00T-WholeBodyControl.git /opt/upstream \
 && cd /opt/upstream && git checkout 087f9ac01d46f6d8e4d0b73c01ae64799f292a38 \
 && git lfs pull --include="motionbricks/out/**" --exclude="" \
 && pip install --no-deps /opt/upstream/motionbricks
COPY workers/game/motionbricks /app
RUN python /app/verify_release.py /opt/upstream
WORKDIR /opt/upstream/motionbricks
RUN python -m unittest discover -s /app -p test_handler.py && python -c "from motionbricks.motion_backbone.demo.utils import navigation_demo; print('Headless imports verified')"
CMD ["python", "/app/handler.py"]
