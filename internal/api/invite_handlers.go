package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/prejudice-studio/twilight/internal/store"
)

func (a *App) handleInviteConfig(w http.ResponseWriter, r *http.Request, _ Params) {
	ok(w, "OK", map[string]any{"enabled": a.cfg.InviteEnabled, "max_depth": a.cfg.InviteMaxDepth, "invite_limit": a.cfg.InviteLimit, "invite_root_user_limit": a.cfg.InviteRootUserLimit, "require_emby": a.cfg.InviteRequireEmby, "default_days": a.cfg.InviteDefaultDays, "code_format": "INV-{random}", "permanent_invite_max_days": a.cfg.PermanentInviteMaxDays})
}

func (a *App) handleInviteMe(w http.ResponseWriter, r *http.Request, _ Params) {
	if !a.cfg.InviteEnabled {
		fail(w, http.StatusForbidden, "邀请功能未开启")
		return
	}
	user := current(r).User
	codes := a.store.ListInviteCodes(user.UID)
	codeItems := make([]map[string]any, 0, len(codes))
	for _, code := range codes {
		codeItems = append(codeItems, inviteCodeDTO(code))
	}
	parent := any(nil)
	if rel, okRel := a.store.ParentOf(user.UID); okRel {
		if u, okUser := a.store.User(rel.ParentUID); okUser {
			parent = publicUser(u)
		}
	}
	children := []map[string]any{}
	maxDays, maxReason := a.maxCodeDays(user)
	for _, rel := range a.store.ChildrenOf(user.UID) {
		if u, okUser := a.store.User(rel.ChildUID); okUser {
			item := publicUser(u)
			item["has_emby"] = u.EmbyID != ""
			item["emby_expired"] = u.ExpiredAt > 0 && u.ExpiredAt < time.Now().Unix()
			item["can_generate_renew_code"] = maxDays > 0
			children = append(children, item)
		}
	}
	canInvite, reason := a.canInvite(user)
	ok(w, "OK", map[string]any{"enabled": a.cfg.InviteEnabled, "is_root": parent == nil, "parent": parent, "children": children, "tree": a.inviteTreeFor(user), "depth": a.inviteDepth(user.UID), "max_depth": a.cfg.InviteMaxDepth, "can_invite": canInvite, "invite_block_reason": reason, "max_code_days": maxDays, "max_code_days_reason": maxReason, "codes": codeItems, "total": len(codeItems)})
}

func (a *App) handleCreateInviteCode(w http.ResponseWriter, r *http.Request, _ Params) {
	if !a.cfg.InviteEnabled {
		fail(w, http.StatusForbidden, "邀请功能未开启")
		return
	}
	user := current(r).User
	canInvite, reason := a.canInvite(user)
	if !canInvite {
		fail(w, http.StatusForbidden, reason)
		return
	}
	payload := decodeMap(r)
	days := intValue(payload, "days", a.cfg.InviteDefaultDays)
	maxDays, _ := a.maxCodeDays(user)
	if days <= 0 || days > maxDays {
		fail(w, http.StatusBadRequest, "邀请码天数超出允许范围")
		return
	}
	code := strings.ToUpper("INV" + randomCode(10))
	expiresAt := int64(intValue(payload, "expires_at", -1))
	targetUsername := strings.TrimSpace(stringValue(payload, "target_username"))
	if targetUsername != "" && (len(targetUsername) < 3 || len(targetUsername) > 32) {
		fail(w, http.StatusBadRequest, "目标用户名长度需在 3-32 字符之间")
		return
	}
	invite := store.InviteCode{Code: code, UID: user.UID, InviterUID: user.UID, Days: days, UseCountLimit: 1, Active: true, Note: truncateString(stringValue(payload, "note"), 255), TargetUsername: targetUsername, CreatedAt: time.Now().Unix(), ExpiredAt: expiresAt}
	_ = a.store.UpsertInviteCode(invite)
	created(w, "invite code created", inviteCodeDTO(invite))
}

func (a *App) handleInviteCodes(w http.ResponseWriter, r *http.Request, _ Params) {
	if !a.cfg.InviteEnabled {
		fail(w, http.StatusForbidden, "邀请功能未开启")
		return
	}
	codes := a.store.ListInviteCodes(current(r).User.UID)
	items := make([]map[string]any, 0, len(codes))
	for _, code := range codes {
		items = append(items, inviteCodeDTO(code))
	}
	ok(w, "OK", map[string]any{"codes": items, "total": len(items)})
}

func (a *App) handleDeleteInviteCode(w http.ResponseWriter, r *http.Request, params Params) {
	if statusFromError(w, a.store.DeleteInviteCode(current(r).User.UID, params["code"])) {
		return
	}
	ok(w, "invite code deleted", nil)
}

func (a *App) handleDetachExpiredInviteChild(w http.ResponseWriter, r *http.Request, params Params) {
	if !a.cfg.InviteEnabled {
		fail(w, http.StatusForbidden, "邀请功能未开启")
		return
	}
	uid, _ := int64Param(params, "uid")
	user := current(r).User
	rel, okRel := a.store.ParentOf(uid)
	if !okRel || rel.ParentUID != user.UID {
		fail(w, http.StatusForbidden, "只能断开自己的直属下级")
		return
	}
	child, okChild := a.store.User(uid)
	if !okChild {
		fail(w, http.StatusNotFound, "user not found")
		return
	}
	if child.ExpiredAt <= 0 || child.ExpiredAt >= time.Now().Unix() {
		fail(w, http.StatusBadRequest, "只能断开已到期的下级")
		return
	}
	deletedEmby := false
	if child.EmbyID != "" && a.cfg.EmbyURL != "" {
		if err := a.embyDelete(r.Context(), "/Users/"+urlPathEscape(child.EmbyID)); err != nil {
			fail(w, http.StatusBadGateway, "删除下级 Emby 账号失败："+err.Error())
			return
		}
		deletedEmby = true
	}
	updated, err := a.store.UpdateUser(uid, func(u *store.User) error {
		u.Active = true
		u.EmbyID = ""
		u.EmbyUsername = ""
		u.PendingEmby = false
		u.PendingEmbyDays = nil
		return nil
	})
	if statusFromError(w, err) {
		return
	}
	if err := a.store.DetachInvite(uid); statusFromError(w, err) {
		return
	}
	ok(w, "已断开下级关系", map[string]any{"uid": uid, "detached": true, "deleted_emby": deletedEmby || child.EmbyID != "", "user": publicUser(updated)})
}

func (a *App) handleInviteCheck(w http.ResponseWriter, r *http.Request, _ Params) {
	if !a.cfg.InviteEnabled {
		fail(w, http.StatusForbidden, "邀请功能未开启")
		return
	}
	code := stringValue(decodeMap(r), "code")
	invite, okInvite := a.store.InviteCode(code)
	if !okInvite || !invite.Active || (invite.ExpiredAt > 0 && invite.ExpiredAt < time.Now().Unix()) {
		fail(w, http.StatusNotFound, "邀请码无效或已停用")
		return
	}
	inviter := ""
	if u, okUser := a.store.User(invite.InviterUID); okUser {
		if !u.Active {
			fail(w, http.StatusNotFound, "邀请码无效或已停用")
			return
		}
		if maxDays, _ := a.maxCodeDays(u); maxDays <= 0 {
			fail(w, http.StatusNotFound, "邀请码无效或已停用")
			return
		}
		inviter = u.Username
	} else {
		fail(w, http.StatusNotFound, "邀请码无效或已停用")
		return
	}
	ok(w, "OK", map[string]any{"days": invite.Days, "inviter": inviter})
}

func (a *App) handleInviteUse(w http.ResponseWriter, r *http.Request, _ Params) {
	if !a.cfg.InviteEnabled {
		fail(w, http.StatusForbidden, "邀请功能未开启")
		return
	}
	payload := decodeMap(r)
	code := stringValue(payload, "code")
	if code == "" {
		fail(w, http.StatusBadRequest, "邀请码不能为空")
		return
	}
	user := current(r).User
	if user.EmbyID != "" {
		fail(w, http.StatusBadRequest, "当前账号已绑定 Emby")
		return
	}
	invite, okInvite := a.store.InviteCode(code)
	if !okInvite || !invite.Active {
		fail(w, http.StatusNotFound, "邀请码无效或已停用")
		return
	}
	if invite.TargetUsername != "" && !strings.EqualFold(invite.TargetUsername, user.Username) {
		fail(w, http.StatusForbidden, "此邀请码仅限指定用户使用")
		return
	}
	if invite.InviterUID == user.UID {
		fail(w, http.StatusBadRequest, "不能使用自己生成的邀请码")
		return
	}
	if _, hasParent := a.store.ParentOf(user.UID); hasParent {
		fail(w, http.StatusBadRequest, "当前账号已存在邀请上级，不能重复加入邀请树")
		return
	}
	inviter, okInviter := a.store.User(invite.InviterUID)
	if !okInviter || !inviter.Active {
		fail(w, http.StatusForbidden, "邀请人状态不可用")
		return
	}
	if a.inviteDepth(inviter.UID) >= a.cfg.InviteMaxDepth {
		fail(w, http.StatusForbidden, "邀请树层级已达上限")
		return
	}
	if a.cfg.InviteRootUserLimit > 0 {
		rootUID := a.inviteRootUID(inviter.UID)
		if a.inviteDescendantCount(rootUID) >= a.cfg.InviteRootUserLimit {
			fail(w, http.StatusForbidden, "邀请树人数已达上限")
			return
		}
	}
	maxDays, reason := a.maxCodeDays(inviter)
	if maxDays <= 0 {
		fail(w, http.StatusForbidden, firstNonEmpty(reason, "邀请人有效期不足"))
		return
	}
	effectiveDays := invite.Days
	if effectiveDays <= 0 || effectiveDays > maxDays {
		effectiveDays = maxDays
	}
	if reached, current, limit := a.embyCapacityReached(user.UID); reached {
		fail(w, http.StatusConflict, fmt.Sprintf("Emby 用户数量已达上限 %d/%d", current, limit))
		return
	}
	if _, err := a.store.ConsumeInviteCode(code, user.UID); statusFromError(w, err) {
		return
	}
	u, err := a.store.UpdateUser(user.UID, func(u *store.User) error {
		u.EmbyUsername = firstNonEmpty(stringValue(payload, "emby_username"), u.Username)
		u.PendingEmby = true
		u.PendingEmbyDays = &effectiveDays
		u.ExpiredAt = boundedInviteExpiry(addDaysToExpiry(u.ExpiredAt, effectiveDays, time.Now()), inviter.ExpiredAt)
		return nil
	})
	if statusFromError(w, err) {
		return
	}
	ok(w, "invite code used", map[string]any{"user": publicUser(u), "days": effectiveDays, "inviter_uid": invite.InviterUID})
}

func boundedInviteExpiry(candidate, inviterExpiredAt int64) int64 {
	if inviterExpiredAt > 0 && inviterExpiredAt < permanentExpiryUnix && (candidate < 0 || candidate > inviterExpiredAt) {
		return inviterExpiredAt
	}
	return candidate
}
