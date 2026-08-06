# {{name}} — Environment Variables
# Copy this file to .env and fill in your values

# Server
PORT=3000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/{{name}}

{{#if cache}}
# Redis (cache)
REDIS_URL=redis://localhost:6379
{{/if}}

{{#if auth}}
# Auth
JWT_SECRET=change-me-in-production
{{/if}}

{{#if grpc}}
# gRPC
GRPC_URL=0.0.0.0:5000
{{/if}}
