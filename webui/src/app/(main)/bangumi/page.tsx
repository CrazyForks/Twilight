"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, RefreshCw, Trash2, Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { api, type BangumiSyncStatus, type BangumiSyncLog } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth";

function formatTime(unix: number): string {
  return new Date(unix * 1000).toLocaleString();
}

export default function BangumiPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { t } = useI18n();
  const { user, fetchUser } = useAuthStore();

  const [status, setStatus] = useState<BangumiSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bgmMode, setBgmMode] = useState(false);
  const [bgmToken, setBgmToken] = useState("");
  const [logs, setLogs] = useState<BangumiSyncLog[]>([]);

  const loadResource = useCallback(async () => {
    const res = await api.getBangumiSyncStatus();
    if (res.success && res.data) {
      setStatus(res.data);
      setBgmMode(res.data.bgm_mode);
      setLogs(res.data.recent_logs || []);
      return true;
    }
    throw new Error(res.message || "加载失败");
  }, []);

  const { isLoading, error, execute: reload } = useAsyncResource(loadResource, { immediate: true });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.triggerBangumiSync();
      if (res.success && res.data) {
        toast({ title: t("bangumi.syncCompleted"), description: `${t("bangumi.syncedCount")}: ${res.data.synced}, ${t("bangumi.skippedCount")}: ${res.data.skipped}, ${t("bangumi.failedCount")}: ${res.data.failed}` });
        await reload();
      } else {
        toast({ title: t("bangumi.syncFailed"), description: res.message, variant: "destructive" });
      }
    } catch {
      toast({ title: t("bangumi.syncError"), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveSettings = async () => {
    if (bgmMode && !bgmToken && !status?.bgm_token_set) {
      toast({ title: t("bangumi.tokenRequired"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateMySettings({ bgm_mode: bgmMode, bgm_token: bgmToken || undefined });
      if (res.success) {
        toast({ title: t("bangumi.settingsSaved") });
        await fetchUser();
        await reload();
      } else {
        toast({ title: t("bangumi.saveFailed"), description: res.message, variant: "destructive" });
      }
    } catch {
      toast({ title: t("bangumi.saveError"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleClearHistory = async () => {
    const ok = await confirm({
      title: t("bangumi.clearConfirmTitle"),
      description: t("bangumi.clearConfirmDescription"),
      tone: "danger",
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      const res = await api.clearBangumiSyncHistory();
      if (res.success) {
        toast({ title: t("bangumi.cleared") });
        await reload();
      } else {
        toast({ title: t("common.deleteFailed"), description: res.message, variant: "destructive" });
      }
    } catch {
      toast({ title: t("common.deleteFailed"), variant: "destructive" });
    }
  };

  const handleClearToken = async () => {
    try {
      const res = await api.updateMySettings({ bgm_mode: false, bgm_token: "" });
      if (res.success) {
        toast({ title: t("bangumi.tokenCleared") });
        setBgmMode(false);
        setBgmToken("");
        await fetchUser();
        await reload();
      }
    } catch {
      toast({ title: t("bangumi.clearFailed"), variant: "destructive" });
    }
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      case "skipped": return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (error) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{String(error)}</p>
            <Button variant="outline" onClick={() => { void reload(); }}>{t("common.retry")}</Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <Card>
          <CardContent className="pt-6 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          {t("bangumi.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("bangumi.description")}
        </p>
      </div>

      <motion.div variants={{ hidden: {}, show: {} }}>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {t("bangumi.syncStatus")}
            </CardTitle>
            <CardDescription>{t("bangumi.syncStatusDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-accent/50 p-3 text-center">
                <div className="text-2xl font-bold">{status?.total_records ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t("bangumi.totalRecords")}</div>
              </div>
              <div className="rounded-lg bg-accent/50 p-3 text-center">
                <div className="text-2xl font-bold text-green-500">{status?.synced_count ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t("bangumi.synced")}</div>
              </div>
              <div className="rounded-lg bg-accent/50 p-3 text-center">
                <div className="text-2xl font-bold">{status?.sync_ready ? t("bangumi.ready") : t("bangumi.notReady")}</div>
                <div className="text-xs text-muted-foreground">{t("bangumi.status")}</div>
              </div>
              <div className="rounded-lg bg-accent/50 p-3 text-center">
                <div className="text-2xl font-bold">{status?.bgm_token_set ? t("bangumi.configured") : t("bangumi.notConfigured")}</div>
                <div className="text-xs text-muted-foreground">{t("bangumi.token")}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSync} disabled={syncing || !status?.sync_ready}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                {t("bangumi.startSync")}
              </Button>
              {logs.length > 0 && (
                <Button variant="outline" onClick={handleClearHistory}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  {t("bangumi.clearHistory")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={{ hidden: {}, show: {} }}>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {t("bangumi.settings")}
            </CardTitle>
            <CardDescription>{t("settings.bangumiDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">{t("settings.bangumiSync")}</Label>
                <p className="text-xs text-muted-foreground">{t("settings.bangumiSyncDescription")}</p>
              </div>
              <Switch checked={bgmMode} onCheckedChange={setBgmMode} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">{t("bangumi.accessToken")}</Label>
              <Input
                type="password"
                placeholder={status?.bgm_token_set ? t("settings.bangumiTokenConfiguredPlaceholder") : t("settings.bangumiTokenPlaceholder")}
                value={bgmToken}
                onChange={(e) => setBgmToken(e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                {t("bangumi.tokenHint")}{" "}
                <a href="https://next.bgm.tv/demo/access-token" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  https://next.bgm.tv/demo/access-token
                </a>
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {t("settings.saveBangumiSettings")}
              </Button>
              {status?.bgm_token_set && (
                <Button variant="outline" onClick={handleClearToken} disabled={saving}>
                  {t("settings.clearToken")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {logs.length > 0 && (
        <motion.div variants={{ hidden: {}, show: {} }}>
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t("bangumi.syncHistory")}
              </CardTitle>
              <CardDescription>{t("bangumi.syncHistoryDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 rounded-lg bg-accent/30 p-2 text-sm">
                    {statusIcon(log.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        {log.subject_name && (
                          <span className="font-medium truncate">{log.subject_name}</span>
                        )}
                        {log.episode ? (
                          <span className="text-muted-foreground">#{log.episode}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Badge variant="outline" className="text-xs">
                          {log.status === "success" ? t("bangumi.success") : log.status === "failed" ? t("bangumi.failed") : t("bangumi.pending")}
                        </Badge>
                        <span>{formatTime(log.created_at)}</span>
                      </div>
                      {log.message && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
