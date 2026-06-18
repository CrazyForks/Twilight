"use client";

const STORAGE_KEY = "twilight:theme-custom";
const CSS_VAR_PREFIX = "--tw-custom";

export interface ThemeCustom {
  /** primary 色相偏移（-180 ~ 180，0=默认紫色） */
  primaryHueShift: number;
  /** 圆角基准值 rem（0.25 ~ 2.0，默认 1.0） */
  radius: number;
  /** 玻璃态模糊强度 px（0 ~ 32，默认 12） */
  glassBlur: number;
  /** 紧凑模式 */
  compact: boolean;
}

const DEFAULTS: ThemeCustom = {
  primaryHueShift: 0,
  radius: 1.0,
  glassBlur: 12,
  compact: false,
};

export function getThemeCustom(): ThemeCustom {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ThemeCustom>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setThemeCustom(partial: Partial<ThemeCustom>): ThemeCustom {
  const current = getThemeCustom();
  const next = { ...current, ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* quota exceeded etc */ }
  applyThemeCustom(next);
  return next;
}

export function resetThemeCustom(): ThemeCustom {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
  applyThemeCustom(DEFAULTS);
  return { ...DEFAULTS };
}

/** 把主题自定义值写入 document.documentElement.style */
export function applyThemeCustom(tc: ThemeCustom): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;

  // primary 色相偏移：覆盖 --primary 变量（仅改 H 通道，保留 S/L）
  const baseH = 257;
  const newH = ((baseH + tc.primaryHueShift) % 360 + 360) % 360;
  root.style.setProperty("--primary", `${newH} 90% 58%`);

  // radius：覆盖 --radius
  root.style.setProperty("--radius", `${tc.radius}rem`);

  // glass blur：自定义变量，被 .section-surface 等引用
  root.style.setProperty("--tw-glass-blur", `${tc.glassBlur}px`);

  // compact
  if (tc.compact) {
    root.classList.add("tw-compact");
  } else {
    root.classList.remove("tw-compact");
  }
}

export function initThemeCustom(): ThemeCustom {
  const tc = getThemeCustom();
  applyThemeCustom(tc);
  return tc;
}
