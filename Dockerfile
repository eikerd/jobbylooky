FROM node:22.23.2-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY angular.json tsconfig*.json ./
COPY src ./src
COPY public ./public
RUN npm run build
RUN npm prune --omit=dev

FROM node:22.23.2-alpine
ENV NODE_ENV=production BIND_HOST=0.0.0.0 PORT=4317
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY server ./server
RUN mkdir data && chown node:node data && chmod 700 data
USER node
EXPOSE 4317
CMD ["node", "server/index.mjs"]
