/**
 * CapitalOps Reports Page
 *
 * Purpose: View and share financial summary reports for projects and deals.
 *
 * Features:
 * - Two tabs: "Received" and "Sent"
 * - Report list with read/unread status
 * - Detail modal with structured content rendering
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, FileText, Send, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/formatters";
import { useAuth } from "@/hooks/use-auth";

interface FinancialReport {
  id: number;
  created_by_user_id: number;
  recipient_user_id: number;
  project_id: number | null;
  deal_id: number | null;
  report_type: "project_summary" | "deal_summary";
  title: string;
  content: ProjectSummaryContent | DealSummaryContent;
  is_read: boolean;
  created_at: string;
  created_by_name?: string;
  recipient_name?: string;
}

interface ProjectSummaryContent {
  project_id: number;
  asset_name: string | null;
  budget_total: number;
  budget_actual: number;
  budget_remaining: number;
  milestone_count: number;
  milestones_complete: number;
  milestone_completion_pct: number;
  risk_flag_count: number;
  deals: Array<{
    deal_id: number;
    capital_required: number;
    capital_raised: number;
    raise_pct: number;
    status: string;
  }>;
}

interface DealSummaryContent {
  deal_id: number;
  project_name: string | null;
  capital_required: number;
  capital_raised: number;
  raise_pct: number;
  allocation_count: number;
  allocation_statuses: Record<string, number>;
  return_profile: string | null;
  duration: string | null;
  risk_level: string | null;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}

function ReportDetailModal({
  report,
  open,
  onClose,
}: {
  report: FinancialReport | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!report) return null;

  const isProject = report.report_type === "project_summary";
  const content = report.content as ProjectSummaryContent | DealSummaryContent;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {report.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{isProject ? "Project Summary" : "Deal Summary"}</Badge>
            <span>•</span>
            <span>{formatDate(report.created_at)}</span>
          </div>

          {isProject ? (
            <div className="space-y-4">
              {(() => {
                const c = content as ProjectSummaryContent;
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <StatCard label="Budget Total" value={`$${c.budget_total.toLocaleString()}`} />
                      <StatCard label="Budget Actual" value={`$${c.budget_actual.toLocaleString()}`} />
                      <StatCard
                        label="Budget Used %"
                        value={`${c.budget_total > 0 ? Math.round((c.budget_actual / c.budget_total) * 100) : 0}%`}
                      />
                      <StatCard
                        label="Milestone Completion %"
                        value={`${c.milestone_completion_pct}%`}
                      />
                      <StatCard label="Milestones Complete" value={`${c.milestones_complete} / ${c.milestone_count}`} />
                      <StatCard label="Risk Flag Count" value={c.risk_flag_count} />
                    </div>
                    {c.deals && c.deals.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Deal Summaries</h4>
                        <div className="space-y-2">
                          {c.deals.map((d) => (
                            <div key={d.deal_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                              <span className="font-medium">Deal #{d.deal_id}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-muted-foreground">
                                  ${d.capital_raised.toLocaleString()} / ${d.capital_required.toLocaleString()}
                                </span>
                                <Badge variant="secondary">{d.raise_pct}%</Badge>
                                <Badge variant="outline">{d.status}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                const c = content as DealSummaryContent;
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <StatCard label="Capital Required" value={`$${c.capital_required.toLocaleString()}`} />
                      <StatCard label="Capital Raised" value={`$${c.capital_raised.toLocaleString()}`} />
                      <StatCard label="Raise %" value={`${c.raise_pct}%`} />
                      <StatCard label="Allocation Count" value={c.allocation_count} />
                      {c.return_profile && <StatCard label="Return Profile" value={c.return_profile} />}
                      {c.duration && <StatCard label="Duration" value={c.duration} />}
                      {c.risk_level && <StatCard label="Risk Level" value={c.risk_level} />}
                    </div>
                    {c.allocation_statuses && Object.keys(c.allocation_statuses).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Allocation Statuses</h4>
                        <div className="space-y-1">
                          {Object.entries(c.allocation_statuses).map(([status, count]) => (
                            <div key={status} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                              <span className="capitalize">{status}</span>
                              <Badge variant="secondary">{count}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const [selectedReport, setSelectedReport] = useState<FinancialReport | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const receivedQuery = useQuery({
    queryKey: ["reports", "received"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/reports/");
      const data = await res.json();
      return data.reports as FinancialReport[];
    },
  });

  const sentQuery = useQuery({
    queryKey: ["reports", "sent"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/reports/sent");
      const data = await res.json();
      return data.reports as FinancialReport[];
    },
  });

  const openReport = (report: FinancialReport) => {
    setSelectedReport(report);
    setDetailOpen(true);
  };

  const renderReportRow = (report: FinancialReport, isSent: boolean) => {
    const isUnread = !isSent && !report.is_read;
    return (
      <Card
        key={report.id}
        className={`cursor-pointer transition-colors hover:bg-accent/50 ${isUnread ? "border-l-4 border-l-primary" : ""}`}
        onClick={() => openReport(report)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className={`text-sm truncate ${isUnread ? "font-bold" : "font-medium"}`}>
                  {report.title}
                </h3>
                <Badge variant="outline" className="text-xs shrink-0">
                  {report.report_type === "project_summary" ? "Project" : "Deal"}
                </Badge>
                {!isSent && !report.is_read && (
                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {isSent ? (
                  <span>To: {report.recipient_name || `User #${report.recipient_user_id}`}</span>
                ) : (
                  <span>From: {report.created_by_name || `User #${report.created_by_user_id}`}</span>
                )}
                <span>•</span>
                <span>{formatDate(report.created_at)}</span>
              </div>
            </div>
            {isUnread ? (
              <EyeOff className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reports"
        description="View and share financial summaries for projects and deals"
        icon={BarChart2}
      />

      <Tabs defaultValue="received" className="space-y-4">
        <TabsList>
          <TabsTrigger value="received" className="gap-2">
            <Eye className="h-4 w-4" />
            Received
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <Send className="h-4 w-4" />
            Sent
          </TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="space-y-3">
          {receivedQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : receivedQuery.error ? (
            <div className="text-center py-12 text-muted-foreground">
              Failed to load reports
            </div>
          ) : receivedQuery.data?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No reports received yet
            </div>
          ) : (
            receivedQuery.data?.map((report) => renderReportRow(report, false))
          )}
        </TabsContent>

        <TabsContent value="sent" className="space-y-3">
          {sentQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : sentQuery.error ? (
            <div className="text-center py-12 text-muted-foreground">
              Failed to load sent reports
            </div>
          ) : sentQuery.data?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No reports sent yet
            </div>
          ) : (
            sentQuery.data?.map((report) => renderReportRow(report, true))
          )}
        </TabsContent>
      </Tabs>

      <ReportDetailModal
        report={selectedReport}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}