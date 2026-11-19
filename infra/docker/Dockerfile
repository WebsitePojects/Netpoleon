# syntax=docker/dockerfile:1
#
# Two images from one build:
#   --target runtime  the API, the worker and the CLIs (compose chooses the command)
#   --target web      the console's static files behind an unprivileged nginx
# Build from the repository root:  docker build -f infra/docker/Dockerfile --target runtime .

FROM node:24-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Manifests only, so the dependency layers below are rebuilt when dependencies change
# and not on every source edit. Add a line here when a workspace package is added.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM manifests AS build
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN pnpm -r build

# Production dependencies of the API and the packages it uses, and nothing else: no
# compiler, test runner, linter or browser library reaches the runtime image.
FROM manifests AS prod-deps
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@wms/api..."

FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app /app
COPY --from=build /app/packages/config/dist packages/config/dist
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY packages/db/migrations packages/db/migrations
USER node
CMD ["node", "apps/api/dist/server.js"]
