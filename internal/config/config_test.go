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
