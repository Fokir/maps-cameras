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

	body, _ := json.Marshal(map[string]any{"name": "Cam", "rtsp_url": "rtsp://x/s", "color": "#fff"})
	req := httptest.NewRequest(http.MethodPost, "/api/cameras", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Create(w, req)

	var created Camera
	json.NewDecoder(w.Body).Decode(&created)

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
