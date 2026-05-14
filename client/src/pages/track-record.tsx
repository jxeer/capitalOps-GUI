/**
 * CapitalOps Track Record Page
 *
 * Purpose: Portfolio-style summary of all projects a user has been involved with as PM.
 *
 * Features:
 * - Summary stat cards row (total projects, completed, active, budget managed, on-time rate, risk flags resolved)
 * - Project history list with progress bars and milestone/risk counts
 * - User selector for Sponsor Admins to look up other users' track records
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, FolderKanban, CheckCircle2, TrendingUp, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, getStatusColor } from "@/lib/formatters";
import { useAuth } from "@/hooks/use-auth";

interface TrackRecordUser {
  id: number;
  full_name: string;
  role: string;
}

interface TrackRecordProject {
  id: number;
  asset_id: number;
  asset_name: string | null;
  portfolio_id: number;
  phase: string;
  start_date: string | null;
  target_completion: string | null;
  budget_total: number;
  budget_actual: number;
  status: string;
  pm_assigned: string;
  created_at: string;
  media: unknown[];
  milestone_count: number;
  milestones_complete: number;
  completion_pct: number;
  risk_flag_count: number;
  entitlement_count: number;
}

interface TrackRecordSummary {
  total_projects: number;
  completed_projects: number;
  active_projects: number;
  total_budget_managed: number;
  on_time_completion_rate: number;
  avg_milestone_completion: number;
  total_risk_flags: number;
  resolved_risk_flags: number;
  entitlement_records_tracked: number;
}

interface TrackRecordResponse {
  user: TrackRecordUser;
  summary: TrackRecordSummary;
  projects: TrackRecordProject[];
}

export default function TrackRecord() {
  const { user: authUser } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>(String(authUser?.id || ""));

  const { data: users } = useQuery({
    queryKey: ["/api/v1/auth/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/auth/users");
      return res.json();
    },
    enabled: authUser?.role === "sponsor_admin",
  });

  const targetUserId = authUser?.role === "sponsor_admin" && selectedUserId
    ? Number(selectedUserId)
    : (authUser?.id || 0);

  const { data, isLoading, error } = useQuery<TrackRecordResponse>({
    queryKey: ["/api/v1/execution/track-record", targetUserId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/execution/track-record/${targetUserId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load track record");
      }
      return res.json();
    },
    enabled: targetUserId > 0,
  });

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-muted-foreground">
          {(error as Error).message || "Failed to load track record"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Track Record"
        description="Portfolio performance summary for project managers"
        icon={Trophy}
      />

      {authUser?.role === "sponsor_admin" && (
        <div className="flex items-center gap-4">
          <Label className="shrink-0">Viewing track record for:</Label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select user" />
            </SelectTrigger>
            <SelectContent>
              {(users?.users || []).map((u: { id: number; full_name: string; email: string }) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.full_name} ({u.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              title="Total Projects"
              value={data.summary.total_projects}
              icon={FolderKanban}
              testId="stat-total-projects"
            />
            <StatCard
              title="Completed"
              value={data.summary.completed_projects}
              icon={CheckCircle2}
              variant="success"
              testId="stat-completed-projects"
            />
            <StatCard
              title="Active"
              value={data.summary.active_projects}
              icon={TrendingUp}
              variant="highlight"
              testId="stat-active-projects"
            />
            <StatCard
              title="Budget Managed"
              value={formatCurrency(data.summary.total_budget_managed)}
              icon={Trophy}
              testId="stat-budget"
            />
            <StatCard
              title="On-Time Rate"
              value={`${data.summary.on_time_completion_rate}%`}
              icon={Clock}
              variant={data.summary.on_time_completion_rate >= 80 ? "success" : "warning"}
              testId="stat-on-time"
            />
            <StatCard
              title="Risk Flags Resolved"
              value={`${data.summary.resolved_risk_flags}/${data.summary.total_risk_flags}`}
              icon={ShieldCheck}
              variant={data.summary.resolved_risk_flags === data.summary.total_risk_flags ? "success" : "default"}
              testId="stat-risk-flags"
            />
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-4">Project History</h2>
            <div className="space-y-4">
              {data.projects.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No projects found for this user
                </div>
              ) : (
                data.projects.map((project) => {
                  const budgetPct = project.budget_total > 0
                    ? Math.round((project.budget_actual / project.budget_total) * 100)
                    : 0;
                  return (
                    <Card key={project.id}>
                      <CardContent className="p-5 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-semibold truncate">
                                {project.asset_name || "Unknown Asset"}
                              </h3>
                              <Badge variant="secondary" className={getStatusColor(project.status)}>
                                {project.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {project.phase} • PM: {project.pm_assigned}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                            {project.entitlement_count > 0 && (
                              <span className="flex items-center gap-1" title="Entitlements">
                                📋 {project.entitlement_count}
                              </span>
                            )}
                            {project.risk_flag_count > 0 && (
                              <span className="flex items-center gap-1 text-chart-3" title="Risk Flags">
                                <AlertTriangle className="h-3 w-3" />
                                {project.risk_flag_count}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Budget</span>
                            <span className="font-medium">
                              {formatCurrency(project.budget_actual)} / {formatCurrency(project.budget_total)}
                            </span>
                          </div>
                          <Progress value={budgetPct} className="h-2" />
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{budgetPct}% used</span>
                            <span>{project.budget_total - project.budget_actual > 0
                              ? formatCurrency(project.budget_total - project.budget_actual) + " remaining"
                              : "over budget"}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Milestones</span>
                            <span className="font-medium">
                              {project.milestones_complete} / {project.milestone_count} complete
                            </span>
                          </div>
                          <Progress value={project.completion_pct} className="h-2" />
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{project.completion_pct}% complete</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}