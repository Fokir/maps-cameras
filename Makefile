.PHONY: dev-backend dev-frontend build run clean

dev-backend:
	go run ./cmd/server/main.go

dev-frontend:
	cd web && npm run dev

build-frontend:
	cd web && npm run build

build: build-frontend
	go build -o maps-cameras ./cmd/server/main.go

run: build
	./maps-cameras

test-backend:
	go test ./... -v

clean:
	rm -f maps-cameras maps-cameras.exe
	rm -rf web/dist
