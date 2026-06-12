package api

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"go.uber.org/zap"
)

func (a *App) handleBangumiSyncStatus(w http.ResponseWriter, r *http.Request, _ Params) {
	p := current(r)
	u := p.User
	logs := a.store().ListBangumiSyncLogs(u.UID, 50)
	records := a.store().PlaybackRecords(u.UID, 0, 0)
	totalRecords := len(records)
	syncedCount := 0
	for _, log := range a.store().ListBangumiSyncLogs(u.UID, 5000) {
		if log.Status == "success" {
			syncedCount++
		}
	}
	ok(w, "OK", map[string]any{
		"bgm_mode":      u.BGMMode,
		"bgm_token_set": u.BGMToken != "",
		"sync_ready":    u.BGMMode && u.BGMToken != "",
		"total_records": totalRecords,
		"synced_count":  syncedCount,
		"recent_logs":   logs,
	})
}

func (a *App) handleBangumiSyncTrigger(w http.ResponseWriter, r *http.Request, _ Params) {
	if !a.cfg().BangumiEnabled {
		failWithCode(w, http.StatusBadRequest, ErrBangumiSyncDisabled, "Bangumi 同步未启用")
		return
	}
	p := current(r)
	u := p.User
	if !u.BGMMode || u.BGMToken == "" {
		failWithCode(w, http.StatusBadRequest, ErrBangumiTokenMissing, "请先配置 Bangumi Token 并开启同步")
		return
	}
	ctx := r.Context()
	zap.L().Info("bangumi sync triggered by user", zap.Int64("uid", u.UID))
	synced, skipped, failed, logs := a.syncBangumiForUser(ctx, u.UID)
	ok(w, "同步完成", map[string]any{
		"synced":  synced,
		"skipped": skipped,
		"failed":  failed,
		"logs":    logs,
	})
}

func (a *App) handleBangumiSyncHistory(w http.ResponseWriter, r *http.Request, _ Params) {
	p := current(r)
	limit := queryInt(r, "limit", 50)
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	logs := a.store().ListBangumiSyncLogs(p.User.UID, limit)
	ok(w, "OK", map[string]any{
		"logs":  logs,
		"total": len(logs),
	})
}

func (a *App) handleBangumiClearHistory(w http.ResponseWriter, r *http.Request, _ Params) {
	p := current(r)
	if err := a.store().ClearBangumiSyncLogs(p.User.UID); err != nil {
		failWithCode(w, http.StatusInternalServerError, ErrInternal, "清除失败: "+err.Error())
		return
	}
	ok(w, "已清除同步历史", nil)
}

func (a *App) handleAdminBangumiUsers(w http.ResponseWriter, r *http.Request, _ Params) {
	users := a.store().ListUsers()
	type BangumiUserInfo struct {
		UID         int64  `json:"uid"`
		Username    string `json:"username"`
		BGMMode     bool   `json:"bgm_mode"`
		TokenSet    bool   `json:"token_set"`
		SyncReady   bool   `json:"sync_ready"`
		SyncCount   int    `json:"sync_count"`
		RecordCount int    `json:"record_count"`
	}
	result := make([]BangumiUserInfo, 0, len(users))
	for _, u := range users {
		info := BangumiUserInfo{
			UID:       u.UID,
			Username:  u.Username,
			BGMMode:   u.BGMMode,
			TokenSet:  u.BGMToken != "",
			SyncReady: u.BGMMode && u.BGMToken != "",
		}
		syncLogs := a.store().ListBangumiSyncLogs(u.UID, 5000)
		for _, log := range syncLogs {
			if log.Status == "success" {
				info.SyncCount++
			}
		}
		info.RecordCount = len(a.store().PlaybackRecords(u.UID, 0, 0))
		result = append(result, info)
	}
	ok(w, "OK", map[string]any{"users": result, "total": len(result)})
}

func (a *App) handleAdminBangumiRecords(w http.ResponseWriter, r *http.Request, ps Params) {
	uid, err := strconv.ParseInt(ps[":uid"], 10, 64)
	if err != nil || uid <= 0 {
		failWithCode(w, http.StatusBadRequest, ErrBadRequest, "无效的用户 ID")
		return
	}
	limit := queryInt(r, "limit", 100)
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	records := a.store().PlaybackRecords(uid, 0, limit)
	logs := a.store().ListBangumiSyncLogs(uid, limit)
	logMap := make(map[string]string)
	for _, log := range logs {
		if log.RecordItemID != "" && log.Status == "success" {
			logMap[log.RecordItemID] = log.SubjectName
		}
	}
	type RecordWithSync struct {
		UID         int64  `json:"uid"`
		ItemID      string `json:"item_id"`
		Title       string `json:"title"`
		SeriesName  string `json:"series_name,omitempty"`
		MediaType   string `json:"media_type"`
		IndexNumber int    `json:"index_number,omitempty"`
		Duration    int64  `json:"duration"`
		PlayedAt    int64  `json:"played_at"`
		SyncedName  string `json:"synced_name,omitempty"`
	}
	out := make([]RecordWithSync, 0, len(records))
	for _, rec := range records {
		out = append(out, RecordWithSync{
			UID: rec.UID, ItemID: rec.ItemID, Title: rec.Title,
			SeriesName: rec.SeriesName, MediaType: rec.MediaType,
			IndexNumber: rec.IndexNumber, Duration: rec.Duration,
			PlayedAt: rec.PlayedAt, SyncedName: logMap[rec.ItemID],
		})
	}
	ok(w, "OK", map[string]any{"records": out, "total": len(out)})
}

func (a *App) handleAdminBangumiSyncUser(w http.ResponseWriter, r *http.Request, ps Params) {
	if !a.cfg().BangumiEnabled {
		failWithCode(w, http.StatusBadRequest, ErrBangumiSyncDisabled, "Bangumi 同步未启用")
		return
	}
	uid, err := strconv.ParseInt(ps[":uid"], 10, 64)
	if err != nil || uid <= 0 {
		failWithCode(w, http.StatusBadRequest, ErrBadRequest, "无效的用户 ID")
		return
	}
	u, found := a.store().User(uid)
	if !found {
		failWithCode(w, http.StatusNotFound, ErrUserNotFound, "用户不存在")
		return
	}
	if !u.BGMMode || u.BGMToken == "" {
		failWithCode(w, http.StatusBadRequest, ErrBangumiTokenMissing, "该用户未配置 Bangumi Token 或未开启同步")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()
	zap.L().Info("bangumi sync triggered by admin", zap.Int64("uid", uid), zap.Int64("admin_uid", current(r).User.UID))
	synced, skipped, failed, logs := a.syncBangumiForUser(ctx, uid)
	ok(w, "同步完成", map[string]any{
		"synced":  synced,
		"skipped": skipped,
		"failed":  failed,
		"logs":    logs,
	})
}

func (a *App) handleAdminBangumiSyncLogs(w http.ResponseWriter, r *http.Request, ps Params) {
	uid, err := strconv.ParseInt(ps[":uid"], 10, 64)
	if err != nil || uid <= 0 {
		failWithCode(w, http.StatusBadRequest, ErrBadRequest, "无效的用户 ID")
		return
	}
	limit := queryInt(r, "limit", 100)
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	logs := a.store().ListBangumiSyncLogs(uid, limit)
	ok(w, "OK", map[string]any{"logs": logs, "total": len(logs)})
}

func (a *App) handleAdminBangumiClearLogs(w http.ResponseWriter, r *http.Request, ps Params) {
	uid, err := strconv.ParseInt(ps[":uid"], 10, 64)
	if err != nil || uid <= 0 {
		failWithCode(w, http.StatusBadRequest, ErrBadRequest, "无效的用户 ID")
		return
	}
	if err := a.store().ClearBangumiSyncLogs(uid); err != nil {
		failWithCode(w, http.StatusInternalServerError, ErrInternal, "清除失败: "+err.Error())
		return
	}
	ok(w, "已清除", nil)
}
