FROM node:24-bookworm-slim AS node_runtime
FROM postgres:18-bookworm
# Same Debian base: ship PostgreSQL client utilities and the supported Node runtime.
COPY --from=node_runtime /usr/local/ /usr/local/
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
USER postgres
ENTRYPOINT []
CMD ["npm", "start"]
