/**
 * CapitalOps Projects Page
 * 
 * Purpose: Manages real estate development projects throughout their lifecycle,
 * tracking milestones, budgets, timelines, and execution progress.
 * 
 * Approach:
 * - Visual project cards with progress indicators for budget and milestone completion
 * - Risk flag detection based on milestone delays
 * - Date-based urgency indicators (overdue, approaching deadline)
 * - Full CRUD operations with media and location integration
 * 
 * Key Features:
 * - Project status visualization with color-coded status bars
 * - Budget burn tracking with progress bars
 * - Milestone progress overview
 * - Days remaining countdown with urgency indicators
 * - Media gallery and location mapping for each project
 * - Risk flag detection based on milestone delays
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FolderKanban, Calendar, User, AlertTriangle, Plus, Trash2, Pencil, TrendingUp, Clock, CheckCircle2, ChevronDown, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { MediaGallery } from "@/components/media-gallery";
import { ImageLightbox } from "@/components/image-lightbox";
import { AssetLocationMap } from "@/components/asset-location-map";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { FieldMediaUploader } from "@/components/FieldMediaUploader";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/formatters";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Project, Asset, Milestone } from "@shared/schema";

const emptyForm = {
  assetId: "", phase: "", startDate: "", targetCompletion: "",
  budgetTotal: "", budgetActual: "0", status: "Planning", pmAssigned: "",
  description: "",
};

/**
 * Returns gradient CSS classes for project status bar based on status value
 * @param status - Project status string
 * @returns Tailwind gradient class string
 */
function getStatusStrip(status: string) {
  const s = status.toLowerCase();
  if (s === "in progress" || s === "on track") return "from-chart-2/30 to-chart-2/5";
  if (s === "planning") return "from-chart-3/30 to-chart-3/5";
  if (s === "at risk" || s === "delayed") return "from-destructive/30 to-destructive/5";
  if (s === "on hold") return "from-muted/50 to-muted/10";
  if (s === "complete" || s === "completed") return "from-chart-1/30 to-chart-1/5";
  return "from-primary/20 to-primary/5";
}

/**
 * Calculates days remaining until target completion date
 * Determines urgency and overdue status
 * 
 * @param targetDate - Target completion date string (ISO)
 * @returns Object with days count, urgent flag, and overdue flag
 * 
 * @example
 * getDaysRemaining("2026-06-15") -> { days: 90, urgent: true, overdue: false }
 * getDaysRemaining("2026-01-01") -> { days: -45, urgent: false, overdue: true }
 */
function getDaysRemaining(targetDate: string): { days: number; urgent: boolean; overdue: boolean } {
  const now = new Date();
  const target = new Date(targetDate);
  const days = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return { days, urgent: days < 60 && days >= 0, overdue: days < 0 };
}

/**
 * Main Projects page component
 * Handles all project CRUD operations and displays project portfolio
 */
export default function Projects() {
  const { data: projects, isLoading } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: assets } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { data: milestones } = useQuery<Milestone[]>({ queryKey: ["/api/milestones"] });
  const { user } = useAuth();

  const { data: users } = useQuery({
    queryKey: ["/api/v1/auth/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/auth/users");
      return res.json();
    },
    enabled: user?.role === "sponsor_admin",
  });

  const sendReportMutation = useMutation({
    mutationFn: async ({ recipientId, projectId }: { recipientId: number; projectId: number }) => {
      const res = await apiRequest("POST", "/api/v1/reports/", {
        recipient_user_id: recipientId,
        project_id: projectId,
        report_type: "project_summary",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Report sent successfully" });
      setReportOpen(false);
      setReportRecipient("");
    },
    onError: () => {
      toast({ title: "Failed to send report", variant: "destructive" });
    },
  });
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [location, setLocation] = useState<{ address: string; lat: number; lng: number } | undefined>(undefined);
  const [mediaPreviews, setMediaPreviews] = useState<{ url: string; type: "image" | "video"; name: string }[]>([]);
  const [lightboxImages, setLightboxImages] = useState<{ url: string; type: "image" | "video"; name: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportRecipient, setReportRecipient] = useState("");
  const [lightboxOpen, setLightboxOpen] = useState(false);

  /**
   * Sets a field value in the form state
   * @param key - Form field key
   * @param value - New value for the field
   */
  const setField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  
  /**
   * Opens dialog for creating new project
   */
  const openCreate = () => { setEditing(null); setForm(emptyForm); setLocation(undefined); setMediaPreviews([]); setOpen(true); };
  
  /**
   * Opens dialog for editing existing project
   * @param project - Project object to edit
   */
  const openEdit = (project: Project) => {
    setEditing(project);
    setForm({ assetId: project.assetId, phase: project.phase, startDate: project.startDate, targetCompletion: project.targetCompletion, budgetTotal: String(project.budgetTotal), budgetActual: String(project.budgetActual), status: project.status, pmAssigned: project.pmAssigned, description: project.description || "" });
    setLocation(undefined);
    setMediaPreviews(project.media || []);
    setOpen(true);
  };
  
  /**
   * Closes dialog and resets all form state
   */
  const closeDialog = () => { setOpen(false); setEditing(null); setForm(emptyForm); setLocation(undefined); setMediaPreviews([]); };

  /**
   * Mutation for creating new projects
   * Invalidates queries after success to refresh data
   */
  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/projects", data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] }); toast({ title: "Project created" }); closeDialog(); },
    onError: (err: Error) => { toast({ title: "Failed to create project", description: err.message, variant: "destructive" }); },
  });

  /**
   * Mutation for updating existing projects
   * Invalidates queries after success to refresh data
   */
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => { const res = await apiRequest("PUT", `/api/projects/${id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] }); toast({ title: "Project updated" }); closeDialog(); },
    onError: (err: Error) => { toast({ title: "Failed to update project", description: err.message, variant: "destructive" }); },
  });

  /**
   * Mutation for deleting projects
   * Invalidates queries after success to refresh data
   */
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/projects/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] }); toast({ title: "Project deleted" }); },
    onError: (err: Error) => { toast({ title: "Failed to delete", description: err.message, variant: "destructive" }); },
  });

  /**
   * Handles form submission for both create and edit operations
   * @param e - Form submit event
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, portfolioId: 1, budgetTotal: Number(form.budgetTotal) || 0, budgetActual: Number(form.budgetActual) || 0, location: location || undefined, media: mediaPreviews };
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
        <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      </div>
    );
  }

  /**
   * Calculates portfolio statistics
   */
  const activeProjects = projects?.filter(p => ["In Progress", "On Track", "At Risk"].includes(p.status)).length || 0;
  const totalBudget = projects?.reduce((sum, p) => sum + p.budgetTotal, 0) || 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Projects" description="Active development projects and execution tracking">
        {user && (
          <Button size="sm" onClick={openCreate} data-testid="button-new-project">
            <Plus className="h-4 w-4 mr-1" /> New Project
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Projects" value={projects?.length || 0} icon={FolderKanban} testId="stat-total-projects" />
        <StatCard title="Active" value={activeProjects} icon={TrendingUp} variant="success" testId="stat-active-projects" />
        <StatCard title="Total Budget" value={formatCurrency(totalBudget)} icon={FolderKanban} variant="highlight" testId="stat-total-budget" />
      </div>

      <div className="space-y-4">
        {projects?.map((project) => {
          const asset = assets?.find(a => a.id === project.assetId);
          const projectMilestones = milestones?.filter(m => m.projectId === project.id) || [];
          const completedMilestones = projectMilestones.filter(m => m.status === "Completed" || m.status === "Complete").length;
          const milestoneProgress = projectMilestones.length > 0 ? Math.round((completedMilestones / projectMilestones.length) * 100) : 0;
          const budgetProgress = project.budgetTotal > 0 ? Math.round((project.budgetActual / project.budgetTotal) * 100) : 0;
          const riskMilestones = projectMilestones.filter(m => m.riskFlag);
          const { days, urgent, overdue } = getDaysRemaining(project.targetCompletion);
          const strip = getStatusStrip(project.status);

          return (
            <Card key={project.id} className="group hover:shadow-xl transition-all duration-300 overflow-hidden" data-testid={`card-project-${project.id}`}>
              <div className={`bg-gradient-to-r ${strip} p-5 pb-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 dark:bg-black/20 backdrop-blur-sm ring-1 ring-white/10">
                      <FolderKanban className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold truncate">{(project as any).assetName || asset?.name || "Unknown Asset"}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] bg-white/30 dark:bg-black/20 backdrop-blur-sm border-0">{project.phase}</Badge>
                        {asset?.location && <span className="text-xs text-muted-foreground">{asset.location}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setSelectedProject(project); setDetailOpen(true); }} aria-label="View details">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Badge variant="secondary" className={getStatusColor(project.status)}>{project.status}</Badge>
                    {user && (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEdit(project)} data-testid={`button-edit-project-${project.id}`} aria-label="Edit project">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-delete-project-${project.id}`} aria-label="Delete project">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(project.id)} data-testid="button-confirm-delete">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <CardContent className="p-5 space-y-4">
                {project.description && (
                  <div className="p-3 bg-muted/30 rounded-lg text-sm">
                    <p className="text-muted-foreground mb-1">Description</p>
                    <p className="text-foreground">{project.description}</p>
                  </div>
                )}

                {project.media && project.media.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Photos</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {project.media.slice(0, 4).map((media, idx) => (
                        <button
                          key={idx}
                          onClick={() => { setLightboxImages(project.media); setLightboxIndex(idx); setLightboxOpen(true); }}
                          className="shrink-0"
                        >
                          <img
                            src={media.url}
                            alt={media.name || "Project photo"}
                            className="h-16 w-16 object-cover rounded-lg hover:opacity-80 transition-opacity cursor-pointer"
                          />
                        </button>
                      ))}
                      {project.media.length > 4 && (
                        <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0 text-xs text-muted-foreground">
                          +{project.media.length - 4}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-2.5 rounded-lg bg-accent/40 space-y-0.5">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Spent</p>
                    <p className="text-sm font-bold">{formatCurrency(project.budgetActual)}</p>
                    <p className="text-[9px] text-muted-foreground">of {formatCurrency(project.budgetTotal)}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-accent/40 space-y-0.5">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Target</p>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                      <p className="text-xs font-semibold truncate">{formatDate(project.targetCompletion)}</p>
                    </div>
                    <p className={`text-[9px] font-medium ${overdue ? "text-destructive" : urgent ? "text-chart-3" : "text-chart-2"}`}>
                      {overdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-accent/40 space-y-0.5">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">PM</p>
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3 text-muted-foreground shrink-0" />
                      <p className="text-xs font-semibold truncate">{project.pmAssigned}</p>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-accent/40 space-y-0.5">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Risk Flags</p>
                    <div className="flex items-center gap-1">
                      <AlertTriangle className={`h-3 w-3 shrink-0 ${riskMilestones.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                      <p className={`text-sm font-bold ${riskMilestones.length > 0 ? "text-destructive" : ""}`}>{riskMilestones.length}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Budget Used</span>
                      <span className={`font-semibold ${budgetProgress > 90 ? "text-destructive" : budgetProgress > 75 ? "text-chart-3" : "text-foreground"}`}>{budgetProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${budgetProgress > 90 ? "bg-destructive" : budgetProgress > 75 ? "bg-chart-3" : "bg-chart-2"}`}
                        style={{ width: `${Math.min(budgetProgress, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Milestones ({completedMilestones}/{projectMilestones.length})</span>
                      <span className="font-semibold">{milestoneProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-chart-1 transition-all duration-700"
                        style={{ width: `${milestoneProgress}%` }}
                      />
                    </div>
                  </div>
                </div>

                {projectMilestones.length > 0 && (
                  <div className="pt-3 border-t border-border/50">
                    <div className="flex flex-wrap gap-1.5">
                      {projectMilestones.slice(0, 6).map((ms) => (
                        <Badge key={ms.id} variant="secondary" className={`text-[10px] ${getStatusColor(ms.status)}`}>
                          {ms.riskFlag && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                          {ms.name}
                        </Badge>
                      ))}
                      {projectMilestones.length > 6 && (
                        <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">+{projectMilestones.length - 6} more</Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Project" : "Create New Project"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Asset</Label>
              <Select value={form.assetId} onValueChange={(v) => setField("assetId", v)}>
                <SelectTrigger data-testid="select-project-asset"><SelectValue placeholder="Select asset" /></SelectTrigger>
                <SelectContent>{assets?.map(a => <SelectItem key={a.id} value={a.id}>{a.name} — {a.location}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Phase</Label>
              <Input value={form.phase} onChange={(e) => setField("phase", e.target.value)} placeholder="e.g. Construction" data-testid="input-project-phase" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setField("startDate", e.target.value)} data-testid="input-project-start" required />
              </div>
              <div className="space-y-2">
                <Label>Target Completion</Label>
                <Input type="date" value={form.targetCompletion} onChange={(e) => setField("targetCompletion", e.target.value)} data-testid="input-project-target" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total Budget</Label>
                <Input type="number" value={form.budgetTotal} onChange={(e) => setField("budgetTotal", e.target.value)} placeholder="0" data-testid="input-budget-total" required />
              </div>
              <div className="space-y-2">
                <Label>Actual Spend</Label>
                <Input type="number" value={form.budgetActual} onChange={(e) => setField("budgetActual", e.target.value)} placeholder="0" data-testid="input-budget-actual" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                  <SelectTrigger data-testid="select-project-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planning">Planning</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="On Track">On Track</SelectItem>
                    <SelectItem value="At Risk">At Risk</SelectItem>
                    <SelectItem value="On Hold">On Hold</SelectItem>
                    <SelectItem value="Complete">Complete</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>PM Assigned</Label>
                <Input value={form.pmAssigned} onChange={(e) => setField("pmAssigned", e.target.value)} placeholder="Name" data-testid="input-pm-assigned" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="Project description..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Media Gallery</Label>
              <MediaGallery initialMedia={mediaPreviews} onUpload={handleMediaUpload} onRemove={handleRemoveMedia} />
            </div>
            <div className="space-y-2">
              <Label>Asset Location</Label>
              <AssetLocationMap initialLocation={location} onChange={setLocation} />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-project">
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editing ? "Save Changes" : "Create Project"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />

      <Dialog open={detailOpen} onOpenChange={(v) => { if (!v) { setDetailOpen(false); setSelectedProject(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Project Details</DialogTitle>
          </DialogHeader>
          {selectedProject && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Phase</p>
                  <p className="text-sm font-medium">{selectedProject.phase}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className={getStatusColor(selectedProject.status)}>{selectedProject.status}</Badge>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">PM Assigned</p>
                  <p className="text-sm font-medium">{selectedProject.pmAssigned || "Unassigned"}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Budget</p>
                  <p className="text-sm font-medium">{formatCurrency(selectedProject.budgetTotal)}</p>
                </div>
              </div>
              {selectedProject.description && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="text-sm">{selectedProject.description}</p>
                </div>
              )}
              {user?.role === "sponsor_admin" && (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => setReportOpen(true)} className="gap-2">
                    <Send className="h-4 w-4" />
                    Send Report
                  </Button>
                </div>
              )}
              <FieldMediaUploader projectId={selectedProject.id} />

              <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Send Project Report</DialogTitle>
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
                        if (selectedProject && reportRecipient) {
                          sendReportMutation.mutate({ recipientId: Number(reportRecipient), projectId: selectedProject.id });
                        }
                      }}
                    >
                      {sendReportMutation.isPending ? "Sending..." : "Send Report"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
