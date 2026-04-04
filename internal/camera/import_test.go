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
