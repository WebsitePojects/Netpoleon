# syntax=docker/dockerfile:1
#
# One image for every process (api now, worker later); compose chooses the command.
# Build from the repository root:  docker build -f infra/docker/Dockerfile .

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

FROM manifests AS build
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN pnpm -r build

# Production dependencies are resolved separately so no compiler, test runner or linter
# reaches the runtime image.
FROM manifests AS prod-deps
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

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
