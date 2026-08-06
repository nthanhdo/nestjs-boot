FROM node:20-alpine

WORKDIR /app

# Copy nestjs-boot source (linked dependency)
COPY ../../../package.json /nestjs-boot/package.json
COPY ../../../dist /nestjs-boot/dist

# Copy proto files
COPY ../proto /proto

# Copy service
COPY package.json ./
RUN npm install --production
COPY . .
RUN npm run build

CMD ["node", "dist/main.js"]
