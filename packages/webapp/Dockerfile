# Stage 1: Build one frontend image for staging and production.
FROM node:18.20.8-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@9.1.2
RUN apk add --no-cache python3 build-base
ENV PYTHON=/usr/bin/python3

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml lerna.json ./
COPY --chown=node:node packages/webapp/package.json ./packages/webapp/
COPY --chown=node:node shared ./shared

RUN HUSKY=0 pnpm install --frozen-lockfile

COPY --chown=node:node ./packages/webapp ./packages/webapp

# Deployment-specific labels come from public/environment.js at runtime.
RUN pnpm run build:webapp --skip-nx-cache && \
    test -s packages/webapp/dist/index.html && \
    test -s packages/webapp/dist/environment.js

# Stage 2: Nginx
FROM nginx:alpine

COPY --chown=root:root ./packages/webapp/nginx/sites/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=nginx:nginx /app/packages/webapp/dist /usr/share/nginx/html

EXPOSE 80
