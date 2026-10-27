FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci
COPY apps/web apps/web
ARG NEXT_PUBLIC_LOCAL_TEST=false
ENV NEXT_PUBLIC_LOCAL_TEST=$NEXT_PUBLIC_LOCAL_TEST
ENV API_INTERNAL_URL=http://api:4000
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@wh/web
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm","run","start","--workspace=@wh/web"]
