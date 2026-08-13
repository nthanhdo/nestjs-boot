# admin-dashboard

A Next.js 15 web UI for nestjs-boot — visual project generation, module exploration, architecture diagrams, and interactive learning. Built for developers who prefer a GUI over the CLI.

## Features

| Section | What it provides |
|---|---|
| **Project Generator** (`/generate`) | Visual form that builds a `npx nestjs-boot` command with all flags — DB, cache, auth, transport, Docker |
| **Architecture Visualizer** (`/architecture`) | 10-service microservice diagram showing how nestjs-boot modules connect |
| **Module Explorer** (`/modules`) | Browse all 28+ nestjs-boot modules with descriptions and usage examples |
| **Learning Hub** (`/learn`) | 12 interactive lessons — from module basics through production patterns |

## Quick start

```bash
cd packages/admin-dashboard
pnpm install
pnpm dev
# open http://localhost:3000
```

## Stack

- Next.js 16 (App Router) + React 19
- Tailwind CSS v4
- lucide-react icons
- No external backend required — all data is local/static

## Relationship to nestjs-boot

The dashboard is a **companion tool** — it reads nestjs-boot's module catalog and pattern library at build time (no live connection needed). Use it to:

1. Visually configure a new project before running the CLI
2. Explore which modules to enable and what each one does
3. Walk through learning lessons that reference real nestjs-boot patterns

## Build

```bash
pnpm build   # outputs to .next/
pnpm start   # serve the production build
```
