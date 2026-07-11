/**
 * CommunicationCenter Component
 * 
 * Purpose: 1-on-1 messaging interface between connected users.
 * Provides real-time messaging within the platform.
 * 
 * MESSAGING FLOW:
 * 1. User selects a conversation from the list (or creates new one)
 * 2. Messages are fetched for that conversation
 * 3. User types and sends a message
 * 4. Message appears in thread and is stored via API
 * 
 * SECURITY NOTES:
 * - Users can only message other users they have connections with
 * - Messages are stored server-side and fetched via API
 * - No WebSocket - uses polling/refetch for "real-time" feel
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Paperclip, Send, User, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Message, Conversation } from "@shared/schema";

/**
 * Record types that can be shared through chat, mapped to their list
 * endpoint (for the attach picker — these endpoints already return only
 * the caller's own records) and their list page (for the message card's
 * click-through; the app has no single-record detail route, so the card
 * links to the type's list page).
 */
const ATTACHABLE_TYPES: Record<string, { endpoint: string; page: string }> = {
  asset: { endpoint: "/api/assets", page: "/assets" },
  project: { endpoint: "/api/projects", page: "/projects" },
  deal: { endpoint: "/api/deals", page: "/deals" },
  vendor: { endpoint: "/api/vendors", page: "/vendors" },
};

/**
 * Human-readable label for a record in the attach picker. Assets and
 * vendors have a name; projects and deals don't — the app's list pages
 * label them by their asset/project name plus phase, so mirror that.
 */
function recordLabel(recordType: string, record: any): string {
  if (recordType === "project")
    return `${record.assetName || "Unknown asset"}${record.phase ? ` — ${record.phase}` : ""}`;
  if (recordType === "deal")
    return `${record.projectName || "Unknown project"}${record.phase ? ` — ${record.phase}` : ""}`;
  return record.name || "Unnamed";
}

/** A record picked in the composer, waiting to be sent with the message. */
interface PendingAttachment {
  recordType: string;
  recordId: number;
  recordName: string;
  accessLevel: "view" | "edit";
}

/**
 * Props for CommunicationCenter component.
 * 
 * @param targetUserId - If provided, shows only conversation with this user
 */
interface CommunicationCenterProps {
  targetUserId?: string;
  /** Called when the user closes targeted mode, so the parent can clear
      the target (e.g. Connections page resetting its "message this user"
      state). Without this, targeted mode had no way back to the list. */
  onClose?: () => void;
}

/**
 * CommunicationCenter Component
 * 
 * Two modes:
 * 1. Full mode (no targetUserId): Shows conversation list + message view
 * 2. Targeted mode (targetUserId provided): Shows only conversation with that user
 * 
 * State:
 * - selectedConversation: Currently viewed conversation
 * - messageContent: Current message being typed
 * - conversations: List of user's conversations
 */
export function CommunicationCenter({ targetUserId, onClose }: CommunicationCenterProps) {
  // Get current user from auth context
  const { user, isLoading: userLoading } = useAuth();
  const { toast } = useToast();

  // Currently selected conversation for viewing messages
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  // Message being composed
  const [messageContent, setMessageContent] = useState("");

  // Record attached to the message being composed (shown as a chip above
  // the input until sent or removed)
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);

  // Attach-picker popover state: open flag, chosen record type, chosen level
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachType, setAttachType] = useState<string>("asset");
  const [attachLevel, setAttachLevel] = useState<"view" | "edit">("view");

  // Records the user can attach for the chosen type. Uses the default
  // queryFn (queryKey[0] as URL) and the same queryKey as the type's list
  // page, so the cache is shared. These endpoints only return records the
  // caller owns, which matches the backend's sender-must-own rule.
  const { data: attachableRecords } = useQuery<any[]>({
    queryKey: [ATTACHABLE_TYPES[attachType].endpoint],
    enabled: attachOpen,
  });

  // Fetch the user's conversations from the backend. This was previously a
  // useState([]) that nothing ever populated, so the list was always empty
  // and targeted mode could never find an existing conversation.
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    enabled: !!user && !userLoading,
    // Poll so brand-new threads appear without a reload — the global
    // staleTime: Infinity would otherwise pin this list for the session
    refetchInterval: 5000,
  });

  // Fetch messages for the selected conversation. Needs a custom queryFn:
  // the app's default queryFn only uses queryKey[0] as the URL, which
  // dropped the conversationId — the backend 400s without it, so threads
  // never loaded.
  const { data: messages } = useQuery<Message[]>({
    queryKey: ["/api/messages", { conversationId: selectedConversation?.id }],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/messages?conversationId=${encodeURIComponent(String(selectedConversation?.id))}`
      );
      return res.json();
    },
    enabled: !!selectedConversation?.id,
    // Poll the open thread for new incoming messages; refetchInterval
    // bypasses staleTime, so this works despite the global Infinity.
    // Only runs while enabled (a conversation is selected and on screen).
    refetchInterval: 5000,
    // No initialData here: initialData is written to the cache as real
    // fetched data, and with the app's global staleTime: Infinity it stayed
    // "fresh" forever — the GET never fired and every thread showed an
    // empty [] ("No messages yet"). undefined-while-loading is handled by
    // the `messages?.` render guards below.
  });

  /**
   * Mutation: Send a message
   * 
   * POSTs to /api/messages with conversationId and content.
   * On success: clears message input, refreshes conversation list.
   */
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedConversation?.id) throw new Error("No conversation selected");
      // Attach the pending record share, if any. The backend validates
      // ownership, resolves the recipient from the conversation, and
      // creates the RecordShare — the client only names the record and
      // level. content may be empty when there's an attachment.
      const body: Record<string, unknown> = {
        conversationId: selectedConversation.id,
        content,
      };
      if (pendingAttachment) {
        body.attachment = {
          recordType: pendingAttachment.recordType,
          recordId: pendingAttachment.recordId,
          accessLevel: pendingAttachment.accessLevel,
        };
      }
      const res = await apiRequest("POST", "/api/messages", body);
      return res.json();
    },
    onSuccess: (message) => {
      // Optimistically update messages cache with new message
      if (selectedConversation?.id) {
        queryClient.setQueryData<Message[]>(
          ["/api/messages", { conversationId: selectedConversation.id }],
          (prev) => [...(prev || []), message]
        );
      }
      // Clear the input and any pending attachment but KEEP the thread
      // open — the old code also nulled selectedConversation here, closing
      // the chat after every single message sent.
      setMessageContent("");
      setPendingAttachment(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to send message", description: err.message, variant: "destructive" });
    },
  });

  /**
   * Mutation: Create a new conversation
   * 
   * POSTs to /api/conversations with the other user's ID.
   * This is needed when messaging a user you haven't chatted with before.
   */
  const createConversationMutation = useMutation({
    mutationFn: async (otherUserId: string) => {
      const res = await apiRequest("POST", "/api/conversations", { otherUserId });
      return res.json();
    },
    onSuccess: (conversation) => {
      // Refresh conversation list
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      // Set as selected to show messages
      setSelectedConversation(conversation);
      toast({ title: "Conversation started" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to start conversation", description: err.message, variant: "destructive" });
    },
  });

  /**
   * Handle message submission
   * 
   * Validates message isn't empty and conversation is selected,
   * then triggers the send mutation.
   */
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    // A message must say something OR share something (mirrors the backend
    // rule: content may be empty when an attachment is present)
    if ((!messageContent.trim() && !pendingAttachment) || !selectedConversation) return;
    sendMessageMutation.mutate(messageContent.trim());
  };

  /**
   * Create a conversation with a specific user
   * 
   * Used when starting a chat with a user you haven't talked to yet.
   */
  const handleCreateConversation = async (otherUserId: string) => {
    createConversationMutation.mutate(otherUserId);
  };

  /**
   * Select a conversation to view its messages.
   *
   * Also zeroes the conversation's unreadCount in the cache immediately:
   * the backend marks messages read during the GET /api/messages this
   * selection triggers, so the badges would clear on the next 5s poll
   * anyway — this just removes the visible lag.
   */
  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    queryClient.setQueryData<Conversation[]>(["/api/conversations"], (prev) =>
      prev?.map((c) =>
        c.id === conversation.id ? { ...c, unreadCount: 0 } : c
      )
    );
  };

  // Find the existing conversation with the target user (targeted mode).
  // IDs are compared as strings: the backend sends numeric userId1/userId2
  // while targetUserId arrives as a string, so strict === never matched.
  const targetConversation = targetUserId
    ? conversations.find(
        (c) =>
          String(c.userId1) === String(targetUserId) ||
          String(c.userId2) === String(targetUserId)
      )
    : null;

  // In targeted mode, auto-open the conversation once it's known — either
  // found in the fetched list or just created. Without this, targeted mode
  // rendered an empty card (the list is hidden and nothing was selected).
  useEffect(() => {
    if (targetUserId && targetConversation && !selectedConversation) {
      // Same path as a manual click so the unread badge clears too
      handleSelectConversation(targetConversation);
    }
  }, [targetUserId, targetConversation, selectedConversation]);

  // Show loading spinner while auth is loading
  if (userLoading) return null;

  return (
    <Card>
      <CardContent className="p-6">
        {/* Header with title and close button */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Messages</h3>
          {targetUserId && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                // Deselect AND tell the parent to clear the target —
                // otherwise the auto-select effect immediately reopens it.
                setSelectedConversation(null);
                onClose?.();
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Close
            </Button>
          )}
        </div>

        {/* === TARGETED MODE: No existing conversation === */}
        {targetUserId && !selectedConversation && !targetConversation && (
          <div className="text-center py-8">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <p className="text-muted-foreground mb-4">No existing conversation with this user</p>
            <Button
              size="sm"
              onClick={() => handleCreateConversation(targetUserId)}
              disabled={createConversationMutation.isPending}
            >
              <User className="h-4 w-4 mr-2" />
              Start Conversation
            </Button>
          </div>
        )}

        {/* === FULL MODE: Conversation list === */}
        {!targetUserId && (
          <div className="space-y-2 mb-4">
            <p className="text-sm text-muted-foreground">Recent Conversations</p>
            {conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">No conversations yet</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className="p-3 rounded-lg bg-accent/30 cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {/* Label each conversation with the OTHER participant's
                        display name (fullName from the backend, username as
                        fallback) — previously this rendered a literal
                        "You"/"Other User" placeholder */}
                    <span className="text-sm font-medium">
                      {String(conv.userId1) === String(user?.id)
                        ? conv.user2Name || conv.user2Username || "Unknown user"
                        : conv.user1Name || conv.user1Username || "Unknown user"}
                    </span>
                    {/* Unread dot — cleared by handleSelectConversation and
                        server-side once the thread is opened */}
                    {(conv.unreadCount ?? 0) > 0 && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-destructive" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* === MESSAGE THREAD VIEW === */}
        {selectedConversation && (
          <div className="flex flex-col h-[400px]">
            {/* Messages scroll area */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {messages?.map((msg) => {
                // Determine if current user sent this message (string-
                // normalized: backend IDs are numeric, frontend's are strings)
                const isMe = String(msg.senderId) === String(user?.id);
                return (
                  <div
                    key={msg.id}
                    // Align right for own messages, left for others
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        isMe
                          ? "bg-primary text-primary-foreground"  // Own messages: primary color
                          : "bg-muted"  // Others' messages: muted background
                      }`}
                    >
                      {/* Message content (may be empty for share-only messages) */}
                      {msg.content && <p className="text-sm">{msg.content}</p>}
                      {/* Shared-record card. Deep-links via
                          /<type>?open=<id> — each list page fetches that
                          single record by id and opens its edit dialog (a
                          shared record is NOT in the recipient's
                          portfolio-scoped list, so it must be fetched
                          directly; only the by-id endpoints are
                          share-aware). recordName is the backend's
                          send-time snapshot. */}
                      {msg.attachment && (
                        <Link
                          href={
                            ATTACHABLE_TYPES[msg.attachment.recordType]
                              ? `${ATTACHABLE_TYPES[msg.attachment.recordType].page}?open=${msg.attachment.recordId}`
                              : "/dashboard"
                          }
                          className={`mt-1 flex items-center gap-2 rounded-md border p-2 text-xs transition-colors ${
                            isMe
                              ? "border-primary-foreground/30 hover:bg-primary-foreground/10"
                              : "border-border bg-background/50 hover:bg-accent"
                          }`}
                          data-testid={`card-attachment-${msg.id}`}
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0" />
                          <span className="capitalize opacity-70">{msg.attachment.recordType}</span>
                          <span className="opacity-70">·</span>
                          <span className="font-medium truncate">{msg.attachment.recordName}</span>
                        </Link>
                      )}
                      {/* Timestamp */}
                      <p className="text-[10px] mt-1 text-right opacity-70">
                        {new Date(msg.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
              {messages?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No messages yet. Start the conversation!
                </p>
              )}
            </div>

            {/* Pending-attachment chip: the record queued to be shared
                with the next message, removable before sending */}
            {pendingAttachment && (
              <div
                className="mb-2 inline-flex items-center gap-2 self-start rounded-full bg-accent px-3 py-1 text-xs"
                data-testid="chip-pending-attachment"
              >
                <Paperclip className="h-3 w-3" />
                <span className="font-medium">{pendingAttachment.recordName}</span>
                <span className="text-muted-foreground">— {pendingAttachment.accessLevel}</span>
                <button
                  type="button"
                  onClick={() => setPendingAttachment(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Message composition form */}
            <form
              onSubmit={handleSendMessage}
              className="flex gap-2"
            >
              {/* Attach-record picker: choose a type, an access level, then
                  click one of your own records to queue it as the pending
                  attachment. Sending shares it with the other participant. */}
              <Popover open={attachOpen} onOpenChange={setAttachOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={sendMessageMutation.isPending}
                    data-testid="button-attach-record"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 space-y-2" align="start">
                  <p className="text-sm font-medium">Share a record</p>
                  <div className="flex gap-2">
                    <Select value={attachType} onValueChange={setAttachType}>
                      <SelectTrigger className="flex-1" data-testid="select-attach-type">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(ATTACHABLE_TYPES).map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={attachLevel}
                      onValueChange={(v) => setAttachLevel(v as "view" | "edit")}
                    >
                      <SelectTrigger className="w-24" data-testid="select-attach-level">
                        <SelectValue placeholder="Access" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">view</SelectItem>
                        <SelectItem value="edit">edit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Your own records of the chosen type; clicking one
                      queues it and closes the picker */}
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {(attachableRecords ?? []).map((record) => (
                      <button
                        type="button"
                        key={record.id}
                        onClick={() => {
                          setPendingAttachment({
                            recordType: attachType,
                            recordId: Number(record.id),
                            recordName: recordLabel(attachType, record),
                            accessLevel: attachLevel,
                          });
                          setAttachOpen(false);
                        }}
                        className="w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        {recordLabel(attachType, record)}
                      </button>
                    ))}
                    {attachableRecords?.length === 0 && (
                      <p className="py-2 text-center text-xs text-muted-foreground">
                        No {attachType}s to share
                      </p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder={pendingAttachment ? "Add a note (optional)..." : "Type a message..."}
                disabled={sendMessageMutation.isPending}
              />
              <Button
                type="submit"
                size="icon"
                disabled={(!messageContent.trim() && !pendingAttachment) || sendMessageMutation.isPending}
              >
                {sendMessageMutation.isPending ? (
                  // Loading spinner while sending
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
