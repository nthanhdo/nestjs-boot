version: '3.8'

services:
  app:
    image: ${DOCKER_REGISTRY:-ghcr.io}/${DOCKER_IMAGE:-org/app}:${DOCKER_TAG:-latest}
    restart: unless-stopped
    deploy:
      replicas: ${APP_REPLICAS:-3}
      resources:
        limits:
          cpus: '1'
          memory: 512M
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env.production
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 15s
      timeout: 3s
      retries: 3
      start_period: 30s
    networks:
      - backend

  nginx:
    image: nginx:alpine
    ports:
      - "${PUBLIC_PORT:-80}:80"
      - "${PUBLIC_SSL_PORT:-443}:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      app:
        condition: service_healthy
    networks:
      - backend
    restart: unless-stopped

{{#neq dbType "none"}}
  mongodb:
    image: mongo:7
    restart: unless-stopped
    volumes:
      - mongo_data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=${MONGO_USER:-admin}
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASSWORD:-changeme}
    networks:
      - backend
{{/neq}}

{{#if cache}}
{{#eq cacheType "redis"}}
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD:-changeme}
    volumes:
      - redis_data:/data
    networks:
      - backend
{{/eq}}
{{/if}}

networks:
  backend:
    driver: bridge

volumes:
{{#neq dbType "none"}}
  mongo_data:
{{/neq}}
{{#if cache}}
{{#eq cacheType "redis"}}
  redis_data:
{{/eq}}
{{/if}}
