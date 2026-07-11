/**
 * CapitalOps Assets Management Page
 * 
 * Purpose: Provides comprehensive asset portfolio management interface for viewing,
 * creating, editing, and deleting real estate assets with media gallery and location mapping.
 * 
 * Approach: 
 * - Uses TanStack Query for data fetching and caching with automatic refetching
 * - Implements dialog forms for create/edit operations with validation
 * - Integrates MediaGallery and AssetLocationMap components for rich asset data
 * - Provides stat cards showing portfolio summary metrics
 * - Follows consistent CRUD patterns with mutation invalidation
 * 
 * Key Features:
 * - Asset listing with type-based visual differentiation
 * - Status badges (Active, Stabilized, Pre-dev)
 * - Stat cards showing total assets, active count, stabilized count, and total square footage
 * - Image/video upload with media gallery preview
 * - Google Maps integration via OpenStreetMap iframe
 * - Full CRUD operations with confirmation dialogs
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Building2, MapPin, Maximize2, Plus, Trash2, Pencil, Layers, Home, Briefcase, ShoppingBag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { MediaGallery } from "@/components/media-gallery";
import { AssetLocationMap } from "@/components/asset-location-map";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { getStatusColor, formatNumber } from "@/lib/formatters";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Asset } from "@shared/schema";

const emptyForm = {
  name: "", location: "", assetType: "", squareFootage: "", status: "Active", assetManager: "",
};

/**
 * Maps asset types to corresponding icons and color themes for visual differentiation
 * 
 * @param type - Asset type string (e.g., "Mixed-Use", "Multi-Family", "Office")
 * @returns Object with icon component, gradient CSS classes, and color classes
 * 
 * @examples
 * getAssetMeta("Mixed-Use") -> { icon: Layers, gradient: "...", iconBg: "...", iconColor: "..." }
 * getAssetMeta("Multi-Family") -> { icon: Home, gradient: "...", iconBg: "...", iconColor: "..." }
 */
function getAssetMeta(type: string): { icon: typeof Building2; gradient: string; iconBg: string; iconColor: string } {
  const t = type.toLowerCase();
  if (t.includes("mixed")) return { icon: Layers, gradient: "from-chart-1/20 to-chart-4/10", iconBg: "bg-chart-1/15", iconColor: "text-chart-1" };
  if (t.includes("multi") || t.includes("resid")) return { icon: Home, gradient: "from-chart-2/20 to-chart-1/10", iconBg: "bg-chart-2/15", iconColor: "text-chart-2" };
  if (t.includes("office") || t.includes("comm")) return { icon: Briefcase, gradient: "from-chart-4/20 to-chart-1/10", iconBg: "bg-chart-4/15", iconColor: "text-chart-4" };
  if (t.includes("retail")) return { icon: ShoppingBag, gradient: "from-chart-3/20 to-chart-1/10", iconBg: "bg-chart-3/15", iconColor: "text-chart-3" };
  return { icon: Building2, gradient: "from-primary/20 to-primary/5", iconBg: "bg-primary/10", iconColor: "text-primary" };
}

/**
 * Returns color class for status dot indicator
 * 
 * @param status - Asset status string
 * @returns Tailwind CSS color class for the status dot
 */
function getStatusDot(status: string) {
  if (status === "Active") return "bg-chart-2";
  if (status === "Stabilized") return "bg-chart-1";
  if (status === "Pre-dev") return "bg-chart-3";
  return "bg-muted-foreground";
}

/**
 * Main Assets page component
 * Handles all asset CRUD operations and displays asset portfolio dashboard
 */
export default function Assets() {
  const { data: assets, isLoading } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [location, setLocation] = useState<{ address: string; lat: number; lng: number } | undefined>(undefined);
  const [mediaPreviews, setMediaPreviews] = useState<{ url: string; type: "image" | "video"; name: string }[]>([]);

  /**
   * Sets a field value in the form state
   * @param key - Form field key
   * @param value - New value for the field
   */
  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  
  /**
   * Opens dialog for creating new asset
   * Resets form state and clears any existing data
   */
  const openCreate = () => { setEditing(null); setForm(emptyForm); setLocation(undefined); setMediaPreviews([]); setOpen(true); };
  
  /**
   * Opens dialog for editing existing asset
   * @param asset - Asset object to edit
   */
  const openEdit = (asset: Asset) => {
    setEditing(asset);
    setForm({ name: asset.name, location: asset.location, assetType: asset.assetType, squareFootage: String(asset.squareFootage), status: asset.status, assetManager: asset.assetManager });
    setLocation(asset.location ? { address: asset.location, lat: 0, lng: 0 } : undefined);
    setMediaPreviews(asset.media || []);
    setOpen(true);
  };
  
  /**
   * Closes dialog and resets all form state
   */
  const closeDialog = () => { setOpen(false); setEditing(null); setForm(emptyForm); setLocation(undefined); setMediaPreviews([]); };

  // Deep-link support: /assets?open=<id> (used by chat attachment cards).
  // wouter's navigate is aliased — this page already has setLocation state
  // for the map location field.
  const search = useSearch();
  const [, navigate] = useLocation();

  /**
   * Open a single asset by id when arriving with ?open=<id>.
   *
   * The asset is fetched directly by id and the dialog opened from the
   * FETCHED object — deliberately NOT looked up in the ["/api/assets"]
   * list, because a record shared with the current user is not in their
   * portfolio-scoped list; only the by-id endpoint is share-aware.
   * A 404 (never shared, or share revoked) shows a toast instead.
   * The param is cleared afterwards (replace, no history entry) so
   * closing the dialog or refreshing doesn't re-trigger the open.
   */
  useEffect(() => {
    const openId = new URLSearchParams(search).get("open");
    if (!openId) return;
    // Guard against React strict-mode double-invocation / unmount races
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/assets/${openId}`);
        const asset: Asset = await res.json();
        if (!cancelled) openEdit(asset);
      } catch {
        // apiRequest throws on non-ok — for this endpoint that means the
        // record doesn't exist or isn't shared with this user (404)
        if (!cancelled) toast({ title: "This record isn't available to you", variant: "destructive" });
      } finally {
        if (!cancelled) navigate("/assets", { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [search]);

  /**
   * Mutation for creating new assets
   * Invalidates queries after success to refresh data
   */
  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/assets", data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] }); toast({ title: "Asset created" }); closeDialog(); },
    onError: (err: Error) => { toast({ title: "Failed to create asset", description: err.message, variant: "destructive" }); },
  });

  /**
   * Mutation for updating existing assets
   * Invalidates queries after success to refresh data
   */
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => { const res = await apiRequest("PUT", `/api/assets/${id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] }); toast({ title: "Asset updated" }); closeDialog(); },
    onError: (err: Error) => { toast({ title: "Failed to update asset", description: err.message, variant: "destructive" }); },
  });

  /**
   * Mutation for deleting assets
   * Invalidates queries after success to refresh data
   */
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/assets/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] }); toast({ title: "Asset deleted" }); },
    onError: (err: Error) => { toast({ title: "Failed to delete asset", description: err.message, variant: "destructive" }); },
  });

  /**
   * Handles form submission for both create and edit operations
   * @param e - Form submit event
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, squareFootage: Number(form.squareFootage) || 0, location: typeof location === "object" && location !== null ? (location as any).address || (location as any).formatted_address || String(location) : location || undefined, media: mediaPreviews };
    if (editing) { updateMutation.mutate({ id: editing.id, data: payload }); } else { createMutation.mutate(payload); }
  };

  /**
   * Handles media upload from file input
   * Uploads files to backend and stores permanent URLs
   * @param files - FileList from input element
   */
  const handleMediaUpload = async (files: FileList) => {
    const { uploadToS3 } = await import("@/lib/s3");
    const newPreviews: { url: string; type: "image" | "video"; name: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
      try {
        const { url } = await uploadToS3(file);
        const type = file.type.startsWith("image/") ? "image" : "video";
        newPreviews.push({ url, type, name: file.name });
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
    setMediaPreviews((prev) => [...prev, ...newPreviews]);
  };

  /**
   * Removes media from preview list
   * @param urlToRemove - URL to remove from previews
   */
  const handleRemoveMedia = (urlToRemove: string) => {
    setMediaPreviews((prev) => prev.filter((p) => p.url !== urlToRemove));
  };

  /**
   * Shows skeleton loader while data is loading
   */
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

  /**
   * Calculates portfolio statistics for stat cards
   */
  const active = assets?.filter(a => a.status === "Active").length || 0;
  const stabilized = assets?.filter(a => a.status === "Stabilized").length || 0;
  const totalSqFt = assets?.reduce((sum, a) => sum + a.squareFootage, 0) || 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Assets" description="Portfolio asset management and property overview">
        {user && (
          <Button size="sm" onClick={openCreate} data-testid="button-new-asset">
            <Plus className="h-4 w-4 mr-1" /> New Asset
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Assets" value={assets?.length || 0} icon={Building2} testId="stat-total-assets" />
        <StatCard title="Active" value={active} icon={Building2} variant="success" testId="stat-active-assets" />
        <StatCard title="Stabilized" value={stabilized} icon={Building2} variant="highlight" testId="stat-stabilized-assets" />
        <StatCard title="Total Sq Ft" value={`${formatNumber(totalSqFt)} SF`} icon={Maximize2} testId="stat-total-sqft" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {assets?.map((asset) => {
          const meta = getAssetMeta(asset.assetType);
          const AssetIcon = meta.icon;
          return (
            <Card key={asset.id} className="group hover:shadow-xl transition-all duration-300 hover:scale-[1.01] overflow-hidden" data-testid={`card-asset-${asset.id}`}>
              <div className={`bg-gradient-to-r ${meta.gradient} px-5 pt-5 pb-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.iconBg} ring-1 ring-white/10`}>
                      <AssetIcon className={`h-5 w-5 ${meta.iconColor}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold truncate" data-testid={`text-asset-name-${asset.id}`}>{asset.name}</h3>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{asset.location}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`h-2 w-2 rounded-full ${getStatusDot(asset.status)}`} />
                    <Badge variant="secondary" className={`${getStatusColor(asset.status)} text-[10px]`}>
                      {asset.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <CardContent className="p-5 pt-4 space-y-4">
                {asset.media && asset.media.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {asset.media.slice(0, 4).map((media, idx) => (
                      <img
                        key={idx}
                        src={media.url}
                        alt={media.name || "Asset photo"}
                        className="h-16 w-16 object-cover rounded-lg shrink-0"
                      />
                    ))}
                    {asset.media.length > 4 && (
                      <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0 text-xs text-muted-foreground">
                        +{asset.media.length - 4}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-2.5 rounded-lg bg-accent/40 space-y-0.5 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Type</p>
                    <p className="text-xs font-semibold leading-tight">{asset.assetType}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-accent/40 space-y-0.5 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Sq Ft</p>
                    <div className="flex items-center justify-center gap-0.5">
                      <Maximize2 className="h-2.5 w-2.5 text-muted-foreground" />
                      <p className="text-xs font-semibold">{formatNumber(asset.squareFootage)}</p>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-accent/40 space-y-0.5 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Manager</p>
                    <p className="text-xs font-semibold leading-tight truncate">{asset.assetManager.split(" ")[0]}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    Managed by <span className="text-foreground font-medium">{asset.assetManager}</span>
                  </p>
                  {user && (
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEdit(asset)} aria-label="Edit asset" data-testid={`button-edit-asset-${asset.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-delete-asset-${asset.id}`} aria-label="Delete asset">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {asset.name}?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(asset.id)} data-testid="button-confirm-delete">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Asset" : "Create New Asset"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Asset name" data-testid="input-asset-name" required />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => setField("location", e.target.value)} placeholder="City, State" data-testid="input-asset-location" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Asset Type</Label>
                <Input value={form.assetType} onChange={(e) => setField("assetType", e.target.value)} placeholder="e.g. Mixed-Use" data-testid="input-asset-type" required />
              </div>
              <div className="space-y-2">
                <Label>Square Footage</Label>
                <Input type="number" value={form.squareFootage} onChange={(e) => setField("squareFootage", e.target.value)} placeholder="0" data-testid="input-asset-sqft" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                  <SelectTrigger data-testid="select-asset-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pre-dev">Pre-dev</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Stabilized">Stabilized</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Asset Manager</Label>
                <Input value={form.assetManager} onChange={(e) => setField("assetManager", e.target.value)} placeholder="Manager name" data-testid="input-asset-manager" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Media Gallery</Label>
              <MediaGallery initialMedia={mediaPreviews} onUpload={handleMediaUpload} onRemove={handleRemoveMedia} />
            </div>
            <div className="space-y-2">
              <Label>Asset Location</Label>
              <AssetLocationMap initialLocation={location} onChange={setLocation} />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-asset">
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editing ? "Save Changes" : "Create Asset"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
