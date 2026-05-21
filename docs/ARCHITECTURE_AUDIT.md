# 架构质量审计记录

本文记录按「5 轮审计 -> 落地记录 -> 整改 -> 验证」节奏发现的问题与整改状态。

## 2026-05-21 第一轮循环

### 审计范围

1. 项目结构、超长文件和模块边界。
2. 后端接口一致性、错误码和安全风险。
3. 前端调用、状态管理和错误处理一致性。
4. 配置、文档和实现口径一致性。
5. 可测试性、验证命令和新人友好度。

### 高优先级问题

| ID | 位置 | 问题 | 风险 | 整改状态 |
| --- | --- | --- | --- | --- |
| A-001 | `src/api/v1/apikey.py` | API Key 有 `RATE_LIMIT` 字段但认证装饰器未执行限流。 | 外部 Key 可高频调用写接口，造成撞库、滥用或资源耗尽。 | 已整改 |
| A-002 | `src/core/request_utils.py` | 默认信任全部私网代理地址。 | 服务直接暴露在私网时可伪造 `X-Real-IP`/`X-Forwarded-For` 绕过 IP 限流。 | 已整改 |
| A-003 | `webui/src/lib/api.ts` | API 响应在判断 HTTP 状态前强制解析 JSON。 | 204/空响应/非 JSON 错误会被误报为解析失败，掩盖真实状态。 | 已整改 |
| A-004 | `webui/src/lib/api.ts` | `removeDevice(deviceId)` 路径参数未编码。 | 设备 ID 含特殊字符时可能改变请求路径。 | 已整改 |
| A-005 | `config.toml` | 工作区存在包含真实凭据的本地配置文件。 | 误提交或打包会泄露密钥；新人可能误连真实服务。 | 待人工迁移 |

### 中优先级问题

| ID | 位置 | 问题 | 风险 | 整改状态 |
| --- | --- | --- | --- | --- |
| A-006 | `src/api/v1/auth.py`、多处 API | `api_response` 响应体不含统一 `code` 字段，且少数失败响应仍默认 HTTP 200。 | 调用方错误处理口径不统一。 | 已部分整改 |
| A-007 | `webui/src/store/auth.ts` | `logout` 只有后端请求成功后才清本地状态。 | 后端登出失败时用户无法可靠退出。 | 已整改 |
| A-008 | `webui/src/app/(main)/**` | 多处 `.catch(() => null)`、`catch (err: any)` 和重复 `JSON.parse`。 | 静默失败、类型保护缺失、错误展示不一致。 | 待拆分整改 |
| A-009 | `.github/workflows/tests.yml` | `mypy`、`bandit` 使用 `|| true`，且无测试目录时跳过 pytest。 | CI 不能阻断类型/安全/回归问题。 | 待整改 |
| A-010 | 文档与前端锁文件 | 文档要求只维护 `pnpm-lock.yaml`，但存在 `package-lock.json`。 | 新人安装依赖口径冲突。 | 待决策 |

### 长期治理问题

| ID | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| A-011 | `src/api/v1/admin.py`、`src/api/v1/users.py`、`src/services/user_service.py` | 后端核心文件超过 2000-4500 行。 | 按领域拆分蓝图和 service，controller 保持薄层。 |
| A-012 | `webui/src/app/(main)/admin/users/page.tsx`、`webui/src/lib/api.ts` | 前端页面和 API 聚合文件过大。 | 先拆 hooks/dialog/table/API types，保留兼容导出。 |
| A-013 | `docs/API_INDEX.md` | API 索引与实际路由不完全一致。 | 新增路由导出校验或维护脚本。 |
| A-014 | `.env.example`、`docs/QUICKSTART-Windows.md` | 环境变量和入口命令口径存在冲突。 | 统一 `TWILIGHT_{SECTION}_{KEY}` 命名和真实可用启动命令。 |

### 第一批整改计划

1. 后端安全与错误格式：修复 API Key 限流、可信代理默认值、统一响应体 `code` 字段、补齐少数失败 HTTP 状态。
2. 前端 API 基础设施：修复响应解析、路径参数编码、登出本地状态兜底。
3. 文档与治理：标记已整改项，保留无法自动处理的本地密钥迁移事项。
