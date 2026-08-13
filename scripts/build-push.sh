#!/bin/bash
set -euo pipefail

# Usage: ./scripts/build-push.sh [tag]
# Builds and pushes Docker image to registry

TAG=${1:-$(git rev-parse --short HEAD)}
REGISTRY=${DOCKER_REGISTRY:-ghcr.io}
IMAGE=${DOCKER_IMAGE:-$(basename $(pwd))}

echo "Building ${REGISTRY}/${IMAGE}:${TAG}..."
docker build -t ${REGISTRY}/${IMAGE}:${TAG} .
docker tag ${REGISTRY}/${IMAGE}:${TAG} ${REGISTRY}/${IMAGE}:latest

echo "Pushing to ${REGISTRY}..."
docker push ${REGISTRY}/${IMAGE}:${TAG}
docker push ${REGISTRY}/${IMAGE}:latest

echo "Pushed ${REGISTRY}/${IMAGE}:${TAG}"
