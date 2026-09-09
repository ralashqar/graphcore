# syntax=docker/dockerfile:1.7
FROM python:3.12.10-slim-bookworm
ENV PYTHONUNBUFFERED=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 CHECKPOINT_DIR=/models TEXT_ENCODER_MODE=local
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates libgomp1 build-essential cmake libeigen3-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY workers/game/animation/requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r requirements.lock
RUN git clone https://github.com/nv-tlabs/kimodo.git /opt/kimodo && cd /opt/kimodo && git checkout 1aece8c124d73d255ceff5086d983b844c9f4e94 && pip install --no-deps .
COPY workers/game/animation /app
RUN HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 python download_models.py --public-only
RUN python -c "import kimodo, motion_correction, jsonschema, runpod; print('Worker imports verified')"
CMD ["python", "handler.py"]
