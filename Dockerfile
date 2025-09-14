# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    bash

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies (including dev dependencies for build)
RUN yarn install --frozen-lockfile

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Copy any existing data files (optional, for faster startup)
COPY data/ ./data/
COPY prefixes.json ./

# Build the application
RUN yarn build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start the server
# Use pino-pretty for development, regular start for production
CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"development\" ]; then yarn start:dev; else yarn start; fi"]
