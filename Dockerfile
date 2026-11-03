FROM node:26-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
USER node
EXPOSE 3000
CMD ["node", "app.js"]