FROM oven/bun:1-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY . .
RUN chown -R bun:bun /app
USER bun
EXPOSE 8080
ENV PORT=8080
CMD ["bun", "run", "server.js"]
