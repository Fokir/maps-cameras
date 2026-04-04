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
