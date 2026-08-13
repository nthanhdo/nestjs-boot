#!/bin/bash
set -euo pipefail

# Usage: ./scripts/deploy.sh [tag]
# Pulls latest image and restarts with zero-downtime rolling update

TAG=${1:-latest}
export DOCKER_TAG=$TAG

echo "Deploying ${DOCKER_IMAGE:-org/app}:${TAG}..."

# Pull new image
docker compose -f docker-compose.prod.yml pull app

# Rolling restart (one at a time)
docker compose -f docker-compose.prod.yml up -d --no-recreate --scale app=${APP_REPLICAS:-3}

# Wait for health
echo "Waiting for health checks..."
sleep 10

# Check health
docker compose -f docker-compose.prod.yml ps

echo "Deploy complete"
