# ForgeAI application image (Next.js server + workflow controller).
# The controller launches sandbox containers through the host Docker daemon; mount the socket
# only if you accept that the ForgeAI container can start containers (see docs/SECURITY.md).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/copy-monaco.mjs scripts/copy-monaco.mjs
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/copy-monaco.mjs && npm run build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git docker.io ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
