stages:
  - lint
  - test
  - build
  - coverage
  - docker

variables:
  NODE_VERSION: '20'

.node_cache:
  cache:
    key: ${CI_COMMIT_REF_SLUG}
    paths:
      - node_modules/

lint:
  stage: lint
  image: node:${NODE_VERSION}
  extends: .node_cache
  script:
    - npm ci
    - npm run lint

test:shard1:
  stage: test
  image: node:${NODE_VERSION}
  extends: .node_cache
  script:
    - npm ci
    - npx vitest run --reporter=verbose --shard=1/2

test:shard2:
  stage: test
  image: node:${NODE_VERSION}
  extends: .node_cache
  script:
    - npm ci
    - npx vitest run --reporter=verbose --shard=2/2

build:
  stage: build
  image: node:${NODE_VERSION}
  extends: .node_cache
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/

coverage:
  stage: coverage
  image: node:${NODE_VERSION}
  extends: .node_cache
  script:
    - npm ci
    - npx vitest run --coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
    paths:
      - coverage/

docker:
  stage: docker
  image: docker:24
  services:
    - docker:24-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  before_script:
    - docker login -u "$CI_REGISTRY_USER" -p "$CI_REGISTRY_PASSWORD" "$CI_REGISTRY"
  script:
    - |
      TAG_SHA="$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"
      TAG_REF="$CI_REGISTRY_IMAGE:$CI_COMMIT_REF_SLUG"
      docker build -t "$TAG_SHA" -t "$TAG_REF" .
      docker push "$TAG_SHA"
      docker push "$TAG_REF"
    - |
      if [ -n "$CI_COMMIT_TAG" ]; then
        TAG_VER="$CI_REGISTRY_IMAGE:$CI_COMMIT_TAG"
        docker tag "$TAG_SHA" "$TAG_VER"
        docker push "$TAG_VER"
      fi
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_COMMIT_TAG =~ /^v.*/
