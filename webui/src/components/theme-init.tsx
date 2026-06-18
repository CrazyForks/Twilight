"use client";

import { useEffect } from "react";
import { initThemeCustom } from "@/lib/theme-custom";

// ThemeInit 在客户端挂载时从 localStorage 恢复用户主题自定义值，
// 注入 CSS 变量和 compact 类。放在 root layout 中确保所有子路由生效。
export function ThemeInit() {
  useEffect(() => {
    initThemeCustom();
  }, []);
  return null;
}
