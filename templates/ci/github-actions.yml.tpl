name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]
        shard: [1, 2]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Test (shard ${{ matrix.shard }}/2)
        run: npx vitest run --reporter=verbose --shard=${{ matrix.shard }}/2

      - name: Build
        run: npm run build

  coverage:
    runs-on: ubuntu-latest
    needs: test

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: 'npm'

      - run: npm ci

      - name: Coverage
        run: npx vitest run --coverage

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
