FROM docker.io/node:24-alpine AS build

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@latest-11

# Copy dependency files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy rest of the project
COPY . .

# Build the app
RUN pnpm run build

FROM docker.io/node:24-alpine

LABEL org.opencontainers.image.title="Moodist" \
      org.opencontainers.image.description="Ambient sounds for focus and calm" \
      org.opencontainers.image.source="https://github.com/jpinz/moodist" \
      org.opencontainers.image.url="https://moodist.mvze.net/" \
      org.opencontainers.image.documentation="https://github.com/jpinz/moodist" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="remvze"

RUN apk add --no-cache ffmpeg

COPY --from=build /app/dist /var/www/html
COPY ./server /app/server

ENV NODE_ENV=production \
    STATIC_ROOT=/var/www/html

EXPOSE 8080 8099

CMD ["node", "/app/server/index.mjs"]
