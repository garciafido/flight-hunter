FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY services/dashboard/package.json services/dashboard/
RUN pnpm install --frozen-lockfile

FROM base AS dev
WORKDIR /app
COPY --from=deps /app/ ./
COPY . .
CMD ["pnpm", "--filter", "@flight-hunter/dashboard", "dev"]

FROM base AS build
WORKDIR /app
COPY --from=deps /app/ ./
COPY . .
RUN pnpm --filter @flight-hunter/shared build && pnpm --filter @flight-hunter/dashboard build

FROM base AS production
WORKDIR /app
COPY --from=build /app/services/dashboard/.next/standalone ./
COPY --from=build /app/services/dashboard/.next/static ./services/dashboard/.next/static
COPY --from=build /app/services/dashboard/public ./services/dashboard/public
EXPOSE 3000
CMD ["node", "services/dashboard/server.js"]
