FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY services/scraper/package.json services/scraper/
RUN pnpm install --frozen-lockfile

FROM base AS dev
WORKDIR /app
COPY --from=deps /app/ ./
COPY . .
CMD ["pnpm", "--filter", "@flight-hunter/scraper", "dev"]

FROM base AS build
WORKDIR /app
COPY --from=deps /app/ ./
COPY . .
RUN pnpm --filter @flight-hunter/shared build && pnpm --filter @flight-hunter/scraper build

FROM base AS production
WORKDIR /app
RUN npx playwright install --with-deps chromium
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/services/scraper/dist ./services/scraper/dist
COPY --from=build /app/services/scraper/package.json ./services/scraper/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/services/scraper/node_modules ./services/scraper/node_modules
COPY package.json pnpm-workspace.yaml ./
CMD ["node", "services/scraper/dist/index.js"]
