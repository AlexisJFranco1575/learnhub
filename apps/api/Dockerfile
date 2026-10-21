# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Base: Node 24 (NestJS 12 is ESM-only and needs require(esm), Node 24.9+),
# pnpm and the system libraries Prisma needs (OpenSSL).
# ---------------------------------------------------------------------------
FROM node:24-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@12
WORKDIR /app

# ---------------------------------------------------------------------------
# Build: all dependencies, generate the Prisma client, compile TypeScript.
# ---------------------------------------------------------------------------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
COPY prisma.config.ts ./
# generate does not connect to the database; the URL is only a placeholder.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    pnpm prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build

# ---------------------------------------------------------------------------
# Runtime: production dependencies + compiled output only, non-root user.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    pnpm prisma generate

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]