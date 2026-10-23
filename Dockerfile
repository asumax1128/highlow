FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node dist ./dist
COPY --chown=node:node server ./server
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production PORT=8080 HIGHLOW_DB=/app/data/rankings.sqlite
EXPOSE 8080
CMD ["node", "server/index.js"]
