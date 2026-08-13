# @nestjs-boot/api-test

Interactive CLI to record live API responses, analyze payload structure, and auto-generate mutation test suites.

## Quick Start

```bash
npx api-test generate   # interactive wizard
npx api-test run         # execute tests
npx api-test run --report html  # with HTML report
```

## Commands

| Command | Description |
|---------|-------------|
| `generate` | Interactive wizard — configure endpoints, record happy cases, generate tests |
| `run` | Execute generated test suites against live API |
| `update` | Re-record happy cases and regenerate (preserves config) |
| `add` | Add new endpoints to existing config |

## Options

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to config file (default: `./api-tests/config.json`) |
| `--report html` | Generate HTML report |
| `--filter <category>` | Filter tests: `auth`, `body`, `params`, `headers`, `edge`, `method` |
| `--bail` | Stop on first failure |

## Mutation Categories

- **auth** — missing token, invalid credentials, empty auth, malformed JWT
- **body** — missing fields, wrong types, null values, empty body, array-instead-of-object
- **params** — invalid format, non-existent resource, empty, special characters
- **headers** — missing Content-Type, wrong Content-Type
- **edge** — empty strings, long strings, XSS, SQL injection, unicode null, number boundaries
- **method** — wrong HTTP method

## Output

```
api-tests/
├── config.json           # saved configuration
├── recordings/           # happy case responses
├── generated/            # test suite JSON files
└── reports/              # JSON + HTML reports
```
