# Multi-stage build for React + Express
# Stage 1: Build React app and compile server TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies (including dev dependencies for TypeScript compilation)
RUN npm ci

# Copy source code
COPY . .

# Build React app and compile all TypeScript (frontend + server)
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies including Express
RUN npm ci --omit=dev

# Copy built React app from builder stage
COPY --from=builder /app/dist /app/dist

# Copy compiled server JavaScript (not TypeScript source)
COPY --from=builder /app/dist-server /app/dist-server

# Create tokens directory with proper permissions
RUN mkdir -p /app/tokens && chmod 700 /app/tokens

# Point storage.ts to the correct volume path (dist-server/../../tokens would
# resolve to /tokens at the filesystem root, missing the Docker volume at /app/tokens)
ENV TOKENS_DIR=/app/tokens

# Declare /app/tokens as a volume so token/settings data survives container replacement
VOLUME ["/app/tokens"]

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

# Start server using compiled JavaScript
CMD ["node", "dist-server/index.js"]