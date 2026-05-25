package api

// ErrCode 是后端业务级错误码，前端 / Bot / 第三方集成方靠它做语义判断
// （HTTP status 仅描述协议层错误，业务错误码描述领域语义）。
// 命名规范：
//   - 全大写 + 下划线
//   - 前缀按业务域分组：USER_ / EMBY_ / REGCODE_ / INVITE_ / MEDIA_ /
//     APIKEY_ / TG_ / CONFIG_ / SCHEDULER_ / SYSTEM_ / RATE_
//   - 通用错误延用 response.go:defaultErrorCode 自动推导（BAD_REQUEST 等）
//
// 新增错误码时：
//  1. 在本文件追加常量
//  2. 在前端 webui/src/lib/api-types.ts 镜像枚举
type ErrCode = string

const (
	// === 鉴权 / 会话 ===
	ErrLoginRateLimited     ErrCode = "AUTH_LOGIN_RATE_LIMITED"
	ErrLoginInvalid         ErrCode = "AUTH_LOGIN_INVALID"
	ErrAccountDisabled      ErrCode = "AUTH_ACCOUNT_DISABLED"
	ErrSessionCreateFailed  ErrCode = "AUTH_SESSION_CREATE_FAILED"
	ErrAPIKeyEmpty          ErrCode = "AUTH_APIKEY_EMPTY"
	ErrAPIKeyInvalid        ErrCode = "AUTH_APIKEY_INVALID"
	ErrDirectLoginDisabled  ErrCode = "AUTH_DIRECT_LOGIN_DISABLED"
	ErrPasswordResetTooMany ErrCode = "AUTH_PASSWORD_RESET_TOO_MANY"
	ErrPasswordOldMismatch  ErrCode = "AUTH_PASSWORD_OLD_MISMATCH"
	ErrPasswordWeak         ErrCode = "AUTH_PASSWORD_WEAK"
	ErrPasswordHashFailed   ErrCode = "AUTH_PASSWORD_HASH_FAILED"
	ErrCSRFMissing          ErrCode = "AUTH_CSRF_MISSING"
	ErrCSRFMismatch         ErrCode = "AUTH_CSRF_MISMATCH"

	// === 用户 / 注册 ===
	ErrRegisterRateLimited ErrCode = "USER_REGISTER_RATE_LIMITED"
	ErrRegisterDisabled    ErrCode = "USER_REGISTER_DISABLED"
	ErrUsernameInvalid     ErrCode = "USER_USERNAME_INVALID"
	ErrUsernameTaken       ErrCode = "USER_USERNAME_TAKEN"
	ErrUserNotFound        ErrCode = "USER_NOT_FOUND"
	ErrUserLimitReached    ErrCode = "USER_LIMIT_REACHED"
	ErrUserProtected       ErrCode = "USER_PROTECTED"

	// === Telegram 绑定 ===
	ErrTGBindRequired       ErrCode = "TG_BIND_REQUIRED"
	ErrTGBindCodeFormat     ErrCode = "TG_BIND_CODE_FORMAT_INVALID"
	ErrTGBindCodeExpired    ErrCode = "TG_BIND_CODE_EXPIRED"
	ErrTGBindCodeNotConfirm ErrCode = "TG_BIND_CODE_NOT_CONFIRMED"
	ErrTGBindCodeSceneBad   ErrCode = "TG_BIND_CODE_SCENE_INVALID"
	ErrTGAlreadyBound       ErrCode = "TG_ALREADY_BOUND"

	// === Emby ===
	ErrEmbyAuthFailed      ErrCode = "EMBY_AUTH_FAILED"
	ErrEmbyAccountUnlinked ErrCode = "EMBY_ACCOUNT_UNLINKED"
	ErrEmbyCapacityReached ErrCode = "EMBY_CAPACITY_REACHED"
	ErrEmbyMissingCreds    ErrCode = "EMBY_MISSING_CREDENTIALS"
	ErrEmbyInputTooLong    ErrCode = "EMBY_INPUT_TOO_LONG"

	// === Bangumi ===
	ErrBangumiSyncDisabled ErrCode = "BANGUMI_SYNC_DISABLED"
	ErrBangumiTokenTooLong ErrCode = "BANGUMI_TOKEN_TOO_LONG"
	ErrBangumiTokenMissing ErrCode = "BANGUMI_TOKEN_MISSING"

	// === 调度器 ===
	ErrSchedulerJobNotFound ErrCode = "SCHEDULER_JOB_NOT_FOUND"
	ErrSchedulerJobRunning  ErrCode = "SCHEDULER_JOB_RUNNING"
	ErrSchedulerJobFailed   ErrCode = "SCHEDULER_JOB_FAILED"

	// === 系统更新（Git 拉取 / Systemd 重启） ===
	ErrUpdateRepoInvalid   ErrCode = "UPDATE_REPO_INVALID"
	ErrUpdateBranchInvalid ErrCode = "UPDATE_BRANCH_INVALID"
	ErrUpdateNotGitRepo    ErrCode = "UPDATE_NOT_GIT_REPO"
	ErrUpdateGitMissing    ErrCode = "UPDATE_GIT_MISSING"
	ErrUpdateInspectFailed ErrCode = "UPDATE_INSPECT_FAILED"
	ErrUpdateGitFailed     ErrCode = "UPDATE_GIT_FAILED"
	ErrUpdateRestartFailed ErrCode = "UPDATE_RESTART_FAILED"

	// === 通用业务 ===
	ErrInvalidPayload ErrCode = "INVALID_PAYLOAD"
	ErrInternal       ErrCode = "INTERNAL_ERROR"

	// === 注册码 / 邀请码 / 卡码使用流 ===
	// 这些错误在 code_use_handlers.go 高频出现，前端需基于稳定码做差异化
	// UI 行为（"不能使用自己生成的邀请码"应跳"前往个人主页"，"邀请树人数
	// 已达上限"应跳"申请提升上限"等），不能再依赖中文 message 正则。
	ErrCodeEmpty              ErrCode = "CODE_EMPTY"
	ErrCodeInvalid            ErrCode = "CODE_INVALID"
	ErrCodeAlreadyEmbyBound   ErrCode = "CODE_ALREADY_EMBY_BOUND"
	ErrInviteNotFound         ErrCode = "INVITE_NOT_FOUND"
	ErrInviteSelfGenerate     ErrCode = "INVITE_SELF_GENERATE"
	ErrInviteAlreadyHasParent ErrCode = "INVITE_ALREADY_HAS_PARENT"
	ErrInviteTargetMismatch   ErrCode = "INVITE_TARGET_MISMATCH"
	ErrInviterUnavailable     ErrCode = "INVITER_UNAVAILABLE"
	ErrInviteDepthExceeded    ErrCode = "INVITE_DEPTH_EXCEEDED"
	ErrInviteRootFull         ErrCode = "INVITE_ROOT_FULL"
	ErrInviterDaysShort       ErrCode = "INVITER_DAYS_SHORT"
	ErrRegcodeNotFound        ErrCode = "REGCODE_NOT_FOUND"

	// === 邀请域补充（invite_handlers.go 的领域错误） ===
	// 用于 invite 生成 / 续期码 / 断开下级 / 校验等流程，前端可据此实现
	// 差异化引导（如"目标用户名不合法"提示用户改写、"续期需先绑定 Emby"
	// 直接跳绑定页等），不再依赖中文 message。
	ErrInviteDisabled            ErrCode = "INVITE_DISABLED"
	ErrInviteCannotInvite        ErrCode = "INVITE_CANNOT_INVITE"
	ErrInviteDaysOutOfRange      ErrCode = "INVITE_DAYS_OUT_OF_RANGE"
	ErrInviteExpiresBeforeNow    ErrCode = "INVITE_EXPIRES_BEFORE_NOW"
	ErrInviteTargetUsernameBad   ErrCode = "INVITE_TARGET_USERNAME_INVALID"
	ErrInviteGenerationConflict  ErrCode = "INVITE_GENERATION_CONFLICT"
	ErrInviteRenewUserDisabled   ErrCode = "INVITE_RENEW_USER_DISABLED"
	ErrInviteRenewRequiresEmby   ErrCode = "INVITE_RENEW_REQUIRES_EMBY"
	ErrInviteRenewBadTarget      ErrCode = "INVITE_RENEW_BAD_TARGET"
	ErrInviteRenewNotDirectChild ErrCode = "INVITE_RENEW_NOT_DIRECT_CHILD"
	ErrInviteRenewTargetMissing  ErrCode = "INVITE_RENEW_TARGET_MISSING"
	ErrInviteRenewDaysOutOfRange ErrCode = "INVITE_RENEW_DAYS_OUT_OF_RANGE"
	ErrInviteDetachNotDirect     ErrCode = "INVITE_DETACH_NOT_DIRECT_CHILD"
	ErrInviteDetachNotExpired    ErrCode = "INVITE_DETACH_NOT_EXPIRED"
	ErrInviteEmbyBound           ErrCode = "INVITE_EMBY_ALREADY_BOUND"
	ErrEmbyDeleteFailed          ErrCode = "EMBY_DELETE_FAILED"

	// === 注册码（admin 写流程） ===
	// 配合 regcode_handlers.go：保留 REGCODE_NOT_FOUND，新增类型 / 冲突 /
	// 批量删除等业务码，让前端"批量删除失败 → 引导分批"等行为脱离 message 匹配。
	ErrRegcodeTypeInvalid      ErrCode = "REGCODE_TYPE_INVALID"
	ErrRegcodeTargetBad        ErrCode = "REGCODE_TARGET_USERNAME_INVALID"
	ErrRegcodeGenerateConflict ErrCode = "REGCODE_GENERATE_CONFLICT"
	ErrRegcodeBatchConfirm     ErrCode = "REGCODE_BATCH_CONFIRM_REQUIRED"
	ErrRegcodeBatchEmpty       ErrCode = "REGCODE_BATCH_EMPTY"
	ErrRegcodeBatchTooLarge    ErrCode = "REGCODE_BATCH_TOO_LARGE"
	ErrRegcodeBatchFailed      ErrCode = "REGCODE_BATCH_DELETE_FAILED"

	// === 签到 ===
	ErrSigninDisabled ErrCode = "SIGNIN_DISABLED"

	// === 数据库迁移 / 备份 ===
	// database_admin.go 的 fail() 全部是中文裸串；前端目前只能 toast 后端
	// message。补充结构化错误码后，迁移 / 恢复失败可在 UI 上做不同 CTA：
	// "重新选择文件" vs "联系运维查看日志"。
	ErrDBBackupListFailed   ErrCode = "DB_BACKUP_LIST_FAILED"
	ErrDBBackupInvalid      ErrCode = "DB_BACKUP_INVALID"
	ErrDBBackupReadFailed   ErrCode = "DB_BACKUP_READ_FAILED"
	ErrDBBackupSnapshotBad  ErrCode = "DB_BACKUP_SNAPSHOT_INVALID"
	ErrDBBackupDeleteFailed ErrCode = "DB_BACKUP_DELETE_FAILED"
	ErrDBBackupCreateFailed ErrCode = "DB_BACKUP_CREATE_FAILED"
	ErrDBSnapshotFailed     ErrCode = "DB_SNAPSHOT_FAILED"
	ErrDBSnapshotVerifyBad  ErrCode = "DB_SNAPSHOT_VERIFY_FAILED"
	ErrDBRestoreBackupFail  ErrCode = "DB_RESTORE_BACKUP_FAILED"
	ErrDBRestoreFailed      ErrCode = "DB_RESTORE_FAILED"
	ErrDBMigrationDisabled  ErrCode = "DB_MIGRATION_DISABLED"
	ErrDBSQLiteDisabled     ErrCode = "DB_SQLITE_DISABLED"
	ErrDBPostgresMissing    ErrCode = "DB_POSTGRES_DSN_MISSING"
	ErrDBPostgresConnect    ErrCode = "DB_POSTGRES_CONNECT_FAILED"
	ErrDBPostgresWriteFail  ErrCode = "DB_POSTGRES_WRITE_FAILED"
	ErrDBStateFileBadPath   ErrCode = "DB_STATE_FILE_BAD_PATH"
	ErrDBStateFileMkdirBad  ErrCode = "DB_STATE_FILE_MKDIR_FAILED"
	ErrDBStateFileWriteBad  ErrCode = "DB_STATE_FILE_WRITE_FAILED"

	// === Emby 远端调用 / Admin Emby 操作 ===
	// admin_extra.go 中的 fail() 之前以英文裸串返回，前端 toast 难以做差异化
	// 引导。改成结构化错误码后：
	//   - EMBY_NOT_CONFIGURED 直接引导到"系统配置 / Emby" 设置页
	//   - EMBY_REMOTE_*_FAILED 提示"上游 Emby 不可达，查看后端日志"，
	//     不再把英文 message 暴露给最终用户
	ErrEmbyNotConfigured      ErrCode = "EMBY_NOT_CONFIGURED"
	ErrEmbyRemoteUsersFailed  ErrCode = "EMBY_REMOTE_USERS_FAILED"
	ErrEmbyRemoteActivityFail ErrCode = "EMBY_REMOTE_ACTIVITY_FAILED"
	ErrEmbyRemoteSessionsFail ErrCode = "EMBY_REMOTE_SESSIONS_FAILED"
	ErrEmbyBroadcastTextEmpty ErrCode = "EMBY_BROADCAST_TEXT_EMPTY"
	ErrEmbyUsernameInvalid    ErrCode = "EMBY_USERNAME_INVALID"
	ErrEmbyPasswordTooShort   ErrCode = "EMBY_PASSWORD_TOO_SHORT"
	ErrEmbyCreateFailed       ErrCode = "EMBY_CREATE_FAILED"
	ErrEmbyCreateNoID         ErrCode = "EMBY_CREATE_NO_ID"
	ErrEmbySetPasswordFailed  ErrCode = "EMBY_SET_PASSWORD_FAILED"

	// === 管理员批量 / 危险操作的 confirm 短语保护 ===
	// 这一组保护性确认短语过去用 missing confirm XYZ 字面量返回；前端
	// 表单想知道"用户没填确认短语"和"填了但拼错"差不多，按域分码可以让
	// UI 在多步骤批量操作中给出更精准的提示。
	ErrAdminEmbyResetConfirm        ErrCode = "ADMIN_EMBY_RESET_CONFIRM_REQUIRED"
	ErrAdminBulkExpireConfirm       ErrCode = "ADMIN_BULK_EXPIRE_CONFIRM_REQUIRED"
	ErrAdminBulkExpireDaysTooLarge  ErrCode = "ADMIN_BULK_EXPIRE_DAYS_TOO_LARGE"
	ErrAdminBulkExpireInvalid       ErrCode = "ADMIN_BULK_EXPIRE_INVALID"
	ErrAdminBulkEnableConfirm       ErrCode = "ADMIN_BULK_ENABLE_CONFIRM_REQUIRED"
	ErrAdminClearPendingEmbyConfirm ErrCode = "ADMIN_CLEAR_PENDING_EMBY_CONFIRM_REQUIRED"
	ErrAdminKickNoEmbyConfirm       ErrCode = "ADMIN_KICK_NO_EMBY_CONFIRM_REQUIRED"
	ErrAdminEnableRejoinedConfirm   ErrCode = "ADMIN_ENABLE_REJOINED_CONFIRM_REQUIRED"
	ErrAdminKickUnboundConfirm      ErrCode = "ADMIN_KICK_UNBOUND_CONFIRM_REQUIRED"
	ErrAdminWhitelistUsernameEmpty  ErrCode = "ADMIN_WHITELIST_USERNAME_REQUIRED"

	// === Rebind 申请审核 ===
	ErrRebindStatusInvalid    ErrCode = "REBIND_STATUS_INVALID"
	ErrRebindActionInvalid    ErrCode = "REBIND_ACTION_INVALID"
	ErrRebindBatchSizeInvalid ErrCode = "REBIND_BATCH_SIZE_INVALID"

	// === Telegram 配置 ===
	ErrTGNotConfigured ErrCode = "TG_NOT_CONFIGURED"

	// === handlers.go 历史遗留：登录 / 资料 / 绑定 / 上传 / 管理员维护 ===
	// handlers.go 在拆分前包含 90+ fail()，下面这一段把它们按业务域归类进
	// 错误码体系；调用点在 handlers.go 内逐个迁移为 failWithCode。
	ErrAuthCredentialsEmpty       ErrCode = "AUTH_CREDENTIALS_EMPTY"
	ErrAuthSessionRefreshFailed   ErrCode = "AUTH_SESSION_REFRESH_FAILED"
	ErrAuthCSRFRefreshFailed      ErrCode = "AUTH_CSRF_REFRESH_FAILED"
	ErrUserNewUsernameRequired    ErrCode = "USER_NEW_USERNAME_REQUIRED"
	ErrUserBackgroundInvalid      ErrCode = "USER_BACKGROUND_INVALID"
	ErrEmbyAlreadyLinked          ErrCode = "EMBY_ALREADY_LINKED"
	ErrEmbyNoRegistrationGrant    ErrCode = "EMBY_NO_REGISTRATION_ENTITLEMENT"
	ErrEmbyUsernameTaken          ErrCode = "EMBY_USERNAME_TAKEN"
	ErrEmbyUsernameLookupFailed   ErrCode = "EMBY_USERNAME_LOOKUP_FAILED"
	ErrEmbyAdminLinkForbidden     ErrCode = "EMBY_ADMIN_LINK_FORBIDDEN"
	ErrEmbyLinkedOtherUser        ErrCode = "EMBY_LINKED_OTHER_USER"
	ErrEmbyPasswordUpdateFailed   ErrCode = "EMBY_PASSWORD_UPDATE_FAILED"
	ErrEmbyConnectFailed          ErrCode = "EMBY_CONNECT_FAILED"
	ErrEmbyUserLookupFailed       ErrCode = "EMBY_USER_LOOKUP_FAILED"
	ErrEmbyUserNotFound           ErrCode = "EMBY_USER_NOT_FOUND"
	ErrEmbyLatestFailed           ErrCode = "EMBY_LATEST_FAILED"
	ErrRenewCodeRequired          ErrCode = "RENEW_CODE_REQUIRED"
	ErrRenewCodeInvalid           ErrCode = "RENEW_CODE_INVALID"
	ErrRegcodeInvalid             ErrCode = "REGCODE_INVALID"
	ErrBindCodeRateLimited        ErrCode = "BIND_CODE_RATE_LIMITED"
	ErrBindCodeConflict           ErrCode = "BIND_CODE_CONFLICT"
	ErrBindCodeNotFound           ErrCode = "BIND_CODE_NOT_FOUND"
	ErrTGUnbindForbidden          ErrCode = "TG_UNBIND_FORBIDDEN"
	ErrTGNotBound                 ErrCode = "TG_NOT_BOUND"
	ErrTGIDInvalid                ErrCode = "TG_ID_INVALID"
	ErrTGIDTaken                  ErrCode = "TG_ID_TAKEN"
	ErrLibrarySelfServiceDisabled ErrCode = "LIBRARY_SELF_SERVICE_DISABLED"
	ErrLibrarySelfServiceAction   ErrCode = "LIBRARY_SELF_SERVICE_ACTION_INVALID"
	ErrLibraryNotSelfService      ErrCode = "LIBRARY_NOT_SELF_SERVICE"
	ErrDeviceIDRequired           ErrCode = "DEVICE_ID_REQUIRED"
	ErrIPRequired                 ErrCode = "IP_REQUIRED"
	ErrUploadRateLimited          ErrCode = "UPLOAD_RATE_LIMITED"
	ErrUploadInvalidPayload       ErrCode = "UPLOAD_INVALID_PAYLOAD"
	ErrUploadFileMissing          ErrCode = "UPLOAD_FILE_MISSING"
	ErrUploadFileTooLarge         ErrCode = "UPLOAD_FILE_TOO_LARGE"
	ErrUploadTypeNotAllowed       ErrCode = "UPLOAD_TYPE_NOT_ALLOWED"
	ErrUploadDirInvalid           ErrCode = "UPLOAD_DIR_INVALID"
	ErrUploadDirCreateFailed      ErrCode = "UPLOAD_DIR_CREATE_FAILED"
	ErrUploadSaveFailed           ErrCode = "UPLOAD_SAVE_FAILED"
	ErrAssetNotFound              ErrCode = "ASSET_NOT_FOUND"
	ErrConfigFileNotFound         ErrCode = "CONFIG_FILE_NOT_FOUND"
	ErrAPIDeprecated              ErrCode = "API_DEPRECATED"
	ErrAdminQueueClearPartial     ErrCode = "ADMIN_QUEUE_CLEAR_PARTIAL"
	ErrAdminDaysOutOfRange        ErrCode = "ADMIN_DAYS_OUT_OF_RANGE"
	ErrAdminEntitlementPartial    ErrCode = "ADMIN_ENTITLEMENT_PARTIAL"
	ErrAdminBulkLibraryConfirm    ErrCode = "ADMIN_BULK_LIBRARY_CONFIRM_REQUIRED"
	ErrAdminPasswordResetScope    ErrCode = "ADMIN_PASSWORD_RESET_SCOPE_INVALID"
	ErrAdminEmbyPasswordReset     ErrCode = "ADMIN_EMBY_PASSWORD_RESET_FAILED"
	ErrAdminLastAdminProtected    ErrCode = "ADMIN_LAST_ADMIN_PROTECTED"
	ErrAPIKeySelfPermForbidden    ErrCode = "API_KEY_SELF_PERMISSION_FORBIDDEN"
	ErrWatchStatsForbidden        ErrCode = "WATCH_STATS_FORBIDDEN"
)
