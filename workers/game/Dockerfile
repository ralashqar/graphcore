FROM denoland/deno:bin-2.5.6 AS deno
FROM mcr.microsoft.com/playwright:v1.63.0-noble
COPY --from=deno /deno /usr/local/bin/deno
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl xz-utils libxrender1 libxi6 libxfixes3 libxkbcommon0 libsm6 libgl1 && rm -rf /var/lib/apt/lists/*
RUN curl --fail --location https://download.blender.org/release/Blender5.0/blender-5.0.1-linux-x64.tar.xz -o /tmp/blender.tar.xz \
 && mkdir /opt/blender && tar -xf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 \
 && ln -s /opt/blender/blender /usr/local/bin/blender && rm /tmp/blender.tar.xz
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY supabase/functions/_shared ./supabase/functions/_shared
COPY workers/game ./workers/game
COPY scripts/game-browser-acceptance.mjs scripts/game-module-browser.mjs scripts/game-interaction-browser.mjs scripts/game-unified-browser.mjs scripts/game-validate-glb.mjs ./scripts/
COPY game-runtime ./game-runtime
COPY vite.game.config.ts ./
RUN npx vite build --config vite.game.config.ts
RUN deno cache --node-modules-dir=auto --config workers/game/deno.json workers/game/main.ts
ENV GAME_WORKER_KIND=build
CMD ["deno","run","--allow-env","--allow-net","--allow-read","--allow-write","--allow-run=node,blender","--allow-sys","--config","workers/game/deno.json","--node-modules-dir=auto","workers/game/main.ts"]
