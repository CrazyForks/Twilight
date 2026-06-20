"use client";

import { useState } from "react";
import { AlertTriangle, Code2, Loader2, Play, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const example = `// Custom Telegram command preview
// Available bindings: ctx, args, user, reply(text), log(text)
const name = user.username || "user";
reply("Hello " + name + ". Args: " + args.join(", "));`;

const statsExample = `// Reply with a compact user summary
const name = user.username || "user";
const uid = user.uid || "unknown";
reply("User: " + name + "\\nUID: " + uid + "\\nArgs: " + args.join(", "));`;

const guardExample = `// Guard an admin-only command
if (!user || user.role !== 0) {
  reply("Permission denied");
  return;
}
log("admin command from " + user.username);
reply("Admin command accepted");`;

const bindingRows = [
  ["ctx", "adminDeveloper.bindingCtx"],
  ["args", "adminDeveloper.bindingArgs"],
  ["user", "adminDeveloper.bindingUser"],
] as const;

const functionRows = [
  ["reply(text)", "adminDeveloper.functionReply"],
  ["log(text)", "adminDeveloper.functionLog"],
] as const;

const exampleRows = [
  ["adminDeveloper.exampleHello", example],
  ["adminDeveloper.exampleStats", statsExample],
  ["adminDeveloper.exampleGuard", guardExample],
] as const;

export default function AdminDeveloperPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [code, setCode] = useState(example);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.previewDeveloperJSCommand>>["data"] | null>(null);

  const preview = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await api.previewDeveloperJSCommand(code);
      if (res.success && res.data) {
        setResult(res.data);
        toast({ title: res.data.ok ? t("adminDeveloper.previewPassed") : t("adminDeveloper.previewBlocked"), variant: res.data.ok ? "success" : "destructive" });
      } else {
        toast({ title: t("adminDeveloper.previewFailed"), description: res.message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: t("adminDeveloper.previewFailed"), description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Code2 className="h-6 w-6" />
          {t("adminDeveloper.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("adminDeveloper.description")}</p>
      </div>

      <Alert className="border-amber-500/40 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t("adminDeveloper.riskTitle")}</AlertTitle>
        <AlertDescription>
          {t("adminDeveloper.riskDescription")}
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("adminDeveloper.sandboxTitle")}</CardTitle>
            <CardDescription>{t("adminDeveloper.sandboxDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="min-h-[360px] font-mono text-sm"
            />
            <Button onClick={() => void preview()} disabled={running} className="min-h-10 whitespace-normal leading-tight">
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {t("adminDeveloper.runPreview")}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("adminDeveloper.apiTitle")}</CardTitle>
              <CardDescription>{t("adminDeveloper.apiDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {["ctx", "args", "user", "reply(text)", "log(text)", "js:"].map((item) => (
                  <Badge key={item} variant="outline">{item}</Badge>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{t("adminDeveloper.bindingsTitle")}</p>
                {bindingRows.map(([name, key]) => (
                  <div key={name} className="rounded-md border bg-muted/20 p-2">
                    <code className="font-mono text-xs">{name}</code>
                    <p className="mt-1 text-xs text-muted-foreground">{t(key)}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{t("adminDeveloper.functionsTitle")}</p>
                {functionRows.map(([name, key]) => (
                  <div key={name} className="rounded-md border bg-muted/20 p-2">
                    <code className="font-mono text-xs">{name}</code>
                    <p className="mt-1 text-xs text-muted-foreground">{t(key)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("adminDeveloper.examplesTitle")}</CardTitle>
              <CardDescription>{t("adminDeveloper.examplesDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {exampleRows.map(([key, sample]) => (
                <Button
                  key={key}
                  variant="outline"
                  className="h-auto justify-start whitespace-normal py-2 text-left"
                  onClick={() => {
                    setCode(sample);
                    setResult(null);
                  }}
                >
                  <span>
                    <span className="block font-medium">{t(key)}</span>
                    <span className="block text-xs text-muted-foreground">{t("adminDeveloper.exampleApply")}</span>
                  </span>
                </Button>
              ))}
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  {t("adminDeveloper.resultTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Badge variant={result.ok ? "success" : "destructive"}>{result.ok ? t("adminDeveloper.resultPassed") : t("adminDeveloper.resultBlocked")}</Badge>
                {result.errors?.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">{t("adminDeveloper.errors")}</p>
                    <ul className="list-inside list-disc text-destructive">
                      {result.errors.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {result.warnings?.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">{t("adminDeveloper.warnings")}</p>
                    <ul className="list-inside list-disc text-muted-foreground">
                      {result.warnings.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {result.output && (
                  <div>
                    <p className="mb-1 font-medium">{t("adminDeveloper.output")}</p>
                    <pre className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{result.output}</pre>
                  </div>
                )}
                {result.logs && result.logs.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">{t("adminDeveloper.logs")}</p>
                    <pre className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{result.logs.join("\n")}</pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
