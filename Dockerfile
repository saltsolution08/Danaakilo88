FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY . .
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
