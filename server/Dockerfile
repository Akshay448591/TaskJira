# ===================================================
# Stage 1: Build & Dependencies
# ===================================================
FROM node:22-alpine AS dependencies
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ===================================================
# Stage 2: Production Runtime
# ===================================================
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache dumb-init wget

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Ensure uploads directory exists with non-root ownership
RUN mkdir -p uploads/avatars uploads/attachments && chown -R node:node /app

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
