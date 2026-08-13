{
  "name": "{{name}}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
  },
  "dependencies": {
    "@nestjs/cli": "^10.4.0",
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "nestjs-boot": "^0.1.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0",
{{#eq dbType "mongodb"}}
    "@nestjs/mongoose": "^10.1.0",
    "mongoose": "^8.0.0",
{{/eq}}
{{#eq cacheType "redis"}}
    "ioredis": "^5.4.0",
{{/eq}}
{{#eq cacheType "memcached"}}
    "memjs": "^1.3.0",
{{/eq}}
{{#eq authType "jwt"}}
    "jsonwebtoken": "^9.0.3",
{{/eq}}
{{#in transportType "grpc"}}
    "@nestjs/microservices": "^10.4.0",
    "@grpc/grpc-js": "^1.9.0",
    "@grpc/proto-loader": "^0.7.0",
{{/in}}
{{#in transportType "tcp|nats|rabbitmq"}}
    "@nestjs/microservices": "^10.4.0",
{{/in}}
    "@nestjs/terminus": "^10.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^7.0.0"
  }
}
