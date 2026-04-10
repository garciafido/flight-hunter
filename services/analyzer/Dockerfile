FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY services/analyzer/package.json services/analyzer/
RUN pnpm install --frozen-lockfile

FROM base AS dev
WORKDIR /app
COPY --from=deps /app/ ./
COPY . .
CMD ["pnpm", "--filter", "@flight-hunter/analyzer", "dev"]

FROM base AS build
WORKDIR /app
COPY --from=deps /app/ ./
COPY . .
RUN pnpm --filter @flight-hunter/shared build && pnpm --filter @flight-hunter/analyzer build

FROM base AS production
WORKDIR /app
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/services/analyzer/dist ./services/analyzer/dist
COPY --from=build /app/services/analyzer/package.json ./services/analyzer/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/services/analyzer/node_modules ./services/analyzer/node_modules
COPY package.json pnpm-workspace.yaml ./
CMD ["node", "services/analyzer/dist/index.js"]
