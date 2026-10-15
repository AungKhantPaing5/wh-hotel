FROM node:22-alpine
RUN npm install --global firebase-tools@15.34.0
WORKDIR /test-auth
COPY infra/firebase.json ./firebase.json
EXPOSE 9099
CMD ["firebase", "emulators:start", "--only", "auth", "--project", "demo-wh-final", "--config", "firebase.json"]
