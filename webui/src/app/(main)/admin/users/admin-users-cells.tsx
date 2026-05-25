// 用户列表中纯展示型的 cell 渲染：角色徽章 / 到期时间 / 单行操作菜单。
// 拆出来的目的：把没有状态依赖的展示逻辑从 page.tsx 主组件中剥离，主组件
// 仅保留交互编排；新人接手时可以单独阅读 cell 渲染规则、单独写单测，不必
// 啃完 3500+ 行的 page.tsx。
import {
  Ban,
  CalendarClock,
  Edit,
  Eye,
  EyeOff,
  Key,
  Link2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Unlink,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserInfo } from "@/lib/api";
import { formatDate } from "@/lib/utils";

/**
 * 角色徽章。
 * - 0 管理员 → 渐变高亮
 * - 2 白名单 → 成功色
 * - 其余（含 -1 未识别 / 1 普通）→ 次级标签
 */
export function renderRoleBadge(role: number) {
  switch (role) {
    case 0:
      return <Badge variant="gradient">管理员</Badge>;
    case 2:
      return <Badge variant="success">白名单</Badge>;
    default:
      return <Badge variant="secondary">普通用户</Badge>;
  }
}

/**
 * 根据 emby_bound / expired_at / pending_emby 渲染到期时间单元格。
 * - 未绑定 Emby（emby_bound===false / pending_emby / expired_at===0）→"未绑定"
 * - -1 / "-1" → "永久"
 * - 真实时间戳 → 用 formatDate；已过期红字
 */
export function renderExpireCell(user: UserInfo) {
  const exp = user.expired_at;
  const isUnbound =
    user.emby_bound === false ||
    Boolean(user.pending_emby) ||
    exp === 0 ||
    exp === "0";
  if (isUnbound) {
    return <span className="text-muted-foreground italic">未绑定</span>;
  }
  if (exp === -1 || exp === "-1" || exp == null) {
    return <span className="text-emerald-500">永久</span>;
  }
  const expMs = typeof exp === "number" && exp < 10000000000 ? exp * 1000 : Number(exp);
  const expired = !Number.isNaN(expMs) && expMs < Date.now();
  return (
    <span className={expired ? "text-destructive" : undefined}>
      {formatDate(exp)}
    </span>
  );
}

/**
 * 单行操作下拉菜单。所有交互通过 handlers 注入，组件本身无状态，便于
 * page.tsx 主组件甩开 90+ 行 JSX。子项的可见性 / 禁用规则与原行为一致：
 *   - "取消永久到期" 仅在永久到期 + 非管理员 + 已绑定 Emby 时出现
 *   - "媒体库权限" 必须已绑定 Emby
 *   - "自助显隐" 切换在 isActionLoading 时禁用
 *   - "授权 / 授权并移出队列" 在 emby_id 已存在或账号被禁用时禁用
 */
export interface UserActionsMenuHandlers {
  onEdit: (user: UserInfo) => void;
  onRenew: (user: UserInfo) => void;
  onCancelPermanent: (user: UserInfo) => void;
  onResetPassword: (user: UserInfo) => void;
  onBindEmby: (user: UserInfo) => void;
  onOpenLibraries: (user: UserInfo) => void;
  onToggleLibrarySelfService: (user: UserInfo) => void;
  onSyncBindings: (user: UserInfo) => void;
  onForceUnbind: (user: UserInfo) => void;
  onClearRegistrationQueue: (user: UserInfo) => void;
  onGrantRegistrationEntitlement: (user: UserInfo) => void;
  onGrantRegistrationEntitlementAndDequeue: (user: UserInfo) => void;
  onToggleActive: (user: UserInfo) => void;
  onDelete: (user: UserInfo) => void;
}

export function UserActionsMenu({
  user,
  isActionLoading,
  handlers,
}: {
  user: UserInfo;
  isActionLoading: boolean;
  handlers: UserActionsMenuHandlers;
}) {
  const showCancelPermanent =
    (user.expired_at === -1 || user.expired_at === "-1") &&
    user.role !== 0 &&
    Boolean(user.emby_id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handlers.onEdit(user)}>
          <Edit className="mr-2 h-4 w-4" />
          编辑信息
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlers.onRenew(user)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          续期
        </DropdownMenuItem>
        {showCancelPermanent && (
          <DropdownMenuItem onClick={() => handlers.onCancelPermanent(user)}>
            <CalendarClock className="mr-2 h-4 w-4" />
            取消永久到期
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => handlers.onResetPassword(user)}>
          <Key className="mr-2 h-4 w-4" />
          重置密码
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlers.onBindEmby(user)}>
          <Link2 className="mr-2 h-4 w-4" />
          绑定 Emby
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handlers.onOpenLibraries(user)}
          disabled={!Boolean(user.emby_id)}
        >
          <Eye className="mr-2 h-4 w-4" />
          媒体库权限
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handlers.onToggleLibrarySelfService(user)}
          disabled={isActionLoading}
        >
          {user.library_self_service ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
          {user.library_self_service ? "关闭自助显隐权" : "开启自助显隐权"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlers.onSyncBindings(user)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          同步绑定状态
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlers.onForceUnbind(user)}>
          <Unlink className="mr-2 h-4 w-4" />
          强制解绑
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handlers.onClearRegistrationQueue(user)}>
          <CalendarClock className="mr-2 h-4 w-4" />
          清理注册队列用户
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handlers.onGrantRegistrationEntitlement(user)}
          disabled={Boolean(user.emby_id) || !user.active}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          给予队列用户注册权利
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handlers.onGrantRegistrationEntitlementAndDequeue(user)}
          disabled={Boolean(user.emby_id) || !user.active}
        >
          <UserCheck className="mr-2 h-4 w-4" />
          授权并移出未处理队列
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handlers.onToggleActive(user)}>
          <Ban className="mr-2 h-4 w-4" />
          {user.active ? "禁用" : "启用"}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => handlers.onDelete(user)}>
          <Trash2 className="mr-2 h-4 w-4" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
