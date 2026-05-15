# Stage 1: install all dependencies (including devDeps for tsx + vite)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: build the Vite frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# VITE_* vars must be passed as build args — Vite bakes them into the bundle
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN npm run build

# Stage 3: production image
FROM node:20-alpine
WORKDIR /app

# Copy only what the server needs at runtime
COPY package*.json ./
COPY tsconfig.json ./
COPY server.ts ./
COPY server/ ./server/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node_modules/.bin/tsx", "server.ts"]
