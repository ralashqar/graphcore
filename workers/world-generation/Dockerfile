FROM denoland/deno:alpine

WORKDIR /app

RUN apk add --no-cache \
  chromium \
  font-noto \
  fontconfig \
  ttf-dejavu \
  libstdc++

ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY . .

RUN deno cache --allow-scripts=npm:sharp --node-modules-dir=auto workers/world-generation/main.ts

CMD ["deno", "run", "--allow-env", "--allow-net", "--allow-read", "--allow-write", "--allow-ffi", "--allow-sys", "--allow-run", "--node-modules-dir=auto", "workers/world-generation/main.ts"]
