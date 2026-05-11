/**
 * CapitalOps Work Orders Page
 *
 * Purpose: Manage maintenance and service work orders for vendors,
 * tracking status, costs, and completion for project-related tasks.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ClipboardList, DollarSign, AlertCircle, CheckCircle2, Plus, Trash2,
  Pencil, Zap, ArrowUpCircle, MinusCircle, Building2, ChevronDown
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { FieldMediaUploader } from "@/components/FieldMediaUploader";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/formatters";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { WorkOrder, Vendor, Asset } from "@shared/schema";

const emptyForm = {
  vendorId: "", assetId: "", type: "", priority: "Medium",
  cost: "", capExFlag: false, status: "Open", description: "", completionDate: ""
};

const PRIORITY_META: Record<string, {
  border: string; iconBg: string; icon: typeof Zap;
  iconColor: string; badge: string
}> = {
  Urgent: { border: "border-l-4 border-l-destructive", iconBg: "bg-destructive/15", icon: Zap, iconColor: "text-destructive", badge: "bg-destructive/15 text-destructive" },
  High:   { border: "border-l-4 border-l-chart-5",    iconBg: "bg-chart-5/15",    icon: ArrowUpCircle, iconColor: "text-chart-5", badge: "bg-chart-5/15 text-chart-5" },
  Medium: { border: "border-l-4 border-l-chart-3",    iconBg: "bg-chart-3/15",    icon: MinusCircle,   iconColor: "text-chart-3", badge: "bg-chart-3/15 text-chart-3" },
  Low:    { border: "border-l-4 border-l-muted-foreground/30", iconBg: "bg-muted", icon: MinusCircle, iconColor: "text-muted-foreground", badge: "bg-muted text-muted-foreground" },
};

export default function WorkOrders() {
  const { data: workOrders, isLoading } = useQuery<WorkOrder[]>({ queryKey: ["/api/work-orders"] });
  const { data: vendors } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"] });
  const { data: assets } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const [form, setForm] = useState(emptyForm);

  const setField = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (wo: WorkOrder) => {
    setEditing(wo);
    setForm({
      vendorId: wo.vendorId, assetId: wo.assetId, type: wo.type,
      priority: wo.priority, cost: String(wo.cost), capExFlag: wo.capExFlag,
      status: wo.status, description: wo.description || "", completionDate: wo.completionDate || ""
    });
    setOpen(true);
  };
  const closeDialog = () => { setOpen(false); setEditing(null); setForm(emptyForm); };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/work-orders", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Work order created" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create work order", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/work-orders/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Work order updated" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/work-orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Work order deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form, cost: Number(form.cost) || 0,
      completionDate: form.completionDate || undefined,
      description: form.description || undefined
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const openOrders = workOrders?.filter(w => w.status === "Open" || w.status === "In Progress") || [];
  const totalCost = workOrders?.reduce((sum, w) => sum + w.cost, 0) || 0;
  const capExCount = workOrders?.filter(w => w.capExFlag).length || 0;
  const completedCount = workOrders?.filter(w => w.status === "Completed").length || 0;

  const urgentAndHigh = workOrders?.filter(w =>
    (w.priority === "Urgent" || w.priority === "High") &&
    w.status !== "Completed" && w.status !== "Cancelled"
  ) || [];
  const otherActive = workOrders?.filter(w =>
    w.priority !== "Urgent" && w.priority !== "High" &&
    w.status !== "Completed" && w.status !== "Cancelled"
  ) || [];
  const done = workOrders?.filter(w => w.status === "Completed" || w.status === "Cancelled") || [];

  const WorkOrderRow = ({ wo }: { wo: WorkOrder }) => {
    const vendor = vendors?.find(v => v.id === wo.vendorId);
    const asset = assets?.find(a => a.id === wo.assetId);
    const meta = PRIORITY_META[wo.priority] || PRIORITY_META.Low;
    const PriorityIcon = meta.icon;

    return (
      <div
        key={wo.id}
        className={`group/wo p-4 rounded-xl bg-card border border-border/50 hover:shadow-md transition-all duration-200 ${meta.border}`}
        data-testid={`work-order-row-${wo.id}`}
      >
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.iconBg}`}>
            <PriorityIcon className={`h-4 w-4 ${meta.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{wo.type}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />{asset?.name || "No asset"}
                  </span>
                  {vendor && <span>· {vendor.name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => { setSelectedWO(wo); setDetailOpen(true); }}
                  aria-label="View details"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Badge variant="secondary" className={`text-[10px] ${meta.badge}`}>{wo.priority}</Badge>
                <Badge variant="secondary" className={`text-[10px] ${getStatusColor(wo.status)}`}>{wo.status}</Badge>
                {user && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover/wo:opacity-100 transition-opacity"
                      onClick={() => openEdit(wo)}
                      aria-label="Edit work order"
                      data-testid={`button-edit-wo-${wo.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover/wo:opacity-100 transition-opacity"
                          data-testid={`button-delete-wo-${wo.id}`}
                          aria-label="Delete work order"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this work order?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(wo.id)} data-testid="button-confirm-delete">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </div>

            {wo.description && <p className="text-xs text-muted-foreground mt-1.5">{wo.description}</p>}

            <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
              <span className="font-semibold text-foreground">{formatCurrency(wo.cost)}</span>
              {wo.capExFlag && <Badge variant="secondary" className="bg-chart-4/15 text-chart-4 text-[10px]">CapEx</Badge>}
              {wo.completionDate && <span className="text-muted-foreground">Done: {formatDate(wo.completionDate)}</span>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Work Orders" description="Work order management and cost tracking">
        {user && (
          <Button size="sm" onClick={openCreate} data-testid="button-new-wo">
            <Plus className="h-4 w-4 mr-1" /> New Work Order
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Open Orders" value={openOrders.length} icon={ClipboardList} variant="warning" testId="stat-open-orders" />
        <StatCard title="Total Cost" value={formatCurrency(totalCost)} icon={DollarSign} testId="stat-total-cost" />
        <StatCard title="CapEx Items" value={capExCount} icon={AlertCircle} variant="danger" testId="stat-capex" />
        <StatCard title="Completed" value={completedCount} icon={CheckCircle2} variant="success" testId="stat-completed" />
      </div>

      <div className="space-y-6">
        {urgentAndHigh.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-destructive" />
              <h3 className="text-sm font-semibold">Urgent & High Priority</h3>
              <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px]">{urgentAndHigh.length}</Badge>
            </div>
            <div className="space-y-2">
              {urgentAndHigh.map(wo => <WorkOrderRow key={wo.id} wo={wo} />)}
            </div>
          </div>
        )}

        {otherActive.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Active Orders</h3>
              <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">{otherActive.length}</Badge>
            </div>
            <div className="space-y-2">
              {otherActive.map(wo => <WorkOrderRow key={wo.id} wo={wo} />)}
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-chart-2" />
              <h3 className="text-sm font-semibold text-muted-foreground">Completed / Cancelled</h3>
              <Badge variant="secondary" className="text-[10px]">{done.length}</Badge>
            </div>
            <div className="space-y-2 opacity-70">
              {done.map(wo => <WorkOrderRow key={wo.id} wo={wo} />)}
            </div>
          </div>
        )}

        {!workOrders?.length && (
          <Card>
            <CardContent className="p-8 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No work orders found</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Work Order" : "Create Work Order"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Input
                value={form.type}
                onChange={(e) => setField("type", e.target.value)}
                placeholder="e.g. HVAC Installation"
                data-testid="input-wo-type"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Select value={form.vendorId} onValueChange={(v) => setField("vendorId", v)}>
                  <SelectTrigger data-testid="select-wo-vendor"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Asset</Label>
                <Select value={form.assetId} onValueChange={(v) => setField("assetId", v)}>
                  <SelectTrigger data-testid="select-wo-asset"><SelectValue placeholder="Select asset" /></SelectTrigger>
                  <SelectContent>{assets?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setField("priority", v)}>
                  <SelectTrigger data-testid="select-wo-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                  <SelectTrigger data-testid="select-wo-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cost</Label>
                <Input
                  type="number"
                  value={form.cost}
                  onChange={(e) => setField("cost", e.target.value)}
                  placeholder="0"
                  data-testid="input-wo-cost"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Completion Date</Label>
                <Input
                  type="date"
                  value={form.completionDate}
                  onChange={(e) => setField("completionDate", e.target.value)}
                  data-testid="input-wo-completion"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.capExFlag}
                onCheckedChange={(v) => setField("capExFlag", v)}
                data-testid="switch-capex"
                id="capex-toggle"
              />
              <Label htmlFor="capex-toggle" className="cursor-pointer">CapEx Item</Label>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Work order details..."
                data-testid="input-wo-desc"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-wo"
            >
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editing ? "Save Changes" : "Create Work Order"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={(v) => { if (!v) { setDetailOpen(false); setSelectedWO(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Work Order Details</DialogTitle>
          </DialogHeader>
          {selectedWO && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="text-sm font-medium">{selectedWO.type}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className={getStatusColor(selectedWO.status)}>{selectedWO.status}</Badge>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Priority</p>
                  <p className="text-sm font-medium">{selectedWO.priority}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Cost</p>
                  <p className="text-sm font-medium">{formatCurrency(selectedWO.cost)}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Vendor</p>
                  <p className="text-sm font-medium">{vendors?.find(v => v.id === selectedWO.vendorId)?.name || "Unassigned"}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Asset</p>
                  <p className="text-sm font-medium">{assets?.find(a => a.id === selectedWO.assetId)?.name || "Unassigned"}</p>
                </div>
              </div>
              {selectedWO.description && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="text-sm">{selectedWO.description}</p>
                </div>
              )}
              <FieldMediaUploader workOrderId={selectedWO.id} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}