FROM node:24.20.0-bookworm-slim AS ui-build
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
ENV VITE_USE_MOCKS=false VITE_API_BASE_URL=""
RUN npm run build

FROM node:24.20.0-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM build AS test
COPY backend/test ./test
COPY backend/scripts ./scripts
COPY contracts /contracts
CMD ["npm", "test"]

FROM base AS runtime
ENV NODE_ENV=production DATA_DIR=/data STATIC_DIR=/app/public
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=ui-build /ui/dist ./public
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=8s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
