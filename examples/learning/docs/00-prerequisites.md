# 00 - Prerequisites

Before starting, make sure you have these installed on your machine.

## Required

| Tool | Version | Check command | Install |
|------|---------|---------------|---------|
| Node.js | 18+ | `node -v` | [nodejs.org](https://nodejs.org/) |
| npm | 9+ | `npm -v` | Comes with Node.js |
| Docker Desktop | Latest | `docker --version` | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Git | Any | `git --version` | [git-scm.com](https://git-scm.com/) |

## Recommended

- **VS Code** with extensions: ESLint, Prettier, MongoDB for VS Code
- **Postman** or **Insomnia** for testing API endpoints (or just use `curl`)

## Knowledge

You should be comfortable with:
- TypeScript basics (types, interfaces, async/await, classes)
- HTTP basics (GET, POST, PUT, DELETE, status codes, JSON)
- Terminal / command line basics

You do NOT need to know:
- NestJS (that's what we're learning!)
- MongoDB (we'll cover it)
- Docker internals (we just use `docker-compose up`)

## Verify Everything Works

```bash
# All of these should print version numbers without errors:
node -v          # v18.x.x or higher
npm -v           # 9.x.x or higher
docker --version # Docker version 24.x.x or higher

# Start Docker Desktop, then verify:
docker compose version   # Docker Compose version v2.x.x
```

If any command fails, install the missing tool before proceeding.

---

Next: [01 - Getting Started](01-getting-started.md)
