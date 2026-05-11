/**
 * CapitalOps Entitlement Page
 *
 * Purpose: Manages permits and entitlements for development projects,
 * tracking applications, approvals, and related events.
 *
 * Features:
 * - Entitlement record table with status badges
 * - Filtering by status
 * - Detail view with event timeline
 * - Create new entitlement records
 * - Update entitlement status
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Plus,
  Calendar,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/formatters";

interface PermitEvent {
  id: number;
  entitlement_record_id: number;
  event_type: string;
  previous_value: string | null;
  new_value: string | null;
  detected_at: string;
  source: string;
  created_at: string;
}

interface EntitlementRecord {
  id: number;
  project_id: number;
  project_name: string;
  parcel_number: string;
  agency: string;
  application_number: string;
  entitlement_type: string;
  status: string;
  submitted_date: string | null;
  hearing_date: string | null;
  approved_date: string | null;
  notes: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

interface EntitlementDetail extends EntitlementRecord {
  events: PermitEvent[];
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (s === "approved" || s === "approved - recorded") return "default";
  if (s === "denied" || s === "rejected") return "destructive";
  if (s.includes("pending") || s.includes("review") || s.includes("in progress")) return "secondary";
  return "outline";
}

function getStatusIcon(status: string) {
  const s = status.toLowerCase();
  if (s === "approved" || s === "approved - recorded") return <CheckCircle2 className="h-3 w-3" />;
  if (s === "denied" || s === "rejected") return <XCircle className="h-3 w-3" />;
  return <Clock className="h-3 w-3" />;
}

const emptyForm = {
  projectId: "",
  parcelNumber: "",
  agency: "",
  applicationNumber: "",
  entitlementType: "",
  status: "",
  submittedDate: "",
  hearingDate: "",
  notes: "",
  sourceUrl: "",
};

export default function EntitlementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<EntitlementDetail | null>(null);
  const [editingRecord, setEditingRecord] = useState<EntitlementRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { data: records, isLoading } = useQuery<EntitlementRecord[]>({
    queryKey: ["/api/v1/entitlement/"],
  });

  const { data: projects } = useQuery<any[]>({ queryKey: ["/api/projects"] });

  const filteredRecords = records?.filter((r) => {
    if (statusFilter === "all") return true;
    return r.status.toLowerCase() === statusFilter.toLowerCase();
  });

  const canEdit = user?.role === "sponsor_admin" || user?.role === "project_manager";

  const setField = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditingRecord(null);
    setForm(emptyForm);
    setCreateOpen(true);
  };

  const openUpdate = (record: EntitlementRecord) => {
    setEditingRecord(record);
    setForm({
      projectId: String(record.project_id),
      parcelNumber: record.parcel_number,
      agency: record.agency,
      applicationNumber: record.application_number,
      entitlementType: record.entitlement_type,
      status: record.status,
      submittedDate: record.submitted_date || "",
      hearingDate: record.hearing_date || "",
      notes: record.notes || "",
      sourceUrl: record.source_url || "",
    });
    setUpdateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setEditingRecord(null);
    setForm(emptyForm);
  };

  const closeUpdate = () => {
    setUpdateOpen(false);
    setEditingRecord(null);
    setForm(emptyForm);
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/v1/entitlement/", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/entitlement/"] });
      toast({ title: "Entitlement record created" });
      closeCreate();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/v1/entitlement/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/entitlement/"] });
      toast({ title: "Entitlement record updated" });
      closeUpdate();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      project_id: Number(form.projectId),
      parcel_number: form.parcelNumber,
      agency: form.agency,
      entitlement_type: form.entitlementType,
      status: form.status,
      submitted_date: form.submittedDate,
    };
    if (form.applicationNumber) payload.application_number = form.applicationNumber;
    if (form.hearingDate) payload.hearing_date = form.hearingDate;
    if (form.notes) payload.notes = form.notes;
    if (form.sourceUrl) payload.source_url = form.sourceUrl;
    createMutation.mutate(payload);
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    const payload: any = {};
    if (form.status !== editingRecord.status) payload.status = form.status;
    if (form.hearingDate) payload.hearing_date = form.hearingDate;
    if (form.notes !== editingRecord.notes) payload.notes = form.notes;
    updateMutation.mutate({ id: editingRecord.id, data: payload });
  };

  const toggleRow = async (id: number, record: EntitlementRecord) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
      if (!selectedRecord || selectedRecord.id !== id) {
        const res = await apiRequest("GET", `/api/v1/entitlement/${id}`);
        const data = await res.json();
        setSelectedRecord(data.entitlement_record);
      }
    }
    setExpandedRows(newExpanded);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Entitlements"
        description="Permit and entitlement applications for development projects"
      >
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add Entitlement
          </Button>
        )}
      </PageHeader>

      <div className="flex items-center gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Filter by Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in review">In Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="denied">Denied</SelectItem>
              <SelectItem value="active">Active</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="h-10 px-4 text-left font-medium">Project</th>
                  <th className="h-10 px-4 text-left font-medium">Parcel Number</th>
                  <th className="h-10 px-4 text-left font-medium">Agency</th>
                  <th className="h-10 px-4 text-left font-medium">Type</th>
                  <th className="h-10 px-4 text-left font-medium">Status</th>
                  <th className="h-10 px-4 text-left font-medium">Submitted</th>
                  <th className="h-10 px-4 text-left font-medium">Hearing Date</th>
                  <th className="h-10 px-4 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords?.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No entitlement records found
                    </td>
                  </tr>
                )}
                {filteredRecords?.map((record) => {
                  const isExpanded = expandedRows.has(record.id);
                  const displayRecord = isExpanded && selectedRecord?.id === record.id ? selectedRecord : null;

                  return (
                    <>
                      <tr
                        key={record.id}
                        className="border-b cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => toggleRow(record.id, record)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="font-medium">{record.project_name || `Project ${record.project_id}`}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{record.parcel_number}</td>
                        <td className="px-4 py-3">{record.agency}</td>
                        <td className="px-4 py-3 capitalize">{record.entitlement_type}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={getStatusBadgeVariant(record.status)}
                            className="flex items-center gap-1 w-fit"
                          >
                            {getStatusIcon(record.status)}
                            {record.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{formatDate(record.submitted_date)}</td>
                        <td className="px-4 py-3">{formatDate(record.hearing_date)}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openUpdate(record)}
                            >
                              Update Status
                            </Button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && displayRecord && (
                        <tr key={`${record.id}-detail`}>
                          <td colSpan={8} className="px-4 py-4 bg-muted/20">
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <p className="text-xs text-muted-foreground">Application #</p>
                                  <p className="font-mono text-sm">{displayRecord.application_number || "N/A"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Source URL</p>
                                  {displayRecord.source_url ? (
                                    <a
                                      href={displayRecord.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-primary hover:underline"
                                    >
                                      View on Portal
                                    </a>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">N/A</p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Approved Date</p>
                                  <p className="text-sm">{formatDate(displayRecord.approved_date) || "N/A"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Notes</p>
                                  <p className="text-sm">{displayRecord.notes || "None"}</p>
                                </div>
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                  Event Timeline
                                </p>
                                {displayRecord.events && displayRecord.events.length > 0 ? (
                                  <div className="space-y-3">
                                    {displayRecord.events.map((event) => (
                                      <div key={event.id} className="flex items-start gap-3">
                                        <div className="mt-1">
                                          <div className="h-2 w-2 rounded-full bg-primary" />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                          <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium capitalize">{event.event_type.replace("_", " ")}</p>
                                            <Badge variant="outline" className="text-xs">
                                              {event.source}
                                            </Badge>
                                          </div>
                                          {event.previous_value && event.new_value && (
                                            <p className="text-xs text-muted-foreground">
                                              {event.previous_value} → {event.new_value}
                                            </p>
                                          )}
                                          {event.new_value && !event.previous_value && (
                                            <p className="text-xs text-muted-foreground">Value: {event.new_value}</p>
                                          )}
                                          <p className="text-xs text-muted-foreground">
                                            {new Date(event.detected_at).toLocaleString()}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">No events recorded</p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(v) => !v && closeCreate()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Entitlement Record</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={form.projectId} onValueChange={(v) => setField("projectId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {(p as any).assetName || `Project ${p.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Parcel Number</Label>
                <Input
                  value={form.parcelNumber}
                  onChange={(e) => setField("parcelNumber", e.target.value)}
                  placeholder="e.g. 01-1234-056-7890"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Agency</Label>
                <Input
                  value={form.agency}
                  onChange={(e) => setField("agency", e.target.value)}
                  placeholder="e.g. Miami-Dade County"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Entitlement Type</Label>
                <Select value={form.entitlementType} onValueChange={(v) => setField("entitlementType", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rezoning">Rezoning</SelectItem>
                    <SelectItem value="variance">Variance</SelectItem>
                    <SelectItem value="site plan">Site Plan</SelectItem>
                    <SelectItem value="special exception">Special Exception</SelectItem>
                    <SelectItem value="conditional use">Conditional Use</SelectItem>
                    <SelectItem value="subdivision">Subdivision</SelectItem>
                    <SelectItem value="building permit">Building Permit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="In Review">In Review</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Denied">Denied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Application Number</Label>
                <Input
                  value={form.applicationNumber}
                  onChange={(e) => setField("applicationNumber", e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label>Submitted Date</Label>
                <Input
                  type="date"
                  value={form.submittedDate}
                  onChange={(e) => setField("submittedDate", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Hearing Date</Label>
              <Input
                type="date"
                value={form.hearingDate}
                onChange={(e) => setField("hearingDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Source URL</Label>
              <Input
                value={form.sourceUrl}
                onChange={(e) => setField("sourceUrl", e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Entitlement Record"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={updateOpen} onOpenChange={(v) => !v && closeUpdate()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Entitlement Status</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateSubmit} className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">{editingRecord?.project_name || `Project ${editingRecord?.project_id}`}</p>
              <p className="text-xs text-muted-foreground">{editingRecord?.entitlement_type} - {editingRecord?.parcel_number}</p>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="In Review">In Review</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Denied">Denied</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hearing Date</Label>
              <Input
                type="date"
                value={form.hearingDate}
                onChange={(e) => setField("hearingDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Update notes..."
                rows={3}
              />
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Updating..." : "Update Status"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}