package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Go2RTC   Go2RTCConfig   `yaml:"go2rtc"`
	Map      MapConfig      `yaml:"map"`
}

type ServerConfig struct {
	Port int `yaml:"port"`
}

type DatabaseConfig struct {
	Path string `yaml:"path"`
}

type Go2RTCConfig struct {
	URL string `yaml:"url"`
}

type MapConfig struct {
	Center [2]float64 `yaml:"center"`
	Zoom   int        `yaml:"zoom"`
}

func Load(path string) (*Config, error) {
	cfg := &Config{
		Server:   ServerConfig{Port: 8080},
		Database: DatabaseConfig{Path: "./data/cameras.db"},
		Go2RTC:   Go2RTCConfig{URL: "http://server.local"},
		Map:      MapConfig{Center: [2]float64{54.3142, 48.4031}, Zoom: 18},
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}
