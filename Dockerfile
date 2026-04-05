# syntax=docker/dockerfile:1.7

# ---------- Stage 1: Build frontend ----------
FROM node:20-alpine AS frontend
WORKDIR /app/web

COPY web/package.json web/package-lock.json* ./
RUN npm ci

COPY web/ .
RUN npm run build

# ---------- Stage 2: Build backend ----------
FROM golang:1.25-alpine AS backend
WORKDIR /app

# Cache modules
COPY go.mod go.sum ./
RUN go mod download

# Source + embedded frontend
COPY . .
# Ensure the embed target starts empty — any stray files from the build
# context (e.g. a local dev placeholder) would otherwise be included.
RUN rm -rf ./cmd/server/dist && mkdir -p ./cmd/server/dist
COPY --from=frontend /app/web/dist ./cmd/server/dist

# Build a static binary (no libc dependency) so it can run on any distro.
ENV CGO_ENABLED=0
RUN go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/maps-cameras \
    ./cmd/server

# ---------- Stage 3: Runtime ----------
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY --from=backend /out/maps-cameras /app/maps-cameras
COPY config.yaml.example /app/config.yaml.default

# Writable data dir owned by the unprivileged user
RUN mkdir -p /app/data && chown -R app:app /app
USER app

EXPOSE 8080
VOLUME ["/app/data"]

# Simple healthcheck — hits the camera list endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:8080/api/cameras || exit 1

# If no config mounted, fall back to the baked-in default.
ENTRYPOINT ["/bin/sh", "-c", "test -f /app/config.yaml || cp /app/config.yaml.default /app/config.yaml; exec /app/maps-cameras /app/config.yaml"]
