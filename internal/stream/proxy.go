package stream

import (
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/gorilla/websocket"
)

type Proxy struct {
	go2rtcURL string
	client    *http.Client
}

func NewProxy(go2rtcURL string) *Proxy {
	return &Proxy{
		go2rtcURL: go2rtcURL,
		client:    &http.Client{},
	}
}

func (p *Proxy) AddStream(name, rtspURL string) error {
	u := fmt.Sprintf("%s/api/streams?name=%s&src=%s", p.go2rtcURL, url.QueryEscape(name), url.QueryEscape(rtspURL))
	req, err := http.NewRequest(http.MethodPut, u, nil)
	if err != nil {
		return err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("go2rtc add stream failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("go2rtc error %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (p *Proxy) RemoveStream(name string) error {
	u := fmt.Sprintf("%s/api/streams?name=%s", p.go2rtcURL, url.QueryEscape(name))
	req, err := http.NewRequest(http.MethodDelete, u, nil)
	if err != nil {
		return err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("go2rtc remove stream failed: %w", err)
	}
	defer resp.Body.Close()
	return nil
}

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (p *Proxy) ProxyWebSocket(w http.ResponseWriter, r *http.Request, targetPath string) {
	targetURL := fmt.Sprintf("ws://%s%s?%s",
		mustParseHost(p.go2rtcURL), targetPath, r.URL.RawQuery)

	backendConn, _, err := websocket.DefaultDialer.Dial(targetURL, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("go2rtc ws connect failed: %v", err), http.StatusBadGateway)
		return
	}
	defer backendConn.Close()

	clientConn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer clientConn.Close()

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			msgType, msg, err := backendConn.ReadMessage()
			if err != nil {
				return
			}
			if err := clientConn.WriteMessage(msgType, msg); err != nil {
				return
			}
		}
	}()

	for {
		msgType, msg, err := clientConn.ReadMessage()
		if err != nil {
			return
		}
		if err := backendConn.WriteMessage(msgType, msg); err != nil {
			return
		}
	}
}

func mustParseHost(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	return u.Host
}
