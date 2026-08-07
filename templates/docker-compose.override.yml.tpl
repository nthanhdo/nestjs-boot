# docker-compose.override.yml — local dev overrides (hot reload)
#
# This file is automatically merged with docker-compose.yml by Docker Compose.
# It mounts your source code and runs the dev server with hot reload so you
# don't need to rebuild the image on every change.
#
# Usage:
#   docker-compose up -d       ← applies docker-compose.yml + this file automatically
#   docker-compose up -d --no-override  ← use production settings only (CI/CD)
#
# ⚠️  Never commit secrets here — use .env (git-ignored) for credentials.

services:
  app:
    build:
      # Use 'builder' stage which has dev dependencies installed
      # The production image uses the final stage (no devDependencies)
      target: builder
    volumes:
      # Hot reload: mount source so changes reflect immediately
      - ./src:/app/src
      - ./package.json:/app/package.json
      # Exclude node_modules (use container's copy, not host's)
      - /app/node_modules
    command: npm run start:dev
    environment:
      NODE_ENV: development
    # Expose debugger port for VS Code / WebStorm attach
    ports:
      - "9229:9229"
