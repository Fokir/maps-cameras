# Maps Cameras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web-сервис для отображения камер видеонаблюдения на интерактивной карте с просмотром RTSP-стримов через go2rtc.

**Architecture:** Go-бэкенд (единый бинарник с встроенной статикой) + React SPA (Vite + TypeScript + Leaflet + Zustand). Бэкенд предоставляет REST API для CRUD камер, проксирует сигналинг к go2rtc (http://server.local), управляет жизненным циклом стримов. Фронтенд — модульная архитектура с доменами map/, camera/, stream/, editor/.

**Tech Stack:** Go 1.22+, net/http ServeMux, modernc.org/sqlite, gorilla/websocket, React 18, TypeScript, Vite, Zustand, react-leaflet, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-04-04-maps-cameras-design.md`

---

## File Structure

### Go Backend

```
go.mod
go.sum
cmd/server/main.go                  — точка входа, инициализация конфига/БД/роутера
internal/config/config.go           — парсинг config.yaml
internal/config/config_test.go
internal/database/sqlite.go         — инициализация SQLite, миграции
internal/database/sqlite_test.go
internal/camera/model.go            — структура Camera
internal/camera/repository.go       — CRUD операции с БД
internal/camera/repository_test.go
internal/camera/handler.go          — HTTP handlers /api/cameras
internal/camera/handler_test.go
internal/camera/import.go           — парсинг M3U
internal/camera/import_test.go
internal/stream/proxy.go            — HTTP/WS проксирование к go2rtc
internal/stream/tracker.go          — отслеживание активных стримов, cleanup
internal/stream/tracker_test.go
internal/stream/handler.go          — HTTP handlers /api/stream/*
internal/router/router.go           — маршруты, статика
config.yaml                         — конфигурация по умолчанию
Makefile                            — dev/build/run команды
Dockerfile                          — multi-stage сборка
docker-compose.yml
```

### React Frontend

```
web/
  package.json
  tsconfig.json
  vite.config.ts
  tailwind.config.js
  index.html
  src/
    index.tsx                        — точка входа React
    app/
      App.tsx                        — корневой layout, переключение режимов
    shared/
      types.ts                       — Camera, AppMode, StreamInfo
      api.ts                         — HTTP клиент fetch-обёртка
      hooks.ts                       — useMediaQuery, useDebounce
    modules/
      map/
        MapView.tsx                  — Leaflet карта, слои OSM/Esri
        CameraMarker.tsx             — иконка камеры + SVG конус
        CameraControls.tsx           — ручки угла/дистанции/поворота
        mapStore.ts                  — зум, центр, активный слой
      camera/
        CameraList.tsx               — список камер (sidebar)
        CameraForm.tsx               — форма создания/редактирования
        ImportM3U.tsx                — кнопка и диалог импорта
        cameraStore.ts               — CRUD, список камер, selectedId
        cameraApi.ts                 — запросы к /api/cameras
      stream/
        StreamPlayer.tsx             — WebRTC + MSE fallback плеер
        streamStore.ts               — активный стрим, состояние подключения
        streamApi.ts                 — start/stop, WS соединение
      editor/
        EditorLayout.tsx             — layout режима редактирования
        DragDrop.tsx                 — drag из списка на карту
        editorStore.ts               — isEditing, selectedCameraId
        historyStore.ts              — undo/redo снапшоты
```

---

## Task 1: Go Module + Config + Makefile

**Files:**
- Create: `go.mod`
- Create: `cmd/server/main.go`
- Create: `internal/config/config.go`
- Create: `internal/config/config_test.go`
- Create: `config.yaml`
- Create: `Makefile`
- Create: `.gitignore`

- [ ] **Step 1: Initialize Go module**

```bash
cd c:/Users/sokol/Documents/maps-cameras
go mod init maps-cameras
```

- [ ] **Step 2: Create .gitignore**

Create `.gitignore`:
```gitignore
# Go
/maps-cameras
/maps-cameras.exe

# Frontend
web/node_modules/
web/dist/

# Data
data/

# IDE
.idea/
.vscode/

# Superpowers
.superpowers/

# OS
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Create config.yaml**

Create `config.yaml`:
```yaml
server:
  port: 8080
database:
  path: ./data/cameras.db
go2rtc:
  url: http://server.local
map:
  center: [54.3142, 48.4031]
  zoom: 18
```

- [ ] **Step 4: Write config test**

Create `internal/config/config_test.go`:
```go
package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	err := os.WriteFile(cfgPath, []byte(`
server:
  port: 9090
database:
  path: ./test.db
go2rtc:
  url: http://localhost:1984
map:
  center: [55.0, 37.0]
  zoom: 16
`), 0644)
	if err != nil {
		t.Fatal(err)
	}

	cfg, err := Load(cfgPath)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if cfg.Server.Port != 9090 {
		t.Errorf("expected port 9090, got %d", cfg.Server.Port)
	}
	if cfg.Database.Path != "./test.db" {
		t.Errorf("expected path ./test.db, got %s", cfg.Database.Path)
	}
	if cfg.Go2RTC.URL != "http://localhost:1984" {
		t.Errorf("expected go2rtc url http://localhost:1984, got %s", cfg.Go2RTC.URL)
	}
	if cfg.Map.Center[0] != 55.0 || cfg.Map.Center[1] != 37.0 {
		t.Errorf("expected center [55.0, 37.0], got %v", cfg.Map.Center)
	}
	if cfg.Map.Zoom != 16 {
		t.Errorf("expected zoom 16, got %d", cfg.Map.Zoom)
	}
}

func TestLoadConfigDefaults(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	err := os.WriteFile(cfgPath, []byte(`{}`), 0644)
	if err != nil {
		t.Fatal(err)
	}

	cfg, err := Load(cfgPath)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if cfg.Server.Port != 8080 {
		t.Errorf("expected default port 8080, got %d", cfg.Server.Port)
	}
}
```

- [ ] **Step 5: Run test to verify it fails**

```bash
cd c:/Users/sokol/Documents/maps-cameras
go test ./internal/config/ -v
```

Expected: FAIL — `Load` not defined.

- [ ] **Step 6: Implement config**

Create `internal/config/config.go`:
```go
package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Go2RTC   Go2RTCConfig   `yaml:"go2rtc"`
	Map      MapConfig      `yaml:"map"`
}

type ServerConfig struct {
	Port int `yaml:"port"`
}

type DatabaseConfig struct {
	Path string `yaml:"path"`
}

type Go2RTCConfig struct {
	URL string `yaml:"url"`
}

type MapConfig struct {
	Center [2]float64 `yaml:"center"`
	Zoom   int        `yaml:"zoom"`
}

func Load(path string) (*Config, error) {
	cfg := &Config{
		Server:   ServerConfig{Port: 8080},
		Database: DatabaseConfig{Path: "./data/cameras.db"},
		Go2RTC:   Go2RTCConfig{URL: "http://server.local"},
		Map:      MapConfig{Center: [2]float64{54.3142, 48.4031}, Zoom: 18},
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}
```

- [ ] **Step 7: Install yaml dependency and run tests**

```bash
cd c:/Users/sokol/Documents/maps-cameras
go get gopkg.in/yaml.v3
go test ./internal/config/ -v
```

Expected: PASS.

- [ ] **Step 8: Create main.go stub**

Create `cmd/server/main.go`:
```go
package main

import (
	"fmt"
	"log"
	"maps-cameras/internal/config"
	"os"
)

func main() {
	cfgPath := "config.yaml"
	if len(os.Args) > 1 {
		cfgPath = os.Args[1]
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	fmt.Printf("Starting server on :%d\n", cfg.Server.Port)
}
```

- [ ] **Step 9: Create Makefile**

Create `Makefile`:
```makefile
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
```

- [ ] **Step 10: Verify build**

```bash
cd c:/Users/sokol/Documents/maps-cameras
go build ./cmd/server/main.go
```

Expected: compiles without errors.

- [ ] **Step 11: Commit**

```bash
git init
git add .gitignore go.mod go.sum config.yaml Makefile cmd/ internal/config/
git commit -m "feat: project scaffold with Go module, config parser, and Makefile"
```

---

## Task 2: SQLite Database + Camera Model

**Files:**
- Create: `internal/camera/model.go`
- Create: `internal/database/sqlite.go`
- Create: `internal/database/sqlite_test.go`

- [ ] **Step 1: Write camera model**

Create `internal/camera/model.go`:
```go
package camera

import "time"

type Camera struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	RTSPURL   string   `json:"rtsp_url"`
	Color     string   `json:"color"`
	Lat       *float64 `json:"lat"`
	Lng       *float64 `json:"lng"`
	Rotation  float64  `json:"rotation"`
	Angle     float64  `json:"angle"`
	Distance  float64  `json:"distance"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
```

- [ ] **Step 2: Write database test**

Create `internal/database/sqlite_test.go`:
```go
package database

import (
	"path/filepath"
	"testing"
)

func TestOpenAndMigrate(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")

	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	// Verify cameras table exists
	var tableName string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='cameras'").Scan(&tableName)
	if err != nil {
		t.Fatalf("cameras table not found: %v", err)
	}
	if tableName != "cameras" {
		t.Errorf("expected table name 'cameras', got '%s'", tableName)
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
go test ./internal/database/ -v
```

Expected: FAIL — `Open` not defined.

- [ ] **Step 4: Implement database**

Create `internal/database/sqlite.go`:
```go
package database

import (
	"database/sql"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func Open(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}

	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS cameras (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			rtsp_url TEXT NOT NULL,
			color TEXT NOT NULL DEFAULT '#7aa2f7',
			lat REAL,
			lng REAL,
			rotation REAL NOT NULL DEFAULT 0,
			angle REAL NOT NULL DEFAULT 90,
			distance REAL NOT NULL DEFAULT 50,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`)
	return err
}
```

- [ ] **Step 5: Install dependency and run test**

```bash
go get modernc.org/sqlite
go test ./internal/database/ -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/camera/model.go internal/database/ go.mod go.sum
git commit -m "feat: SQLite database with cameras table migration"
```

---

## Task 3: Camera Repository (CRUD)

**Files:**
- Create: `internal/camera/repository.go`
- Create: `internal/camera/repository_test.go`

- [ ] **Step 1: Write repository test**

Create `internal/camera/repository_test.go`:
```go
package camera

import (
	"maps-cameras/internal/database"
	"path/filepath"
	"testing"
)

func setupTestDB(t *testing.T) *Repository {
	t.Helper()
	db, err := database.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewRepository(db)
}

func TestCreateAndGetAll(t *testing.T) {
	repo := setupTestDB(t)

	cam := &Camera{
		Name:    "Test Cam",
		RTSPURL: "rtsp://192.168.1.10/stream1",
		Color:   "#f7768e",
	}

	created, err := repo.Create(cam)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if created.ID == "" {
		t.Error("expected non-empty ID")
	}
	if created.Name != "Test Cam" {
		t.Errorf("expected name 'Test Cam', got '%s'", created.Name)
	}

	all, err := repo.GetAll()
	if err != nil {
		t.Fatalf("GetAll failed: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("expected 1 camera, got %d", len(all))
	}
	if all[0].ID != created.ID {
		t.Errorf("expected ID %s, got %s", created.ID, all[0].ID)
	}
}

func TestUpdate(t *testing.T) {
	repo := setupTestDB(t)

	cam, _ := repo.Create(&Camera{Name: "Cam", RTSPURL: "rtsp://1.2.3.4/s", Color: "#fff"})

	lat, lng := 54.3, 48.4
	cam.Lat = &lat
	cam.Lng = &lng
	cam.Rotation = 45.0
	cam.Angle = 120.0
	cam.Distance = 30.0

	updated, err := repo.Update(cam)
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if *updated.Lat != 54.3 {
		t.Errorf("expected lat 54.3, got %f", *updated.Lat)
	}
	if updated.Rotation != 45.0 {
		t.Errorf("expected rotation 45, got %f", updated.Rotation)
	}
}

func TestDelete(t *testing.T) {
	repo := setupTestDB(t)

	cam, _ := repo.Create(&Camera{Name: "Cam", RTSPURL: "rtsp://1.2.3.4/s", Color: "#fff"})

	err := repo.Delete(cam.ID)
	if err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	all, _ := repo.GetAll()
	if len(all) != 0 {
		t.Errorf("expected 0 cameras after delete, got %d", len(all))
	}
}

func TestGetByID(t *testing.T) {
	repo := setupTestDB(t)

	cam, _ := repo.Create(&Camera{Name: "Cam", RTSPURL: "rtsp://1.2.3.4/s", Color: "#fff"})

	found, err := repo.GetByID(cam.ID)
	if err != nil {
		t.Fatalf("GetByID failed: %v", err)
	}
	if found.Name != "Cam" {
		t.Errorf("expected 'Cam', got '%s'", found.Name)
	}

	_, err = repo.GetByID("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent ID")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/camera/ -v
```

Expected: FAIL — `NewRepository`, `Create`, etc. not defined.

- [ ] **Step 3: Implement repository**

Create `internal/camera/repository.go`:
```go
package camera

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) GetAll() ([]Camera, error) {
	rows, err := r.db.Query(`SELECT id, name, rtsp_url, color, lat, lng, rotation, angle, distance, created_at, updated_at FROM cameras ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cameras []Camera
	for rows.Next() {
		var c Camera
		err := rows.Scan(&c.ID, &c.Name, &c.RTSPURL, &c.Color, &c.Lat, &c.Lng, &c.Rotation, &c.Angle, &c.Distance, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			return nil, err
		}
		cameras = append(cameras, c)
	}
	return cameras, rows.Err()
}

func (r *Repository) GetByID(id string) (*Camera, error) {
	var c Camera
	err := r.db.QueryRow(`SELECT id, name, rtsp_url, color, lat, lng, rotation, angle, distance, created_at, updated_at FROM cameras WHERE id = ?`, id).
		Scan(&c.ID, &c.Name, &c.RTSPURL, &c.Color, &c.Lat, &c.Lng, &c.Rotation, &c.Angle, &c.Distance, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("camera not found: %s", id)
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) Create(c *Camera) (*Camera, error) {
	c.ID = uuid.New().String()
	now := time.Now()
	c.CreatedAt = now
	c.UpdatedAt = now
	if c.Angle == 0 {
		c.Angle = 90
	}
	if c.Distance == 0 {
		c.Distance = 50
	}

	_, err := r.db.Exec(`INSERT INTO cameras (id, name, rtsp_url, color, lat, lng, rotation, angle, distance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.ID, c.Name, c.RTSPURL, c.Color, c.Lat, c.Lng, c.Rotation, c.Angle, c.Distance, c.CreatedAt, c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (r *Repository) Update(c *Camera) (*Camera, error) {
	c.UpdatedAt = time.Now()
	result, err := r.db.Exec(`UPDATE cameras SET name=?, rtsp_url=?, color=?, lat=?, lng=?, rotation=?, angle=?, distance=?, updated_at=? WHERE id=?`,
		c.Name, c.RTSPURL, c.Color, c.Lat, c.Lng, c.Rotation, c.Angle, c.Distance, c.UpdatedAt, c.ID)
	if err != nil {
		return nil, err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return nil, fmt.Errorf("camera not found: %s", c.ID)
	}
	return c, nil
}

func (r *Repository) Delete(id string) error {
	result, err := r.db.Exec(`DELETE FROM cameras WHERE id = ?`, id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("camera not found: %s", id)
	}
	return nil
}

func (r *Repository) GetByRTSPURL(url string) (*Camera, error) {
	var c Camera
	err := r.db.QueryRow(`SELECT id, name, rtsp_url, color, lat, lng, rotation, angle, distance, created_at, updated_at FROM cameras WHERE rtsp_url = ?`, url).
		Scan(&c.ID, &c.Name, &c.RTSPURL, &c.Color, &c.Lat, &c.Lng, &c.Rotation, &c.Angle, &c.Distance, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}
```

- [ ] **Step 4: Install UUID dependency and run tests**

```bash
go get github.com/google/uuid
go test ./internal/camera/ -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/camera/repository.go internal/camera/repository_test.go go.mod go.sum
git commit -m "feat: camera repository with CRUD operations"
```

---

## Task 4: Camera HTTP Handlers

**Files:**
- Create: `internal/camera/handler.go`
- Create: `internal/camera/handler_test.go`

- [ ] **Step 1: Write handler test**

Create `internal/camera/handler_test.go`:
```go
package camera

import (
	"bytes"
	"encoding/json"
	"maps-cameras/internal/database"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func setupTestHandler(t *testing.T) *Handler {
	t.Helper()
	db, err := database.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewHandler(NewRepository(db))
}

func TestHandlerCreateAndList(t *testing.T) {
	h := setupTestHandler(t)

	// Create
	body, _ := json.Marshal(map[string]any{
		"name":     "Test",
		"rtsp_url": "rtsp://1.2.3.4/s",
		"color":    "#f7768e",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/cameras", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Create(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var created Camera
	json.NewDecoder(w.Body).Decode(&created)
	if created.ID == "" {
		t.Error("expected non-empty ID")
	}

	// List
	req = httptest.NewRequest(http.MethodGet, "/api/cameras", nil)
	w = httptest.NewRecorder()
	h.List(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var cameras []Camera
	json.NewDecoder(w.Body).Decode(&cameras)
	if len(cameras) != 1 {
		t.Fatalf("expected 1 camera, got %d", len(cameras))
	}
}

func TestHandlerUpdate(t *testing.T) {
	h := setupTestHandler(t)

	// Create first
	body, _ := json.Marshal(map[string]any{"name": "Cam", "rtsp_url": "rtsp://x/s", "color": "#fff"})
	req := httptest.NewRequest(http.MethodPost, "/api/cameras", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Create(w, req)

	var created Camera
	json.NewDecoder(w.Body).Decode(&created)

	// Update
	body, _ = json.Marshal(map[string]any{"name": "Updated", "rtsp_url": "rtsp://x/s", "color": "#000", "rotation": 90.0})
	req = httptest.NewRequest(http.MethodPut, "/api/cameras/"+created.ID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.SetPathValue("id", created.ID)
	w = httptest.NewRecorder()
	h.Update(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var updated Camera
	json.NewDecoder(w.Body).Decode(&updated)
	if updated.Name != "Updated" {
		t.Errorf("expected 'Updated', got '%s'", updated.Name)
	}
}

func TestHandlerDelete(t *testing.T) {
	h := setupTestHandler(t)

	body, _ := json.Marshal(map[string]any{"name": "Cam", "rtsp_url": "rtsp://x/s", "color": "#fff"})
	req := httptest.NewRequest(http.MethodPost, "/api/cameras", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Create(w, req)

	var created Camera
	json.NewDecoder(w.Body).Decode(&created)

	req = httptest.NewRequest(http.MethodDelete, "/api/cameras/"+created.ID, nil)
	req.SetPathValue("id", created.ID)
	w = httptest.NewRecorder()
	h.Delete(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/camera/ -run TestHandler -v
```

Expected: FAIL — `NewHandler`, `Handler` not defined.

- [ ] **Step 3: Implement handler**

Create `internal/camera/handler.go`:
```go
package camera

import (
	"encoding/json"
	"net/http"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	cameras, err := h.repo.GetAll()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if cameras == nil {
		cameras = []Camera{}
	}
	writeJSON(w, http.StatusOK, cameras)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var c Camera
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	created, err := h.repo.Create(&c)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var c Camera
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	c.ID = id

	updated, err := h.repo.Update(&c)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	if err := h.repo.Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
```

- [ ] **Step 4: Run tests**

```bash
go test ./internal/camera/ -run TestHandler -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/camera/handler.go internal/camera/handler_test.go
git commit -m "feat: camera HTTP handlers (list, create, update, delete)"
```

---

## Task 5: M3U Import

**Files:**
- Create: `internal/camera/import.go`
- Create: `internal/camera/import_test.go`

- [ ] **Step 1: Write import test**

Create `internal/camera/import_test.go`:
```go
package camera

import (
	"maps-cameras/internal/database"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseM3U(t *testing.T) {
	input := `#EXTM3U
#EXTINF:-1,Вход №1
rtsp://192.168.1.10/stream1
#EXTINF:-1,Парковка
rtsp://192.168.1.11/stream1
`
	entries, err := ParseM3U(strings.NewReader(input))
	if err != nil {
		t.Fatalf("ParseM3U failed: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[0].Name != "Вход №1" {
		t.Errorf("expected 'Вход №1', got '%s'", entries[0].Name)
	}
	if entries[0].URL != "rtsp://192.168.1.10/stream1" {
		t.Errorf("expected rtsp URL, got '%s'", entries[0].URL)
	}
	if entries[1].Name != "Парковка" {
		t.Errorf("expected 'Парковка', got '%s'", entries[1].Name)
	}
}

func TestParseM3UEmpty(t *testing.T) {
	entries, err := ParseM3U(strings.NewReader("#EXTM3U\n"))
	if err != nil {
		t.Fatalf("ParseM3U failed: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries, got %d", len(entries))
	}
}

func TestImportM3U(t *testing.T) {
	db, err := database.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	repo := NewRepository(db)

	input := `#EXTM3U
#EXTINF:-1,Cam1
rtsp://1.2.3.4/s1
#EXTINF:-1,Cam2
rtsp://1.2.3.4/s2
`
	result, err := ImportM3U(repo, strings.NewReader(input))
	if err != nil {
		t.Fatalf("ImportM3U failed: %v", err)
	}
	if result.Imported != 2 {
		t.Errorf("expected 2 imported, got %d", result.Imported)
	}

	// Import again — duplicates should be skipped
	input2 := `#EXTM3U
#EXTINF:-1,Cam1
rtsp://1.2.3.4/s1
#EXTINF:-1,Cam3
rtsp://1.2.3.4/s3
`
	result2, err := ImportM3U(repo, strings.NewReader(input2))
	if err != nil {
		t.Fatalf("ImportM3U failed: %v", err)
	}
	if result2.Imported != 1 {
		t.Errorf("expected 1 imported, got %d", result2.Imported)
	}
	if result2.Skipped != 1 {
		t.Errorf("expected 1 skipped, got %d", result2.Skipped)
	}

	all, _ := repo.GetAll()
	if len(all) != 3 {
		t.Errorf("expected 3 cameras total, got %d", len(all))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/camera/ -run "TestParseM3U|TestImportM3U" -v
```

Expected: FAIL — `ParseM3U`, `ImportM3U` not defined.

- [ ] **Step 3: Implement M3U parser and importer**

Create `internal/camera/import.go`:
```go
package camera

import (
	"bufio"
	"io"
	"strings"
)

type M3UEntry struct {
	Name string
	URL  string
}

type ImportResult struct {
	Imported int      `json:"imported"`
	Skipped  int      `json:"skipped"`
	Errors   []string `json:"errors"`
}

func ParseM3U(r io.Reader) ([]M3UEntry, error) {
	scanner := bufio.NewScanner(r)
	var entries []M3UEntry
	var currentName string

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		if strings.HasPrefix(line, "#EXTINF:") {
			// Extract name after the last comma
			if idx := strings.Index(line, ","); idx != -1 {
				currentName = strings.TrimSpace(line[idx+1:])
			}
		} else if line != "" && !strings.HasPrefix(line, "#") {
			name := currentName
			if name == "" {
				name = line
			}
			entries = append(entries, M3UEntry{Name: name, URL: line})
			currentName = ""
		}
	}

	return entries, scanner.Err()
}

func ImportM3U(repo *Repository, r io.Reader) (*ImportResult, error) {
	entries, err := ParseM3U(r)
	if err != nil {
		return nil, err
	}

	result := &ImportResult{}

	for _, entry := range entries {
		existing, err := repo.GetByRTSPURL(entry.URL)
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			continue
		}
		if existing != nil {
			result.Skipped++
			continue
		}

		_, err = repo.Create(&Camera{
			Name:    entry.Name,
			RTSPURL: entry.URL,
			Color:   "#7aa2f7",
		})
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			continue
		}
		result.Imported++
	}

	return result, nil
}
```

- [ ] **Step 4: Run tests**

```bash
go test ./internal/camera/ -run "TestParseM3U|TestImportM3U" -v
```

Expected: PASS.

- [ ] **Step 5: Add import HTTP handler to handler.go**

Add to the bottom of `internal/camera/handler.go`:
```go
func (h *Handler) Import(w http.ResponseWriter, r *http.Request) {
	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	result, err := ImportM3U(h.repo, file)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
```

- [ ] **Step 6: Commit**

```bash
git add internal/camera/import.go internal/camera/import_test.go internal/camera/handler.go
git commit -m "feat: M3U playlist import with duplicate detection"
```

---

## Task 6: Stream Tracker

**Files:**
- Create: `internal/stream/tracker.go`
- Create: `internal/stream/tracker_test.go`

- [ ] **Step 1: Write tracker test**

Create `internal/stream/tracker_test.go`:
```go
package stream

import (
	"testing"
	"time"
)

func TestTrackerAddAndRemove(t *testing.T) {
	tr := NewTracker()

	tr.Add("cam1", "rtsp://1.2.3.4/s1")

	if !tr.IsActive("cam1") {
		t.Error("expected cam1 to be active")
	}

	tr.Remove("cam1")

	if tr.IsActive("cam1") {
		t.Error("expected cam1 to be inactive after remove")
	}
}

func TestTrackerCleanup(t *testing.T) {
	tr := NewTracker()
	tr.Add("cam1", "rtsp://1.2.3.4/s1")

	// Simulate stale heartbeat
	tr.mu.Lock()
	tr.streams["cam1"].lastHeartbeat = time.Now().Add(-60 * time.Second)
	tr.mu.Unlock()

	stale := tr.GetStale(30 * time.Second)
	if len(stale) != 1 {
		t.Fatalf("expected 1 stale stream, got %d", len(stale))
	}
	if stale[0] != "cam1" {
		t.Errorf("expected 'cam1', got '%s'", stale[0])
	}
}

func TestTrackerTouch(t *testing.T) {
	tr := NewTracker()
	tr.Add("cam1", "rtsp://1.2.3.4/s1")

	// Make it stale
	tr.mu.Lock()
	tr.streams["cam1"].lastHeartbeat = time.Now().Add(-60 * time.Second)
	tr.mu.Unlock()

	// Touch refreshes it
	tr.Touch("cam1")

	stale := tr.GetStale(30 * time.Second)
	if len(stale) != 0 {
		t.Errorf("expected 0 stale after touch, got %d", len(stale))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/stream/ -v
```

Expected: FAIL — `NewTracker` not defined.

- [ ] **Step 3: Implement tracker**

Create `internal/stream/tracker.go`:
```go
package stream

import (
	"sync"
	"time"
)

type activeStream struct {
	cameraID      string
	rtspURL       string
	lastHeartbeat time.Time
}

type Tracker struct {
	mu      sync.Mutex
	streams map[string]*activeStream
}

func NewTracker() *Tracker {
	return &Tracker{
		streams: make(map[string]*activeStream),
	}
}

func (t *Tracker) Add(cameraID, rtspURL string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.streams[cameraID] = &activeStream{
		cameraID:      cameraID,
		rtspURL:       rtspURL,
		lastHeartbeat: time.Now(),
	}
}

func (t *Tracker) Remove(cameraID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.streams, cameraID)
}

func (t *Tracker) Touch(cameraID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if s, ok := t.streams[cameraID]; ok {
		s.lastHeartbeat = time.Now()
	}
}

func (t *Tracker) IsActive(cameraID string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	_, ok := t.streams[cameraID]
	return ok
}

func (t *Tracker) GetStale(timeout time.Duration) []string {
	t.mu.Lock()
	defer t.mu.Unlock()
	cutoff := time.Now().Add(-timeout)
	var stale []string
	for id, s := range t.streams {
		if s.lastHeartbeat.Before(cutoff) {
			stale = append(stale, id)
		}
	}
	return stale
}
```

- [ ] **Step 4: Run tests**

```bash
go test ./internal/stream/ -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/stream/tracker.go internal/stream/tracker_test.go
git commit -m "feat: stream tracker with heartbeat and stale cleanup"
```

---

## Task 7: Stream Proxy + Handlers

**Files:**
- Create: `internal/stream/proxy.go`
- Create: `internal/stream/handler.go`

- [ ] **Step 1: Implement go2rtc proxy**

Create `internal/stream/proxy.go`:
```go
package stream

import (
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/gorilla/websocket"
)

type Proxy struct {
	go2rtcURL string
	client    *http.Client
}

func NewProxy(go2rtcURL string) *Proxy {
	return &Proxy{
		go2rtcURL: go2rtcURL,
		client:    &http.Client{},
	}
}

func (p *Proxy) AddStream(name, rtspURL string) error {
	u := fmt.Sprintf("%s/api/streams?name=%s&src=%s", p.go2rtcURL, url.QueryEscape(name), url.QueryEscape(rtspURL))
	req, err := http.NewRequest(http.MethodPut, u, nil)
	if err != nil {
		return err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("go2rtc add stream failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("go2rtc error %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (p *Proxy) RemoveStream(name string) error {
	u := fmt.Sprintf("%s/api/streams?name=%s", p.go2rtcURL, url.QueryEscape(name))
	req, err := http.NewRequest(http.MethodDelete, u, nil)
	if err != nil {
		return err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("go2rtc remove stream failed: %w", err)
	}
	defer resp.Body.Close()
	return nil
}

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (p *Proxy) ProxyWebSocket(w http.ResponseWriter, r *http.Request, targetPath string) {
	// Connect to go2rtc WebSocket
	targetURL := fmt.Sprintf("ws://%s%s?%s",
		mustParseHost(p.go2rtcURL), targetPath, r.URL.RawQuery)

	backendConn, _, err := websocket.DefaultDialer.Dial(targetURL, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("go2rtc ws connect failed: %v", err), http.StatusBadGateway)
		return
	}
	defer backendConn.Close()

	// Upgrade client connection
	clientConn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer clientConn.Close()

	// Bidirectional proxy
	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			msgType, msg, err := backendConn.ReadMessage()
			if err != nil {
				return
			}
			if err := clientConn.WriteMessage(msgType, msg); err != nil {
				return
			}
		}
	}()

	for {
		msgType, msg, err := clientConn.ReadMessage()
		if err != nil {
			return
		}
		if err := backendConn.WriteMessage(msgType, msg); err != nil {
			return
		}
	}
}

func mustParseHost(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	return u.Host
}
```

- [ ] **Step 2: Implement stream handlers**

Create `internal/stream/handler.go`:
```go
package stream

import (
	"encoding/json"
	"fmt"
	"log"
	"maps-cameras/internal/camera"
	"net/http"
	"time"
)

type Handler struct {
	proxy   *Proxy
	tracker *Tracker
	repo    *camera.Repository
}

type StartRequest struct {
	CameraID string `json:"camera_id"`
}

type StartResponse struct {
	StreamName string `json:"stream_name"`
	WebRTCURL  string `json:"webrtc_url"`
	WSURL      string `json:"ws_url"`
}

func NewHandler(proxy *Proxy, tracker *Tracker, repo *camera.Repository) *Handler {
	h := &Handler{proxy: proxy, tracker: tracker, repo: repo}
	go h.cleanupLoop()
	return h
}

func (h *Handler) Start(w http.ResponseWriter, r *http.Request) {
	var req StartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	cam, err := h.repo.GetByID(req.CameraID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	streamName := fmt.Sprintf("mc_%s", cam.ID)

	if err := h.proxy.AddStream(streamName, cam.RTSPURL); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	h.tracker.Add(cam.ID, cam.RTSPURL)

	resp := StartResponse{
		StreamName: streamName,
		WebRTCURL:  fmt.Sprintf("/api/stream/webrtc?src=%s", streamName),
		WSURL:      fmt.Sprintf("/api/stream/ws?src=%s", streamName),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) Stop(w http.ResponseWriter, r *http.Request) {
	var req StartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	streamName := fmt.Sprintf("mc_%s", req.CameraID)
	h.proxy.RemoveStream(streamName)
	h.tracker.Remove(req.CameraID)

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) WebRTC(w http.ResponseWriter, r *http.Request) {
	h.proxy.ProxyWebSocket(w, r, "/api/ws")
}

func (h *Handler) WS(w http.ResponseWriter, r *http.Request) {
	h.proxy.ProxyWebSocket(w, r, "/api/ws")
}

func (h *Handler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	var req StartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	h.tracker.Touch(req.CameraID)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) cleanupLoop() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		stale := h.tracker.GetStale(30 * time.Second)
		for _, cameraID := range stale {
			streamName := fmt.Sprintf("mc_%s", cameraID)
			h.proxy.RemoveStream(streamName)
			h.tracker.Remove(cameraID)
			log.Printf("cleaned up stale stream: %s", cameraID)
		}
	}
}
```

- [ ] **Step 3: Install websocket dependency**

```bash
go get github.com/gorilla/websocket
```

- [ ] **Step 4: Verify compilation**

```bash
go build ./internal/stream/
```

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add internal/stream/proxy.go internal/stream/handler.go go.mod go.sum
git commit -m "feat: stream proxy to go2rtc with lifecycle management and cleanup"
```

---

## Task 8: Router + Main Server

**Files:**
- Create: `internal/router/router.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Create router**

Create `internal/router/router.go`:
```go
package router

import (
	"embed"
	"io/fs"
	"maps-cameras/internal/camera"
	"maps-cameras/internal/config"
	"maps-cameras/internal/stream"
	"net/http"
)

func New(cfg *config.Config, camHandler *camera.Handler, streamHandler *stream.Handler, staticFS embed.FS) http.Handler {
	mux := http.NewServeMux()

	// Camera API
	mux.HandleFunc("GET /api/cameras", camHandler.List)
	mux.HandleFunc("POST /api/cameras", camHandler.Create)
	mux.HandleFunc("PUT /api/cameras/{id}", camHandler.Update)
	mux.HandleFunc("DELETE /api/cameras/{id}", camHandler.Delete)
	mux.HandleFunc("POST /api/cameras/import", camHandler.Import)

	// Stream API
	mux.HandleFunc("POST /api/stream/start", streamHandler.Start)
	mux.HandleFunc("POST /api/stream/stop", streamHandler.Stop)
	mux.HandleFunc("POST /api/stream/heartbeat", streamHandler.Heartbeat)
	mux.HandleFunc("/api/stream/webrtc", streamHandler.WebRTC)
	mux.HandleFunc("/api/stream/ws", streamHandler.WS)

	// Map config endpoint
	mux.HandleFunc("GET /api/config/map", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"center":[` +
			formatFloat(cfg.Map.Center[0]) + `,` + formatFloat(cfg.Map.Center[1]) +
			`],"zoom":` + formatInt(cfg.Map.Zoom) + `}`))
	})

	// Static files (SPA)
	distFS, err := fs.Sub(staticFS, "dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(distFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Try to serve the file; if not found, serve index.html (SPA routing)
		path := r.URL.Path
		f, err := distFS.(fs.ReadFileFS).ReadFile(path[1:]) // strip leading /
		if err != nil || path == "/" {
			// Serve index.html for SPA routing
			index, _ := distFS.(fs.ReadFileFS).ReadFile("index.html")
			w.Header().Set("Content-Type", "text/html")
			w.Write(index)
			return
		}
		_ = f
		fileServer.ServeHTTP(w, r)
	})

	return corsMiddleware(mux)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func formatFloat(f float64) string {
	return fmt.Sprintf("%g", f)
}

func formatInt(i int) string {
	return fmt.Sprintf("%d", i)
}
```

Add the missing import at the top of `internal/router/router.go`:
```go
import (
	"embed"
	"fmt"
	"io/fs"
	"maps-cameras/internal/camera"
	"maps-cameras/internal/config"
	"maps-cameras/internal/stream"
	"net/http"
)
```

- [ ] **Step 2: Update main.go**

Replace `cmd/server/main.go` with:
```go
package main

import (
	"embed"
	"fmt"
	"log"
	"maps-cameras/internal/camera"
	"maps-cameras/internal/config"
	"maps-cameras/internal/database"
	"maps-cameras/internal/router"
	"maps-cameras/internal/stream"
	"net/http"
	"os"
)

//go:embed all:../../web/dist
var staticFS embed.FS

func main() {
	cfgPath := "config.yaml"
	if len(os.Args) > 1 {
		cfgPath = os.Args[1]
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	db, err := database.Open(cfg.Database.Path)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	camRepo := camera.NewRepository(db)
	camHandler := camera.NewHandler(camRepo)

	streamProxy := stream.NewProxy(cfg.Go2RTC.URL)
	streamTracker := stream.NewTracker()
	streamHandler := stream.NewHandler(streamProxy, streamTracker, camRepo)

	handler := router.New(cfg, camHandler, streamHandler, staticFS)

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("Starting server on %s", addr)
	log.Printf("go2rtc at %s", cfg.Go2RTC.URL)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
```

- [ ] **Step 3: Verify compilation**

```bash
go build ./internal/router/
```

Note: `cmd/server/main.go` won't compile until `web/dist/` exists with at least `index.html`. That's expected — it will work after the frontend build step.

- [ ] **Step 4: Commit**

```bash
git add internal/router/router.go cmd/server/main.go
git commit -m "feat: HTTP router with all API routes and SPA static serving"
```

---

## Task 9: Frontend Scaffold

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/tailwind.config.js`, `web/index.html`
- Create: `web/src/index.tsx`, `web/src/app/App.tsx`
- Create: `web/src/shared/types.ts`, `web/src/shared/api.ts`

- [ ] **Step 1: Initialize frontend project**

```bash
cd c:/Users/sokol/Documents/maps-cameras
mkdir -p web/src/app web/src/shared web/src/modules
cd web
npm init -y
npm install react react-dom zustand leaflet react-leaflet
npm install -D typescript @types/react @types/react-dom @types/leaflet vite @vitejs/plugin-react tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Create tsconfig.json**

Create `web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts**

Create `web/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

- [ ] **Step 4: Create shared types**

Create `web/src/shared/types.ts`:
```typescript
export interface Camera {
  id: string;
  name: string;
  rtsp_url: string;
  color: string;
  lat: number | null;
  lng: number | null;
  rotation: number;
  angle: number;
  distance: number;
  created_at: string;
  updated_at: string;
}

export type AppMode = "view" | "edit";

export interface MapConfig {
  center: [number, number];
  zoom: number;
}

export interface StreamInfo {
  stream_name: string;
  webrtc_url: string;
  ws_url: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}
```

- [ ] **Step 5: Create API client**

Create `web/src/shared/api.ts`:
```typescript
const BASE = "/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}${path}`, { method: "POST", body: form }).then(
      (res) => res.json() as Promise<T>
    );
  },
};
```

- [ ] **Step 6: Create index.html**

Create `web/index.html`:
```html
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Maps Cameras</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create entry point and App**

Create `web/src/index.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Create `web/src/index.css`:
```css
@import "tailwindcss";
@import "leaflet/dist/leaflet.css";

html, body, #root {
  height: 100%;
  margin: 0;
  padding: 0;
}
```

Create `web/src/app/App.tsx`:
```tsx
export function App() {
  return (
    <div className="h-full flex items-center justify-center bg-gray-900 text-white">
      <p>Maps Cameras</p>
    </div>
  );
}
```

- [ ] **Step 8: Verify frontend builds**

```bash
cd c:/Users/sokol/Documents/maps-cameras/web
npx tsc --noEmit
npm run build
```

Add build script to `web/package.json` if not present — set `"scripts": { "dev": "vite", "build": "vite build" }`.

- [ ] **Step 9: Commit**

```bash
git add web/
git commit -m "feat: frontend scaffold with Vite, React, TypeScript, Tailwind, shared types and API client"
```

---

## Task 10: Map Module — MapView + Tile Layers

**Files:**
- Create: `web/src/modules/map/MapView.tsx`
- Create: `web/src/modules/map/mapStore.ts`
- Modify: `web/src/app/App.tsx`

- [ ] **Step 1: Create map store**

Create `web/src/modules/map/mapStore.ts`:
```typescript
import { create } from "zustand";

type TileLayer = "streets" | "satellite";

interface MapState {
  center: [number, number];
  zoom: number;
  tileLayer: TileLayer;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  toggleTileLayer: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  center: [54.3142, 48.4031],
  zoom: 18,
  tileLayer: "streets",
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  toggleTileLayer: () =>
    set((s) => ({
      tileLayer: s.tileLayer === "streets" ? "satellite" : "streets",
    })),
}));
```

- [ ] **Step 2: Create MapView component**

Create `web/src/modules/map/MapView.tsx`:
```tsx
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { useMapStore } from "./mapStore";
import { useEffect } from "react";

const TILE_URLS = {
  streets: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  satellite:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

const TILE_ATTR = {
  streets: "&copy; OpenStreetMap contributors",
  satellite: "&copy; Esri World Imagery",
};

function MapController() {
  const map = useMap();
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);

  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);

  // Maintain center on resize
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
      map.setView(map.getCenter(), map.getZoom());
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [map]);

  return null;
}

function TileLayerSwitch() {
  const tileLayer = useMapStore((s) => s.tileLayer);
  return (
    <TileLayer
      key={tileLayer}
      url={TILE_URLS[tileLayer]}
      attribution={TILE_ATTR[tileLayer]}
      maxZoom={20}
    />
  );
}

export function MapView({ children }: { children?: React.ReactNode }) {
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const tileLayer = useMapStore((s) => s.tileLayer);
  const toggleTileLayer = useMapStore((s) => s.toggleTileLayer);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full"
        zoomControl={false}
      >
        <MapController />
        <TileLayerSwitch />
        {children}
      </MapContainer>

      {/* Tile layer toggle */}
      <button
        onClick={toggleTileLayer}
        className="absolute bottom-3 right-3 z-[1000] bg-gray-800 text-white text-sm px-3 py-1.5 rounded shadow hover:bg-gray-700"
      >
        {tileLayer === "streets" ? "Спутник" : "Улицы"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Update App.tsx to show the map**

Replace `web/src/app/App.tsx`:
```tsx
import { MapView } from "@/modules/map/MapView";

export function App() {
  return (
    <div className="h-full bg-gray-900">
      <MapView />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd c:/Users/sokol/Documents/maps-cameras/web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/modules/map/ web/src/app/App.tsx
git commit -m "feat: MapView with OpenStreetMap/Esri tile layer toggle"
```

---

## Task 11: Camera Store + API

**Files:**
- Create: `web/src/modules/camera/cameraApi.ts`
- Create: `web/src/modules/camera/cameraStore.ts`

- [ ] **Step 1: Create camera API**

Create `web/src/modules/camera/cameraApi.ts`:
```typescript
import { api } from "@/shared/api";
import type { Camera, ImportResult } from "@/shared/types";

export const cameraApi = {
  getAll: () => api.get<Camera[]>("/cameras"),
  create: (data: Partial<Camera>) => api.post<Camera>("/cameras", data),
  update: (id: string, data: Partial<Camera>) =>
    api.put<Camera>(`/cameras/${id}`, data),
  delete: (id: string) => api.del(`/cameras/${id}`),
  importM3U: (file: File) => api.upload<ImportResult>("/cameras/import", file),
};
```

- [ ] **Step 2: Create camera store**

Create `web/src/modules/camera/cameraStore.ts`:
```typescript
import { create } from "zustand";
import type { Camera } from "@/shared/types";
import { cameraApi } from "./cameraApi";

interface CameraState {
  cameras: Camera[];
  selectedId: string | null;
  loading: boolean;

  fetchCameras: () => Promise<void>;
  createCamera: (data: Partial<Camera>) => Promise<Camera>;
  updateCamera: (id: string, data: Partial<Camera>) => Promise<Camera>;
  deleteCamera: (id: string) => Promise<void>;
  selectCamera: (id: string | null) => void;
}

export const useCameraStore = create<CameraState>((set, get) => ({
  cameras: [],
  selectedId: null,
  loading: false,

  fetchCameras: async () => {
    set({ loading: true });
    const cameras = await cameraApi.getAll();
    set({ cameras, loading: false });
  },

  createCamera: async (data) => {
    const camera = await cameraApi.create(data);
    set((s) => ({ cameras: [...s.cameras, camera] }));
    return camera;
  },

  updateCamera: async (id, data) => {
    const updated = await cameraApi.update(id, data);
    set((s) => ({
      cameras: s.cameras.map((c) => (c.id === id ? updated : c)),
    }));
    return updated;
  },

  deleteCamera: async (id) => {
    await cameraApi.delete(id);
    set((s) => ({
      cameras: s.cameras.filter((c) => c.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  selectCamera: (id) => set({ selectedId: id }),
}));
```

- [ ] **Step 3: Verify build**

```bash
cd c:/Users/sokol/Documents/maps-cameras/web
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add web/src/modules/camera/cameraApi.ts web/src/modules/camera/cameraStore.ts
git commit -m "feat: camera store with CRUD API integration"
```

---

## Task 12: Camera Marker with Cone (SVG)

**Files:**
- Create: `web/src/modules/map/CameraMarker.tsx`
- Modify: `web/src/modules/map/MapView.tsx`

- [ ] **Step 1: Create CameraMarker component**

Create `web/src/modules/map/CameraMarker.tsx`:
```tsx
import { Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useRef } from "react";
import type { Camera } from "@/shared/types";

interface CameraMarkerProps {
  camera: Camera;
  isActive: boolean;
  onClick: (id: string) => void;
}

function createCameraIcon(color: string, isActive: boolean): L.DivIcon {
  const size = isActive ? 18 : 14;
  const border = isActive ? `3px solid #e0af68` : `2px solid #fff`;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: 50%;
      border: ${border};
      box-shadow: 0 0 8px ${color}80;
    "></div>`,
  });
}

function getConePoints(
  map: L.Map,
  latlng: L.LatLng,
  rotation: number,
  angle: number,
  distance: number
): L.LatLng[] {
  const startAngle = rotation - angle / 2;
  const endAngle = rotation + angle / 2;
  const steps = Math.max(8, Math.ceil(angle / 5));
  const points: L.LatLng[] = [latlng];

  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / steps);
    const rad = (a * Math.PI) / 180;
    // Approximate: 1 meter ≈ 1/111320 degrees lat
    const dLat = (distance * Math.cos(rad)) / 111320;
    const dLng =
      (distance * Math.sin(rad)) /
      (111320 * Math.cos((latlng.lat * Math.PI) / 180));
    points.push(L.latLng(latlng.lat + dLat, latlng.lng + dLng));
  }

  points.push(latlng);
  return points;
}

export function CameraMarker({ camera, isActive, onClick }: CameraMarkerProps) {
  const map = useMap();
  const coneRef = useRef<L.Polygon | null>(null);

  const position: L.LatLngExpression | null =
    camera.lat != null && camera.lng != null
      ? [camera.lat, camera.lng]
      : null;

  useEffect(() => {
    if (!position) return;

    const latlng = L.latLng(position[0], position[1]);
    const points = getConePoints(
      map,
      latlng,
      camera.rotation,
      camera.angle,
      camera.distance
    );

    if (coneRef.current) {
      coneRef.current.setLatLngs(points);
      coneRef.current.setStyle({
        fillColor: camera.color,
        color: camera.color,
        fillOpacity: isActive ? 0.25 : 0.15,
        weight: isActive ? 2 : 1,
      });
    } else {
      coneRef.current = L.polygon(points, {
        fillColor: camera.color,
        color: camera.color,
        fillOpacity: isActive ? 0.25 : 0.15,
        weight: isActive ? 2 : 1,
        dashArray: isActive ? undefined : "4 3",
        interactive: false,
      }).addTo(map);
    }

    return () => {
      if (coneRef.current) {
        coneRef.current.remove();
        coneRef.current = null;
      }
    };
  }, [map, position, camera.rotation, camera.angle, camera.distance, camera.color, isActive]);

  if (!position) return null;

  return (
    <Marker
      position={position}
      icon={createCameraIcon(camera.color, isActive)}
      eventHandlers={{
        click: () => onClick(camera.id),
      }}
    />
  );
}
```

- [ ] **Step 2: Add markers to MapView**

Add to `web/src/modules/map/MapView.tsx` — import `CameraMarker` and `useCameraStore`, render markers inside `MapContainer`:

After `<TileLayerSwitch />` add:
```tsx
{children}
```

This is already there. The actual wiring of markers will happen in App.tsx. Add an export of CameraMarker from the map module.

- [ ] **Step 3: Verify build**

```bash
cd c:/Users/sokol/Documents/maps-cameras/web
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add web/src/modules/map/CameraMarker.tsx
git commit -m "feat: camera marker with SVG cone of view on map"
```

---

## Task 13: Editor Store + History (Undo/Redo)

**Files:**
- Create: `web/src/modules/editor/editorStore.ts`
- Create: `web/src/modules/editor/historyStore.ts`

- [ ] **Step 1: Create editor store**

Create `web/src/modules/editor/editorStore.ts`:
```typescript
import { create } from "zustand";
import type { AppMode } from "@/shared/types";

interface EditorState {
  mode: AppMode;
  editingCameraId: string | null;
  setMode: (mode: AppMode) => void;
  setEditingCameraId: (id: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  mode: "view",
  editingCameraId: null,
  setMode: (mode) => set({ mode, editingCameraId: null }),
  setEditingCameraId: (id) => set({ editingCameraId: id }),
}));
```

- [ ] **Step 2: Create history store**

Create `web/src/modules/editor/historyStore.ts`:
```typescript
import { create } from "zustand";
import type { Camera } from "@/shared/types";

interface HistoryState {
  undoStack: Camera[][];
  redoStack: Camera[][];
  pushSnapshot: (cameras: Camera[]) => void;
  undo: () => Camera[] | null;
  redo: () => Camera[] | null;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushSnapshot: (cameras) => {
    const snapshot = cameras.map((c) => ({ ...c }));
    set((s) => ({
      undoStack: [...s.undoStack, snapshot],
      redoStack: [],
    }));
  },

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length < 2) return null;
    const current = undoStack[undoStack.length - 1];
    const previous = undoStack[undoStack.length - 2];
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, current],
    }));
    return previous;
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return null;
    const next = redoStack[redoStack.length - 1];
    set((s) => ({
      undoStack: [...s.undoStack, next],
      redoStack: s.redoStack.slice(0, -1),
    }));
    return next;
  },

  clear: () => set({ undoStack: [], redoStack: [] }),
}));
```

- [ ] **Step 3: Verify build**

```bash
cd c:/Users/sokol/Documents/maps-cameras/web
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add web/src/modules/editor/editorStore.ts web/src/modules/editor/historyStore.ts
git commit -m "feat: editor store with undo/redo history via snapshots"
```

---

## Task 14: Stream Module — Player + API

**Files:**
- Create: `web/src/modules/stream/streamApi.ts`
- Create: `web/src/modules/stream/streamStore.ts`
- Create: `web/src/modules/stream/StreamPlayer.tsx`

- [ ] **Step 1: Create stream API**

Create `web/src/modules/stream/streamApi.ts`:
```typescript
import { api } from "@/shared/api";
import type { StreamInfo } from "@/shared/types";

export const streamApi = {
  start: (cameraId: string) =>
    api.post<StreamInfo>("/stream/start", { camera_id: cameraId }),
  stop: (cameraId: string) =>
    api.post("/stream/stop", { camera_id: cameraId }),
  heartbeat: (cameraId: string) =>
    api.post("/stream/heartbeat", { camera_id: cameraId }),
};
```

- [ ] **Step 2: Create stream store**

Create `web/src/modules/stream/streamStore.ts`:
```typescript
import { create } from "zustand";
import type { StreamInfo } from "@/shared/types";
import { streamApi } from "./streamApi";

interface StreamState {
  activeCameraId: string | null;
  streamInfo: StreamInfo | null;
  loading: boolean;
  error: string | null;
  heartbeatInterval: ReturnType<typeof setInterval> | null;

  startStream: (cameraId: string) => Promise<void>;
  stopStream: () => Promise<void>;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  activeCameraId: null,
  streamInfo: null,
  loading: false,
  error: null,
  heartbeatInterval: null,

  startStream: async (cameraId) => {
    const { activeCameraId, stopStream } = get();
    if (activeCameraId) await stopStream();

    set({ loading: true, error: null });
    try {
      const info = await streamApi.start(cameraId);
      const interval = setInterval(() => {
        streamApi.heartbeat(cameraId).catch(() => {});
      }, 10_000);
      set({
        activeCameraId: cameraId,
        streamInfo: info,
        loading: false,
        heartbeatInterval: interval,
      });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  stopStream: async () => {
    const { activeCameraId, heartbeatInterval } = get();
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (activeCameraId) {
      await streamApi.stop(activeCameraId).catch(() => {});
    }
    set({
      activeCameraId: null,
      streamInfo: null,
      heartbeatInterval: null,
    });
  },
}));
```

- [ ] **Step 3: Create StreamPlayer component**

Create `web/src/modules/stream/StreamPlayer.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { useStreamStore } from "./streamStore";

export function StreamPlayer() {
  const streamInfo = useStreamStore((s) => s.streamInfo);
  const loading = useStreamStore((s) => s.loading);
  const error = useStreamStore((s) => s.error);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!streamInfo || !videoRef.current) return;

    const video = videoRef.current;

    // Try MSE via WebSocket
    const wsUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${streamInfo.ws_url}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    let mediaSource: MediaSource | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    const queue: ArrayBuffer[] = [];

    ws.onopen = () => {
      // Request MSE stream
      ws.send(JSON.stringify({ type: "mse" }));
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        const msg = JSON.parse(event.data);
        if (msg.type === "mse") {
          // Received codec info, init MediaSource
          mediaSource = new MediaSource();
          video.src = URL.createObjectURL(mediaSource);
          mediaSource.addEventListener("sourceopen", () => {
            try {
              sourceBuffer = mediaSource!.addSourceBuffer(msg.value);
              sourceBuffer.mode = "segments";
              sourceBuffer.addEventListener("updateend", () => {
                if (queue.length > 0 && sourceBuffer && !sourceBuffer.updating) {
                  sourceBuffer.appendBuffer(queue.shift()!);
                }
              });
            } catch (e) {
              console.error("MSE codec not supported:", e);
            }
          });
          video.play().catch(() => {});
        }
      } else if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buf) => {
          if (sourceBuffer && !sourceBuffer.updating) {
            sourceBuffer.appendBuffer(buf);
          } else {
            queue.push(buf);
          }
        });
      }
    };

    ws.onerror = () => {
      console.error("WebSocket error, stream may not be available");
    };

    return () => {
      ws.close();
      wsRef.current = null;
      if (mediaSource && mediaSource.readyState === "open") {
        mediaSource.endOfStream();
      }
      video.src = "";
    };
  }, [streamInfo]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-gray-400">
        Подключение...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-red-400">
        Ошибка: {error}
      </div>
    );
  }

  if (!streamInfo) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950 text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-2">📹</div>
          <p>Выберите камеру на карте</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="max-h-full max-w-full"
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd c:/Users/sokol/Documents/maps-cameras/web
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add web/src/modules/stream/
git commit -m "feat: stream player with MSE WebSocket and heartbeat"
```

---

## Task 15: Viewer Layout (Split Pane)

**Files:**
- Create: `web/src/shared/hooks.ts`
- Create: `web/src/app/ViewerLayout.tsx`
- Modify: `web/src/app/App.tsx`

- [ ] **Step 1: Create shared hooks**

Create `web/src/shared/hooks.ts`:
```typescript
import { useEffect, useRef, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

export function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
```

- [ ] **Step 2: Create ViewerLayout**

Create `web/src/app/ViewerLayout.tsx`:
```tsx
import { useRef, useState, useCallback, useEffect } from "react";
import { MapView } from "@/modules/map/MapView";
import { CameraMarker } from "@/modules/map/CameraMarker";
import { StreamPlayer } from "@/modules/stream/StreamPlayer";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useStreamStore } from "@/modules/stream/streamStore";
import { useEditorStore } from "@/modules/editor/editorStore";
import { useMediaQuery } from "@/shared/hooks";

export function ViewerLayout() {
  const cameras = useCameraStore((s) => s.cameras);
  const selectedId = useCameraStore((s) => s.selectedId);
  const selectCamera = useCameraStore((s) => s.selectCamera);
  const startStream = useStreamStore((s) => s.startStream);
  const stopStream = useStreamStore((s) => s.stopStream);
  const activeCameraId = useStreamStore((s) => s.activeCameraId);
  const setMode = useEditorStore((s) => s.setMode);
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [splitPercent, setSplitPercent] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleCameraClick = useCallback(
    (id: string) => {
      selectCamera(id);
      startStream(id);
    },
    [selectCamera, startStream]
  );

  const handleMouseDown = useCallback(() => {
    dragging.current = true;
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.max(20, Math.min(80, percent)));
    };
    const handleMouseUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Mobile: show stream fullscreen
  if (isMobile && activeCameraId) {
    return (
      <div className="h-full relative">
        <StreamPlayer />
        <button
          onClick={() => {
            stopStream();
            selectCamera(null);
          }}
          className="absolute top-3 left-3 z-10 bg-gray-800/80 text-white px-3 py-1.5 rounded"
        >
          ← Карта
        </button>
      </div>
    );
  }

  // Mobile: map only
  if (isMobile) {
    return (
      <div className="h-full relative">
        <MapView>
          {cameras
            .filter((c) => c.lat != null)
            .map((c) => (
              <CameraMarker
                key={c.id}
                camera={c}
                isActive={c.id === selectedId}
                onClick={handleCameraClick}
              />
            ))}
        </MapView>
        <button
          onClick={() => setMode("edit")}
          className="absolute bottom-3 left-3 z-[1000] bg-gray-800 text-white text-sm px-3 py-1.5 rounded shadow"
        >
          ✏️ Редактирование
        </button>
      </div>
    );
  }

  // Desktop: split
  return (
    <div ref={containerRef} className="h-full flex relative">
      <div style={{ width: `${splitPercent}%` }} className="relative">
        <MapView>
          {cameras
            .filter((c) => c.lat != null)
            .map((c) => (
              <CameraMarker
                key={c.id}
                camera={c}
                isActive={c.id === selectedId}
                onClick={handleCameraClick}
              />
            ))}
        </MapView>
        <button
          onClick={() => setMode("edit")}
          className="absolute bottom-3 left-3 z-[1000] bg-gray-800 text-white text-sm px-3 py-1.5 rounded shadow"
        >
          ✏️ Редактирование
        </button>
      </div>

      {/* Resizable divider */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1.5 bg-gray-700 hover:bg-blue-500 cursor-col-resize flex-shrink-0 flex items-center justify-center"
      >
        <div className="w-0.5 h-8 bg-gray-500 rounded" />
      </div>

      <div style={{ width: `${100 - splitPercent}%` }}>
        <StreamPlayer />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update App.tsx**

Replace `web/src/app/App.tsx`:
```tsx
import { useEffect } from "react";
import { ViewerLayout } from "./ViewerLayout";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useEditorStore } from "@/modules/editor/editorStore";
import { useMapStore } from "@/modules/map/mapStore";
import { api } from "@/shared/api";
import type { MapConfig } from "@/shared/types";

export function App() {
  const fetchCameras = useCameraStore((s) => s.fetchCameras);
  const mode = useEditorStore((s) => s.mode);

  useEffect(() => {
    fetchCameras();
    api.get<MapConfig>("/config/map").then((cfg) => {
      useMapStore.getState().setCenter(cfg.center);
      useMapStore.getState().setZoom(cfg.zoom);
    });
  }, [fetchCameras]);

  if (mode === "edit") {
    // EditorLayout will be implemented in Task 16
    return <div className="h-full bg-gray-900 text-white p-4">Editor (TODO)</div>;
  }

  return <ViewerLayout />;
}
```

- [ ] **Step 4: Verify build**

```bash
cd c:/Users/sokol/Documents/maps-cameras/web
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add web/src/app/ViewerLayout.tsx web/src/app/App.tsx web/src/shared/hooks.ts
git commit -m "feat: viewer layout with resizable split pane and mobile support"
```

---

## Task 16: Editor Layout + Camera List + Camera Form

**Files:**
- Create: `web/src/modules/camera/CameraList.tsx`
- Create: `web/src/modules/camera/CameraForm.tsx`
- Create: `web/src/modules/editor/EditorLayout.tsx`
- Modify: `web/src/app/App.tsx`

- [ ] **Step 1: Create CameraList**

Create `web/src/modules/camera/CameraList.tsx`:
```tsx
import { useCameraStore } from "./cameraStore";
import { useEditorStore } from "@/modules/editor/editorStore";

export function CameraList() {
  const cameras = useCameraStore((s) => s.cameras);
  const editingId = useEditorStore((s) => s.editingCameraId);
  const setEditingId = useEditorStore((s) => s.setEditingCameraId);

  return (
    <div className="h-full flex flex-col bg-gray-900 border-r border-gray-700 p-3">
      <h3 className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-3">
        Камеры
      </h3>

      <div className="flex-1 overflow-y-auto space-y-1.5">
        {cameras.map((cam) => {
          const onMap = cam.lat != null;
          return (
            <div
              key={cam.id}
              draggable={!onMap}
              onDragStart={(e) => {
                e.dataTransfer.setData("camera-id", cam.id);
              }}
              onClick={() => setEditingId(cam.id)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded cursor-pointer border transition
                ${editingId === cam.id ? "border-blue-500 bg-gray-800" : "border-gray-700 bg-gray-850 hover:bg-gray-800"}
                ${!onMap ? "cursor-grab" : ""}
                ${onMap ? "opacity-60" : ""}
              `}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: cam.color }}
              />
              <span className="text-sm text-gray-200 flex-1 truncate">
                {cam.name}
              </span>
              {onMap && (
                <span className="text-xs text-gray-500">✓</span>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setEditingId("new")}
        className="mt-3 bg-blue-600 hover:bg-blue-500 text-white text-sm py-2 rounded font-medium"
      >
        + Добавить
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create CameraForm**

Create `web/src/modules/camera/CameraForm.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useCameraStore } from "./cameraStore";
import { useEditorStore } from "@/modules/editor/editorStore";
import { useHistoryStore } from "@/modules/editor/historyStore";

const COLORS = [
  "#f7768e", "#7aa2f7", "#9ece6a", "#e0af68",
  "#bb9af7", "#73daca", "#ff9e64", "#7dcfff",
];

export function CameraForm() {
  const editingId = useEditorStore((s) => s.editingCameraId);
  const setEditingId = useEditorStore((s) => s.setEditingCameraId);
  const cameras = useCameraStore((s) => s.cameras);
  const createCamera = useCameraStore((s) => s.createCamera);
  const updateCamera = useCameraStore((s) => s.updateCamera);
  const deleteCamera = useCameraStore((s) => s.deleteCamera);
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot);

  const isNew = editingId === "new";
  const camera = isNew ? null : cameras.find((c) => c.id === editingId);

  const [name, setName] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  useEffect(() => {
    if (camera) {
      setName(camera.name);
      setRtspUrl(camera.rtsp_url);
      setColor(camera.color);
    } else {
      setName("");
      setRtspUrl("");
      setColor(COLORS[0]);
    }
  }, [camera, editingId]);

  if (!editingId) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-500 text-sm border-l border-gray-700">
        Выберите камеру для редактирования
      </div>
    );
  }

  const handleSave = async () => {
    pushSnapshot(cameras);
    if (isNew) {
      await createCamera({ name, rtsp_url: rtspUrl, color });
    } else if (camera) {
      await updateCamera(camera.id, { ...camera, name, rtsp_url: rtspUrl, color });
    }
    setEditingId(null);
  };

  const handleDelete = async () => {
    if (camera) {
      pushSnapshot(cameras);
      await deleteCamera(camera.id);
      setEditingId(null);
    }
  };

  return (
    <div className="h-full bg-gray-900 border-l border-gray-700 p-4 flex flex-col">
      <h3 className="text-sm font-bold text-gray-300 mb-4">
        {isNew ? "Новая камера" : "Редактирование камеры"}
      </h3>

      <div className="space-y-4 flex-1">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Название</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            placeholder="Вход №1"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">RTSP URL</label>
          <input
            value={rtspUrl}
            onChange={(e) => setRtspUrl(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            placeholder="rtsp://192.168.1.10/stream1"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Цвет</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded transition"
                style={{
                  backgroundColor: c,
                  border: c === color ? "3px solid white" : "2px solid transparent",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={!name || !rtspUrl}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm py-2 rounded font-medium"
        >
          Сохранить
        </button>
        {!isNew && (
          <button
            onClick={handleDelete}
            className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800/50 text-sm py-2 rounded"
          >
            Удалить
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create EditorLayout**

Create `web/src/modules/editor/EditorLayout.tsx`:
```tsx
import { useEffect } from "react";
import { MapView } from "@/modules/map/MapView";
import { CameraMarker } from "@/modules/map/CameraMarker";
import { CameraList } from "@/modules/camera/CameraList";
import { CameraForm } from "@/modules/camera/CameraForm";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useEditorStore } from "./editorStore";
import { useHistoryStore } from "./historyStore";

export function EditorLayout() {
  const cameras = useCameraStore((s) => s.cameras);
  const selectCamera = useCameraStore((s) => s.selectCamera);
  const selectedId = useCameraStore((s) => s.selectedId);
  const setMode = useEditorStore((s) => s.setMode);
  const setEditingId = useEditorStore((s) => s.setEditingCameraId);
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const clear = useHistoryStore((s) => s.clear);
  const fetchCameras = useCameraStore((s) => s.fetchCameras);

  // Initialize history on enter
  useEffect(() => {
    pushSnapshot(cameras);
    return () => clear();
  }, []);

  // Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const prev = undo();
        if (prev) {
          useCameraStore.setState({ cameras: prev });
          // TODO: sync to server
        }
      }
      if (e.ctrlKey && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        const next = redo();
        if (next) {
          useCameraStore.setState({ cameras: next });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const handleCameraClick = (id: string) => {
    selectCamera(id);
    setEditingId(id);
  };

  const handleExitEdit = () => {
    fetchCameras(); // re-sync from server
    setMode("view");
  };

  return (
    <div className="h-full flex">
      {/* Camera list sidebar */}
      <div className="w-[200px] flex-shrink-0">
        <CameraList />
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapView>
          {cameras
            .filter((c) => c.lat != null)
            .map((c) => (
              <CameraMarker
                key={c.id}
                camera={c}
                isActive={c.id === selectedId}
                onClick={handleCameraClick}
              />
            ))}
        </MapView>

        {/* Edit mode indicator */}
        <div className="absolute top-3 left-3 z-[1000] bg-amber-900/30 text-amber-400 text-xs px-2.5 py-1 rounded border border-amber-700/30">
          🔧 Режим редактирования
        </div>

        <button
          onClick={handleExitEdit}
          className="absolute bottom-3 left-3 z-[1000] bg-amber-600 hover:bg-amber-500 text-gray-900 text-sm px-3 py-1.5 rounded shadow font-medium"
        >
          👁 Просмотр
        </button>
      </div>

      {/* Camera form */}
      <div className="w-[280px] flex-shrink-0">
        <CameraForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update App.tsx to use EditorLayout**

In `web/src/app/App.tsx`, replace the editor placeholder:
```tsx
import { useEffect } from "react";
import { ViewerLayout } from "./ViewerLayout";
import { EditorLayout } from "@/modules/editor/EditorLayout";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useEditorStore } from "@/modules/editor/editorStore";
import { useMapStore } from "@/modules/map/mapStore";
import { api } from "@/shared/api";
import type { MapConfig } from "@/shared/types";

export function App() {
  const fetchCameras = useCameraStore((s) => s.fetchCameras);
  const mode = useEditorStore((s) => s.mode);

  useEffect(() => {
    fetchCameras();
    api.get<MapConfig>("/config/map").then((cfg) => {
      useMapStore.getState().setCenter(cfg.center);
      useMapStore.getState().setZoom(cfg.zoom);
    });
  }, [fetchCameras]);

  return mode === "edit" ? <EditorLayout /> : <ViewerLayout />;
}
```

- [ ] **Step 5: Verify build**

```bash
cd c:/Users/sokol/Documents/maps-cameras/web
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add web/src/modules/camera/CameraList.tsx web/src/modules/camera/CameraForm.tsx web/src/modules/editor/EditorLayout.tsx web/src/app/App.tsx
git commit -m "feat: editor layout with camera list, form, and undo/redo keyboard shortcuts"
```

---

## Task 17: Drag-and-Drop from List to Map

**Files:**
- Create: `web/src/modules/editor/DragDrop.tsx`
- Modify: `web/src/modules/editor/EditorLayout.tsx`

- [ ] **Step 1: Create DragDrop handler component**

Create `web/src/modules/editor/DragDrop.tsx`:
```tsx
import { useMapEvents } from "react-leaflet";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useHistoryStore } from "./historyStore";
import { useRef, useEffect } from "react";

export function DragDrop() {
  const updateCamera = useCameraStore((s) => s.updateCamera);
  const cameras = useCameraStore((s) => s.cameras);
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot);
  const dragCameraIdRef = useRef<string | null>(null);

  // Listen to dragover/drop on the map container
  const map = useMapEvents({});

  useEffect(() => {
    const container = map.getContainer();

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const cameraId = e.dataTransfer!.getData("camera-id");
      if (!cameraId) return;

      const rect = container.getBoundingClientRect();
      const point = map.containerPointToLatLng([
        e.clientX - rect.left,
        e.clientY - rect.top,
      ]);

      const camera = cameras.find((c) => c.id === cameraId);
      if (camera) {
        pushSnapshot(cameras);
        updateCamera(cameraId, {
          ...camera,
          lat: point.lat,
          lng: point.lng,
        });
      }
    };

    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("drop", handleDrop);
    return () => {
      container.removeEventListener("dragover", handleDragOver);
      container.removeEventListener("drop", handleDrop);
    };
  }, [map, cameras, updateCamera, pushSnapshot]);

  return null;
}
```

- [ ] **Step 2: Add DragDrop to EditorLayout MapView**

In `web/src/modules/editor/EditorLayout.tsx`, import `DragDrop` and add it inside `<MapView>`:

```tsx
import { DragDrop } from "./DragDrop";
```

Inside `<MapView>`, after the camera markers:
```tsx
<DragDrop />
```

- [ ] **Step 3: Verify build**

```bash
cd c:/Users/sokol/Documents/maps-cameras/web
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add web/src/modules/editor/DragDrop.tsx web/src/modules/editor/EditorLayout.tsx
git commit -m "feat: drag-and-drop cameras from list onto map"
```

---

## Task 18: Camera Controls (Rotation, Angle, Distance)

**Files:**
- Create: `web/src/modules/map/CameraControls.tsx`
- Modify: `web/src/modules/editor/EditorLayout.tsx`

- [ ] **Step 1: Create CameraControls component**

Create `web/src/modules/map/CameraControls.tsx`:
```tsx
import { useEffect, useRef, useCallback } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { Camera } from "@/shared/types";
import { useCameraStore } from "@/modules/camera/cameraStore";
import { useHistoryStore } from "@/modules/editor/historyStore";

interface Props {
  camera: Camera;
}

function offsetLatLng(
  origin: L.LatLng,
  angleDeg: number,
  distanceMeters: number
): L.LatLng {
  const rad = (angleDeg * Math.PI) / 180;
  const dLat = (distanceMeters * Math.cos(rad)) / 111320;
  const dLng =
    (distanceMeters * Math.sin(rad)) /
    (111320 * Math.cos((origin.lat * Math.PI) / 180));
  return L.latLng(origin.lat + dLat, origin.lng + dLng);
}

export function CameraControls({ camera }: Props) {
  const map = useMap();
  const updateCamera = useCameraStore((s) => s.updateCamera);
  const cameras = useCameraStore((s) => s.cameras);
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot);
  const markersRef = useRef<L.Marker[]>([]);
  const snapshotPushed = useRef(false);

  const origin = L.latLng(camera.lat!, camera.lng!);

  const pushOnce = useCallback(() => {
    if (!snapshotPushed.current) {
      pushSnapshot(cameras);
      snapshotPushed.current = true;
    }
  }, [cameras, pushSnapshot]);

  useEffect(() => {
    snapshotPushed.current = false;
  }, [camera.id]);

  useEffect(() => {
    if (camera.lat == null || camera.lng == null) return;

    // Clean previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const createHandle = (
      position: L.LatLng,
      color: string,
      onDrag: (latlng: L.LatLng) => void,
      onDragEnd: () => void
    ) => {
      const icon = L.divIcon({
        className: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        html: `<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2px solid #fff;cursor:pointer;"></div>`,
      });
      const marker = L.marker(position, { icon, draggable: true }).addTo(map);
      marker.on("drag", (e: any) => {
        pushOnce();
        onDrag(e.target.getLatLng());
      });
      marker.on("dragend", onDragEnd);
      markersRef.current.push(marker);
      return marker;
    };

    // Angle handles (top and bottom edges of cone)
    const topAngle = camera.rotation - camera.angle / 2;
    const bottomAngle = camera.rotation + camera.angle / 2;
    const topPos = offsetLatLng(origin, topAngle, camera.distance);
    const bottomPos = offsetLatLng(origin, bottomAngle, camera.distance);

    createHandle(
      topPos,
      "#e0af68",
      (latlng) => {
        const dx = latlng.lng - origin.lng;
        const dy = latlng.lat - origin.lat;
        const newAngleDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
        const diff = Math.abs(camera.rotation - newAngleDeg) * 2;
        const clampedAngle = Math.max(10, Math.min(180, diff));
        updateCamera(camera.id, { ...camera, angle: clampedAngle });
      },
      () => { snapshotPushed.current = false; }
    );

    createHandle(
      bottomPos,
      "#e0af68",
      (latlng) => {
        const dx = latlng.lng - origin.lng;
        const dy = latlng.lat - origin.lat;
        const newAngleDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
        const diff = Math.abs(newAngleDeg - camera.rotation) * 2;
        const clampedAngle = Math.max(10, Math.min(180, diff));
        updateCamera(camera.id, { ...camera, angle: clampedAngle });
      },
      () => { snapshotPushed.current = false; }
    );

    // Distance handle (middle of far edge)
    const distPos = offsetLatLng(origin, camera.rotation, camera.distance);

    createHandle(
      distPos,
      "#7aa2f7",
      (latlng) => {
        const dist = origin.distanceTo(latlng);
        updateCamera(camera.id, { ...camera, distance: Math.max(5, dist) });
      },
      () => { snapshotPushed.current = false; }
    );

    // Rotation: drag the camera icon itself
    // We re-use the main camera marker for rotation — handled via CameraMarker draggable in edit mode

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [map, camera, origin, pushOnce, updateCamera]);

  return null;
}
```

- [ ] **Step 2: Add CameraControls to EditorLayout**

In `web/src/modules/editor/EditorLayout.tsx`, import and render `CameraControls` for the selected camera:

```tsx
import { CameraControls } from "@/modules/map/CameraControls";
```

Inside `<MapView>`, after markers and DragDrop:
```tsx
{selectedId && cameras.find((c) => c.id === selectedId && c.lat != null) && (
  <CameraControls camera={cameras.find((c) => c.id === selectedId)!} />
)}
```

- [ ] **Step 3: Make CameraMarker draggable in edit mode for rotation**

In `web/src/modules/map/CameraMarker.tsx`, add props for edit mode:

Add to interface:
```typescript
isEditing?: boolean;
onPositionChange?: (id: string, lat: number, lng: number) => void;
onRotationDrag?: (id: string, rotation: number) => void;
```

Update `<Marker>` to support dragging:
```tsx
<Marker
  position={position}
  icon={createCameraIcon(camera.color, isActive)}
  draggable={isEditing}
  eventHandlers={{
    click: () => onClick(camera.id),
    dragend: (e) => {
      if (onPositionChange) {
        const ll = e.target.getLatLng();
        onPositionChange(camera.id, ll.lat, ll.lng);
      }
    },
  }}
/>
```

- [ ] **Step 4: Verify build**

```bash
cd c:/Users/sokol/Documents/maps-cameras/web
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add web/src/modules/map/CameraControls.tsx web/src/modules/map/CameraMarker.tsx web/src/modules/editor/EditorLayout.tsx
git commit -m "feat: camera controls for angle, distance, and position drag in edit mode"
```

---

## Task 19: M3U Import UI

**Files:**
- Create: `web/src/modules/camera/ImportM3U.tsx`
- Modify: `web/src/modules/camera/CameraList.tsx`

- [ ] **Step 1: Create ImportM3U component**

Create `web/src/modules/camera/ImportM3U.tsx`:
```tsx
import { useRef } from "react";
import { cameraApi } from "./cameraApi";
import { useCameraStore } from "./cameraStore";

export function ImportM3U() {
  const fileRef = useRef<HTMLInputElement>(null);
  const fetchCameras = useCameraStore((s) => s.fetchCameras);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await cameraApi.importM3U(file);
      alert(
        `Импортировано: ${result.imported}, пропущено: ${result.skipped}` +
          (result.errors?.length ? `\nОшибки: ${result.errors.join(", ")}` : "")
      );
      fetchCameras();
    } catch (err) {
      alert(`Ошибка импорта: ${err}`);
    }

    // Reset input
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".m3u,.m3u8"
        className="hidden"
        onChange={handleImport}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm py-2 rounded"
      >
        📥 Импорт M3U
      </button>
    </>
  );
}
```

- [ ] **Step 2: Add ImportM3U to CameraList**

In `web/src/modules/camera/CameraList.tsx`, import and add below the "Добавить" button:

```tsx
import { ImportM3U } from "./ImportM3U";
```

In the bottom section, after the "Добавить" button:
```tsx
<div className="mt-2">
  <ImportM3U />
</div>
```

- [ ] **Step 3: Verify build**

```bash
cd c:/Users/sokol/Documents/maps-cameras/web
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add web/src/modules/camera/ImportM3U.tsx web/src/modules/camera/CameraList.tsx
git commit -m "feat: M3U playlist import UI in editor sidebar"
```

---

## Task 20: Dockerfile + docker-compose

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

Create `Dockerfile`:
```dockerfile
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
COPY --from=frontend /app/web/dist ./web/dist
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
```

- [ ] **Step 2: Create docker-compose.yml**

Create `docker-compose.yml`:
```yaml
services:
  maps-cameras:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
      - ./config.yaml:/app/config.yaml
    restart: unless-stopped
```

- [ ] **Step 3: Verify Dockerfile syntax**

```bash
cd c:/Users/sokol/Documents/maps-cameras
docker build --check .
```

Or simply review the file — actual build requires Docker daemon.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: Dockerfile with multi-stage build and docker-compose"
```

---

## Task 21: Integration — Wire Everything + Final Verification

**Files:**
- Modify: `cmd/server/main.go` (fix embed path)
- Modify: `Makefile`

- [ ] **Step 1: Fix embed.FS path in main.go**

The embed directive `//go:embed all:../../web/dist` won't work because Go embed paths must be relative to the file and can't use `..`. Instead, move the embed to a file in the project root.

Create `web.go` in project root:
```go
package main

import "embed"

//go:embed web/dist
var staticFS embed.FS
```

Wait — this won't work either since `main` package is in `cmd/server/`. The cleanest solution: create an internal package for the embed.

Create `internal/static/static.go`:
```go
package static

import "embed"

// FS is populated at build time. During development it may be empty.
var FS embed.FS
```

In `cmd/server/main.go`, use `go:embed` directive:
```go
package main

import (
	"embed"
	"fmt"
	"log"
	"maps-cameras/internal/camera"
	"maps-cameras/internal/config"
	"maps-cameras/internal/database"
	"maps-cameras/internal/router"
	"maps-cameras/internal/stream"
	"net/http"
	"os"
)

//go:embed dist
var embeddedFS embed.FS

func main() {
	cfgPath := "config.yaml"
	if len(os.Args) > 1 {
		cfgPath = os.Args[1]
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	db, err := database.Open(cfg.Database.Path)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	camRepo := camera.NewRepository(db)
	camHandler := camera.NewHandler(camRepo)

	streamProxy := stream.NewProxy(cfg.Go2RTC.URL)
	streamTracker := stream.NewTracker()
	streamHandler := stream.NewHandler(streamProxy, streamTracker, camRepo)

	handler := router.New(cfg, camHandler, streamHandler, embeddedFS)

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("Starting maps-cameras on %s", addr)
	log.Printf("go2rtc at %s", cfg.Go2RTC.URL)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
```

Update `Makefile` build step to copy dist into cmd/server before go build:
```makefile
build: build-frontend
	cp -r web/dist cmd/server/dist
	go build -o maps-cameras ./cmd/server/main.go
	rm -rf cmd/server/dist
```

- [ ] **Step 2: Update router to accept embed.FS**

The `router.New` function signature already accepts `embed.FS`. Update it to handle the `dist` prefix:

In `internal/router/router.go`, change `fs.Sub(staticFS, "dist")` — it already does this. Just make sure the sub-path matches the embed directive.

- [ ] **Step 3: Run all backend tests**

```bash
cd c:/Users/sokol/Documents/maps-cameras
go test ./... -v
```

Expected: all tests PASS.

- [ ] **Step 4: Build full project**

```bash
cd c:/Users/sokol/Documents/maps-cameras
make build
```

Expected: produces `maps-cameras` binary.

- [ ] **Step 5: Commit**

```bash
git add cmd/server/main.go internal/router/router.go Makefile
git commit -m "feat: wire all components together, fix embed paths, final integration"
```

---

## Summary

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Go module + config + Makefile | — |
| 2 | SQLite + Camera model | 1 |
| 3 | Camera repository CRUD | 2 |
| 4 | Camera HTTP handlers | 3 |
| 5 | M3U import | 3 |
| 6 | Stream tracker | 1 |
| 7 | Stream proxy + handlers | 6, 3 |
| 8 | Router + main server | 4, 5, 7 |
| 9 | Frontend scaffold | 1 |
| 10 | Map module (Leaflet + tiles) | 9 |
| 11 | Camera store + API | 9 |
| 12 | Camera marker with cone | 10, 11 |
| 13 | Editor store + history | 9 |
| 14 | Stream module + player | 11 |
| 15 | Viewer layout (split pane) | 10, 12, 14 |
| 16 | Editor layout + list + form | 12, 13 |
| 17 | Drag-and-drop to map | 16 |
| 18 | Camera controls (angle/dist) | 16 |
| 19 | M3U import UI | 16 |
| 20 | Dockerfile + compose | 8, 9 |
| 21 | Integration + final wire | all |

**Parallel work possible:**
- Tasks 1-8 (backend) can proceed in parallel with Tasks 9-19 (frontend) after Task 1 completes.
- Tasks 2-5 (camera domain) are independent of Tasks 6-7 (stream domain).
