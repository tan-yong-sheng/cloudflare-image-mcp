# ============================================================================
# Cloudflare Image MCP - Multi-stage Docker Build
# Builds both core and local packages for production deployment
# ============================================================================

# Stage 1: Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY packages/core/package*.json ./packages/core/
COPY packages/local/package*.json ./packages/local/

# Install dependencies for both packages
WORKDIR /app/packages/core
RUN npm ci

WORKDIR /app/packages/local
RUN npm ci

# Copy source code
WORKDIR /app
COPY packages/core ./packages/core
COPY packages/local ./packages/local

# Build core package first (dependency of local)
WORKDIR /app/packages/core
RUN npm run build

# Build local package
WORKDIR /app/packages/local
RUN npm run build

# Stage 2: Production image
FROM node:18-alpine AS production

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy built artifacts and production dependencies
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package*.json ./packages/core/
COPY --from=builder /app/packages/local/dist ./packages/local/dist
COPY --from=builder /app/packages/local/package*.json ./packages/local/
COPY --from=builder /app/packages/local/src/ui ./packages/local/src/ui

# Install only production dependencies
WORKDIR /app/packages/core
RUN npm ci --only=production

WORKDIR /app/packages/local
RUN npm ci --only=production

# Set working directory to local package
WORKDIR /app/packages/local

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Labels for metadata
LABEL org.opencontainers.image.title="Cloudflare Image MCP"
LABEL org.opencontainers.image.description="OpenAI-compatible image generation API + MCP server powered by Cloudflare Workers AI"
LABEL org.opencontainers.image.version="0.1.0"
LABEL org.opencontainers.image.vendor="tan-yong-sheng"
LABEL org.opencontainers.image.source="https://github.com/tan-yong-sheng/cloudflare-image-mcp"

# Start the server
CMD ["node", "dist/main.js"]
