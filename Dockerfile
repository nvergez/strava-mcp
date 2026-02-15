FROM node:24-slim AS build

WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN pnpm build

# --- Production image ---
FROM node:24-slim

WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=build /app/dist/ ./dist/

EXPOSE 3000

CMD ["node", "dist/index.js"]
