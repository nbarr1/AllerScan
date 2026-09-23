# syntax=docker/dockerfile:1

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# Cloud Run (and most container hosts) put one proxy in front of the app. The rate limiters key on
# the client address, which Express only reads from X-Forwarded-For when told how many hops to
# trust. Set it to 0 when nothing sits in front of the container.
ENV TRUST_PROXY=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.cjs"]
