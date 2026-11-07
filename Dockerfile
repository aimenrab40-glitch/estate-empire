# Estate Empire — production Dockerfile (Render / any Docker host)
# Two processes on ONE origin: Express serves the built React client + REST +
# Socket.IO. Requires DATABASE_URL (Neon). Production refuses to start without
# a reachable PostgreSQL — no silent memory fallback.

# ---------------- build stage ----------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci

COPY . .
RUN npm run build

# ---------------- run stage ----------------
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV REQUIRE_DB=1
# Hosts inject PORT (Render 10000, HF Spaces 7860); fall back to Spaces' 7860.
ENV PORT=7860
ENV EMBEDDED_PG=0

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 7860
CMD ["node", "server/dist/server/src/index.js"]
