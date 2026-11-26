# Stage 1: Build
FROM node:18.20.8-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@9.1.2
RUN apk add --no-cache python3 build-base
ENV PYTHON=/usr/bin/python3

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml lerna.json ./
COPY --chown=node:node packages/server/package.json ./packages/server/
COPY --chown=node:node shared ./shared

RUN HUSKY=0 pnpm install --frozen-lockfile

COPY --chown=node:node ./packages/server ./packages/server

# Build every shared runtime dependency, including the TypeScript SDK.
RUN pnpm run build:shared --skip-nx-cache && \
    pnpm --filter @bigcapital/server run build && \
    pnpm --filter @bigcapital/server exec nest build cli && \
    test -s packages/server/dist/main.js && \
    test -s packages/server/dist/cli.js

# Stage 2: Production
FROM node:18.20.8-alpine AS production

WORKDIR /app

RUN npm install -g pnpm@9.1.2
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Poppler and Tesseract support local PDF/OCR processing on Linux.
RUN apk add --no-cache python3 libstdc++ tesseract-ocr tesseract-ocr-data-eng poppler-utils font-dejavu

COPY --chown=nodejs:nodejs package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=nodejs:nodejs packages/server/package.json ./packages/server/
COPY --chown=nodejs:nodejs shared ./shared

# Skip the root Husky prepare hook without changing manifests or the lockfile.
# Rebuild bcrypt explicitly because its native binding is required at runtime.
RUN apk add --no-cache --virtual .build-deps python3 build-base && \
    pnpm install --prod --frozen-lockfile --ignore-scripts && \
    npm_config_build_from_source=true npm_config_nodedir=/usr/local \
      pnpm --filter @bigcapital/server rebuild bcrypt && \
    apk del .build-deps && \
    pnpm --filter @bigcapital/server exec node -e "require('bcrypt').hashSync('container-build-check', 4)"

# Includes the API, standalone CLI, compiled tenant migrations and native assets.
COPY --from=builder --chown=nodejs:nodejs /app/packages/server/dist ./packages/server/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/server/src/i18n ./packages/server/dist/i18n
COPY --from=builder --chown=nodejs:nodejs /app/packages/server/public ./packages/server/public
COPY --from=builder --chown=nodejs:nodejs /app/packages/server/static ./packages/server/static
COPY --from=builder --chown=nodejs:nodejs /app/packages/server/src/database ./packages/server/src/database

# Keep production dependency links; copy only the built shared artifacts.
COPY --from=builder --chown=nodejs:nodejs /app/shared/bigcapital-utils/dist ./shared/bigcapital-utils/dist
COPY --from=builder --chown=nodejs:nodejs /app/shared/pdf-templates/dist ./shared/pdf-templates/dist
COPY --from=builder --chown=nodejs:nodejs /app/shared/email-components/dist ./shared/email-components/dist
COPY --from=builder --chown=nodejs:nodejs /app/shared/sdk-ts/dist ./shared/sdk-ts/dist

# The unprivileged API writes temporary PDFs beneath public/pdf.
RUN chown -R nodejs:nodejs /app/packages/server/public

ENV NODE_ENV=production
ENV NEW_RELIC_NO_CONFIG_FILE=true
ENV PORT=3000
ENV SYSTEM_DB_MIGRATION_DIR=/app/packages/server/dist/database/system/migrations
ENV SYSTEM_DB_SEEDS_DIR=/app/packages/server/dist/database/system/seeds

USER nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/system_db', (r) => {process.exit(r.statusCode >= 200 && r.statusCode < 300 ? 0 : 1)}).on('error', () => process.exit(1))"

CMD [ "node", "packages/server/dist/main.js" ]
