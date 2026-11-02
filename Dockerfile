# Collabo production image — Next.js app + custom socket server
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

# docker CLI so server can spawn room containers via mounted socket
RUN apt-get update && apt-get install -y --no-install-recommends docker.io \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY package.json next.config.js tsconfig.server.json ./

EXPOSE 3000
CMD ["node", "build/server/index.js"]
