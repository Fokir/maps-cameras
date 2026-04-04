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

	var tableName string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='cameras'").Scan(&tableName)
	if err != nil {
		t.Fatalf("cameras table not found: %v", err)
	}
	if tableName != "cameras" {
		t.Errorf("expected table name 'cameras', got '%s'", tableName)
	}
}
