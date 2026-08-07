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
{{#eq dbType "postgres"}}
      postgres:
        condition: service_started
{{/eq}}
{{#eq dbType "mysql"}}
      mysql:
        condition: service_started
{{/eq}}
{{#eq dbType "dynamodb"}}
      dynamodb:
        condition: service_started
{{/eq}}
{{#eq dbType "elasticsearch"}}
      elasticsearch:
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
{{#eq dbType "postgres"}}
  postgres:
    image: postgres:16-alpine
    container_name: {{name}}-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: {{name}}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

{{/eq}}
{{#eq dbType "mysql"}}
  mysql:
    image: mysql:8
    container_name: {{name}}-mysql
    ports:
      - "3306:3306"
    environment:
      MYSQL_DATABASE: {{name}}
      MYSQL_ROOT_PASSWORD: root
    volumes:
      - mysql-data:/var/lib/mysql
    restart: unless-stopped

{{/eq}}
{{#eq dbType "dynamodb"}}
  dynamodb:
    image: amazon/dynamodb-local:latest
    container_name: {{name}}-dynamodb
    ports:
      - "8000:8000"
    command: "-jar DynamoDBLocal.jar -sharedDb"
    restart: unless-stopped

{{/eq}}
{{#eq dbType "elasticsearch"}}
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.14.0
    container_name: {{name}}-elasticsearch
    ports:
      - "9200:9200"
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - es-data:/usr/share/elasticsearch/data
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
{{#eq dbType "postgres"}}
  postgres-data:
{{/eq}}
{{#eq dbType "mysql"}}
  mysql-data:
{{/eq}}
{{#eq dbType "elasticsearch"}}
  es-data:
{{/eq}}
