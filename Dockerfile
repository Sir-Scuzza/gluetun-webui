# ---- Build stage ----
FROM node:25-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-fund

# ---- Final stage ----
FROM node:25-alpine
WORKDIR /app
ENV NODE_ENV=production

# Add non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package-lock.json ./
COPY package.json ./
COPY src/ ./src/

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/server.js"]
