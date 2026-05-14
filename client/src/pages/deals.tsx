/**
 * CapitalOps Deals Pipeline Page
 * 
 * Purpose: Manages the capital raising deal pipeline with investor matching, funding tracking,
 * and allocation management for real estate development projects.
 * 
 * Approach:
 * - Comprehensive deal listing with filtering and view toggles (cards/list)
 * - Investor matching algorithm based on risk tolerance, check size, and asset preferences
 * - Circular progress indicators showing capital raised vs target
 * - Full CRUD operations for deal management
 * - Deal card and list views with different information density
 * 
 * Key Features:
 * - Deal pipeline visualization with funding progress
 * - Investor matching based on criteria (risk tolerance, check size, asset preference)
 * - Allocation viewing showing which investors have committed
 * - Toggle between card and list views for different use cases
 * - Stat cards showing total capital required, raised, and active deals
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Handshake, TrendingUp, Clock, Plus, Trash2, Pencil, Users, CheckCircle2, LayoutGrid, List, Building2, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DealCard } from "@/components/deal-card";
import { formatCurrency, getStatusColor } from "@/lib/formatters";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Deal, Project, Asset, Allocation, Investor } from "@shared/schema";

const emptyForm = {
  projectId: "", capitalRequired: "", capitalRaised: "0", returnProfile: "",
  duration: "", riskLevel: "Medium", complexity: "Moderate", phase: "", status: "Draft",
};

/**
 * Matches investors to deals based on multiple criteria
 * Filters investors by active status and checks:
 * 1. Check size alignment (deal falls within investor's min/max range)
 * 2. Risk tolerance compatibility
 * 3. Asset type preference matching
 * 
 * @param deal - Deal object to match investors to
 * @param investors - Array of all investors to filter
 * @param asset - Optional asset associated with the deal for more specific matching
 * @returns Array of matched investors that meet the criteria
 */
function getMatchedInvestors(deal: Deal, investors: Investor[], asset?: Asset): Investor[] {
  return investors.filter((inv) => {
    if (inv.status !== "Active") return false;
    
    // Check if deal capital falls within investor's check size range
    const withinCheck = deal.capitalRequired >= inv.checkSizeMin && deal.capitalRequired <= inv.checkSizeMax;
    
    // Risk tolerance matching logic
    const riskMatch =
      (inv.riskTolerance === "Conservative" && deal.riskLevel === "Low") ||
      (inv.riskTolerance === "Moderate" && (deal.riskLevel === "Low" || deal.riskLevel === "Medium")) ||
      inv.riskTolerance === "Aggressive";
    
    // Asset preference matching (bidirectional check)
    const assetMatch =
      !asset ||
      !inv.assetPreference ||
      inv.assetPreference.toLowerCase().includes(asset.assetType.toLowerCase()) ||
      asset.assetType.toLowerCase().includes(inv.assetPreference.toLowerCase());
    
    return (withinCheck || riskMatch) && assetMatch;
  });
}

/**
 * Main Deals page component
 * Handles all deal CRUD operations and displays deal pipeline dashboard
 */
export default function Deals() {
  const { data: deals, isLoading } = useQuery<Deal[]>({ queryKey: ["/api/deals"] });
  const { data: projects } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: assets } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { data: allocations } = useQuery<Allocation[]>({ queryKey: ["/api/allocations"] });
  const { data: investors } = useQuery<Investor[]>({ queryKey: ["/api/investors"] });
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: users } = useQuery({
    queryKey: ["/api/v1/auth/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/auth/users");
      return res.json();
    },
    enabled: user?.role === "sponsor_admin",
  });

  const sendReportMutation = useMutation({
    mutationFn: async ({ recipientId, dealId }: { recipientId: number; dealId: number }) => {
      const res = await apiRequest("POST", "/api/v1/reports/", {
        recipient_user_id: recipientId,
        deal_id: dealId,
        report_type: "deal_summary",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Report sent successfully" });
      setReportOpen(false);
      setReportRecipient("");
      setReportDeal(null);
    },
    onError: () => {
      toast({ title: "Failed to send report", variant: "destructive" });
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "cards">("cards");
  const [form, setForm] = useState(emptyForm);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportDeal, setReportDeal] = useState<Deal | null>(null);
  const [reportRecipient, setReportRecipient] = useState("");

  /**
   * Sets a field value in the form state
   * @param key - Form field key
   * @param value - New value for the field
   */
  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  /**
   * Opens dialog for creating new deal
   */
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  /**
   * Opens dialog for editing existing deal
   * @param deal - Deal object to edit
   */
  const openEdit = (deal: Deal) => {
    setEditing(deal);
    setForm({
      projectId: deal.projectId,
      capitalRequired: String(deal.capitalRequired),
      capitalRaised: String(deal.capitalRaised),
      returnProfile: deal.returnProfile,
      duration: deal.duration,
      riskLevel: deal.riskLevel,
      complexity: deal.complexity,
      phase: deal.phase,
      status: deal.status,
    });
    setOpen(true);
  };

  /**
   * Closes dialog and resets all form state
   */
  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  /**
   * Mutation for creating new deals
   * Invalidates queries after success to refresh data
   */
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/deals", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Deal created" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create deal", description: err.message, variant: "destructive" });
    },
  });

  /**
   * Mutation for updating existing deals
   * Invalidates queries after success to refresh data
   */
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/deals/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Deal updated" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update deal", description: err.message, variant: "destructive" });
    },
  });

  /**
   * Mutation for deleting deals
   * Invalidates queries after success to refresh data
   */
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/deals/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Deal deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  /**
   * Handles form submission for both create and edit operations
   * @param e - Form submit event
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      portfolioId: "port-001",
      capitalRequired: Number(form.capitalRequired) || 0,
      capitalRaised: Number(form.capitalRaised) || 0,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  /**
   * Toggles expanded state for matched investors display
   * @param dealId - ID of the deal whose investor matches to toggle
   */
  const toggleMatches = (dealId: string) => {
    setExpandedMatches(prev => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  };

  /**
   * Shows skeleton loader while data is loading
   */
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  /**
   * Calculates portfolio statistics
   */
  const totalRequired = deals?.reduce((sum, d) => sum + d.capitalRequired, 0) || 0;
  const totalRaised = deals?.reduce((sum, d) => sum + d.capitalRaised, 0) || 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Deal Pipeline"
        description="Capital distribution and deal management"
      >
        <div className="flex items-center gap-2">
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as "list" | "cards")}>
            <ToggleGroupItem value="cards" aria-label="Card view">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          {user && (
            <Button size="sm" onClick={openCreate} data-testid="button-new-deal">
              <Plus className="h-4 w-4 mr-1" /> New Deal
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Capital Required" value={formatCurrency(totalRequired)} icon={Handshake} testId="stat-total-required" />
        <StatCard
          title="Total Capital Raised"
          value={formatCurrency(totalRaised)}
          subtitle={`${totalRequired > 0 ? Math.round((totalRaised / totalRequired) * 100) : 0}% of target`}
          icon={TrendingUp}
          testId="stat-total-raised"
        />
        <StatCard title="Active Deals" value={deals?.filter(d => d.status === "Active").length || 0} icon={Handshake} testId="stat-active-deals" />
      </div>

      {viewMode === "cards" ? (
        /**
         * Card view: Shows deals in responsive grid with DealCard component
         * Each card shows funding progress, financial details, and matched investors
         */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {deals?.map((deal) => {
            const project = projects?.find(p => p.id === deal.projectId);
            const asset = project ? assets?.find(a => a.id === project.assetId) : undefined;
            const progress = deal.capitalRequired > 0 ? Math.round((deal.capitalRaised / deal.capitalRequired) * 100) : 0;
            const matched = investors ? getMatchedInvestors(deal, investors, asset) : [];
            return (
              <DealCard
                key={deal.id}
                deal={deal}
                project={project}
                asset={asset}
                matchedInvestors={matched}
                progress={progress}
                onView={() => openEdit(deal)}
                onInvest={() => openEdit(deal)}
                testId={`card-deal-${deal.id}`}
              />
            );
          })}
        </div>
      ) : (
        /**
         * List view: Shows detailed deal list with expanded allocation and investor matching
         * Each row shows full deal information, allocations, and matched investors section
         */
        <div className="space-y-4">
          {deals?.map((deal) => {
            const project = projects?.find(p => p.id === deal.projectId);
            const asset = project ? assets?.find(a => a.id === project.assetId) : undefined;
            const dealAllocations = allocations?.filter(a => a.dealId === deal.id) || [];
            const progress = deal.capitalRequired > 0 ? Math.round((deal.capitalRaised / deal.capitalRequired) * 100) : 0;
            const allocatedInvestorIds = new Set(dealAllocations.map(a => a.investorId));
            const matched = investors ? getMatchedInvestors(deal, investors, asset) : [];
            const unallocatedMatches = matched.filter(inv => !allocatedInvestorIds.has(inv.id));
            const showMatches = expandedMatches.has(deal.id);

            return (
              <Card key={deal.id} data-testid={`card-deal-${deal.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <Handshake className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{(deal as any).projectName || asset?.name || "Unknown"} — {deal.phase}</CardTitle>
                      <p className="text-xs text-muted-foreground">{asset?.location || ""}{asset?.location ? " | " : ""}{deal.returnProfile}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className={getStatusColor(deal.status)}>{deal.status}</Badge>
                    <Badge variant="secondary" className={getStatusColor(deal.riskLevel)}>{deal.riskLevel} Risk</Badge>
                    {user?.role === "sponsor_admin" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setReportDeal(deal); setReportOpen(true); }} aria-label="Send report" data-testid={`button-send-report-${deal.id}`}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(deal)} aria-label="Edit deal" data-testid={`button-edit-deal-${deal.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-delete-deal-${deal.id}`} aria-label="Delete deal">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this deal?</AlertDialogTitle>
                          <AlertDialogDescription>This will remove the deal and cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(deal.id)} data-testid="button-confirm-delete">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Required</p>
                      <p className="text-sm font-semibold">{formatCurrency(deal.capitalRequired)}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Raised</p>
                      <p className="text-sm font-semibold text-chart-2">{formatCurrency(deal.capitalRaised)}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</p>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <p className="text-sm font-medium">{deal.duration}</p>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Complexity</p>
                      <p className="text-sm font-medium">{deal.complexity}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Investors</p>
                      <p className="text-sm font-medium">{dealAllocations.length}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Capital Progress</span>
                      <span className="font-medium">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  {dealAllocations.length > 0 && (
                    <div className="pt-3 border-t border-border">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Allocations</p>
                      <div className="space-y-2">
                        {dealAllocations.map((alloc) => {
                          const investor = investors?.find(i => i.id === alloc.investorId);
                          return (
                            <div key={alloc.id} className="flex items-center justify-between gap-3 p-2 rounded-md bg-accent/30" data-testid={`deal-allocation-${alloc.id}`}>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{investor?.name || "Unknown"}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  Soft: {formatCurrency(alloc.softCommitAmount)} | Hard: {formatCurrency(alloc.hardCommitAmount)}
                                </p>
                              </div>
                              <Badge variant="secondary" className={getStatusColor(alloc.status)}>{alloc.status}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Matched Investors Section - Expandable */}
                  {deal.status !== "Closed" && deal.status !== "Funded" && (
                    <div className="pt-3 border-t border-border">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                        onClick={() => toggleMatches(deal.id)}
                        data-testid={`button-toggle-matches-${deal.id}`}
                      >
                        <Users className="h-3 w-3" />
                        {unallocatedMatches.length} Matched Investor{unallocatedMatches.length !== 1 ? "s" : ""} Available
                        <span className="text-primary">{showMatches ? "▲ Hide" : "▼ Show"}</span>
                      </button>
                      {showMatches && (
                        <div className="mt-2 space-y-2">
                          {unallocatedMatches.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No unallocated matching investors found.</p>
                          ) : (
                            unallocatedMatches.map((inv) => (
                              <div key={inv.id} className="flex items-center justify-between gap-3 p-2 rounded-md bg-chart-2/10 border border-chart-2/20" data-testid={`match-investor-${inv.id}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-chart-2 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{inv.name}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {formatCurrency(inv.checkSizeMin)}–{formatCurrency(inv.checkSizeMax)} | {inv.riskTolerance} | {inv.tierLevel}
                                    </p>
                                  </div>
                                </div>
                                <Badge variant="secondary" className={inv.tierLevel === "Tier 2" ? "bg-chart-4/15 text-chart-4" : "bg-accent text-accent-foreground"}>
                                  {inv.tierLevel}
                                </Badge>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Deal" : "Create New Deal"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={form.projectId} onValueChange={(v) => setField("projectId", v)}>
                <SelectTrigger data-testid="select-deal-project"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects?.map(p => {
                    const a = assets?.find(a => a.id === p.assetId);
                    return <SelectItem key={p.id} value={p.id}>{(p as any).assetName || a?.name || p.phase}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Capital Required</Label>
                <Input type="number" value={form.capitalRequired} onChange={(e) => setField("capitalRequired", e.target.value)} placeholder="0" data-testid="input-capital-req" required />
              </div>
              <div className="space-y-2">
                <Label>Capital Raised</Label>
                <Input type="number" value={form.capitalRaised} onChange={(e) => setField("capitalRaised", e.target.value)} placeholder="0" data-testid="input-capital-raised" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Return Profile</Label>
                <Input value={form.returnProfile} onChange={(e) => setField("returnProfile", e.target.value)} placeholder="e.g. 18–22% IRR" data-testid="input-return" required />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input value={form.duration} onChange={(e) => setField("duration", e.target.value)} placeholder="e.g. 36 months" data-testid="input-duration" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Risk Level</Label>
                <Select value={form.riskLevel} onValueChange={(v) => setField("riskLevel", v)}>
                  <SelectTrigger data-testid="select-risk"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Complexity</Label>
                <Select value={form.complexity} onValueChange={(v) => setField("complexity", v)}>
                  <SelectTrigger data-testid="select-complexity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Simple">Simple</SelectItem>
                    <SelectItem value="Moderate">Moderate</SelectItem>
                    <SelectItem value="Complex">Complex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phase</Label>
                <Input value={form.phase} onChange={(e) => setField("phase", e.target.value)} placeholder="e.g. Fundraising" data-testid="input-phase" required />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                  <SelectTrigger data-testid="select-deal-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Funded">Funded</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-deal">
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editing ? "Save Changes" : "Create Deal"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={(v) => { if (!v) { setReportOpen(false); setReportDeal(null); setReportRecipient(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Deal Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Recipient</Label>
              <Select value={reportRecipient} onValueChange={setReportRecipient}>
                <SelectTrigger><SelectValue placeholder="Choose a user" /></SelectTrigger>
                <SelectContent>
                  {(users?.users || []).map((u: { id: number; full_name: string; email: string }) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.full_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!reportRecipient || sendReportMutation.isPending}
              onClick={() => {
                if (reportDeal && reportRecipient) {
                  sendReportMutation.mutate({ recipientId: Number(reportRecipient), dealId: Number(reportDeal.id) });
                }
              }}
            >
              {sendReportMutation.isPending ? "Sending..." : "Send Report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
