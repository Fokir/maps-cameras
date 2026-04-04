package camera

import (
	"bufio"
	"io"
	"strings"
)

type M3UEntry struct {
	Name string
	URL  string
}

type ImportResult struct {
	Imported int      `json:"imported"`
	Skipped  int      `json:"skipped"`
	Errors   []string `json:"errors"`
}

func ParseM3U(r io.Reader) ([]M3UEntry, error) {
	scanner := bufio.NewScanner(r)
	var entries []M3UEntry
	var currentName string

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		if strings.HasPrefix(line, "#EXTINF:") {
			if idx := strings.Index(line, ","); idx != -1 {
				currentName = strings.TrimSpace(line[idx+1:])
			}
		} else if line != "" && !strings.HasPrefix(line, "#") {
			name := currentName
			if name == "" {
				name = line
			}
			entries = append(entries, M3UEntry{Name: name, URL: line})
			currentName = ""
		}
	}

	return entries, scanner.Err()
}

func ImportM3U(repo *Repository, r io.Reader) (*ImportResult, error) {
	entries, err := ParseM3U(r)
	if err != nil {
		return nil, err
	}

	result := &ImportResult{}

	for _, entry := range entries {
		existing, err := repo.GetByRTSPURL(entry.URL)
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			continue
		}
		if existing != nil {
			result.Skipped++
			continue
		}

		_, err = repo.Create(&Camera{
			Name:    entry.Name,
			RTSPURL: entry.URL,
			Color:   "#7aa2f7",
		})
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			continue
		}
		result.Imported++
	}

	return result, nil
}
