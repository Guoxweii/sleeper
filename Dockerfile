FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

ENV npm_config_nodedir=/usr/local

COPY package.json package-lock.json* ./
COPY web/package.json ./web/package.json
COPY server/package.json ./server/package.json

RUN npm install

COPY . .

RUN npm run build --workspace web
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "server"]
