# =============================================================
# Multi-stage Dockerfile for the learning project.
#
# Stage 1: Build TypeScript -> JavaScript
# Stage 2: Run the compiled app with minimal image size
#
# Build:   docker build -t learning-app .
# Run:     docker run -p 3000:3000 --env-file .env learning-app
# =============================================================

# --- Stage 1: Build ---
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Stage 2: Production ---
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
