import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionCookieName } from "@/lib/session-cookie";

/**
 * (auth) 路由组覆盖 /login、/register、/forgot-password。这些页面对"已登录
 * 用户"是反语义的——他们再点回登录链接（或浏览器历史回到 /login）会看到
 * 一份完整登录表单，体验上像被登出，要再次手填一遍才能继续。
 *
 * 历史实现是纯客户端 layout：服务端把整张表单 HTML 全推给浏览器，等 React
 * hydrate 后才能根据 zustand 持久化状态判断"咦你已经登录了"，再 router.push
 * 回 /dashboard。这个窗口期对快网络来说一闪而过，对慢机器/慢网络则是几百
 * 毫秒的诡异闪烁。
 *
 * 改成 server component：SSR 阶段读会话 cookie，存在直接 302
 * 到 /dashboard，不存在才正常渲染壳子。与 page.tsx / middleware 的策略保持一致——
 * "cookie 仅证明曾登录过，session 是否真的有效仍由后端在每个 API 校验"。
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionCookie = (await cookies()).get(getSessionCookieName())?.value;
  if (sessionCookie) {
    redirect("/dashboard");
  }
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="shell-glow shell-glow-left" />
      <div className="shell-glow shell-glow-right" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/0.12),transparent_35%),radial-gradient(circle_at_80%_90%,hsl(var(--primary)/0.08),transparent_30%)]" />
      <div className="relative z-10 min-h-screen">
        {children}
      </div>
    </div>
  );
}
