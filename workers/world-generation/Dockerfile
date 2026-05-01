FROM denoland/deno:alpine

WORKDIR /app

RUN apk add --no-cache libstdc++

COPY . .

RUN deno cache --allow-scripts=npm:sharp --node-modules-dir=auto workers/world-generation/main.ts

CMD ["deno", "run", "--allow-env", "--allow-net", "--allow-read", "--allow-write", "--allow-ffi", "--allow-sys", "--node-modules-dir=auto", "workers/world-generation/main.ts"]
