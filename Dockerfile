# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/corepack
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/rbac/package.json packages/rbac/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/validation/package.json packages/validation/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ARG SITE_URL=https://staging.mensahrentals.com
ARG SITE_INDEXING_ENABLED=false
ARG API_INTERNAL_URL=http://api:4000
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
ENV SITE_URL=$SITE_URL
ENV SITE_INDEXING_ENABLED=$SITE_INDEXING_ENABLED
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN pnpm build

FROM node:22-alpine AS web
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM node:22-alpine AS admin
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/admin/.next/static ./apps/admin/.next/static
USER nextjs
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]

FROM builder AS api-production-dependencies
RUN pnpm deploy --filter @mensah-rentals/api --prod --legacy /production/api \
    && deployed_client="$(readlink -f /production/api/node_modules/.pnpm/node_modules/@prisma/client)" \
    && deployed_modules="$(dirname "$(dirname "$deployed_client")")" \
    && generated_client="$(find /workspace/node_modules/.pnpm -path '*/node_modules/.prisma/client' -type d -print -quit)" \
    && test -n "$generated_client" \
    && mkdir -p "$deployed_modules/.prisma" \
    && cp -R "$generated_client" "$deployed_modules/.prisma/client"

FROM node:22-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nestjs \
    && mkdir -p /app/storage/media /app/.backup-status \
    && chown -R nestjs:nodejs /app/storage /app/.backup-status
COPY --from=api-production-dependencies --chown=nestjs:nodejs /production/api ./
USER nestjs
EXPOSE 4000
CMD ["node", "dist/main.js"]

FROM builder AS operator
ENV NODE_ENV=production
USER node
CMD ["pnpm", "--filter", "@mensah-rentals/database", "exec", "prisma", "migrate", "deploy", "--schema", "/workspace/packages/database/prisma/schema.prisma"]
