# nestjs-boot Learning Project

Learn to build production-ready NestJS microservices -- step by step.

This project is a **single-service** application with rich inline code comments
that explain every concept as you read the source. Pair the code with the
`docs/` tutorials and `exercises/` to go from zero to production-ready.

## Prerequisites

- Node.js 18+
- Docker Desktop (for MongoDB + Redis)
- VS Code (recommended -- install the ESLint + Prettier extensions)
- Basic TypeScript knowledge (types, interfaces, async/await)

## Quick Start

```bash
cd examples/learning
npm install
docker-compose up -d          # starts MongoDB + Redis
cp .env.example .env          # default config, edit if needed
npm run start:dev             # starts with hot-reload
```

Then open another terminal:

```bash
curl http://localhost:3000/health          # should return { status: 'ok' }
curl http://localhost:3000/products        # empty array -- time to add data!
```

## Learning Path

| # | Topic | Time | Lesson | Exercise |
|---|-------|------|--------|----------|
| 1 | Getting Started | 15 min | [docs/01](docs/01-getting-started.md) | -- |
| 2 | NestJS Basics | 20 min | [docs/02](docs/02-understanding-nestjs.md) | -- |
| 3 | Database | 25 min | [docs/03](docs/03-database.md) | [Add a field](exercises/01-add-a-field.md) |
| 4 | CRUD Operations | 30 min | [docs/04](docs/04-crud-operations.md) | [Add pagination](exercises/02-add-pagination.md) |
| 5 | Validation | 20 min | [docs/05](docs/05-validation.md) | [Add caching](exercises/03-add-caching.md) |
| 6 | Caching | 25 min | [docs/06](docs/06-caching.md) | [Add auth guard](exercises/04-add-auth-guard.md) |
| 7 | Authentication | 30 min | [docs/07](docs/07-authentication.md) | [Add roles](exercises/05-add-roles.md) |
| 8 | Error Handling | 20 min | [docs/08](docs/08-error-handling.md) | [Add a service](exercises/06-add-a-service.md) |
| 9 | Testing | 25 min | [docs/09](docs/09-testing.md) | [Connect services](exercises/07-connect-services.md) |
| 10 | Docker | 20 min | [docs/10](docs/10-docker.md) | [Add events](exercises/08-add-events.md) |
| 11 | Microservices | 25 min | [docs/11](docs/11-microservices.md) | [Write tests](exercises/09-write-tests.md) |
| 12 | Deployment | 20 min | [docs/12](docs/12-deployment.md) | [Deploy to Docker](exercises/10-deploy-to-docker.md) |

**Total: ~4 hours** to complete all lessons + exercises.

## How to Use This Project

1. **Read the source code** -- every file in `src/` has `LESSON` annotations
   explaining what each section does and why.
2. **Follow the docs** -- `docs/00` through `docs/12` walk you through concepts
   with code examples pulled from this actual project.
3. **Do the exercises** -- `exercises/` gives you progressively harder challenges.
   Each one tells you exactly what files to create or modify.
4. **Check solutions** -- stuck? `solutions/` has complete, copy-paste-ready code.

## Who Is This For?

- Interns starting their first backend project
- Students learning microservice architecture
- Frontend developers moving to backend
- Developers switching from Express/Fastify to NestJS

## Project Structure

```
src/
  main.ts                 <- LESSON 1: createApp() explained
  app.module.ts           <- LESSON 2: NestJS Module system
  product/
    product.controller.ts <- LESSON 3: REST endpoints
    product.service.ts    <- LESSON 4: Business logic + DI
    product.schema.ts     <- LESSON 5: Mongoose schemas
    product.dto.ts        <- LESSON 6: DTOs + validation
  auth/
    auth.controller.ts    <- LESSON 7: Auth endpoints
    auth.service.ts       <- LESSON 8: JWT + bcrypt
    user.schema.ts        <- LESSON 9: User model
  cache/
    cached-product.service.ts <- LESSON 10: Cache-aside pattern
docs/                     <- Tutorial series (00-12)
exercises/                <- 10 progressive challenges
solutions/                <- Complete solutions for each exercise
```
