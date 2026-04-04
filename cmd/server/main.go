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
