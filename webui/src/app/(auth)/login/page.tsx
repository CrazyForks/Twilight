"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, Loader2, ShieldCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/auth";
import { useSystemStore } from "@/store/system";
import { SITE_NAME } from "@/lib/site-config";
import { sanitizeExternalUrl } from "@/lib/safe-url";
import { friendlyError } from "@/lib/validators";

const protectedRedirectPrefixes = [
  "/dashboard",
  "/admin",
  "/announcements",
  "/invite",
  "/media",
  "/score",
  "/settings",
];

function pathMatches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function loginRedirectTarget(): string {
  if (typeof window === "undefined") return "/dashboard";
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";

  try {
    const url = new URL(next, "https://twilight.local");
    if (url.origin !== "https://twilight.local") return "/dashboard";
    if (!pathMatches(url.pathname, protectedRedirectPrefixes)) return "/dashboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
}

export default function LoginPage() {
  const { toast } = useToast();
  const { login } = useAuthStore();
  const { info: systemInfo, fetchInfo: fetchSystemInfo } = useSystemStore();
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const requiredTelegramLinks = [
    ...(systemInfo?.required_telegram_links?.groups || []),
    ...(systemInfo?.required_telegram_links?.channels || []),
  ];
  const telegramLinks = [
    ...(requiredTelegramLinks.length > 0 ? requiredTelegramLinks : [
      ...(systemInfo?.telegram_links?.groups || []),
      ...(systemInfo?.telegram_links?.channels || []),
    ]),
  ].map((item) => ({ ...item, url: sanitizeExternalUrl(item.url) })).filter((item): item is { label: string; url: string } => Boolean(item.url));

  useEffect(() => {
    // 不在未登录状态预取受保护路由：middleware 会把预取重定向到 /login，
    // App Router 之后可能复用这份旧结果，让登录成功后的跳转看起来失效。
    void fetchSystemInfo();
  }, [fetchSystemInfo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast({
        title: "请填写完整信息",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(username, password);
      if (result.ok) {
        toast({
          title: "登录成功",
          description: "欢迎回来！",
          variant: "success",
        });
        // 登录会写 HttpOnly session cookie，受保护页面又由 middleware 读 cookie。
        // 用完整导航避开登录前的 RSC/prefetch 缓存，确保下一次请求携带最新 cookie。
        window.location.replace(loginRedirectTarget());
      } else {
        // 用稳定的 error_code 决定 UI 分支，避免 /禁用/.test(message) 这种
        // 文案级匹配在后端切英文 / 改文案时炸掉。
        // 区分两类失败：
        //   - AUTH_ACCOUNT_DISABLED：管理员主动禁用，引导联系管理员；
        //   - AUTH_ACCOUNT_EXPIRED：entitlement 到期，引导续费而非申诉。
        // 后端在 R62-6 起把这两种 Active=false 状态拆开返回，前端原本只会
        // 提示"账户被禁用"让到期用户也跑去找管理员，UX 错位。
        const code = result.errorCode;
        const disabled = code === "AUTH_ACCOUNT_DISABLED";
        const expired = code === "AUTH_ACCOUNT_EXPIRED";
        const description = code
          ? friendlyError(code, result.message)
          : result.message || "用户名或密码错误";
        let title = "登录失败";
        let body = description;
        if (disabled) {
          title = "账户已被禁用";
          body = "请联系管理员处理";
        } else if (expired) {
          title = "账号有效期已到期";
          body = "请使用续期码续费后再登录";
        }
        toast({
          title,
          description: body,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "登录失败",
        description: "请检查网络连接",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[440px]"
      >
        <Card className="border-border/70 bg-card/78 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2 pb-6 pt-8 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/14 text-primary">
              <ShieldCheck className="h-7 w-7" />
            </div>

            <CardTitle className="text-2xl font-semibold tracking-tight">
              进入 {systemInfo?.name || SITE_NAME}
            </CardTitle>
            <CardDescription className="text-sm">
              访问你的媒体控制台
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 pb-7 md:px-8">
            {telegramLinks.length > 0 && (
              <div className="mb-5 rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-sm">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <Send className="h-4 w-4 text-primary" />
                  Telegram 社群
                </div>
                <div className="flex flex-wrap gap-2">
                  {telegramLinks.map((item) => (
                    <a
                      key={item.url}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="ml-1">用户名</Label>
                <Input
                  id="username"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="ml-1">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  className="h-11 w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-5 w-5" />
                  )}
                  立即登入
                </Button>
              </div>
            </form>
 
            <div className="mt-5 text-center text-sm">
              <Link href="/forgot-password" className="font-medium text-primary hover:underline">
                忘记密码？使用 Emby 账号验证找回
              </Link>
            </div>

            <div className="mt-5 flex items-center justify-center gap-2 text-sm">
              <span className="text-muted-foreground">还没有账号？</span>
              <Link
                href="/register"
                className="font-medium text-primary hover:underline"
              >
                创建新账户
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
