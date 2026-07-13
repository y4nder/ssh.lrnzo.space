FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --production

COPY src ./src

# the oven/bun image ships a non-root 'bun' user
USER bun

ENV PORT=2222 \
    HOST_KEY_PATH=/keys/host_key

EXPOSE 2222

CMD ["bun", "src/server.ts"]
