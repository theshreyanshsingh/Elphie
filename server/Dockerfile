# syntax=docker/dockerfile:1

FROM node:22-slim AS deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY docs/api-reference/openapi.json ./docs/api-reference/openapi.json
COPY api/pyproject.toml ./api/pyproject.toml
WORKDIR /app/server
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/docs/api-reference/openapi.json ./docs/api-reference/openapi.json
COPY --from=builder /app/api/pyproject.toml ./api/pyproject.toml
WORKDIR /app/server
EXPOSE 8000
CMD ["node", "dist/src/server.js"]
