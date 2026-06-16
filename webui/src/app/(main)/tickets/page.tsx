"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  MessageSquareMore, Plus, Loader2, Clock, AlertCircle,
  CheckCircle2, XCircle, RotateCcw, Archive,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { api, type Ticket } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSystemStore } from "@/store/system";

const STATUS_MAP: Record<string, { labelKey: string; className: string; icon: typeof AlertCircle }> = {
  open: { labelKey: "tickets.statusOpen", className: "bg-warning/10 text-warning border-warning/30", icon: AlertCircle },
  in_progress: { labelKey: "tickets.statusInProgress", className: "bg-info/10 text-info border-info/30", icon: Loader2 },
  resolved: { labelKey: "tickets.statusResolved", className: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  closed: { labelKey: "tickets.statusClosed", className: "bg-muted text-muted-foreground border-muted", icon: Archive },
};

const PRIORITY_MAP: Record<string, { labelKey: string; className: string }> = {
  low: { labelKey: "tickets.priorityLow", className: "bg-muted text-muted-foreground" },
  medium: { labelKey: "tickets.priorityMedium", className: "bg-info/10 text-info" },
  high: { labelKey: "tickets.priorityHigh", className: "bg-warning/10 text-warning" },
  urgent: { labelKey: "tickets.priorityUrgent", className: "bg-destructive/10 text-destructive" },
};

const DEFAULT_TYPES = [
  { value: "all", labelKey: "tickets.typeAll" },
];

export default function UserTicketsPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const { info: systemInfo } = useSystemStore();
  const ticketEnabled = Boolean(systemInfo?.features?.ticket_system);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [ticketType, setTicketType] = useState("bug");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);

  const loadTickets = useCallback(async () => {
    const res = await api.getMyTickets();
    if (res.success && res.data) return { tickets: res.data.tickets, types: res.data.ticket_types || [] };
    throw new Error(res.message || t("common.networkError"));
  }, [t]);

  const { data, isLoading, error, execute: reload } = useAsyncResource(loadTickets, { immediate: true });

  const handleCreate = async () => {
    if (!title.trim()) { toast({ title: t("tickets.titleRequired"), variant: "destructive" }); return; }
    if (!content.trim()) { toast({ title: t("tickets.contentRequired"), variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await api.createTicket({ title: title.trim(), content: content.trim(), type: ticketType, priority });
      if (res.success) { toast({ title: t("tickets.submitted") }); setCreateOpen(false); setTitle(""); setContent(""); await reload(); }
      else toast({ title: res.message, variant: "destructive" });
    } catch (err: any) { toast({ title: err?.message || t("common.networkError"), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleClose = async (id: number) => {
    try {
      const res = await api.closeOwnTicket(id);
      if (res.success) { toast({ title: t("tickets.closed") }); await reload(); }
      else toast({ title: res.message, variant: "destructive" });
    } catch (err: any) { toast({ title: err?.message || t("common.networkError"), variant: "destructive" }); }
  };

  const handleReopen = async (id: number) => {
    try {
      const res = await api.reopenOwnTicket(id);
      if (res.success) { toast({ title: t("tickets.reopened") }); await reload(); }
      else toast({ title: res.message, variant: "destructive" });
    } catch (err: any) { toast({ title: err?.message || t("common.networkError"), variant: "destructive" }); }
  };

  if (!ticketEnabled) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <Card className="border-dashed"><CardContent className="p-8 text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground mb-2 opacity-40" />
          <p className="font-medium">{t("tickets.disabled")}</p>
        </CardContent></Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquareMore className="h-5 w-5" />{t("tickets.pageTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("tickets.pageDescription")}</p>
        </div>
        <Button onClick={() => { setTitle(""); setContent(""); setCreateOpen(true); }} size="sm">
          <Plus className="h-4 w-4 mr-1" />{t("tickets.submit")}
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40"><CardContent className="p-6 text-center space-y-3">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void reload()}>{t("common.retry")}</Button>
        </CardContent></Card>
      ) : isLoading ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
        </CardContent></Card>
      ) : !data?.tickets?.length ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center">
          <MessageSquareMore className="h-10 w-10 mx-auto text-muted-foreground mb-2 opacity-40" />
          <p className="font-medium">{t("tickets.noTickets")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("tickets.noTicketsHint")}</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {data.tickets.map((ticket: Ticket) => {
            const s = STATUS_MAP[ticket.status] || STATUS_MAP.open;
            const p = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.medium;
            const typeLabel = DEFAULT_TYPES.find((dt) => dt.value === ticket.type)?.labelKey;
            const SI = s.icon;
            const isClosed = ticket.status === "closed";
            const isResolved = ticket.status === "resolved";
            return (
              <Card key={ticket.id} className={isClosed ? "opacity-70" : ""}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${s.className}`}>
                          <SI className="h-3 w-3" />{t(s.labelKey as any)}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${p.className}`}>
                          {t(p.labelKey as any)}
                        </Badge>
                        {typeLabel && <Badge variant="secondary" className="text-[10px]">{t(typeLabel as any)}</Badge>}
                        <Badge variant="secondary" className="text-[10px] font-mono">#{ticket.id}</Badge>
                      </div>
                      <h3 className="font-bold text-base">{ticket.title}</h3>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!isClosed && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-destructive" onClick={() => handleClose(ticket.id)}>
                          <Archive className="h-3.5 w-3.5 mr-1" />{t("tickets.closeTicket")}
                        </Button>
                      )}
                      {isClosed && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleReopen(ticket.id)}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />{t("tickets.reopenTicket")}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/30 p-4 text-sm whitespace-pre-wrap break-words border border-border/50">
                    {ticket.content}
                  </div>

                  {ticket.admin_note && (
                    <div className="rounded-lg bg-info/5 border border-info/20 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-info/15 text-info">
                          <MessageSquareMore className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs font-semibold text-info">{t("tickets.adminReply")}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {t("tickets.updatedAt", { time: new Date(ticket.updated_at * 1000).toLocaleString() })}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words pl-8">{ticket.admin_note}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t("tickets.createdAt", { time: new Date(ticket.created_at * 1000).toLocaleString() })}
                    </span>
                    {ticket.resolved_at && ticket.resolved_at > 0 && (
                      <span className="flex items-center gap-1 text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("tickets.resolvedAt", { time: new Date(ticket.resolved_at * 1000).toLocaleString() })}
                      </span>
                    )}
                    {isClosed && ticket.closed_at && ticket.closed_at > 0 && (
                      <span className="flex items-center gap-1">
                        <Archive className="h-3 w-3" />
                        {t("tickets.closedAt", { time: new Date(ticket.closed_at * 1000).toLocaleString() })}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog — unchanged */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("tickets.createTitle")}</DialogTitle>
            <DialogDescription>{t("tickets.createDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("tickets.title")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("tickets.titlePlaceholder")} maxLength={200} />
            </div>
            <div className="space-y-2"><Label>{t("tickets.content")}</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("tickets.contentPlaceholder")} rows={5} maxLength={10000} className="resize-y" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>{t("tickets.type")}</Label>
                <Select value={ticketType} onValueChange={setTicketType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEFAULT_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.labelKey as any)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>{t("tickets.priority")}</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_MAP).map(([v, o]) => <SelectItem key={v} value={v}>{t(o.labelKey as any)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("tickets.submit")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
