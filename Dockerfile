# ---- Build stage ----
FROM node:26-alpine@sha256:b9b5737eabd423ba73b21fe2e82332c0656d571daf1ebf19b0f89d0dd0d3ca93 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-fund

# ---- Final stage ----
FROM node:26-alpine@sha256:b9b5737eabd423ba73b21fe2e82332c0656d571daf1ebf19b0f89d0dd0d3ca93
WORKDIR /app
ENV NODE_ENV=production

# gcompat: glibc compat for speedtest binary (Alpine uses musl)
# speedtest: Ookla CLI for optional speed test feature
ARG SPEEDTEST_VERSION=1.2.0
RUN apk add --no-cache gcompat curl && \
    curl -fsSL -o /tmp/speedtest.tgz \
      "https://install.speedtest.net/app/cli/ookla-speedtest-${SPEEDTEST_VERSION}-linux-$(uname -m).tgz" && \
    tar -xzf /tmp/speedtest.tgz -C /usr/local/bin speedtest && \
    chmod +x /usr/local/bin/speedtest && \
    rm /tmp/speedtest.tgz && \
    apk del curl

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
