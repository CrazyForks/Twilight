"use client";

import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import {
  getThemeCustom,
  setThemeCustom,
  applyThemeCustom,
  resetThemeCustom,
  type ThemeCustom,
} from "@/lib/theme-custom";
import { Loader2, Save } from "lucide-react";

// 滑条实时预览但不同步 localStorage；点击「保存」才持久化。
export default function ThemeCustomizer() {
  const { t } = useI18n();
  const { toast } = useToast();

  const [draft, setDraft] = useState<ThemeCustom>(() => getThemeCustom());
  const [saved, setSaved] = useState<ThemeCustom>(() => getThemeCustom());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const current = getThemeCustom();
    setDraft(current);
    setSaved(current);
  }, []);

  // 滑条/开关变更 → 更新草稿 + 实时预览（不写 localStorage）
  const change = useCallback((patch: Partial<ThemeCustom>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      applyThemeCustom(next);
      return next;
    });
  }, []);

  // 保存 → 写 localStorage
  const save = useCallback(() => {
    setSaving(true);
    try {
      const persisted = setThemeCustom(draft);
      setSaved(persisted);
      toast({ title: t("appearance.theme.saved"), variant: "success" });
    } catch {
      toast({ title: t("appearance.saveFailedRetry"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [draft, t, toast]);

  // 撤销草稿 → 回到上次保存的状态
  const revert = useCallback(() => {
    const current = saved;
    setDraft(current);
    applyThemeCustom(current);
  }, [saved]);

  // 恢复默认（预置值）并自动保存
  const resetToDefaults = useCallback(() => {
    const defs = resetThemeCustom();
    setDraft(defs);
    setSaved(defs);
    toast({ title: t("appearance.theme.resetDone"), variant: "success" });
  }, [t, toast]);

  const isDirty =
    draft.primaryHueShift !== saved.primaryHueShift ||
    draft.radius !== saved.radius ||
    draft.glassBlur !== saved.glassBlur ||
    draft.compact !== saved.compact;

  return (
    <div className="space-y-8">
      {/* 强调色 / 主色 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("appearance.theme.hueLabel")}</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {257 + draft.primaryHueShift}°
          </span>
        </div>
        <input
          type="range"
          min={-180}
          max={180}
          value={draft.primaryHueShift}
          onChange={(e) => change({ primaryHueShift: Number(e.target.value) })}
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
              onClick={() => change({ primaryHueShift: h - 257 })}
              aria-label={`Hue ${h}`}
            />
          ))}
        </div>
      </div>

      {/* 圆角 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("appearance.theme.radiusLabel")}</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {draft.radius.toFixed(2)}rem
          </span>
        </div>
        <input
          type="range"
          min={0.25}
          max={2.0}
          step={0.05}
          value={draft.radius}
          onChange={(e) => change({ radius: Number(e.target.value) })}
          className="w-full"
          aria-label={t("appearance.theme.radiusLabel")}
        />
      </div>

      {/* 玻璃模糊 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("appearance.theme.glassBlurLabel")}</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {draft.glassBlur}px
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={32}
          step={1}
          value={draft.glassBlur}
          onChange={(e) => change({ glassBlur: Number(e.target.value) })}
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
          checked={draft.compact}
          onCheckedChange={(v) => change({ compact: v })}
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button
            onClick={save}
            disabled={!isDirty || saving}
            size="sm"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("appearance.theme.save")}
          </Button>
          {isDirty && (
            <Button
              variant="outline"
              size="sm"
              onClick={revert}
              disabled={saving}
            >
              {t("common.cancel")}
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={resetToDefaults}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t("appearance.theme.reset")}
        </button>
      </div>
    </div>
  );
}
