FROM denoland/deno:alpine

WORKDIR /app

COPY . .

RUN deno cache --node-modules-dir=auto workers/world-generation/main.ts

CMD ["deno", "run", "--allow-env", "--allow-net", "--allow-read", "--node-modules-dir=auto", "workers/world-generation/main.ts"]
