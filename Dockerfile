# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ .
RUN npm run build

# Stage 2: Build backend
FROM golang:1.22-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/web/dist ./cmd/server/dist
RUN go build -o maps-cameras ./cmd/server/main.go

# Stage 3: Runtime
FROM alpine:3.19
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=backend /app/maps-cameras .
COPY config.yaml .
RUN mkdir -p data
EXPOSE 8080
CMD ["./maps-cameras"]
