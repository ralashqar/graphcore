FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY game-runtime ./game-runtime
COPY vite.game.config.ts ./
ARG VITE_GAME_RELEASE_URL
ENV VITE_GAME_RELEASE_URL=$VITE_GAME_RELEASE_URL
RUN npx vite build --config vite.game.config.ts
FROM nginx:1.28-alpine
COPY --from=build /app/dist-game /usr/share/nginx/html
COPY workers/game/nginx.conf /etc/nginx/conf.d/default.conf
