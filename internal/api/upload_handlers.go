package api

// 用户资源上传 / 头像 / 背景 / Server Icon / 静态资源访问域 handler。从
// handlers.go 抽出来的目的：
//   - handlers.go 长期聚合 9+ 业务域 2888 行，本批先把 auth / upload 拆出，
//     缩到可读范围；
//   - 上传链路其实是 "rate_limit → multipart 解析 → mime 嗅探 → 路径 sanitization
//     → 写盘 → 更新 user/config" 的固定模板，集中在一处后单测能针对单个 mime
//     extension / 路径校验 / 限流桶 写而不必跨整个 handlers 文件；
//   - 静态资源 `/api/v1/users/assets/...` 有路径白名单（uploadFilenamePattern）
//     + ResolveWithinRoot 防穿越，与 background CSS sanitization 一起放到上传
//     域是因为它们共享同一个文件名模式正则。

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/prejudice-studio/twilight/internal/store"
)

// 上传文件名白名单：随机 16 hex + 已知图片扩展名。任何不匹配的 filename 一律
// 当作 404，避免静态资源端点被用作目录探测 / SSRF。
var uploadFilenamePattern = regexp.MustCompile(`^[a-f0-9]{16}\.(jpg|png|gif|webp|bmp)$`)

// 用户自定义背景仅允许 CSS gradient 函数；普通 url() / 表达式 / @import 一律
// 拒绝，防止管理员被普通用户的恶意背景做 XSS / 资源外链。
var backgroundGradientPattern = regexp.MustCompile(`(?i)^(linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient)\s*\(`)

func (a *App) handleGetBackground(w http.ResponseWriter, r *http.Request, params Params) {
	uid, _ := int64Param(params, "uid")
	u, okUser := a.store.User(uid)
	if !okUser {
		failWithCode(w, http.StatusNotFound, ErrUserNotFound, "user not found")
		return
	}
	ok(w, "OK", map[string]any{"background": u.Background})
}

func (a *App) handleUpdateBackground(w http.ResponseWriter, r *http.Request, _ Params) {
	p := current(r)
	payload := decodeMap(r)
	bg, err := sanitizedBackgroundConfig(payload)
	if err != nil {
		failWithCode(w, http.StatusBadRequest, ErrUserBackgroundInvalid, err.Error())
		return
	}
	u, err := a.store.UpdateUser(p.User.UID, func(u *store.User) error { u.Background = bg; return nil })
	if statusFromError(w, err) {
		return
	}
	ok(w, "background updated", map[string]any{"background": u.Background})
}

func sanitizedBackgroundConfig(payload map[string]any) (string, error) {
	if len(payload) == 0 {
		return "", fmt.Errorf("背景配置不能为空")
	}
	if raw := firstNonEmpty(stringValue(payload, "background"), stringValue(payload, "url")); raw != "" {
		var nested map[string]any
		if err := json.Unmarshal([]byte(raw), &nested); err == nil && len(nested) > 0 {
			payload = nested
		} else {
			css, err := sanitizeBackgroundCSSValue(raw)
			if err != nil {
				return "", err
			}
			return mustJSON(map[string]any{"lightBg": css, "darkBg": css}), nil
		}
	}

	lightBg, err := sanitizeBackgroundCSSValue(stringValue(payload, "lightBg"))
	if err != nil {
		return "", err
	}
	darkBg, err := sanitizeBackgroundCSSValue(stringValue(payload, "darkBg"))
	if err != nil {
		return "", err
	}
	lightImage, err := sanitizeBackgroundImageValue(stringValue(payload, "lightBgImage"))
	if err != nil {
		return "", err
	}
	darkImage, err := sanitizeBackgroundImageValue(stringValue(payload, "darkBgImage"))
	if err != nil {
		return "", err
	}
	if lightBg == "" && darkBg == "" && lightImage == "" && darkImage == "" {
		return "", fmt.Errorf("背景配置不能为空")
	}

	cfg := map[string]any{
		"lightBg":      lightBg,
		"darkBg":       darkBg,
		"lightBgImage": lightImage,
		"darkBgImage":  darkImage,
		"lightFlow":    boolValue(payload, "lightFlow", false),
		"darkFlow":     boolValue(payload, "darkFlow", false),
		"lightBlur":    clamp(intValue(payload, "lightBlur", 0), 0, 30),
		"darkBlur":     clamp(intValue(payload, "darkBlur", 0), 0, 30),
		"lightOpacity": clamp(intValue(payload, "lightOpacity", 100), 10, 100),
		"darkOpacity":  clamp(intValue(payload, "darkOpacity", 100), 10, 100),
	}
	return mustJSON(cfg), nil
}

func sanitizeBackgroundCSSValue(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	if len(value) > 2000 || strings.ContainsAny(value, "\x00\r\n<>;{}") || strings.Contains(strings.ToLower(value), "url(") || strings.Contains(value, "@") {
		return "", fmt.Errorf("背景 CSS 只允许安全的渐变表达式")
	}
	if !backgroundGradientPattern.MatchString(value) {
		return "", fmt.Errorf("背景 CSS 只允许 linear/radial/conic gradient")
	}
	return value, nil
}

func sanitizeBackgroundImageValue(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" || strings.EqualFold(value, "none") {
		return "", nil
	}
	if len(value) > 1000 || strings.ContainsAny(value, "\x00\r\n<>") {
		return "", fmt.Errorf("背景图片地址无效")
	}
	if strings.HasPrefix(strings.ToLower(value), "url(") && strings.HasSuffix(value, ")") {
		value = strings.TrimSpace(value[4 : len(value)-1])
		value = strings.Trim(value, `"'`)
	}
	const prefix = "/api/v1/users/assets/background/"
	if !strings.HasPrefix(value, prefix) {
		return "", fmt.Errorf("背景图片只允许使用本系统上传的背景资源")
	}
	filename := strings.TrimPrefix(value, prefix)
	if strings.ContainsAny(filename, `/\`) || !uploadFilenamePattern.MatchString(filename) {
		return "", fmt.Errorf("背景图片文件名无效")
	}
	return `url("` + value + `")`, nil
}

func mustJSON(value any) string {
	data, _ := json.Marshal(value)
	return string(data)
}

func (a *App) handleDeleteBackground(w http.ResponseWriter, r *http.Request, _ Params) {
	p := current(r)
	_, err := a.store.UpdateUser(p.User.UID, func(u *store.User) error { u.Background = ""; return nil })
	if statusFromError(w, err) {
		return
	}
	ok(w, "background deleted", nil)
}

func (a *App) handleGetAvatar(w http.ResponseWriter, r *http.Request, params Params) {
	uid, _ := int64Param(params, "uid")
	u, okUser := a.store.User(uid)
	if !okUser {
		failWithCode(w, http.StatusNotFound, ErrUserNotFound, "user not found")
		return
	}
	ok(w, "OK", map[string]any{"avatar": u.Avatar, "uid": u.UID, "username": u.Username})
}

func (a *App) handleUploadBackground(w http.ResponseWriter, r *http.Request, _ Params) {
	a.handleUpload(w, r, "background")
}

func (a *App) handleUploadAvatar(w http.ResponseWriter, r *http.Request, _ Params) {
	a.handleUpload(w, r, "avatar")
}

func (a *App) handleUpload(w http.ResponseWriter, r *http.Request, kind string) {
	if !a.allowRate(r.Context(), rateKey("upload:", current(r).User.UID), a.cfg.RateLimitUploadPerMinute, time.Minute) {
		failWithCode(w, http.StatusTooManyRequests, ErrUploadRateLimited, "上传过于频繁")
		return
	}
	if err := r.ParseMultipartForm(a.cfg.MaxUploadSize); err != nil {
		failWithCode(w, http.StatusBadRequest, ErrUploadInvalidPayload, "上传内容无效")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		failWithCode(w, http.StatusBadRequest, ErrUploadFileMissing, "缺少文件")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, a.cfg.MaxUploadSize+1))
	if err != nil || int64(len(data)) > a.cfg.MaxUploadSize {
		failWithCode(w, http.StatusRequestEntityTooLarge, ErrUploadFileTooLarge, "文件过大")
		return
	}
	contentType := strings.ToLower(strings.Split(http.DetectContentType(data), ";")[0])
	ext, okImage := uploadImageExtension(contentType)
	if !okImage {
		failWithCode(w, http.StatusBadRequest, ErrUploadTypeNotAllowed, "only image uploads are allowed")
		return
	}
	filename := randomCode(16) + ext
	dir := filepath.Join(a.cfg.UploadDir, kind)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		failWithCode(w, http.StatusInternalServerError, ErrUploadDirCreateFailed, "创建上传目录失败")
		return
	}
	if err := os.WriteFile(filepath.Join(dir, filename), data, 0o600); err != nil {
		failWithCode(w, http.StatusInternalServerError, ErrUploadSaveFailed, "保存文件失败")
		return
	}
	url := "/api/v1/users/assets/" + kind + "/" + filename
	p := current(r)
	if _, err := a.store.UpdateUser(p.User.UID, func(u *store.User) error {
		if kind == "avatar" {
			u.Avatar = url
		} else {
			u.Background = url
		}
		return nil
	}); err != nil {
		_ = os.Remove(filepath.Join(dir, filename))
		if statusFromError(w, err) {
			return
		}
		return
	}
	if kind == "avatar" {
		ok(w, "上传成功", map[string]any{"avatar_url": url, "url": url, "filename": filename})
		return
	}
	ok(w, "上传成功", map[string]any{"url": url, "type": kind, "filename": filename})
}

func uploadImageExtension(contentType string) (string, bool) {
	switch contentType {
	case "image/jpeg":
		return ".jpg", true
	case "image/png":
		return ".png", true
	case "image/gif":
		return ".gif", true
	case "image/webp":
		return ".webp", true
	case "image/bmp":
		return ".bmp", true
	default:
		return "", false
	}
}

func (a *App) handleUploadServerIcon(w http.ResponseWriter, r *http.Request, _ Params) {
	p := current(r)
	if !a.allowRate(r.Context(), rateKey("admin-server-icon:", p.User.UID), a.cfg.RateLimitAdminIconPerMinute, time.Minute) {
		failWithCode(w, http.StatusTooManyRequests, ErrUploadRateLimited, "上传过于频繁")
		return
	}
	limit := int64(2 * 1024 * 1024)
	if a.cfg.MaxUploadSize > 0 && a.cfg.MaxUploadSize < limit {
		limit = a.cfg.MaxUploadSize
	}
	if err := r.ParseMultipartForm(limit); err != nil {
		failWithCode(w, http.StatusBadRequest, ErrUploadInvalidPayload, "上传内容无效")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		failWithCode(w, http.StatusBadRequest, ErrUploadFileMissing, "缺少文件")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil || int64(len(data)) > limit {
		failWithCode(w, http.StatusRequestEntityTooLarge, ErrUploadFileTooLarge, "文件过大")
		return
	}
	contentType := strings.ToLower(strings.Split(http.DetectContentType(data), ";")[0])
	ext, okImage := uploadImageExtension(contentType)
	if !okImage {
		failWithCode(w, http.StatusBadRequest, ErrUploadTypeNotAllowed, "only jpg, png, gif, webp and bmp uploads are allowed")
		return
	}
	filename := randomCode(16) + ext
	filePath, okPath := resolveUploadAssetPath(a.cfg.UploadDir, "server-icon", filename)
	if !okPath {
		failWithCode(w, http.StatusInternalServerError, ErrUploadDirInvalid, "上传目录无效")
		return
	}
	if err := os.MkdirAll(filepath.Dir(filePath), 0o700); err != nil {
		failWithCode(w, http.StatusInternalServerError, ErrUploadDirCreateFailed, "创建上传目录失败")
		return
	}
	if err := os.WriteFile(filePath, data, 0o600); err != nil {
		failWithCode(w, http.StatusInternalServerError, ErrUploadSaveFailed, "保存文件失败")
		return
	}
	values := configValues(a.cfg)
	if values["Global"] == nil {
		values["Global"] = map[string]any{}
	}
	serverIcon := filepath.ToSlash(filepath.Join("server-icon", filename))
	values["Global"]["server_icon"] = serverIcon
	info, status, message := a.saveConfigContent(renderConfigTOML(values))
	if status != http.StatusOK {
		_ = os.Remove(filePath)
		failWithCode(w, status, ErrConfigSaveFailed, message)
		return
	}
	ok(w, "上传成功", map[string]any{
		"server_icon": serverIcon,
		"url":         "/api/v1/system/server-icon?ts=" + strconv.FormatInt(time.Now().Unix(), 10),
		"filename":    filename,
		"reload":      info["reload"],
	})
}

func (a *App) handleAsset(w http.ResponseWriter, r *http.Request, params Params) {
	kind := params["kind"]
	filename := params["filename"]
	if kind != "avatar" && kind != "background" {
		failWithCode(w, http.StatusNotFound, ErrAssetNotFound, "resource not found")
		return
	}
	if !uploadFilenamePattern.MatchString(filename) {
		failWithCode(w, http.StatusNotFound, ErrAssetNotFound, "resource not found")
		return
	}
	filePath, okPath := resolveUploadAssetPath(a.cfg.UploadDir, kind, filename)
	if !okPath {
		failWithCode(w, http.StatusNotFound, ErrAssetNotFound, "resource not found")
		return
	}
	http.ServeFile(w, r, filePath)
}

func resolveUploadAssetPath(uploadDir, kind, filename string) (string, bool) {
	target, err := ResolveWithinRoot(firstNonEmpty(uploadDir, "uploads"), filepath.Join(kind, filename))
	if err != nil {
		return "", false
	}
	return target, true
}

func (a *App) handleDeleteAvatar(w http.ResponseWriter, r *http.Request, _ Params) {
	p := current(r)
	_, err := a.store.UpdateUser(p.User.UID, func(u *store.User) error { u.Avatar = ""; return nil })
	if statusFromError(w, err) {
		return
	}
	ok(w, "avatar deleted", nil)
}
