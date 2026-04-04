package main

import (
	"fmt"
	"log"
	"maps-cameras/internal/config"
	"os"
)

func main() {
	cfgPath := "config.yaml"
	if len(os.Args) > 1 {
		cfgPath = os.Args[1]
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	fmt.Printf("Starting server on :%d\n", cfg.Server.Port)
}
