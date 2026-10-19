# syntax=docker/dockerfile:1

# Node 20 reached end of life in April 2026 and gets no more security fixes; 24 is the active LTS.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# Cloud Run (and most container hosts) put one proxy in front of the app. The rate limiters key on
# the client address, which Express only reads from X-Forwarded-For when told how many hops to
# trust. Set it to 0 when nothing sits in front of the container.
ENV TRUST_PROXY=1
COPY package.json package-lock.json ./
# --ignore-scripts: the only install script is the Husky git-hook setup, which a runtime image has
# no use for.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
# The official image ships an unprivileged "node" user; nothing here needs root.
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.cjs"]
