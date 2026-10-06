# Biocatalyst India — web app container (Google Cloud Run)
#
# Multi-stage build for the pnpm/Turborepo monorepo. Builds @biocatalyst/web
# with `next build` and serves it with `next start`.
#
# Build (needs the repo root as context):
#   docker build -f apps/web/Dockerfile -t biocatalyst-web .
#
# Or without local Docker, via Cloud Build (see docs/deployment-cloud-run.md):
#   gcloud builds submit --tag <region>-docker.pkg.dev/<project>/<repo>/web .
#
# Runtime env (set on the Cloud Run service, never baked into the image):
#   DATABASE_URL   Postgres connection string (Supabase/Neon free tier)
#   ADMIN_TOKEN    long random secret gating /api/v1/admin/* write endpoints
# Cloud Run injects PORT; the container listens on ${PORT:-8080}.

# ---------------------------------------------------------------- deps ---
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
WORKDIR /repo

# Copy workspace manifests first for a cache-friendly dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/data/package.json packages/data/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/extraction/package.json packages/extraction/package.json
COPY packages/ingestion/package.json packages/ingestion/package.json
COPY packages/market-data/package.json packages/market-data/package.json
COPY packages/notifications/package.json packages/notifications/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile

# -------------------------------------------------------------- builder ---
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# Build only the web app (workspace libs are transpiled via transpilePackages).
RUN pnpm --filter @biocatalyst/web build

# --------------------------------------------------------------- runner ---
FROM node:20-alpine AS runner
WORKDIR /app

# Run as non-root.
RUN addgroup -S app && adduser -S app -G app

# Copy the built app and its (workspace-linked) dependencies.
COPY --from=builder --chown=app:app /repo/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=app:app /repo/apps/web/public ./apps/web/public
COPY --from=builder --chown=app:app /repo/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=app:app /repo/apps/web/next.config.mjs ./apps/web/next.config.mjs
COPY --from=builder --chown=app:app /repo/node_modules ./node_modules
COPY --from=builder --chown=app:app /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder --chown=app:app /repo/packages ./packages

USER app
WORKDIR /app/apps/web
EXPOSE 8080

# next start honours $PORT only via the -p flag, so expand it in a shell.
CMD ["sh", "-c", "node node_modules/next/dist/bin/next start -p ${PORT:-8080}"]
