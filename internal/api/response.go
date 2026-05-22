package api

import (
	"encoding/json"
	"net/http"
	"time"
)

type envelope struct {
	Success   bool   `json:"success"`
	Code      int    `json:"code"`
	Message   string `json:"message"`
	Data      any    `json:"data,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

func writeJSON(w http.ResponseWriter, status int, success bool, message string, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(envelope{
		Success:   success,
		Code:      status,
		Message:   message,
		Data:      data,
		Timestamp: time.Now().Unix(),
	})
}

func ok(w http.ResponseWriter, message string, data any) {
	writeJSON(w, http.StatusOK, true, message, data)
}

func created(w http.ResponseWriter, message string, data any) {
	writeJSON(w, http.StatusCreated, true, message, data)
}

func fail(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, false, message, nil)
}
