FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci
COPY apps/api apps/api
RUN npm run build --workspace=@wh/api
ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["npm","run","start","--workspace=@wh/api"]
