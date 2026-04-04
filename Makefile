.PHONY: dev-backend dev-frontend build run clean

dev-backend:
	go run ./cmd/server/main.go

dev-frontend:
	cd web && npm run dev

build-frontend:
	cd web && npm run build

build: build-frontend
	rm -rf cmd/server/dist
	cp -r web/dist cmd/server/dist
	go build -o maps-cameras ./cmd/server/main.go
	rm -rf cmd/server/dist

run: build
	./maps-cameras

test-backend:
	go test ./... -v

clean:
	rm -f maps-cameras maps-cameras.exe
	rm -rf web/dist
