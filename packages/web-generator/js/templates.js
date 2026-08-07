/**
 * templates.js — All project templates as JS template literals.
 * Mirrors the .tpl files from nestjs-boot/templates/ exactly.
 */

export function mainTs(c) {
  let s = `import { join } from 'path';\nimport { createApp } from 'nestjs-boot';\nimport { AppModule } from './app.module';\n\nasync function bootstrap() {\n  const app = await createApp(AppModule, {\n`;

  // Database
  if (c.db === 'mongodb') {
    s += `    database: {\n      connections: {\n        master: {\n          writerUri: process.env.MONGO_URI || 'mongodb://localhost:27017/${c.name}',\n        },\n      },\n    },\n`;
  } else if (c.db === 'postgres') {
    s += `    database: {\n      type: 'postgres',\n      host: process.env.DB_HOST || 'localhost',\n      port: parseInt(process.env.DB_PORT || '5432', 10),\n      database: process.env.DB_NAME || '${c.name}',\n      username: process.env.DB_USER || 'postgres',\n      password: process.env.DB_PASS || 'postgres',\n    },\n`;
  } else if (c.db === 'mysql') {
    s += `    database: {\n      type: 'mysql',\n      host: process.env.DB_HOST || 'localhost',\n      port: parseInt(process.env.DB_PORT || '3306', 10),\n      database: process.env.DB_NAME || '${c.name}',\n      username: process.env.DB_USER || 'root',\n      password: process.env.DB_PASS || 'root',\n    },\n`;
  } else if (c.db === 'dynamodb') {
    s += `    database: {\n      type: 'dynamodb',\n      region: process.env.AWS_REGION || 'us-east-1',\n      endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',\n    },\n`;
  } else if (c.db === 'elasticsearch') {
    s += `    database: {\n      type: 'elasticsearch',\n      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',\n    },\n`;
  }

  // Cache
  if (c.cache === 'redis') {
    s += `    cache: {\n      redis: { url: process.env.REDIS_URL || 'redis://localhost:6379' },\n    },\n`;
  } else if (c.cache === 'memcached') {
    s += `    cache: {\n      memcached: { servers: process.env.MEMCACHED_SERVERS || 'localhost:11211' },\n    },\n`;
  }

  // Transport
  if (c.transport === 'grpc') {
    s += `    transport: {\n      grpc: {\n        url: '0.0.0.0:5000',\n        package: '${c.name}',\n        protoPath: join(__dirname, '../proto/${c.name}.proto'),\n      },\n    },\n`;
  } else if (c.transport === 'tcp') {
    s += `    transport: {\n      tcp: {\n        host: '0.0.0.0',\n        port: 4000,\n      },\n    },\n`;
  } else if (c.transport === 'nats') {
    s += `    transport: {\n      nats: {\n        url: process.env.NATS_URL || 'nats://localhost:4222',\n      },\n    },\n`;
  } else if (c.transport === 'rabbitmq') {
    s += `    transport: {\n      rabbitmq: {\n        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',\n      },\n    },\n`;
  }

  // Auth
  if (c.auth === 'jwt') {
    s += `    auth: {\n      jwt: {\n        secret: process.env.JWT_SECRET || 'change-me-in-production',\n      },\n    },\n`;
  }

  s += `    health: { enabled: true },\n  });\n\n  await app.listen(process.env.PORT || 3000);\n  console.log(\`${c.name} running on port \${process.env.PORT || 3000}\`);\n}\nbootstrap();\n`;
  return s;
}

export function packageJson(c) {
  const deps = {
    '@nestjs/cli': '^10.4.0',
    '@nestjs/common': '^10.4.0',
    '@nestjs/core': '^10.4.0',
    '@nestjs/platform-express': '^10.4.0',
    'nestjs-boot': '^0.1.0',
    'reflect-metadata': '^0.2.0',
    'rxjs': '^7.8.0',
  };

  if (c.db === 'mongodb') {
    deps['@nestjs/mongoose'] = '^10.1.0';
    deps['mongoose'] = '^8.0.0';
  } else if (c.db === 'postgres') {
    deps['@nestjs/typeorm'] = '^10.0.0';
    deps['typeorm'] = '^0.3.0';
    deps['pg'] = '^8.12.0';
  } else if (c.db === 'mysql') {
    deps['@nestjs/typeorm'] = '^10.0.0';
    deps['typeorm'] = '^0.3.0';
    deps['mysql2'] = '^3.9.0';
  } else if (c.db === 'dynamodb') {
    deps['dynamoose'] = '^4.0.0';
  } else if (c.db === 'elasticsearch') {
    deps['@nestjs/elasticsearch'] = '^10.0.0';
    deps['@elastic/elasticsearch'] = '^8.13.0';
  }

  if (c.cache === 'redis') deps['ioredis'] = '^5.4.0';
  if (c.cache === 'memcached') deps['memjs'] = '^1.3.0';
  if (c.auth === 'jwt') deps['jsonwebtoken'] = '^9.0.3';

  if (c.transport === 'grpc') {
    deps['@nestjs/microservices'] = '^10.4.0';
    deps['@grpc/grpc-js'] = '^1.9.0';
    deps['@grpc/proto-loader'] = '^0.7.0';
  } else if (['tcp', 'nats', 'rabbitmq'].includes(c.transport)) {
    deps['@nestjs/microservices'] = '^10.4.0';
  }

  deps['@nestjs/terminus'] = '^10.2.0';

  const devDeps = {
    '@types/node': '^20.0.0',
    '@typescript-eslint/eslint-plugin': '^8.0.0',
    '@typescript-eslint/parser': '^8.0.0',
    'eslint': '^9.0.0',
    'prettier': '^3.3.0',
    'typescript': '^5.5.0',
    'vitest': '^2.0.0',
    '@vitest/coverage-v8': '^2.0.0',
    'supertest': '^7.0.0',
    '@types/supertest': '^7.0.0',
  };

  return JSON.stringify({
    name: c.name,
    version: '0.1.0',
    private: true,
    scripts: {
      build: 'nest build',
      start: 'nest start',
      'start:dev': 'nest start --watch',
      'start:debug': 'nest start --debug --watch',
      'start:prod': 'node dist/main',
      test: 'vitest run',
      'test:watch': 'vitest',
      'test:cov': 'vitest run --coverage',
      lint: 'eslint "{src,apps,libs,test}/**/*.ts" --fix',
    },
    dependencies: deps,
    devDependencies: devDeps,
  }, null, 2) + '\n';
}

export function dockerCompose(c) {
  let s = `services:\n  app:\n    build: .\n    container_name: ${c.name}\n    ports:\n      - "3000:3000"\n    env_file: .env\n`;

  const hasInfra = c.db !== 'none' || c.cache !== 'none';
  if (hasInfra) {
    s += `    depends_on:\n`;
    if (c.db === 'mongodb') s += `      mongodb:\n        condition: service_started\n`;
    if (c.db === 'postgres') s += `      postgres:\n        condition: service_started\n`;
    if (c.db === 'mysql') s += `      mysql:\n        condition: service_started\n`;
    if (c.db === 'dynamodb') s += `      dynamodb:\n        condition: service_started\n`;
    if (c.db === 'elasticsearch') s += `      elasticsearch:\n        condition: service_started\n`;
    if (c.cache === 'redis') s += `      redis:\n        condition: service_started\n`;
    if (c.cache === 'memcached') s += `      memcached:\n        condition: service_started\n`;
  }
  s += `    restart: unless-stopped\n\n`;

  if (c.db === 'mongodb') {
    s += `  mongodb:\n    image: mongo:7\n    container_name: ${c.name}-mongodb\n    ports:\n      - "27017:27017"\n    volumes:\n      - mongo-data:/data/db\n    restart: unless-stopped\n\n`;
  }
  if (c.db === 'postgres') {
    s += `  postgres:\n    image: postgres:16-alpine\n    container_name: ${c.name}-postgres\n    ports:\n      - "5432:5432"\n    environment:\n      POSTGRES_DB: ${c.name}\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: postgres\n    volumes:\n      - postgres-data:/var/lib/postgresql/data\n    restart: unless-stopped\n\n`;
  }
  if (c.db === 'mysql') {
    s += `  mysql:\n    image: mysql:8\n    container_name: ${c.name}-mysql\n    ports:\n      - "3306:3306"\n    environment:\n      MYSQL_DATABASE: ${c.name}\n      MYSQL_ROOT_PASSWORD: root\n    volumes:\n      - mysql-data:/var/lib/mysql\n    restart: unless-stopped\n\n`;
  }
  if (c.db === 'dynamodb') {
    s += `  dynamodb:\n    image: amazon/dynamodb-local:latest\n    container_name: ${c.name}-dynamodb\n    ports:\n      - "8000:8000"\n    command: "-jar DynamoDBLocal.jar -sharedDb"\n    restart: unless-stopped\n\n`;
  }
  if (c.db === 'elasticsearch') {
    s += `  elasticsearch:\n    image: docker.elastic.co/elasticsearch/elasticsearch:8.14.0\n    container_name: ${c.name}-elasticsearch\n    ports:\n      - "9200:9200"\n    environment:\n      - discovery.type=single-node\n      - xpack.security.enabled=false\n      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"\n    volumes:\n      - es-data:/usr/share/elasticsearch/data\n    restart: unless-stopped\n\n`;
  }
  if (c.cache === 'redis') {
    s += `  redis:\n    image: redis:7-alpine\n    container_name: ${c.name}-redis\n    ports:\n      - "6379:6379"\n    restart: unless-stopped\n\n`;
  }
  if (c.cache === 'memcached') {
    s += `  memcached:\n    image: memcached:1.6-alpine\n    container_name: ${c.name}-memcached\n    ports:\n      - "11211:11211"\n    restart: unless-stopped\n\n`;
  }

  s += `volumes:\n`;
  if (c.db === 'mongodb') s += `  mongo-data:\n`;
  if (c.db === 'postgres') s += `  postgres-data:\n`;
  if (c.db === 'mysql') s += `  mysql-data:\n`;
  if (c.db === 'elasticsearch') s += `  es-data:\n`;

  return s;
}

export function dockerfile() {
  return `# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./

# Install production deps separately for layer caching
RUN npm ci --only=production && cp -R node_modules /prod_modules

# Install all deps (including dev) for build
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine
WORKDIR /app

# Copy only production node_modules
COPY --from=builder /prod_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json .

# Run as non-root
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
`;
}

export function envExample(c) {
  let s = `PORT=3000\n`;
  if (c.db === 'mongodb') s += `MONGO_URI=mongodb://localhost:27017/${c.name}\n`;
  if (c.db === 'postgres') s += `DB_HOST=localhost\nDB_PORT=5432\nDB_NAME=${c.name}\nDB_USER=postgres\nDB_PASS=postgres\n`;
  if (c.db === 'mysql') s += `DB_HOST=localhost\nDB_PORT=3306\nDB_NAME=${c.name}\nDB_USER=root\nDB_PASS=root\n`;
  if (c.db === 'dynamodb') s += `AWS_REGION=us-east-1\nDYNAMODB_ENDPOINT=http://localhost:8000\n`;
  if (c.db === 'elasticsearch') s += `ELASTICSEARCH_URL=http://localhost:9200\n`;
  if (c.cache === 'redis') s += `REDIS_URL=redis://localhost:6379\n`;
  if (c.cache === 'memcached') s += `MEMCACHED_SERVERS=localhost:11211\n`;
  if (c.auth === 'jwt') s += `JWT_SECRET=change-me-in-production\n`;
  if (c.transport === 'nats') s += `NATS_URL=nats://localhost:4222\n`;
  if (c.transport === 'rabbitmq') s += `RABBITMQ_URL=amqp://localhost:5672\n`;
  return s;
}

export function appModule() {
  return `import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`;
}

export function appController() {
  return `import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): { message: string; service: string } {
    return this.appService.getHello();
  }
}
`;
}

export function appService(c) {
  return `import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { message: string; service: string } {
    return {
      message: 'Hello from nestjs-boot!',
      service: '${c.name}',
    };
  }
}
`;
}

export function tsconfig() {
  return JSON.stringify({
    compilerOptions: {
      module: 'commonjs',
      declaration: true,
      removeComments: true,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      allowSyntheticDefaultImports: true,
      target: 'ES2021',
      sourceMap: true,
      outDir: './dist',
      rootDir: './src',
      baseUrl: './',
      incremental: true,
      skipLibCheck: true,
      strictNullChecks: true,
      noImplicitAny: true,
      strictBindCallApply: true,
      forceConsistentCasingInFileNames: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  }, null, 2) + '\n';
}

export function vitestConfig() {
  return `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    testTimeout: 30_000,
  },
});
`;
}

export function e2eSpec(c) {
  return `import { describe, it, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200);
  });

  it('GET /', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('message');
        expect(res.body).toHaveProperty('service', '${c.name}');
      });
  });
});
`;
}

export function readmeMd(c) {
  return `# ${c.name}

A NestJS microservice powered by [nestjs-boot](https://github.com/nthanhdo/nestjs-boot).

## Quick Start

\`\`\`bash
# Start infrastructure
docker-compose up -d

# Start dev server with hot reload
npm run start:dev
\`\`\`

Your service will be running at:
- **HTTP:** http://localhost:3000
- **Health:** http://localhost:3000/health

## Scripts

| Command | Description |
|---------|-------------|
| \`npm run start:dev\` | Start with hot reload |
| \`npm run build\` | Build for production |
| \`npm run start:prod\` | Run production build |
| \`npm test\` | Run tests |
| \`npm run test:cov\` | Run tests with coverage |
| \`npm run lint\` | Lint and fix |

## Environment Variables

See \`.env.example\` for all available configuration. Copy it to \`.env\`:

\`\`\`bash
cp .env.example .env
\`\`\`

## Docker

### Development

\`\`\`bash
docker-compose up -d
\`\`\`

### Production

\`\`\`bash
docker build -t ${c.name} .
docker run -p 3000:3000 --env-file .env ${c.name}
\`\`\`

## Kubernetes

\`\`\`bash
kubectl apply -f k8s/
\`\`\`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | \`/\` | Hello endpoint |
| GET | \`/health\` | Health check |

## Project Structure

\`\`\`
${c.name}/
  src/
    main.ts            # Application bootstrap
    app.module.ts      # Root module
    app.controller.ts  # Root controller
    app.service.ts     # Root service
  test/
    app.e2e-spec.ts    # E2E tests
  k8s/                 # Kubernetes manifests
  Dockerfile           # Multi-stage production build
  docker-compose.yml   # Local development infrastructure
\`\`\`
`;
}

export function k8sDeployment(c) {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${c.name}
  labels:
    app: ${c.name}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${c.name}
  template:
    metadata:
      labels:
        app: ${c.name}
    spec:
      containers:
        - name: ${c.name}
          image: ${c.name}:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: ${c.name}-config
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
            timeoutSeconds: 3
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 3
`;
}

export function k8sService(c) {
  return `apiVersion: v1
kind: Service
metadata:
  name: ${c.name}
  labels:
    app: ${c.name}
spec:
  type: ClusterIP
  ports:
    - port: 3000
      targetPort: 3000
      protocol: TCP
      name: http
  selector:
    app: ${c.name}
`;
}

export function k8sConfigMap(c) {
  let data = `  PORT: "3000"\n`;
  if (c.db === 'mongodb') data += `  MONGO_URI: "mongodb://mongodb:27017/${c.name}"\n`;
  if (c.db === 'postgres') data += `  DB_HOST: "postgres"\n  DB_PORT: "5432"\n  DB_NAME: "${c.name}"\n  DB_USER: "postgres"\n  DB_PASS: "postgres"\n`;
  if (c.db === 'mysql') data += `  DB_HOST: "mysql"\n  DB_PORT: "3306"\n  DB_NAME: "${c.name}"\n  DB_USER: "root"\n  DB_PASS: "root"\n`;
  if (c.db === 'dynamodb') data += `  AWS_REGION: "us-east-1"\n`;
  if (c.db === 'elasticsearch') data += `  ELASTICSEARCH_URL: "http://elasticsearch:9200"\n`;
  if (c.cache === 'redis') data += `  REDIS_URL: "redis://redis:6379"\n`;
  if (c.auth === 'jwt') data += `  JWT_SECRET: "change-me-in-production"\n`;

  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${c.name}-config
data:
${data}`;
}

export function k8sHpa(c) {
  return `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${c.name}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${c.name}
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
`;
}

export function proto(c) {
  return `syntax = "proto3";

package ${c.name};

service ${c.name}Service {
  rpc GetHello (Empty) returns (HelloResponse);
}

message Empty {}

message HelloResponse {
  string message = 1;
  string service = 2;
}
`;
}

export function eslintConfig() {
  return `module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: {
    node: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist/'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
`;
}

export function prettierConfig() {
  return `{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true
}
`;
}
