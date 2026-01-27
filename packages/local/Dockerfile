# ============================================================================
# Cloudflare Image MCP - Local Server Docker Image
# ============================================================================

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY packages/local/package*.json ./
COPY packages/core ./core/

# Install dependencies
RUN npm install

# Build
RUN npm run build --workspace=@cloudflare-image-mcp/core
RUN npm run build --workspace=@cloudflare-image-mcp/local

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Copy built files
COPY --from=builder /app/packages/local/dist ./dist
COPY --from=builder /app/packages/local/package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the server
CMD ["node", "dist/main.js"]
