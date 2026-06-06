"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Copy, Bot, Check, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/auth";
import { useSystemStore } from "@/store/system";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { telegramBotUrl } from "@/lib/safe-url";

export default function RebindGuard() {
  const { toast } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const { user, fetchUser } = useAuthStore();
  const { info: systemInfo } = useSystemStore();
  const [bindCode, setBindCode] = useState<string | null>(null);
  const [bindCodeExpiry, setBindCodeExpiry] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isBound, setIsBound] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const completeRef = useRef(false);

  const botUsername = systemInfo?.telegram_bot?.username;
  const botUrl = telegramBotUrl(botUsername, systemInfo?.telegram_bot?.url);

  const stopPolling = useCallback(() => {
    if (pollingTimer.current) {
      clearInterval(pollingTimer.current);
      pollingTimer.current = null;
    }
    setPolling(false);
  }, []);

  const completeRebind = useCallback(async () => {
    if (completeRef.current) return;
    completeRef.current = true;
    try {
      const res = await api.completeRebind();
      if (res.success) {
        await fetchUser();
        router.replace("/dashboard");
      }
    } catch {
      completeRef.current = false;
    }
  }, [fetchUser, router]);

  const pollStatus = useCallback(async (code: string) => {
    try {
      const res = await api.getBindCodeStatus(code);
      if (res.success && res.data) {
        if (res.data.telegram_bound || res.data.status === "bound" || res.data.status === "confirmed") {
          stopPolling();
          setIsBound(true);
          setTimeout(() => void completeRebind(), 1500);
          return;
        }
        if (res.data.terminal && res.data.status !== "pending") {
          stopPolling();
          setBindCode(null);
          toast({
            title: t("settings.getBindCodeFailed"),
            description: res.data.message,
            variant: "destructive",
          });
        }
      }
    } catch {
      // keep polling
    }
  }, [stopPolling, toast, t, completeRebind]);

  const startPolling = useCallback((code: string) => {
    stopPolling();
    setPolling(true);
    pollStatus(code);
    pollingTimer.current = setInterval(() => {
      pollStatus(code);
    }, 2000);
  }, [stopPolling, pollStatus]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleGetBindCode = async () => {
    setIsLoading(true);
    setBindCode(null);
    try {
      const res = await api.getBindCode();
      if (res.success && res.data?.bind_code) {
        setBindCode(res.data.bind_code);
        setBindCodeExpiry(res.data.expires_in);
        startPolling(res.data.bind_code);
        toast({
          title: t("settings.bindCodeGenerated"),
          variant: "success",
        });
      } else {
        toast({ title: t("settings.getBindCodeFailed"), description: res.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: t("settings.getBindCodeFailed"), description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Card className="border-primary/20 bg-card/90 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              {isBound ? (
                <Check className="h-7 w-7 text-emerald-500" />
              ) : bindCode ? (
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              ) : (
                <Bot className="h-7 w-7 text-primary" />
              )}
            </div>
            <CardTitle className="text-xl">
              {isBound ? t("settings.rebindCompleteTitle") : t("settings.rebindRequiredTitle")}
            </CardTitle>
            <CardDescription className="text-sm">
              {isBound
                ? t("settings.rebindCompleteDescription")
                : t("settings.rebindRequiredDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isBound && !bindCode && (
              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("settings.rebindInstructions")}
                </p>
                <Button
                  className="w-full"
                  onClick={handleGetBindCode}
                  disabled={isLoading}
                  size="lg"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Bot className="mr-2 h-5 w-5" />
                  )}
                  {t("settings.getBindCode")}
                </Button>
              </div>
            )}

            {bindCode && !isBound && (
              <div className="space-y-3">
                <div className="rounded-lg bg-primary/5 p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    {t("settings.sendBindWithin", { minutes: Math.floor(bindCodeExpiry / 60), bot: botUsername ? `@${botUsername}` : "Telegram Bot" })}
                  </p>
                  <code className="text-3xl font-mono font-bold tracking-[0.3em] text-primary">
                    {bindCode}
                  </code>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      navigator.clipboard.writeText(`/bind ${bindCode}`);
                      toast({ title: t("settings.copyCommand"), variant: "success" });
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("settings.copyCommand")}
                  </Button>
                  {botUrl && (
                    <Button variant="outline" className="flex-1" asChild>
                      <a href={botUrl} target="_blank" rel="noopener noreferrer">
                        <Bot className="mr-2 h-4 w-4" />
                        {t("settings.openBot")}
                      </a>
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("settings.waitingForBind")}
                </div>

                <Button
                  variant="ghost"
                  className="w-full text-xs"
                  onClick={() => {
                    stopPolling();
                    setBindCode(null);
                  }}
                >
                  {t("settings.retryBindCode")}
                </Button>
              </div>
            )}

            {isBound && (
              <div className="text-center space-y-3">
                <AlertCircle className="mx-auto h-6 w-6 text-emerald-500" />
                <p className="text-sm text-muted-foreground">
                  {t("settings.rebindRedirecting")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
