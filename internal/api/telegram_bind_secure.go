package api

import (
	"net/http"
	"strings"
	"time"
)

func (a *App) handleBindConfirmSecure(w http.ResponseWriter, r *http.Request, _ Params) {
	secret := firstNonEmpty(r.Header.Get("X-Internal-Secret"), strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if a.cfg.BotInternalSecret == "" || secret != a.cfg.BotInternalSecret {
		fail(w, http.StatusForbidden, "内部密钥无效")
		return
	}
	payload := decodeMap(r)
	code := strings.ToUpper(stringValue(payload, "code"))
	bind, okBind := a.store.BindCode(code)
	if !okBind || bind.ExpiresAt < time.Now().Unix() {
		fail(w, http.StatusNotFound, "绑定码不存在")
		return
	}
	telegramID := int64(intValue(payload, "telegram_id", 0))
	if telegramID == 0 {
		fail(w, http.StatusBadRequest, "Telegram ID 无效")
		return
	}
	bind.Confirmed = true
	bind.TelegramID = telegramID
	_ = a.store.UpsertBindCode(bind)
	ok(w, "绑定已确认", map[string]any{"code": code, "confirmed": true})
}
