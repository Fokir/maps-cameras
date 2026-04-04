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
