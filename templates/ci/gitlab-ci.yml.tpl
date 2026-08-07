stages:
  - lint
  - test
  - build
  - coverage

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
