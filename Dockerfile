FROM node:20-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY examples ./examples
COPY README.md LICENSE SECURITY.md CHANGELOG.md ./

CMD ["node", "src/server.mjs"]
