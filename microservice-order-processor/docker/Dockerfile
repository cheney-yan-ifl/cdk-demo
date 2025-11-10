# Multi-stage Dockerfile for Order Processor Service
# Always build for linux/amd64 (x86_64) to ensure compatibility with ECS
FROM --platform=linux/amd64 node:18.19-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
# Build everything inside the container to avoid architecture mismatches
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Runtime
FROM --platform=linux/amd64 node:18.19-alpine AS runtime

# Install dumb-init for proper signal handling (ensure x86_64 version)
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application source
COPY --chown=nodejs:nodejs src/ ./src/

# Switch to non-root user
USER nodejs

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "src/index.js"]