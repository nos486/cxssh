FROM node:20-alpine

# Install build deps for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Ensure data directory exists
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server/index.js"]
