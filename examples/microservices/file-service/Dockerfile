FROM node:20-alpine

WORKDIR /app

COPY ../../../package.json /nestjs-boot/package.json
COPY ../../../dist /nestjs-boot/dist

COPY ../proto /proto

COPY package.json ./
RUN npm install --production
COPY . .
RUN npm run build

RUN mkdir -p /app/uploads

CMD ["node", "dist/main.js"]
