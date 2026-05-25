"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes 0.4 起把内部路径 `next-themes/dist/types` 从 package.exports
// 移除，原来的 `import { ThemeProviderProps } from "next-themes/dist/types"`
// 在升级后会立刻 TS2307。这里改成从 NextThemesProvider 的组件 props 反推，
// 兼容 0.3.x / 0.4.x，且不再依赖任何"内部子路径"。
type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

