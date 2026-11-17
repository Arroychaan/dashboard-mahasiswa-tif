# syntax=docker/dockerfile:1.7

# ==============================================================================
# Stage 1: Install dependencies
# ==============================================================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat vips-dev
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ==============================================================================
# Stage 2: Build Next.js standalone production bundle
# ==============================================================================
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat vips-dev
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Do not bake runtime secrets into the image; skip env validation during build
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1
ENV NODE_ENV=production

RUN pnpm build

# ==============================================================================
# Stage 3: Minimal non-root production runner
# ==============================================================================
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat vips
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

# Ensure persistent lecturer photo directory exists and is writable by non-root user
RUN mkdir -p /app/public/uploads/lecturers && \
    chown -R nextjs:nodejs /app/public/uploads

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]

