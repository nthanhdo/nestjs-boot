export interface ProjectConfig {
  name: string;
  db: string;
  cache: string;
  auth: string;
  transport: string;
  docker: boolean;
  k8s: boolean;
  tests: boolean;
  eslint: boolean;
}

export const defaultConfig: ProjectConfig = {
  name: "my-service",
  db: "none",
  cache: "none",
  auth: "none",
  transport: "http",
  docker: true,
  k8s: false,
  tests: true,
  eslint: true,
};

export function generateMainTs(c: ProjectConfig): string {
  let s = `import { join } from 'path';\nimport { createApp } from 'nestjs-boot';\nimport { AppModule } from './app.module';\n\nasync function bootstrap() {\n  const app = await createApp(AppModule, {\n`;

  if (c.db === "mongodb") {
    s += `    database: {\n      connections: {\n        master: {\n          writerUri: process.env.MONGO_URI || 'mongodb://localhost:27017/${c.name}',\n        },\n      },\n    },\n`;
  } else if (c.db === "postgres") {
    s += `    database: {\n      type: 'postgres',\n      host: process.env.DB_HOST || 'localhost',\n      port: parseInt(process.env.DB_PORT || '5432', 10),\n      database: process.env.DB_NAME || '${c.name}',\n      username: process.env.DB_USER || 'postgres',\n      password: process.env.DB_PASS || 'postgres',\n    },\n`;
  } else if (c.db === "mysql") {
    s += `    database: {\n      type: 'mysql',\n      host: process.env.DB_HOST || 'localhost',\n      port: parseInt(process.env.DB_PORT || '3306', 10),\n      database: process.env.DB_NAME || '${c.name}',\n      username: process.env.DB_USER || 'root',\n      password: process.env.DB_PASS || 'root',\n    },\n`;
  } else if (c.db === "dynamodb") {
    s += `    database: {\n      type: 'dynamodb',\n      region: process.env.AWS_REGION || 'us-east-1',\n      endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',\n    },\n`;
  } else if (c.db === "elasticsearch") {
    s += `    database: {\n      type: 'elasticsearch',\n      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',\n    },\n`;
  }

  if (c.cache === "redis") {
    s += `    cache: {\n      redis: { url: process.env.REDIS_URL || 'redis://localhost:6379' },\n    },\n`;
  } else if (c.cache === "memcached") {
    s += `    cache: {\n      memcached: { servers: process.env.MEMCACHED_SERVERS || 'localhost:11211' },\n    },\n`;
  }

  if (c.transport === "grpc") {
    s += `    transport: {\n      grpc: {\n        url: '0.0.0.0:5000',\n        package: '${c.name}',\n        protoPath: join(__dirname, '../proto/${c.name}.proto'),\n      },\n    },\n`;
  } else if (c.transport === "tcp") {
    s += `    transport: {\n      tcp: {\n        host: '0.0.0.0',\n        port: 4000,\n      },\n    },\n`;
  } else if (c.transport === "nats") {
    s += `    transport: {\n      nats: {\n        url: process.env.NATS_URL || 'nats://localhost:4222',\n      },\n    },\n`;
  } else if (c.transport === "rabbitmq") {
    s += `    transport: {\n      rabbitmq: {\n        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',\n      },\n    },\n`;
  }

  if (c.auth === "jwt") {
    s += `    auth: {\n      jwt: {\n        secret: process.env.JWT_SECRET || 'change-me-in-production',\n      },\n    },\n`;
  }

  s += `    health: { enabled: true },\n  });\n\n  await app.listen(process.env.PORT || 3000);\n  console.log(\`${c.name} running on port \${process.env.PORT || 3000}\`);\n}\nbootstrap();\n`;
  return s;
}

export function generateDockerCompose(c: ProjectConfig): string {
  let s = `services:\n  app:\n    build: .\n    container_name: ${c.name}\n    ports:\n      - "3000:3000"\n    env_file: .env\n`;

  const hasInfra = c.db !== "none" || c.cache !== "none";
  if (hasInfra) {
    s += `    depends_on:\n`;
    if (c.db === "mongodb") s += `      mongodb:\n        condition: service_started\n`;
    if (c.db === "postgres") s += `      postgres:\n        condition: service_started\n`;
    if (c.db === "mysql") s += `      mysql:\n        condition: service_started\n`;
    if (c.db === "dynamodb") s += `      dynamodb:\n        condition: service_started\n`;
    if (c.db === "elasticsearch") s += `      elasticsearch:\n        condition: service_started\n`;
    if (c.cache === "redis") s += `      redis:\n        condition: service_started\n`;
    if (c.cache === "memcached") s += `      memcached:\n        condition: service_started\n`;
  }
  s += `    restart: unless-stopped\n\n`;

  if (c.db === "mongodb") {
    s += `  mongodb:\n    image: mongo:7\n    container_name: ${c.name}-mongodb\n    ports:\n      - "27017:27017"\n    volumes:\n      - mongo-data:/data/db\n    restart: unless-stopped\n\n`;
  }
  if (c.db === "postgres") {
    s += `  postgres:\n    image: postgres:16-alpine\n    container_name: ${c.name}-postgres\n    ports:\n      - "5432:5432"\n    environment:\n      POSTGRES_DB: ${c.name}\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: postgres\n    volumes:\n      - postgres-data:/var/lib/postgresql/data\n    restart: unless-stopped\n\n`;
  }
  if (c.db === "mysql") {
    s += `  mysql:\n    image: mysql:8\n    container_name: ${c.name}-mysql\n    ports:\n      - "3306:3306"\n    environment:\n      MYSQL_DATABASE: ${c.name}\n      MYSQL_ROOT_PASSWORD: root\n    volumes:\n      - mysql-data:/var/lib/mysql\n    restart: unless-stopped\n\n`;
  }
  if (c.db === "dynamodb") {
    s += `  dynamodb:\n    image: amazon/dynamodb-local:latest\n    container_name: ${c.name}-dynamodb\n    ports:\n      - "8000:8000"\n    command: "-jar DynamoDBLocal.jar -sharedDb"\n    restart: unless-stopped\n\n`;
  }
  if (c.db === "elasticsearch") {
    s += `  elasticsearch:\n    image: docker.elastic.co/elasticsearch/elasticsearch:8.14.0\n    container_name: ${c.name}-elasticsearch\n    ports:\n      - "9200:9200"\n    environment:\n      - discovery.type=single-node\n      - xpack.security.enabled=false\n    volumes:\n      - es-data:/usr/share/elasticsearch/data\n    restart: unless-stopped\n\n`;
  }
  if (c.cache === "redis") {
    s += `  redis:\n    image: redis:7-alpine\n    container_name: ${c.name}-redis\n    ports:\n      - "6379:6379"\n    restart: unless-stopped\n\n`;
  }
  if (c.cache === "memcached") {
    s += `  memcached:\n    image: memcached:1.6-alpine\n    container_name: ${c.name}-memcached\n    ports:\n      - "11211:11211"\n    restart: unless-stopped\n\n`;
  }

  s += `volumes:\n`;
  if (c.db === "mongodb") s += `  mongo-data:\n`;
  if (c.db === "postgres") s += `  postgres-data:\n`;
  if (c.db === "mysql") s += `  mysql-data:\n`;
  if (c.db === "elasticsearch") s += `  es-data:\n`;

  return s;
}

export function generateCliCommand(c: ProjectConfig): string {
  let cmd = `npx nestjs-boot ${c.name}`;
  if (c.db !== "none") cmd += ` --db ${c.db}`;
  if (c.cache !== "none") cmd += ` --cache ${c.cache}`;
  if (c.auth !== "none") cmd += ` --auth ${c.auth}`;
  if (c.transport !== "http") cmd += ` --transport ${c.transport}`;
  if (c.docker) cmd += ` --docker`;
  if (c.k8s) cmd += ` --k8s`;
  if (c.tests) cmd += ` --tests`;
  if (c.eslint) cmd += ` --eslint`;
  return cmd;
}

export function generateMermaidDiagram(c: ProjectConfig): string {
  let diagram = `graph TD\n  Client[Client] --> App[${c.name}]`;

  if (c.db === "mongodb") diagram += `\n  App --> MongoDB[(MongoDB)]`;
  if (c.db === "postgres") diagram += `\n  App --> PostgreSQL[(PostgreSQL)]`;
  if (c.db === "mysql") diagram += `\n  App --> MySQL[(MySQL)]`;
  if (c.db === "dynamodb") diagram += `\n  App --> DynamoDB[(DynamoDB)]`;
  if (c.db === "elasticsearch") diagram += `\n  App --> ES[(Elasticsearch)]`;

  if (c.cache === "redis") diagram += `\n  App --> Redis[(Redis)]`;
  if (c.cache === "memcached") diagram += `\n  App --> Memcached[(Memcached)]`;

  if (c.auth === "jwt") diagram += `\n  App --> JWT{JWT Auth}`;

  if (c.transport === "grpc") diagram += `\n  App -- gRPC --> Services[Other Services]`;
  if (c.transport === "tcp") diagram += `\n  App -- TCP --> Services[Other Services]`;
  if (c.transport === "nats") diagram += `\n  App -- NATS --> Services[Other Services]`;
  if (c.transport === "rabbitmq") diagram += `\n  App -- RabbitMQ --> Services[Other Services]`;

  diagram += `\n  App --> Health[/health]`;

  return diagram;
}
