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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send, User, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Message, Conversation } from "@shared/schema";

/**
 * Props for CommunicationCenter component.
 * 
 * @param targetUserId - If provided, shows only conversation with this user
 */
interface CommunicationCenterProps {
  targetUserId?: string;
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
export function CommunicationCenter({ targetUserId }: CommunicationCenterProps) {
  // Get current user from auth context
  const { user, isLoading: userLoading } = useAuth();
  const { toast } = useToast();
  
  // Currently selected conversation for viewing messages
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  
  // Message being composed
  const [messageContent, setMessageContent] = useState("");
  
  // User's conversations list
  const [conversations, setConversations] = useState<Conversation[]>([]);

  // Fetch pending connection requests (for potential new conversations)
  const { data: pendingRequests } = useQuery({
    queryKey: ["/api/connection-pending"],
    enabled: !!user && !userLoading,
  });

  // Fetch messages for selected conversation
  // Enabled only when conversation is selected
  const { data: messages } = useQuery<Message[]>({
    queryKey: ["/api/messages", { conversationId: selectedConversation?.id }],
    enabled: !!selectedConversation?.id,
    initialData: [],
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
      const res = await apiRequest("POST", "/api/messages", {
        conversationId: selectedConversation.id,
        content,
      });
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
      // Clear input and close conversation
      setMessageContent("");
      setSelectedConversation(null);
      toast({ title: "Message sent" });
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
    if (!messageContent.trim() || !selectedConversation) return;
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
   * Select a conversation to view its messages
   */
  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
  };

  // Show loading spinner while auth is loading
  if (userLoading) return null;

  // Find the "other" user in targeted mode
  const otherUser = targetUserId
    ? conversations.find(c => c.userId1 === targetUserId || c.userId2 === targetUserId)
    : null;

  return (
    <Card>
      <CardContent className="p-6">
        {/* Header with title and close button */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Messages</h3>
          {targetUserId && (
            <Button size="sm" variant="ghost" onClick={() => setSelectedConversation(null)}>
              <X className="h-4 w-4 mr-1" />
              Close
            </Button>
          )}
        </div>

        {/* === TARGETED MODE: No existing conversation === */}
        {targetUserId && !selectedConversation && !otherUser && (
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
                // Determine if current user sent this message
                const isMe = msg.senderId === user?.id;
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
                      {/* Message content */}
                      <p className="text-sm">{msg.content}</p>
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

            {/* Message composition form */}
            <form
              onSubmit={handleSendMessage}
              className="flex gap-2"
            >
              <Input
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="Type a message..."
                disabled={sendMessageMutation.isPending}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!messageContent.trim() || sendMessageMutation.isPending}
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
