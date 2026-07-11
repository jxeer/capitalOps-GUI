/**
 * CommentsSection Component
 *
 * Purpose: comment thread for a shareable record (asset/project/deal/vendor),
 * mounted inside the record's edit dialog.
 *
 * ACCESS MODEL (enforced server-side, mirrored here only for UX):
 * - The backend gates both reading and writing comments on view access to
 *   the record itself, and filters what the caller may see per comment:
 *   'all' -> everyone with record access, 'private' -> author only,
 *   'user' -> author + the targeted user. The list this component renders
 *   is therefore already access-filtered.
 * - Edit/delete are author-only server-side; the buttons are simply hidden
 *   for other people's comments.
 *
 * COMPOSER:
 * - Text input + visibility select (Everyone / Private / Specific user).
 * - "Specific user" reveals a user picker backed by GET /api/users — the
 *   same discovery list the Connections page uses (excludes the caller).
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, Pencil, Trash2, X } from "lucide-react";

/** Public author info embedded by the backend (_user_public_dict). */
interface CommentAuthor {
  id: string;
  username?: string;
  fullName?: string | null;
}

/** Comment shape returned by GET /api/comments (camelCased, string ids). */
interface RecordComment {
  id: string;
  recordType: string;
  recordId: string;
  authorId: string;
  content: string;
  visibility: "private" | "user" | "all";
  targetUserId: string | null;
  createdAt: string;
  author: CommentAuthor | null;
}

interface CommentsSectionProps {
  recordType: string;
  /** Record id as the page holds it (frontend ids are strings). */
  recordId: string | number;
}

export function CommentsSection({ recordType, recordId }: CommentsSectionProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Composer state
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"all" | "private" | "user">("all");
  const [targetUserId, setTargetUserId] = useState<string>("");

  // Inline-edit state: which comment is being edited, and its draft text
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Comments for this record. Needs a custom queryFn: the app's default
  // queryFn only uses queryKey[0] as the URL and would drop the params.
  const { data: comments } = useQuery<RecordComment[]>({
    queryKey: ["/api/comments", { recordType, recordId }],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/comments?recordType=${encodeURIComponent(recordType)}&recordId=${encodeURIComponent(String(recordId))}`
      );
      return res.json();
    },
  });

  // User list for the "Specific user" picker AND for labeling 'user'
  // comments with the target's name. Same endpoint/cache the Connections
  // Discover tab uses; excludes the current user server-side.
  const { data: users } = useQuery<CommentAuthor[]>({ queryKey: ["/api/users"] });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/comments", { recordType, recordId }] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        recordType,
        recordId: Number(recordId),
        content: content.trim(),
        visibility,
      };
      // targetUserId only applies to (and is required for) 'user' visibility
      if (visibility === "user") body.targetUserId = Number(targetUserId);
      const res = await apiRequest("POST", "/api/comments", body);
      return res.json();
    },
    onSuccess: () => {
      setContent("");
      setVisibility("all");
      setTargetUserId("");
      invalidate();
    },
    onError: (err: Error) =>
      toast({ title: "Failed to post comment", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, newContent }: { id: string; newContent: string }) => {
      const res = await apiRequest("PUT", `/api/comments/${id}`, { content: newContent });
      return res.json();
    },
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
    onError: (err: Error) =>
      toast({ title: "Failed to update comment", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/comments/${id}`);
    },
    onSuccess: invalidate,
    onError: (err: Error) =>
      toast({ title: "Failed to delete comment", description: err.message, variant: "destructive" }),
  });

  /**
   * Human label for a comment's visibility. For 'user' comments the target
   * is resolved from the users list; if the target is the current user
   * (who is excluded from /api/users), label it "you".
   */
  const visibilityLabel = (c: RecordComment): string => {
    if (c.visibility === "private") return "Private";
    if (c.visibility === "user") {
      if (String(c.targetUserId) === String(user?.id)) return "Shared with you";
      const target = users?.find((u) => String(u.id) === String(c.targetUserId));
      return `Shared with ${target?.fullName || target?.username || "one user"}`;
    }
    return "Everyone";
  };

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || (visibility === "user" && !targetUserId)) return;
    createMutation.mutate();
  };

  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm font-medium">Comments</p>

      {/* Comment list (already access-filtered by the backend) */}
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {(comments ?? []).map((c) => {
          const isMine = String(c.authorId) === String(user?.id);
          return (
            <div key={c.id} className="rounded-md bg-accent/30 p-2" data-testid={`comment-${c.id}`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">
                  {c.author?.fullName || c.author?.username || "Unknown user"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
                <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                  {visibilityLabel(c)}
                </span>
                {/* Author-only actions (also enforced server-side) */}
                {isMine && editingId !== c.id && (
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(c.id);
                        setEditDraft(c.content);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Edit comment"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(c.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
              {editingId === c.id ? (
                <div className="mt-1 flex gap-1">
                  <Input
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="h-7 text-sm"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={!editDraft.trim() || updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ id: c.id, newContent: editDraft.trim() })}
                    aria-label="Save comment"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel edit"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-sm">{c.content}</p>
              )}
            </div>
          );
        })}
        {comments?.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">No comments yet</p>
        )}
      </div>

      {/* Composer: text + visibility (+ target picker for 'user') */}
      <form onSubmit={handlePost} className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add a comment..."
            disabled={createMutation.isPending}
            data-testid="input-comment"
          />
          <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
            <SelectTrigger className="w-32 shrink-0" data-testid="select-comment-visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="user">Specific user</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {visibility === "user" && (
          <Select value={targetUserId} onValueChange={setTargetUserId}>
            <SelectTrigger data-testid="select-comment-target">
              <SelectValue placeholder="Choose who can see this" />
            </SelectTrigger>
            <SelectContent>
              {(users ?? []).map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.fullName || u.username || `User ${u.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          type="submit"
          size="sm"
          className="w-full"
          disabled={
            !content.trim() ||
            (visibility === "user" && !targetUserId) ||
            createMutation.isPending
          }
          data-testid="button-post-comment"
        >
          {createMutation.isPending ? "Posting..." : "Post Comment"}
        </Button>
      </form>
    </div>
  );
}
