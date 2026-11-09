# 1 段目: Node 24 で依存を入れ、vite build で dist/ を作る。
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npx vite build

# 2 段目: nginx の公式イメージに dist/ と設定のひな形を入れる。
# /etc/nginx/templates/*.template は、起動時に環境変数（VIEWER_PORT、VIEWER_BRIDGE_PORT）を置き換えて conf.d/ に出る。
# タグだけでは中身が変わりうるので、配るイメージは digest で固定する（更新するときは docker buildx imagetools inspect nginx:1.29-alpine で確かめて書き換える）。
FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
