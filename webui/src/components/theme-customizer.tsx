"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { getThemeCustom, setThemeCustom, resetThemeCustom, type ThemeCustom } from "@/lib/theme-custom";

export default function ThemeCustomizer() {
  const { t } = useI18n();
  const [state, setState] = useState<ThemeCustom>(() => getThemeCustom());

  useEffect(() => setState(getThemeCustom()), []);

  const update = (partial: Partial<ThemeCustom>) => {
    const next = setThemeCustom(partial);
    setState(next);
  };

  const reset = () => {
    const next = resetThemeCustom();
    setState(next);
  };

  return (
    <div className="space-y-8">
      {/* 强调色 / 主色 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("appearance.theme.hueLabel")}</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {257 + state.primaryHueShift}°
          </span>
        </div>
        <input
          type="range"
          min={-180}
          max={180}
          value={state.primaryHueShift}
          onChange={(e) => update({ primaryHueShift: Number(e.target.value) })}
          className="hue-slider"
          aria-label={t("appearance.theme.hueLabel")}
        />
        <div className="flex gap-2">
          {[257, 200, 160, 120, 40, 0, 310].map((h) => (
            <button
              key={h}
              type="button"
              className="h-6 w-6 rounded-full border-2 border-border transition-shadow hover:shadow-md"
              style={{ background: `hsl(${h}, 90%, 58%)` }}
              onClick={() => update({ primaryHueShift: h - 257 })}
              aria-label={`Hue ${h}`}
            />
          ))}
        </div>
      </div>

      {/* 圆角 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("appearance.theme.radiusLabel")}</Label>
          <span className="text-xs tabular-nums text-muted-foreground">{state.radius.toFixed(2)}rem</span>
        </div>
        <input
          type="range"
          min={0.25}
          max={2.0}
          step={0.05}
          value={state.radius}
          onChange={(e) => update({ radius: Number(e.target.value) })}
          className="w-full"
          aria-label={t("appearance.theme.radiusLabel")}
        />
      </div>

      {/* 玻璃模糊 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("appearance.theme.glassBlurLabel")}</Label>
          <span className="text-xs tabular-nums text-muted-foreground">{state.glassBlur}px</span>
        </div>
        <input
          type="range"
          min={0}
          max={32}
          step={1}
          value={state.glassBlur}
          onChange={(e) => update({ glassBlur: Number(e.target.value) })}
          className="w-full"
          aria-label={t("appearance.theme.glassBlurLabel")}
        />
      </div>

      {/* 紧凑模式 */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">{t("appearance.theme.compactLabel")}</Label>
          <p className="text-xs text-muted-foreground">{t("appearance.theme.compactDesc")}</p>
        </div>
        <Switch
          checked={state.compact}
          onCheckedChange={(v) => update({ compact: v })}
        />
      </div>

      {/* 恢复默认 */}
      <button
        type="button"
        onClick={reset}
        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {t("appearance.theme.reset")}
      </button>
    </div>
  );
}
