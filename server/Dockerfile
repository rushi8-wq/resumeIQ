FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev --workspace=@resumeiq/server
COPY --chown=node:node server/src server/src
USER node
EXPOSE 4000
CMD ["node", "server/src/index.js"]
