"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api, type SetupPayload } from "@/lib/api";
import { ApiError } from "@/lib/api-request";
import { useI18n } from "@/lib/i18n";
import { friendlyError } from "@/lib/validators";
import { useAuthStore } from "@/store/auth";
import { useSystemStore } from "@/store/system";
import { AuthBrand, AuthStepDots, AUTH_PRIMARY_BTN } from "../auth-ui";

const steps = ["account", "emby", "integrations", "review"] as const;

function splitList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLineList(value: string): Array<{ name?: string; url: string }> {
  return splitList(value).map((item) => {
    const idx = item.indexOf("=");
    if (idx > 0) {
      return { name: item.slice(0, idx).trim(), url: item.slice(idx + 1).trim() };
    }
    return { url: item };
  }).filter((item) => item.url);
}

export default function SetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
  const { fetchUser } = useAuthStore();
  const { fetchInfo, invalidate, info } = useSystemStore();

  const [checking, setChecking] = useState(true);
  const [available, setAvailable] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [siteName, setSiteName] = useState(info?.name || "Twilight");

  const [embyURL, setEmbyURL] = useState("");
  const [embyToken, setEmbyToken] = useState("");
  const [embyLines, setEmbyLines] = useState("");

  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramAdmins, setTelegramAdmins] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerCodeLimit, setRegisterCodeLimit] = useState(true);
  const [allowPendingRegister, setAllowPendingRegister] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.getSetupStatus()
      .then((res) => {
        if (!alive) return;
        const ok = Boolean(res.success && res.data?.available);
        setAvailable(ok);
        if (!ok) router.replace("/login");
      })
      .catch(() => {
        if (alive) router.replace("/login");
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [router]);

  const payload = useMemo<SetupPayload>(() => ({
    admin: { username, password, email: email || undefined },
    global: { server_name: siteName || "Twilight" },
    emby: {
      emby_url: embyURL || undefined,
      emby_token: embyToken || undefined,
      emby_url_list: parseLineList(embyLines),
    },
    telegram: {
      enabled: telegramEnabled,
      bot_token: telegramToken || undefined,
      admin_id: splitList(telegramAdmins),
    },
    email: {
      enabled: emailEnabled,
      smtp_host: smtpHost || undefined,
      smtp_port: smtpPort ? Number(smtpPort) : undefined,
      smtp_username: smtpUsername || undefined,
      smtp_password: smtpPassword || undefined,
      smtp_from_address: smtpFrom || undefined,
      smtp_encryption: "starttls",
    },
    policy: {
      register_mode: registerOpen,
      register_code_limit: registerCodeLimit,
      allow_pending_register: allowPendingRegister,
    },
  }), [
    allowPendingRegister,
    email,
    emailEnabled,
    embyLines,
    embyToken,
    embyURL,
    password,
    registerCodeLimit,
    registerOpen,
    siteName,
    smtpFrom,
    smtpHost,
    smtpPassword,
    smtpPort,
    smtpUsername,
    telegramAdmins,
    telegramEnabled,
    telegramToken,
    username,
  ]);

  const validateAccount = () => {
    if (!username || !password) {
      toast({ title: t("auth.setup.validationRequired"), variant: "destructive" });
      return false;
    }
    if (password !== confirmPassword) {
      toast({ title: t("auth.setup.passwordMismatch"), variant: "destructive" });
      return false;
    }
    return true;
  };

  const nextStep = () => {
    if (step === 0 && !validateAccount()) return;
    setStep((value) => Math.min(value + 1, steps.length - 1));
  };

  const submit = async () => {
    if (!validateAccount()) return;
    setSubmitting(true);
    try {
      const res = await api.completeSetup(payload);
      if (!res.success) {
        toast({ title: t("auth.setup.failed"), description: res.message, variant: "destructive" });
        return;
      }
      toast({ title: t("auth.setup.success"), description: t("auth.setup.successDescription"), variant: "success" });
      invalidate();
      await fetchInfo(true);
      await fetchUser({ silent: true });
      router.replace("/admin");
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      toast({
        title: t("auth.setup.failed"),
        description: apiErr?.errorCode ? friendlyError(apiErr.errorCode, apiErr.backendMessage) : t("common.checkNetwork"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (checking || !available) {
    return (
      <>
        <AuthBrand subtitle={t("auth.setup.loading")} />
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <AuthBrand subtitle={t("auth.setup.description")} />
      <AuthStepDots total={steps.length} current={step} />

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
        <div className="mb-1 flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4" />
          {t("auth.setup.securityTitle")}
        </div>
        <p className="text-foreground/75">{t("auth.setup.securityDescription")}</p>
      </div>

      {step === 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">{t("auth.setup.accountTitle")}</h2>
            <p className="text-sm text-foreground/65">{t("auth.setup.accountDescription")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-site">{t("auth.setup.siteName")}</Label>
            <Input id="setup-site" value={siteName} onChange={(e) => setSiteName(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-username">{t("auth.setup.adminUsername")}</Label>
            <Input id="setup-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-email">{t("auth.setup.adminEmail")}</Label>
            <Input id="setup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="h-11" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="setup-password">{t("auth.setup.adminPassword")}</Label>
              <Input id="setup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-confirm">{t("auth.setup.confirmPassword")}</Label>
              <Input id="setup-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="h-11" />
            </div>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">{t("auth.setup.embyTitle")}</h2>
            <p className="text-sm text-foreground/65">{t("auth.setup.embyDescription")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-emby-url">{t("auth.setup.embyURL")}</Label>
            <Input id="setup-emby-url" placeholder="http://emby:8096" value={embyURL} onChange={(e) => setEmbyURL(e.target.value)} className="h-11" />
            <p className="text-xs text-foreground/60">{t("auth.setup.embyURLHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-emby-token">{t("auth.setup.embyToken")}</Label>
            <Input id="setup-emby-token" type="password" value={embyToken} onChange={(e) => setEmbyToken(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-emby-lines">{t("auth.setup.embyLines")}</Label>
            <Input id="setup-emby-lines" placeholder="LAN=http://192.168.1.10:8096, Public=https://media.example.com" value={embyLines} onChange={(e) => setEmbyLines(e.target.value)} className="h-11" />
            <p className="text-xs text-foreground/60">{t("auth.setup.embyLinesHint")}</p>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <div>
            <h2 className="text-base font-semibold">{t("auth.setup.integrationsTitle")}</h2>
            <p className="text-sm text-foreground/65">{t("auth.setup.integrationsDescription")}</p>
          </div>
          <div className="space-y-3 rounded-lg border border-border/70 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={telegramEnabled} onCheckedChange={(checked) => setTelegramEnabled(checked === true)} />
              {t("auth.setup.enableTelegram")}
            </label>
            <Input type="password" placeholder={t("auth.setup.telegramToken")} value={telegramToken} onChange={(e) => setTelegramToken(e.target.value)} className="h-10" />
            <Input placeholder={t("auth.setup.telegramAdmins")} value={telegramAdmins} onChange={(e) => setTelegramAdmins(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-3 rounded-lg border border-border/70 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={emailEnabled} onCheckedChange={(checked) => setEmailEnabled(checked === true)} />
              {t("auth.setup.enableEmail")}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder={t("auth.setup.smtpHost")} value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="h-10" />
              <Input placeholder={t("auth.setup.smtpPort")} value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="h-10" />
              <Input placeholder={t("auth.setup.smtpUsername")} value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} className="h-10" />
              <Input type="password" placeholder={t("auth.setup.smtpPassword")} value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} className="h-10" />
            </div>
            <Input placeholder={t("auth.setup.smtpFrom")} value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-3 rounded-lg border border-border/70 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={registerOpen} onCheckedChange={(checked) => setRegisterOpen(checked === true)} />
              {t("auth.setup.openRegistration")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground/75">
              <Checkbox checked={registerCodeLimit} onCheckedChange={(checked) => setRegisterCodeLimit(checked === true)} />
              {t("auth.setup.requireRegCode")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground/75">
              <Checkbox checked={allowPendingRegister} onCheckedChange={(checked) => setAllowPendingRegister(checked === true)} />
              {t("auth.setup.allowPending")}
            </label>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">{t("auth.setup.reviewTitle")}</h2>
            <p className="text-sm text-foreground/65">{t("auth.setup.reviewDescription")}</p>
          </div>
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3"><span>{t("auth.setup.siteName")}</span><b className="truncate">{siteName || "Twilight"}</b></div>
            <div className="flex justify-between gap-3"><span>{t("auth.setup.adminUsername")}</span><b className="truncate">{username || "-"}</b></div>
            <div className="flex justify-between gap-3"><span>{t("auth.setup.embyTitle")}</span><b>{embyURL ? t("common.enabled") : t("common.disabled")}</b></div>
            <div className="flex justify-between gap-3"><span>Telegram</span><b>{telegramEnabled ? t("common.enabled") : t("common.disabled")}</b></div>
            <div className="flex justify-between gap-3"><span>{t("common.email")}</span><b>{emailEnabled ? t("common.enabled") : t("common.disabled")}</b></div>
          </div>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground/80">
            <CheckCircle2 className="mb-2 h-4 w-4" />
            {t("auth.setup.finalNotice")}
          </div>
        </section>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="h-11 flex-1" disabled={step === 0 || submitting} onClick={() => setStep((value) => Math.max(value - 1, 0))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("common.previousPage")}
        </Button>
        {step < steps.length - 1 ? (
          <Button type="button" className={`${AUTH_PRIMARY_BTN} flex-1`} onClick={nextStep}>
            {t("common.nextPage")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" className={`${AUTH_PRIMARY_BTN} flex-1`} disabled={submitting} onClick={submit}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            {t("auth.setup.submit")}
          </Button>
        )}
      </div>
    </>
  );
}
