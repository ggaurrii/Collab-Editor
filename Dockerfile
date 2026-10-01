# Dev image shared by web + realtime (npm workspaces).
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/realtime/package.json apps/realtime/
COPY apps/web/package.json apps/web/
RUN npm install
COPY . .
