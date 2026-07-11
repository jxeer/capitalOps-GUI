/**
 * CapitalOps Vendors Page
 * 
 * Purpose: Directory of pre-vetted service providers for real estate development,
 * including contractors, consultants, and other service vendors.
 * 
 * Key Features:
 * - Vendor directory with search and filtering
 * - Performance ratings and reviews
 * - Service type categorization
 * - Contact information and certifications
 * 
 * Related Backend Routes:
 * - GET /api/vendors - List vendors
 * - POST /api/vendors - Create vendor
 * - PUT /api/vendors/:id - Update vendor
 * - DELETE /api/vendors/:id - Delete vendor
 */

import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Truck, Shield, Star, Plus, Trash2, Pencil, CheckCircle2, XCircle, Clock, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { getStatusColor } from "@/lib/formatters";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Vendor, Asset, WorkOrder } from "@shared/schema";

const emptyForm = { assetId: "", name: "", type: "", coiStatus: "Current", slaType: "", performanceScore: "85" };

function PerformanceGauge({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 90 ? "hsl(var(--chart-2))" : score >= 75 ? "hsl(var(--chart-3))" : "hsl(var(--destructive))";
  const textColor = score >= 90 ? "text-chart-2" : score >= 75 ? "text-chart-3" : "text-destructive";
  const label = score >= 90 ? "Excellent" : score >= 75 ? "Good" : "At Risk";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg width="88" height="88" className="transform -rotate-90">
          <circle cx="44" cy="44" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" opacity="0.4" />
          <circle
            cx="44" cy="44" r={radius} fill="none"
            stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xl font-bold ${textColor}`}>{score}</span>
          <span className="text-[8px] text-muted-foreground uppercase tracking-wide">/100</span>
        </div>
      </div>
      <span className={`text-[10px] font-semibold ${textColor}`}>{label}</span>
    </div>
  );
}

function CoiIcon({ status }: { status: string }) {
  if (status === "Current") return <CheckCircle2 className="h-3.5 w-3.5 text-chart-2" />;
  if (status === "Expired") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <Clock className="h-3.5 w-3.5 text-chart-3" />;
}

export default function Vendors() {
  const { data: vendors, isLoading } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"] });
  const { data: assets } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { data: workOrders } = useQuery<WorkOrder[]>({ queryKey: ["/api/work-orders"] });
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);

  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (v: Vendor) => {
    setEditing(v);
    setForm({ assetId: v.assetId, name: v.name, type: v.type, coiStatus: v.coiStatus, slaType: v.slaType, performanceScore: String(v.performanceScore) });
    setOpen(true);
  };

  // Deep-link support: /vendors?open=<id> (used by chat attachment cards)
  const search = useSearch();
  const [, navigate] = useLocation();

  /**
   * Open a single vendor by id when arriving with ?open=<id>.
   *
   * Fetched directly by id and opened from the FETCHED object — a record
   * shared with the current user is NOT in their portfolio-scoped
   * ["/api/vendors"] list; only the by-id endpoint is share-aware. 404
   * (never shared / revoked) shows a toast. The param is cleared with a
   * history replace so refresh/close doesn't re-trigger. Same pattern as
   * assets.tsx.
   */
  useEffect(() => {
    const openId = new URLSearchParams(search).get("open");
    if (!openId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/vendors/${openId}`);
        const vendor: Vendor = await res.json();
        if (!cancelled) openEdit(vendor);
      } catch {
        if (!cancelled) toast({ title: "This record isn't available to you", variant: "destructive" });
      } finally {
        if (!cancelled) navigate("/vendors", { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [search]);
  const closeDialog = () => { setOpen(false); setEditing(null); setForm(emptyForm); };

  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/vendors", data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vendors"] }); toast({ title: "Vendor created" }); closeDialog(); },
    onError: (err: Error) => { toast({ title: "Failed to create vendor", description: err.message, variant: "destructive" }); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => { const res = await apiRequest("PUT", `/api/vendors/${id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vendors"] }); toast({ title: "Vendor updated" }); closeDialog(); },
    onError: (err: Error) => { toast({ title: "Failed to update vendor", description: err.message, variant: "destructive" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/vendors/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vendors"] }); toast({ title: "Vendor deleted" }); },
    onError: (err: Error) => { toast({ title: "Failed to delete", description: err.message, variant: "destructive" }); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, performanceScore: Number(form.performanceScore) || 0 };
    if (editing) { updateMutation.mutate({ id: editing.id, data: payload }); } else { createMutation.mutate(payload); }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-52" />)}
        </div>
      </div>
    );
  }

  const currentCOI = vendors?.filter(v => v.coiStatus === "Current").length || 0;
  const avgScore = vendors?.length
    ? Math.round(vendors.reduce((sum, v) => sum + v.performanceScore, 0) / vendors.length)
    : 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Vendors" description="Vendor management and performance tracking">
        {user && (
          <Button size="sm" onClick={openCreate} data-testid="button-new-vendor">
            <Plus className="h-4 w-4 mr-1" /> New Vendor
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Vendors" value={vendors?.length || 0} icon={Truck} testId="stat-total-vendors" />
        <StatCard title="COI Current" value={currentCOI} icon={Shield} variant="success" testId="stat-coi-current" />
        <StatCard title="Avg Performance" value={`${avgScore}/100`} icon={Star} variant={avgScore >= 85 ? "success" : avgScore >= 70 ? "warning" : "danger"} testId="stat-avg-score" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {vendors?.map((vendor) => {
          const asset = assets?.find(a => a.id === vendor.assetId);
          const vendorWOs = workOrders?.filter(w => w.vendorId === vendor.id) || [];
          const openWOs = vendorWOs.filter(w => w.status === "Open" || w.status === "In Progress").length;
          const completedWOs = vendorWOs.filter(w => w.status === "Completed").length;

          return (
            <Card key={vendor.id} className="group hover:shadow-xl transition-all duration-300 hover:scale-[1.01] overflow-hidden" data-testid={`card-vendor-${vendor.id}`}>
              <CardContent className="p-0">
                {/* Card header section */}
                <div className="p-5 flex items-start gap-4">
                  {/* Performance gauge */}
                  <PerformanceGauge score={vendor.performanceScore} />

                  {/* Vendor info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold truncate" data-testid={`text-vendor-name-${vendor.id}`}>{vendor.name}</h3>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10">
                            <Wrench className="h-3 w-3 text-primary" />
                          </div>
                          <p className="text-xs text-muted-foreground">{vendor.type}</p>
                        </div>
                      </div>
                      {user && (
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(vendor)} aria-label="Edit vendor" data-testid={`button-edit-vendor-${vendor.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-delete-vendor-${vendor.id}`} aria-label="Delete vendor">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {vendor.name}?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(vendor.id)} data-testid="button-confirm-delete">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </div>

                    {/* COI status */}
                    <div className="flex items-center gap-1.5 mt-2 p-2 rounded-lg bg-accent/40">
                      <CoiIcon status={vendor.coiStatus} />
                      <span className="text-xs font-medium">COI: {vendor.coiStatus}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{vendor.slaType}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom stats strip */}
                <div className="border-t border-border/50 grid grid-cols-3 divide-x divide-border/50">
                  <div className="p-3 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Asset</p>
                    <p className="text-xs font-semibold mt-0.5 truncate px-1">{asset?.name?.split(" ")[0] || "—"}</p>
                  </div>
                  <div className="p-3 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Open WOs</p>
                    <p className={`text-xs font-semibold mt-0.5 ${openWOs > 0 ? "text-chart-3" : "text-muted-foreground"}`}>{openWOs}</p>
                  </div>
                  <div className="p-3 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Completed</p>
                    <p className="text-xs font-semibold mt-0.5 text-chart-2">{completedWOs}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Vendor name" data-testid="input-vendor-name" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Input value={form.type} onChange={(e) => setField("type", e.target.value)} placeholder="e.g. General Contractor" data-testid="input-vendor-type" required />
              </div>
              <div className="space-y-2">
                <Label>Asset</Label>
                <Select value={form.assetId} onValueChange={(v) => setField("assetId", v)}>
                  <SelectTrigger data-testid="select-vendor-asset"><SelectValue placeholder="Select asset" /></SelectTrigger>
                  <SelectContent>
                    {assets?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>COI Status</Label>
                <Select value={form.coiStatus} onValueChange={(v) => setField("coiStatus", v)}>
                  <SelectTrigger data-testid="select-coi"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Current">Current</SelectItem>
                    <SelectItem value="Expired">Expired</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>SLA Type</Label>
                <Input value={form.slaType} onChange={(e) => setField("slaType", e.target.value)} placeholder="e.g. Fixed Price" data-testid="input-sla" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Performance Score (0–100)</Label>
              <Input type="number" min="0" max="100" value={form.performanceScore} onChange={(e) => setField("performanceScore", e.target.value)} data-testid="input-perf-score" required />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-vendor">
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editing ? "Save Changes" : "Add Vendor"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
