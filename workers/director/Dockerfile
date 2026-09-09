FROM denoland/deno:2.9.6
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN deno cache --config workers/director/deno.json --node-modules-dir=auto workers/director/main.ts
ENTRYPOINT ["deno", "run", "--config", "workers/director/deno.json", "--allow-env", "--allow-net", "--allow-read", "--allow-write", "--allow-sys", "--allow-run=ffmpeg,ffprobe", "--node-modules-dir=auto", "workers/director/main.ts"]
CMD ["orchestration"]
