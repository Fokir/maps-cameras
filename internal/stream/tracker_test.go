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

	tr.mu.Lock()
	tr.streams["cam1"].lastHeartbeat = time.Now().Add(-60 * time.Second)
	tr.mu.Unlock()

	tr.Touch("cam1")

	stale := tr.GetStale(30 * time.Second)
	if len(stale) != 0 {
		t.Errorf("expected 0 stale after touch, got %d", len(stale))
	}
}
