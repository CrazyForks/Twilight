/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // standalone 模式：build 后可独立运行，无需 node_modules
  output: 'standalone',
  // 允许开发环境的跨域请求
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // 本地开发时将 /api/* 代理到后端（避免跨域）
  // 生产环境通过 NEXT_PUBLIC_API_URL 直连后端
  async rewrites() {
    const rules = [
      {
        source: '/favicon.ico',
        destination: '/favicon.svg',
      },
    ];

    // 仅当未设置 NEXT_PUBLIC_API_URL 时启用代理（即本地开发）
    if (process.env.NEXT_PUBLIC_API_URL) return rules;
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    return [
      ...rules,
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  async headers() {
    // 开发模式下 Next.js 需要 eval（HMR / React refresh）；
    // 生产构建禁掉 unsafe-eval，让脚本只信任 self + 内联占位（Next 静态注入）。
    const isDev = process.env.NODE_ENV !== 'production';
    const scriptSrc = isDev
      ? "'self' 'unsafe-inline' 'unsafe-eval'"
      : "'self' 'unsafe-inline'";

    // CSP：默认拒绝外发，按需放行：
    //   - img/font 允许 data:/blob:，背景图允许 https: 外链；
    //   - connect-src 'self' 仅信任同源 API；如要把 API 部到独立域，
    //     在部署时通过 NEXT_PUBLIC_CSP_CONNECT 追加。
    //   - frame-ancestors 'none' 与 X-Frame-Options DENY 双重防点击劫持。
    //   - upgrade-insecure-requests 让混入的 http://… 自动升 https。
    const extraConnect = process.env.NEXT_PUBLIC_CSP_CONNECT?.trim();
    const connectSrc = extraConnect ? `'self' ${extraConnect}` : "'self'";
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "media-src 'self' https:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      'upgrade-insecure-requests',
    ].join('; ');

    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: csp },
      // HSTS: 一年；浏览器仅在 HTTPS 响应里读取该头，HTTP 下静默忽略，
      // 故对本地 dev 也安全发出；preload 暂不启用，避免提交错误后难以撤回。
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    ];

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  // 禁用 Next 服务端图片优化，避免特殊部署环境中由图片优化器代拉任意远程 URL。
  // 页面内图片组件均显式使用 unoptimized，头像/背景等资源由浏览器直接请求受控 API 或可信外部 CDN。
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

if (process.env.TWILIGHT_OPENNEXT_DEV === 'true') {
  import('@opennextjs/cloudflare').then((m) => m.initOpenNextCloudflareForDev());
}
