package router

import (
	"embed"
	"fmt"
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
		w.Write([]byte(fmt.Sprintf(`{"center":[%g,%g],"zoom":%d}`, cfg.Map.Center[0], cfg.Map.Center[1], cfg.Map.Zoom)))
	})

	// Static files (SPA)
	distFS, err := fs.Sub(staticFS, "dist")
	if err != nil {
		// If no dist directory embedded, serve a placeholder
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte("<html><body><p>Frontend not built. Run: cd web && npm run build</p></body></html>"))
		})
		return corsMiddleware(mux)
	}

	fileServer := http.FileServer(http.FS(distFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Try to serve the file; if not found, serve index.html (SPA routing)
		path := r.URL.Path
		if path != "/" {
			// Check if file exists
			if f, err := fs.Stat(distFS, path[1:]); err == nil && !f.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		// Serve index.html for SPA routing
		index, err := fs.ReadFile(distFS, "index.html")
		if err != nil {
			http.Error(w, "index.html not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		w.Write(index)
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
