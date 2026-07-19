# syntax=docker/dockerfile:1
FROM node:18-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app source
COPY . .

# MSE scraper hits mse.mk (HTTPS) — ensure CA certs are present in alpine
RUN apk add --no-cache ca-certificates

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
