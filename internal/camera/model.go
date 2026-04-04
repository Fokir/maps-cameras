package camera

import "time"

type Camera struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	RTSPURL   string    `json:"rtsp_url"`
	Color     string    `json:"color"`
	Lat       *float64  `json:"lat"`
	Lng       *float64  `json:"lng"`
	Rotation  float64   `json:"rotation"`
	Angle     float64   `json:"angle"`
	Distance  float64   `json:"distance"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
