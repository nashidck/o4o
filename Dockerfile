FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_MAP_STYLE_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_MAP_STYLE_URL=$NEXT_PUBLIC_MAP_STYLE_URL
COPY . .
RUN npm ci && npm run db:generate && npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
RUN npm prune --omit=dev
USER node
EXPOSE 3000 4000
CMD ["npm", "run", "start", "-w", "@o4o/api"]

FROM runtime AS worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-mal clamav && rm -rf /var/lib/apt/lists/*
USER node
CMD ["npm", "run", "start", "-w", "@o4o/worker"]
