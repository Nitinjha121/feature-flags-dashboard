# One image for every Node service (api, worker, migrate, webhook-receiver, web, test tools).
# Dependencies are installed INSIDE the image so native binaries match Linux; the host's
# node_modules is never mounted (see docker-compose.yml).
FROM node:22-slim AS app
ENV CI=true
# pnpm itself has no install scripts; --ignore-scripts is just belt and braces.
RUN npm install -g pnpm@12.15.0 --ignore-scripts
WORKDIR /app

# Manifests first so the dependency layer is cached until a package.json or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/webhook-receiver/package.json apps/webhook-receiver/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile

# Fail the build now, not at runtime, if esbuild's native binary is missing or the wrong
# architecture (tsx transpiles through esbuild, so this exercises the real binary).
RUN cd apps/api && ./node_modules/.bin/tsx -e "console.log('esbuild native binary OK')"

COPY . .

# Playwright runner: the official image ships browsers matching @playwright/test 1.64.1.
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS e2e
ENV CI=true
RUN npm install -g pnpm@12.15.0 --ignore-scripts
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --filter @ff/e2e
COPY e2e e2e
WORKDIR /app/e2e
