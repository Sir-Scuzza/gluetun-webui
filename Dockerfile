# ---- Build stage ----
FROM node:20-alpine AS deps
WORKDIR /app
# Copy lockfile alongside package.json for deterministic installs.
# Once package-lock.json is committed, change `npm install` to `npm ci`.
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---- Final stage ----
FROM node:20-alpine
WORKDIR /app

# Add non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/server.js"]
