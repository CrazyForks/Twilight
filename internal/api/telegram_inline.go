package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/prejudice-studio/twilight/internal/store"
)

const telegramPanelTTL = time.Minute

type telegramPanelContext struct {
	Token            string
	ChatID           int64
	MessageID        int64
	CommandMessageID int64
	TargetUID        int64
	Query            string
	ReplyTelegramID  int64
	ExpiresAt        int64
	ConfirmAction    string
	// timer 是这个 panel 的过期定时器；同一个 panel 全程只对应一个 *time.Timer。
	// touch 时调 Reset 而非 AfterFunc 新建一个，避免 admin 高频按按钮时 goroutine
	// 与 closure 累积——历史实现每次 touch 都挂一个新 AfterFunc，旧的从不取消，
	// 极端场景下单个 panel 能挂出几十个未释放的 closure。结构体被拷贝到栈 / map
	// 时共享同一个 *Timer 实例，map 内的副本始终是定时器的"主人"。
	timer *time.Timer
}

func telegramIsAnonymousGroupMessage(message map[string]any) bool {
	if message == nil {
		return false
	}
	if senderChat, _ := message["sender_chat"].(map[string]any); senderChat != nil {
		return true
	}
	chat, _ := message["chat"].(map[string]any)
	from, _ := message["from"].(map[string]any)
	return numeric(chat["id"]) != 0 && !strings.EqualFold(asString(chat["type"]), "private") && numeric(from["id"]) == 0
}

func (a *App) telegramResolveGroupUserTarget(fields []string, message map[string]any) (store.User, string) {
	return a.telegramResolveGroupUserTargetValues(telegramCommandQuery(fields), telegramReplyTelegramID(message))
}

func (a *App) telegramResolveGroupUserTargetValues(query string, replyTelegramID int64) (store.User, string) {
	if strings.TrimSpace(query) == "" {
		if replyTelegramID != 0 {
			if u, okUser := a.store().FindUserByTelegramID(replyTelegramID); okUser {
				return u, ""
			}
			return store.User{}, "目标 Telegram 尚未绑定 Twilight 账号。"
		}
		return store.User{}, "请回复目标用户消息后发送 /twguser，或发送 /twguser <用户名/UID/关键词>。"
	}
	users := a.telegramFindUsers(query, 6)
	if len(users) == 0 {
		return store.User{}, "未找到匹配用户。"
	}
	if len(users) > 1 {
		return store.User{}, "找到多个匹配项，请缩小关键词。\n\n" + telegramUserList(users)
	}
	return users[0], ""
}

func (a *App) telegramSendGroupAdminAuth(ctx context.Context, chatID, commandMessageID int64, fields []string, message map[string]any) {
	panel := a.telegramCreateAuthPanel(chatID, commandMessageID, telegramCommandQuery(fields), telegramReplyTelegramID(message))
	markup := telegramInlineKeyboard([][]telegramInlineButton{
		{{Text: "验证管理员身份", Data: "gadm:auth:" + panel.Token}},
		{{Text: "关闭面板", Data: "gadm:act:close:" + panel.Token}},
	})
	messageID, err := a.telegramSendMessageWithMarkup(ctx, chatID, "匿名管理员指令需要先验证真实 Telegram 身份。", markup)
	if err != nil {
		return
	}
	panel.MessageID = messageID
	a.telegramSavePanel(panel)
}

func (a *App) telegramSendGroupUserPanel(ctx context.Context, chatID, commandMessageID int64, target store.User, requireAuth bool) {
	panel := a.telegramCreatePanel(chatID, commandMessageID, target)
	text := a.telegramGroupUserPanelText(ctx, target)
	markup := a.telegramGroupUserPanelMarkup(panel.Token, target, panel.ConfirmAction)
	messageID, err := a.telegramSendMessageWithMarkup(ctx, chatID, text, markup)
	if err != nil {
		return
	}
	panel.MessageID = messageID
	if requireAuth {
		panel.ConfirmAction = "auth"
	}
	a.telegramSavePanel(panel)
}

func (a *App) telegramCreatePanel(chatID, commandMessageID int64, target store.User) telegramPanelContext {
	token := telegramRandomToken()
	return telegramPanelContext{
		Token:            token,
		ChatID:           chatID,
		CommandMessageID: commandMessageID,
		TargetUID:        target.UID,
		ExpiresAt:        time.Now().Add(telegramPanelTTL).Unix(),
	}
}

func (a *App) telegramCreateAuthPanel(chatID, commandMessageID int64, query string, replyTelegramID int64) telegramPanelContext {
	token := telegramRandomToken()
	return telegramPanelContext{
		Token:            token,
		ChatID:           chatID,
		CommandMessageID: commandMessageID,
		Query:            strings.TrimSpace(query),
		ReplyTelegramID:  replyTelegramID,
		ExpiresAt:        time.Now().Add(telegramPanelTTL).Unix(),
	}
}

func (a *App) telegramSavePanel(panel telegramPanelContext) {
	a.telegramPanelMu.Lock()
	if a.telegramPanels == nil {
		a.telegramPanels = map[string]telegramPanelContext{}
	}
	// 既存 panel（同 token 极少见，但 token 复用 / 错误重发场景下要清理）：
	// 先停掉旧 timer 再覆盖，避免泄露。
	if existing, ok := a.telegramPanels[panel.Token]; ok && existing.timer != nil {
		existing.timer.Stop()
	}
	delay := telegramPanelTTL + time.Second
	token := panel.Token
	panel.timer = time.AfterFunc(delay, func() { a.telegramExpirePanel(token) })
	a.telegramPanels[panel.Token] = panel
	a.telegramPanelMu.Unlock()
}

// telegramSchedulePanelExpiry 仅在 telegramExpirePanel 发现 panel 仍未到期
// 时被调用，用 Reset 续上当前 panel 的 timer。touch 路径不再走这里。
func (a *App) telegramSchedulePanelExpiry(token string, delay time.Duration) {
	if delay <= 0 {
		delay = time.Second
	}
	a.telegramPanelMu.Lock()
	panel, ok := a.telegramPanels[token]
	if !ok {
		a.telegramPanelMu.Unlock()
		return
	}
	if panel.timer != nil {
		panel.timer.Reset(delay)
	} else {
		panel.timer = time.AfterFunc(delay, func() { a.telegramExpirePanel(token) })
		a.telegramPanels[token] = panel
	}
	a.telegramPanelMu.Unlock()
}

func (a *App) telegramExpirePanel(token string) {
	a.telegramPanelMu.Lock()
	panel, ok := a.telegramPanels[token]
	if !ok {
		a.telegramPanelMu.Unlock()
		return
	}
	if panel.ExpiresAt > time.Now().Unix() {
		// 还没到点（被 touch 过）——续上 timer 并退出，本次回调不删消息。
		delay := time.Until(time.Unix(panel.ExpiresAt, 0)) + time.Second
		if delay <= 0 {
			delay = time.Second
		}
		if panel.timer != nil {
			panel.timer.Reset(delay)
		} else {
			panel.timer = time.AfterFunc(delay, func() { a.telegramExpirePanel(token) })
			a.telegramPanels[token] = panel
		}
		a.telegramPanelMu.Unlock()
		return
	}
	delete(a.telegramPanels, token)
	if panel.timer != nil {
		panel.timer.Stop()
	}
	a.telegramPanelMu.Unlock()
	_ = a.telegramDeleteMessage(context.Background(), panel.ChatID, panel.MessageID)
}

func (a *App) telegramPanel(token string) (telegramPanelContext, bool) {
	a.telegramPanelMu.Lock()
	defer a.telegramPanelMu.Unlock()
	panel, ok := a.telegramPanels[token]
	if !ok || panel.ExpiresAt < time.Now().Unix() {
		if ok {
			if panel.timer != nil {
				panel.timer.Stop()
			}
			delete(a.telegramPanels, token)
		}
		return telegramPanelContext{}, false
	}
	return panel, true
}

func (a *App) telegramTouchPanel(panel telegramPanelContext) telegramPanelContext {
	panel.ExpiresAt = time.Now().Add(telegramPanelTTL).Unix()
	delay := telegramPanelTTL + time.Second
	a.telegramPanelMu.Lock()
	if existing, ok := a.telegramPanels[panel.Token]; ok && existing.timer != nil {
		// 复用 map 里那把 timer：Reset 即可，不再每次 AfterFunc 新建 closure。
		existing.timer.Reset(delay)
		panel.timer = existing.timer
	} else if panel.timer != nil {
		panel.timer.Reset(delay)
	} else {
		token := panel.Token
		panel.timer = time.AfterFunc(delay, func() { a.telegramExpirePanel(token) })
	}
	a.telegramPanels[panel.Token] = panel
	a.telegramPanelMu.Unlock()
	return panel
}

func (a *App) telegramDeletePanel(token string) {
	a.telegramPanelMu.Lock()
	if existing, ok := a.telegramPanels[token]; ok && existing.timer != nil {
		existing.timer.Stop()
	}
	delete(a.telegramPanels, token)
	a.telegramPanelMu.Unlock()
}

func (a *App) telegramHandleCallback(ctx context.Context, callback map[string]any) {
	data := asString(callback["data"])
	parts := strings.Split(data, ":")
	if len(parts) < 3 || parts[0] != "gadm" {
		return
	}
	callbackID := asString(callback["id"])
	from, _ := callback["from"].(map[string]any)
	actorID := numeric(from["id"])
	message, _ := callback["message"].(map[string]any)
	chat, _ := message["chat"].(map[string]any)
	chatID := numeric(chat["id"])
	messageID := numeric(message["message_id"])
	token := parts[len(parts)-1]
	panel, ok := a.telegramPanel(token)
	if !ok {
		_ = a.telegramAnswerCallbackQuery(ctx, callbackID, "面板已过期，请重新发送 /twguser。", true)
		_ = a.telegramDeleteMessage(ctx, chatID, messageID)
		return
	}
	if panel.MessageID == 0 && messageID != 0 {
		panel.MessageID = messageID
	}
	if panel.ChatID == 0 && chatID != 0 {
		panel.ChatID = chatID
	}
	if (panel.ChatID != 0 && chatID != 0 && panel.ChatID != chatID) || (panel.MessageID != 0 && messageID != 0 && panel.MessageID != messageID) {
		_ = a.telegramAnswerCallbackQuery(ctx, callbackID, "面板来源不匹配，请重新打开。", true)
		return
	}
	if !a.telegramAdminID(actorID) {
		_ = a.telegramAnswerCallbackQuery(ctx, callbackID, "没有管理员权限。", true)
		a.telegramSendUnauthorizedAndCleanup(ctx, panel.ChatID, panel.CommandMessageID)
		return
	}
	if parts[1] == "auth" {
		panel.ConfirmAction = ""
		panel = a.telegramTouchPanel(panel)
		_ = a.telegramAnswerCallbackQuery(ctx, callbackID, "身份验证通过。", false)
		if panel.TargetUID == 0 {
			target, reason := a.telegramResolveGroupUserTargetValues(panel.Query, panel.ReplyTelegramID)
			if reason != "" {
				_ = a.telegramEditMessageText(ctx, panel.ChatID, panel.MessageID, reason, nil)
				a.telegramDeletePanel(panel.Token)
				return
			}
			panel.TargetUID = target.UID
			panel = a.telegramTouchPanel(panel)
		}
		a.telegramEditPanel(ctx, panel)
		return
	}
	if len(parts) < 4 || parts[1] != "act" {
		return
	}
	action := parts[2]
	if action == "close" {
		a.telegramDeletePanel(panel.Token)
		_ = a.telegramAnswerCallbackQuery(ctx, callbackID, "面板已关闭。", false)
		_ = a.telegramDeleteMessage(ctx, panel.ChatID, panel.MessageID)
		return
	}
	panel = a.telegramTouchPanel(panel)
	_ = a.telegramAnswerCallbackQuery(ctx, callbackID, "操作处理中。", false)
	a.telegramApplyPanelAction(ctx, panel, action)
}

func (a *App) telegramApplyPanelAction(ctx context.Context, panel telegramPanelContext, action string) {
	target, ok := a.store().User(panel.TargetUID)
	if !ok {
		a.telegramDeletePanel(panel.Token)
		_ = a.telegramEditMessageText(ctx, panel.ChatID, panel.MessageID, "目标用户不存在或已被删除。", nil)
		return
	}
	switch action {
	case "refresh":
		panel.ConfirmAction = ""
		a.telegramTouchPanel(panel)
		a.telegramEditPanel(ctx, panel)
	case "enable", "disable":
		enabled := action == "enable"
		if !enabled && a.telegramProtectedTarget(target) {
			a.telegramEditPanelWithNotice(ctx, panel, target, "管理员账号禁止通过 Telegram 面板禁用。")
			return
		}
		updated, err := a.store().SetUserActiveAtomic(target.UID, enabled)
		if err != nil {
			a.telegramEditPanelWithNotice(ctx, panel, target, "更新用户状态失败: "+err.Error())
			return
		}
		if !enabled {
			a.sessions().DeleteUser(ctx, updated.UID)
		}
		if updated.EmbyID != "" && a.cfg().EmbyURL != "" {
			_ = a.embySetUserEnabled(ctx, updated.EmbyID, a.embyShouldEnableUser(updated))
		}
		a.telegramEditPanelWithNotice(ctx, panel, updated, "用户状态已更新。")
	case "emby_disable", "emby_enable":
		if a.telegramProtectedTarget(target) {
			a.telegramEditPanelWithNotice(ctx, panel, target, "受保护账号禁止通过 Telegram 面板修改 Emby 状态。")
			return
		}
		if target.EmbyID == "" {
			a.telegramEditPanelWithNotice(ctx, panel, target, "目标用户未绑定 Emby 账号。")
			return
		}
		if !a.embyConfigured() {
			a.telegramEditPanelWithNotice(ctx, panel, target, "Emby URL 或 API Token 未配置，无法操作远端账号。")
			return
		}
		enableEmby := action == "emby_enable"
		if enableEmby && !a.embyShouldEnableUser(target) {
			a.telegramEditPanelWithNotice(ctx, panel, target, "Web 账号已禁用或已过期，禁止绕过有效期直接启用 Emby。")
			return
		}
		if err := a.embySetUserEnabled(ctx, target.EmbyID, enableEmby); err != nil {
			a.telegramEditPanelWithNotice(ctx, panel, target, "Emby 状态更新失败: "+telegramPanelSafeError(err))
			return
		}
		verb := "禁用"
		if enableEmby {
			verb = "启用"
		}
		a.telegramEditPanelWithNotice(ctx, panel, target, "Emby 账号已"+verb+"。")
	case "grant_register":
		if a.telegramProtectedTarget(target) {
			a.telegramEditPanelWithNotice(ctx, panel, target, "管理员或受保护账号不需要通过群组面板授予注册资格。")
			return
		}
		if target.EmbyID != "" {
			a.telegramEditPanelWithNotice(ctx, panel, target, "目标用户已绑定 Emby，无需授予注册资格。")
			return
		}
		if reached, current, limit := a.embyCapacityReached(target.UID); reached {
			a.telegramEditPanelWithNotice(ctx, panel, target, fmt.Sprintf("Emby 名额已满: %d/%d。", current, limit))
			return
		}
		days := a.cfg().InviteDefaultDays
		if days == 0 {
			days = a.cfg().EmbyDirectRegisterDays
		}
		if days == 0 {
			days = 30
		}
		if days < -1 {
			days = -1
		}
		updated, err := a.store().UpdateUser(target.UID, func(u *store.User) error {
			u.PendingEmby = true
			u.PendingEmbyDays = &days
			if u.Role == store.RoleUnrecognized {
				u.Role = store.RoleNormal
			}
			return nil
		})
		if err != nil {
			a.telegramEditPanelWithNotice(ctx, panel, target, "授予注册资格失败: "+err.Error())
			return
		}
		a.telegramEditPanelWithNotice(ctx, panel, updated, fmt.Sprintf("已授予 Emby 注册资格，有效天数: %d。", days))
	case "delete":
		if a.telegramProtectedTarget(target) {
			a.telegramEditPanelWithNotice(ctx, panel, target, "管理员账号禁止通过 Telegram 面板删除。")
			return
		}
		panel.ConfirmAction = "delete"
		panel = a.telegramTouchPanel(panel)
		a.telegramEditPanel(ctx, panel)
	case "delete_confirm":
		if panel.ConfirmAction != "delete" {
			a.telegramEditPanelWithNotice(ctx, panel, target, "请先点击删除按钮确认风险。")
			return
		}
		if a.telegramProtectedTarget(target) {
			a.telegramEditPanelWithNotice(ctx, panel, target, "管理员账号禁止通过 Telegram 面板删除。")
			return
		}
		if err := a.store().DeleteUser(target.UID); err != nil {
			a.telegramEditPanelWithNotice(ctx, panel, target, "删除用户失败: "+err.Error())
			return
		}
		a.sessions().DeleteUser(ctx, target.UID)
		a.telegramDeletePanel(panel.Token)
		_ = a.telegramEditMessageText(ctx, panel.ChatID, panel.MessageID, fmt.Sprintf("已删除用户 %s。", target.Username), nil)
	case "emby_delete":
		if a.telegramProtectedTarget(target) {
			a.telegramEditPanelWithNotice(ctx, panel, target, "受保护账号禁止通过 Telegram 面板删除 Emby 账号。")
			return
		}
		if target.EmbyID == "" {
			a.telegramEditPanelWithNotice(ctx, panel, target, "目标用户未绑定 Emby 账号。")
			return
		}
		panel.ConfirmAction = "emby_delete"
		panel = a.telegramTouchPanel(panel)
		a.telegramEditPanel(ctx, panel)
	case "emby_delete_confirm":
		if panel.ConfirmAction != "emby_delete" {
			a.telegramEditPanelWithNotice(ctx, panel, target, "请先点击删除 Emby 按钮确认风险。")
			return
		}
		if a.telegramProtectedTarget(target) {
			a.telegramEditPanelWithNotice(ctx, panel, target, "受保护账号禁止通过 Telegram 面板删除 Emby 账号。")
			return
		}
		updated, err := a.telegramDeleteTargetEmby(ctx, target)
		if err != nil {
			a.telegramEditPanelWithNotice(ctx, panel, target, "删除 Emby 账号失败: "+telegramPanelSafeError(err))
			return
		}
		a.telegramEditPanelWithNotice(ctx, panel, updated, "Emby 账号已删除，本地账号保留。")
	case "kick", "ban":
		if target.TelegramID == 0 {
			a.telegramEditPanelWithNotice(ctx, panel, target, "目标用户未绑定 Telegram，无法执行群组操作。")
			return
		}
		if a.telegramProtectedTarget(target) {
			a.telegramEditPanelWithNotice(ctx, panel, target, "管理员账号禁止通过 Telegram 面板移出或封禁。")
			return
		}
		var err error
		if action == "kick" {
			err = a.telegramKickChatMember(ctx, fmt.Sprint(panel.ChatID), target.TelegramID)
		} else {
			err = a.telegramBanChatMember(ctx, fmt.Sprint(panel.ChatID), target.TelegramID)
		}
		if err != nil {
			a.telegramEditPanelWithNotice(ctx, panel, target, "Telegram 群组操作失败: "+a.telegramSanitizeError(err))
			return
		}
		a.telegramEditPanelWithNotice(ctx, panel, target, "Telegram 群组操作已完成。")
	default:
		a.telegramEditPanelWithNotice(ctx, panel, target, "未知操作。")
	}
}

func (a *App) telegramEditPanel(ctx context.Context, panel telegramPanelContext) {
	target, ok := a.store().User(panel.TargetUID)
	if !ok {
		_ = a.telegramEditMessageText(ctx, panel.ChatID, panel.MessageID, "目标用户不存在或已被删除。", nil)
		return
	}
	_ = a.telegramEditMessageText(ctx, panel.ChatID, panel.MessageID, a.telegramGroupUserPanelText(ctx, target), a.telegramGroupUserPanelMarkup(panel.Token, target, panel.ConfirmAction))
}

func (a *App) telegramEditPanelWithNotice(ctx context.Context, panel telegramPanelContext, target store.User, notice string) {
	panel.ConfirmAction = ""
	panel = a.telegramTouchPanel(panel)
	text := a.telegramGroupUserPanelText(ctx, target)
	if strings.TrimSpace(notice) != "" {
		text += "\n\n" + notice
	}
	_ = a.telegramEditMessageText(ctx, panel.ChatID, panel.MessageID, text, a.telegramGroupUserPanelMarkup(panel.Token, target, panel.ConfirmAction))
}

func (a *App) telegramGroupUserPanelText(ctx context.Context, u store.User) string {
	lines := []string{
		"Twilight 群组用户面板",
		"",
		"== 用户 ==",
		"用户名: " + u.Username,
		fmt.Sprintf("UID: %d", u.UID),
		"角色: " + roleName(u.Role),
		"受保护: " + telegramYesNoLabel(a.telegramProtectedTarget(u)),
		"",
		"== Web 账号 ==",
		"状态: " + telegramActiveLabel(u.Active),
		"到期: " + expireStatus(u.ExpiredAt),
		"注册时间: " + telegramUnixTimeLabel(firstNonZeroInt64(u.RegisterTime, u.CreatedAt)),
		"媒体库自助: " + telegramEnabledLabel(u.LibrarySelfService),
		"",
		"== 绑定 ==",
		"Telegram: " + telegramTelegramBindingLabel(u),
		"Emby: " + telegramLocalEmbyLabel(u),
	}
	lines = append(lines, a.telegramGroupUserPanelEmbyLines(ctx, u)...)
	lines = append(lines,
		"",
		"== 安全提示 ==",
		"面板 1 分钟无操作会自动删除；每次按钮操作都会重新校验管理员身份。",
		"群内面板不展示邮箱、Emby ID、Token、密码或服务器线路。",
	)
	return strings.Join(lines, "\n")
}

func (a *App) telegramGroupUserPanelEmbyLines(ctx context.Context, u store.User) []string {
	lines := []string{"", "== Emby 远端 =="}
	if u.EmbyID == "" {
		if u.PendingEmby {
			lines = append(lines, "状态: 待用户创建 Emby 账号", "授权天数: "+telegramPendingEmbyDaysLabel(u.PendingEmbyDays))
		} else {
			lines = append(lines, "状态: 未绑定")
		}
		return lines
	}
	if !a.embyConfigured() {
		return append(lines, "状态: 本地已绑定，远端未配置或 Token 缺失，无法查询")
	}
	remote, found, err := a.embyUserByID(ctx, u.EmbyID)
	if err != nil {
		return append(lines, "状态: 查询失败（详情见后端日志）")
	}
	if !found {
		return append(lines, "状态: 远端未找到，本地仍保留绑定")
	}
	policy := embyPolicy(remote)
	remoteName := firstNonEmpty(asString(remote["Name"]), u.EmbyUsername, "-")
	remoteStatus := "启用"
	if boolish(policy["IsDisabled"]) {
		remoteStatus = "禁用"
	}
	adminState := "普通用户"
	if boolish(policy["IsAdministrator"]) {
		adminState = "管理员"
	}
	return append(lines,
		"远端用户名: "+remoteName,
		"远端状态: "+remoteStatus,
		"远端权限: "+adminState,
		"隐藏状态: "+telegramYesNoLabel(boolish(policy["IsHidden"])),
		"最近活动: "+telegramActivityTimeLabel(remote["LastActivityDate"], remote["DateLastActivity"], remote["LastLoginDate"]),
	)
}

func (a *App) telegramGroupUserPanelMarkup(token string, u store.User, confirmAction string) any {
	panelRows := [][]telegramInlineButton{{
		{Text: "刷新", Data: "gadm:act:refresh:" + token},
		{Text: "关闭面板", Data: "gadm:act:close:" + token},
	}}
	protected := a.telegramProtectedTarget(u)
	if protected {
		return telegramInlineKeyboard(panelRows)
	}
	if u.Active {
		panelRows = append(panelRows, []telegramInlineButton{{Text: "禁用 Web 账号", Data: "gadm:act:disable:" + token}})
	} else {
		panelRows = append(panelRows, []telegramInlineButton{{Text: "启用 Web 账号", Data: "gadm:act:enable:" + token}})
	}
	if u.EmbyID != "" {
		panelRows = append(panelRows, []telegramInlineButton{
			{Text: "禁用 Emby", Data: "gadm:act:emby_disable:" + token},
			{Text: "启用 Emby", Data: "gadm:act:emby_enable:" + token},
		})
		if confirmAction == "emby_delete" {
			panelRows = append(panelRows, []telegramInlineButton{{Text: "确认删除 Emby", Data: "gadm:act:emby_delete_confirm:" + token}})
		} else {
			panelRows = append(panelRows, []telegramInlineButton{{Text: "删除 Emby", Data: "gadm:act:emby_delete:" + token}})
		}
	}
	if u.EmbyID == "" && !u.PendingEmby {
		panelRows = append(panelRows, []telegramInlineButton{{Text: "授予注册资格", Data: "gadm:act:grant_register:" + token}})
	}
	if confirmAction == "delete" {
		panelRows = append(panelRows, []telegramInlineButton{{Text: "确认删除用户", Data: "gadm:act:delete_confirm:" + token}})
	} else {
		panelRows = append(panelRows, []telegramInlineButton{{Text: "删除用户", Data: "gadm:act:delete:" + token}})
	}
	if u.TelegramID != 0 {
		panelRows = append(panelRows, []telegramInlineButton{
			{Text: "移出群组", Data: "gadm:act:kick:" + token},
			{Text: "封禁群组", Data: "gadm:act:ban:" + token},
		})
	}
	return telegramInlineKeyboard(panelRows)
}

func (a *App) telegramProtectedTarget(u store.User) bool {
	return a.userIsProtected(u) || (u.TelegramID != 0 && a.telegramAdminID(u.TelegramID))
}

func (a *App) telegramDeleteTargetEmby(ctx context.Context, target store.User) (store.User, error) {
	if target.EmbyID == "" {
		return target, fmt.Errorf("target user has no Emby account")
	}
	if !a.embyConfigured() {
		return target, fmt.Errorf("Emby URL or API Token is not configured")
	}
	if err := a.embyDelete(ctx, "/Users/"+urlPathEscape(target.EmbyID)); err != nil && !strings.Contains(err.Error(), "remote status 404") {
		return target, err
	}
	return a.store().UpdateUser(target.UID, func(u *store.User) error {
		u.EmbyID = ""
		u.EmbyUsername = ""
		u.PendingEmby = false
		u.PendingEmbyDays = nil
		return nil
	})
}

func telegramPanelSafeError(err error) string {
	if err == nil {
		return ""
	}
	return truncateString(redactSensitiveText(err.Error()), 120)
}

func telegramTelegramBindingLabel(u store.User) string {
	if u.TelegramID == 0 {
		return "未绑定"
	}
	if strings.TrimSpace(u.TelegramUsername) != "" {
		return "已绑定 (@" + strings.TrimPrefix(u.TelegramUsername, "@") + ")"
	}
	return "已绑定"
}

func telegramLocalEmbyLabel(u store.User) string {
	if u.EmbyID != "" {
		if strings.TrimSpace(u.EmbyUsername) != "" {
			return "已绑定 (" + u.EmbyUsername + ")"
		}
		return "已绑定"
	}
	if u.PendingEmby {
		return "待开通 (" + telegramPendingEmbyDaysLabel(u.PendingEmbyDays) + ")"
	}
	return "未绑定"
}

func telegramPendingEmbyDaysLabel(days *int) string {
	if days == nil {
		return "未设置"
	}
	if *days < 0 {
		return "永久"
	}
	return fmt.Sprintf("%d 天", *days)
}

func telegramEnabledLabel(ok bool) string {
	if ok {
		return "开启"
	}
	return "关闭"
}

func telegramUnixTimeLabel(ts int64) string {
	if ts <= 0 {
		return "-"
	}
	return time.Unix(ts, 0).Format("2006-01-02 15:04")
}

func telegramActivityTimeLabel(values ...any) string {
	for _, value := range values {
		raw := strings.TrimSpace(asString(value))
		if raw == "" {
			continue
		}
		if t, ok := telegramParseActivityTime(raw); ok {
			return telegramTimeLabel(t)
		}
		return truncateString(raw, 80)
	}
	return "-"
}

func telegramParseActivityTime(raw string) (time.Time, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || strings.EqualFold(trimmed, "null") {
		return time.Time{}, true
	}
	if n, err := strconv.ParseFloat(trimmed, 64); err == nil {
		if n <= 0 {
			return time.Time{}, true
		}
		return telegramUnixNumberTime(n), true
	}

	for _, layout := range []string{
		time.RFC3339Nano,
		"2006-01-02T15:04:05.999999999",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	} {
		var (
			t   time.Time
			err error
		)
		if strings.Contains(layout, "Z07") {
			t, err = time.Parse(layout, trimmed)
		} else {
			t, err = time.ParseInLocation(layout, trimmed, time.Local)
		}
		if err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func telegramUnixNumberTime(value float64) time.Time {
	switch {
	case value >= 1e18:
		return time.Unix(0, int64(value)).UTC()
	case value >= 1e15:
		return time.UnixMicro(int64(value)).UTC()
	case value >= 1e12:
		return time.UnixMilli(int64(value)).UTC()
	default:
		seconds := int64(value)
		nanos := int64((value - float64(seconds)) * 1e9)
		return time.Unix(seconds, nanos).UTC()
	}
}

func telegramTimeLabel(t time.Time) string {
	if t.IsZero() || t.Year() <= 1 {
		return "-"
	}
	return t.Format("2006-01-02 15:04")
}

func firstNonZeroInt64(values ...int64) int64 {
	for _, value := range values {
		if value != 0 {
			return value
		}
	}
	return 0
}

func (a *App) telegramSendUnauthorizedAndCleanup(ctx context.Context, chatID, sourceMessageID int64) {
	warnID, _ := a.telegramSendMessageWithMarkup(ctx, chatID, "没有管理员权限。此提示和越权指令将在 30 秒后自动删除。", nil)
	time.AfterFunc(30*time.Second, func() {
		_ = a.telegramDeleteMessage(context.Background(), chatID, warnID)
		_ = a.telegramDeleteMessage(context.Background(), chatID, sourceMessageID)
	})
}

type telegramInlineButton struct {
	Text string
	Data string
}

func telegramInlineKeyboard(rows [][]telegramInlineButton) any {
	keyboard := make([][]map[string]string, 0, len(rows))
	for _, row := range rows {
		items := make([]map[string]string, 0, len(row))
		for _, button := range row {
			items = append(items, map[string]string{"text": button.Text, "callback_data": button.Data})
		}
		keyboard = append(keyboard, items)
	}
	return map[string]any{"inline_keyboard": keyboard}
}

func telegramCommandQuery(fields []string) string {
	if len(fields) <= 1 {
		return ""
	}
	return strings.Join(fields[1:], " ")
}

func telegramReplyTelegramID(message map[string]any) int64 {
	if reply, _ := message["reply_to_message"].(map[string]any); reply != nil {
		if from, _ := reply["from"].(map[string]any); from != nil {
			return numeric(from["id"])
		}
	}
	return 0
}

func telegramRandomToken() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}
