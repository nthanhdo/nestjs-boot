# {{name}} — Environment Variables
# Copy this file to .env and fill in your values

# Server
PORT=3000
NODE_ENV=development

{{#eq dbType "mongodb"}}
# MongoDB
MONGO_URI=mongodb://localhost:27017/{{name}}
{{/eq}}
{{#eq dbType "postgres"}}
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME={{name}}
DB_USER=postgres
DB_PASS=postgres
{{/eq}}
{{#eq dbType "mysql"}}
# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_NAME={{name}}
DB_USER=root
DB_PASS=root
{{/eq}}
{{#eq dbType "dynamodb"}}
# DynamoDB
AWS_REGION=us-east-1
DYNAMODB_ENDPOINT=http://localhost:8000
{{/eq}}
{{#eq dbType "elasticsearch"}}
# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200
{{/eq}}

{{#eq cacheType "redis"}}
# Redis (cache)
REDIS_URL=redis://localhost:6379
{{/eq}}
{{#eq cacheType "memcached"}}
# Memcached
MEMCACHED_SERVERS=localhost:11211
{{/eq}}

{{#if auth}}
# Auth
JWT_SECRET=change-me-in-production
{{/if}}

{{#eq transportType "grpc"}}
# gRPC
GRPC_URL=0.0.0.0:5000
{{/eq}}
{{#eq transportType "nats"}}
# NATS
NATS_URL=nats://localhost:4222
{{/eq}}
{{#eq transportType "rabbitmq"}}
# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
{{/eq}}
