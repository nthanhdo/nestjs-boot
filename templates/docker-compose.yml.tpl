services:
  app:
    build: .
    container_name: {{name}}
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      mongodb:
        condition: service_started
{{#if cache}}
      redis:
        condition: service_started
{{/if}}
    restart: unless-stopped

  mongodb:
    image: mongo:7
    container_name: {{name}}-mongodb
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

{{#if cache}}
  redis:
    image: redis:7-alpine
    container_name: {{name}}-redis
    ports:
      - "6379:6379"
    restart: unless-stopped
{{/if}}

volumes:
  mongo-data:
