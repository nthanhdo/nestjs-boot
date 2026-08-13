# Contributing to nestjs-boot

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Reporting Bugs

1. Search [existing issues](https://github.com/nthanhdo/nestjs-boot/issues) first.
2. If none found, open a new issue with:
   - A clear, descriptive title
   - Steps to reproduce
   - Expected vs. actual behavior
   - NestJS and nestjs-boot versions
   - Relevant code snippet or minimal reproduction

## Suggesting Enhancements

Open an issue with the `enhancement` label. Describe the use case, not just the feature.

## Submitting Pull Requests

1. **Fork** the repository and clone your fork.
2. **Branch** from `master`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Implement** your changes — see Code Style below.
5. **Test** — all tests must pass and new features need test coverage:
   ```bash
   npm test
   npm run test:cov   # coverage must not drop
   ```
6. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat(module): add feature X
   fix(auth): resolve JWT refresh race condition
   docs: update README example
   ```
7. **Push** and open a PR against `master`.
8. Fill in the PR template — describe what changed and why.

### PR Requirements

- [ ] All existing tests pass (`npm test`)
- [ ] New code has corresponding tests
- [ ] TypeScript strict mode — no `any`, no type suppressions without explanation
- [ ] No new lint errors (`npm run lint`)
- [ ] Docs updated if public API changed

## Code Style

- **Language:** TypeScript strict (`"strict": true`)
- **Formatter:** Prettier (auto on save / `npm run format`)
- **Linter:** ESLint (`npm run lint`)
- **Imports:** absolute from package root, no relative `../../..` depth > 2
- **Naming:** `camelCase` for variables/functions, `PascalCase` for classes/interfaces, `UPPER_SNAKE` for constants
- **Modules:** each module in its own directory with barrel `index.ts`
- **Tests:** co-located `*.spec.ts` files; use Vitest

## Development Setup

```bash
npm install
npm run build          # compile
npm test           # run all tests
npm test:watch     # watch mode
```

## Questions?

Open a [Discussion](https://github.com/nthanhdo/nestjs-boot/discussions) or tag `@nthanhdo` in an issue.
