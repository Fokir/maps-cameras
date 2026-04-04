package camera

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) GetAll() ([]Camera, error) {
	rows, err := r.db.Query(`SELECT id, name, rtsp_url, color, lat, lng, rotation, angle, distance, created_at, updated_at FROM cameras ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cameras []Camera
	for rows.Next() {
		var c Camera
		err := rows.Scan(&c.ID, &c.Name, &c.RTSPURL, &c.Color, &c.Lat, &c.Lng, &c.Rotation, &c.Angle, &c.Distance, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			return nil, err
		}
		cameras = append(cameras, c)
	}
	return cameras, rows.Err()
}

func (r *Repository) GetByID(id string) (*Camera, error) {
	var c Camera
	err := r.db.QueryRow(`SELECT id, name, rtsp_url, color, lat, lng, rotation, angle, distance, created_at, updated_at FROM cameras WHERE id = ?`, id).
		Scan(&c.ID, &c.Name, &c.RTSPURL, &c.Color, &c.Lat, &c.Lng, &c.Rotation, &c.Angle, &c.Distance, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("camera not found: %s", id)
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) Create(c *Camera) (*Camera, error) {
	c.ID = uuid.New().String()
	now := time.Now()
	c.CreatedAt = now
	c.UpdatedAt = now
	if c.Angle == 0 {
		c.Angle = 90
	}
	if c.Distance == 0 {
		c.Distance = 50
	}

	_, err := r.db.Exec(`INSERT INTO cameras (id, name, rtsp_url, color, lat, lng, rotation, angle, distance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.ID, c.Name, c.RTSPURL, c.Color, c.Lat, c.Lng, c.Rotation, c.Angle, c.Distance, c.CreatedAt, c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (r *Repository) Update(c *Camera) (*Camera, error) {
	c.UpdatedAt = time.Now()
	result, err := r.db.Exec(`UPDATE cameras SET name=?, rtsp_url=?, color=?, lat=?, lng=?, rotation=?, angle=?, distance=?, updated_at=? WHERE id=?`,
		c.Name, c.RTSPURL, c.Color, c.Lat, c.Lng, c.Rotation, c.Angle, c.Distance, c.UpdatedAt, c.ID)
	if err != nil {
		return nil, err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return nil, fmt.Errorf("camera not found: %s", c.ID)
	}
	return c, nil
}

func (r *Repository) Delete(id string) error {
	result, err := r.db.Exec(`DELETE FROM cameras WHERE id = ?`, id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("camera not found: %s", id)
	}
	return nil
}

func (r *Repository) GetByRTSPURL(url string) (*Camera, error) {
	var c Camera
	err := r.db.QueryRow(`SELECT id, name, rtsp_url, color, lat, lng, rotation, angle, distance, created_at, updated_at FROM cameras WHERE rtsp_url = ?`, url).
		Scan(&c.ID, &c.Name, &c.RTSPURL, &c.Color, &c.Lat, &c.Lng, &c.Rotation, &c.Angle, &c.Distance, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}
