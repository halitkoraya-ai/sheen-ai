# Build stage — install dev + prod deps and compile TypeScript with npm.
# We previously used bun here, but switching to npm keeps the local
# toolchain (Windows machine without bun) consistent with the deploy
# pipeline.
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production image — slim Node-only runtime for Cloud Run.
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
