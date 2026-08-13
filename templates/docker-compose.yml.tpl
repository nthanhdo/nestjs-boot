services:
  app:
    build: .
    container_name: {{name}}
    ports:
      - "3000:3000"
    env_file: .env
{{#neq dbType "none"}}
    depends_on:
{{/neq}}
{{#eq dbType "mongodb"}}
      mongodb:
        condition: service_started
{{/eq}}
{{#eq cacheType "redis"}}
      redis:
        condition: service_started
{{/eq}}
{{#eq cacheType "memcached"}}
      memcached:
        condition: service_started
{{/eq}}
    restart: unless-stopped

{{#eq dbType "mongodb"}}
  mongodb:
    image: mongo:7
    container_name: {{name}}-mongodb
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

{{/eq}}
{{#eq cacheType "redis"}}
  redis:
    image: redis:7-alpine
    container_name: {{name}}-redis
    ports:
      - "6379:6379"
    restart: unless-stopped

{{/eq}}
{{#eq cacheType "memcached"}}
  memcached:
    image: memcached:1.6-alpine
    container_name: {{name}}-memcached
    ports:
      - "11211:11211"
    restart: unless-stopped

{{/eq}}
volumes:
{{#eq dbType "mongodb"}}
  mongo-data:
{{/eq}}
