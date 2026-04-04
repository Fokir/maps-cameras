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
