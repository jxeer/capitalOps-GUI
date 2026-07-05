/**
 * ConnectionRequestList Component
 * 
 * Purpose:
 * Displays a scrollable list of connection requests, either sent or received,
 * with the ability to accept or decline incoming requests.
 * 
 * Key Features:
 * - Dual mode: shows "received" requests (with accept/decline actions) 
 *   or "sent" requests (withdrawal capable)
 * - Avatar generation from username initials
 * - ScrollArea for handling long lists
 * - Empty states for both modes
 * - Timestamp display for each request
 * - Optional message preview if request included one
 * 
 * Security Considerations:
 * - Requires authentication; returns null during user loading
 * - Server enforces data isolation (users only see their own requests)
 * - Actions are validated server-side (cannot accept/decline others' requests)
 * - Query is enabled only when authenticated user is loaded
 * 
 * Data Flow:
 * - Fetches from /api/connection-pending (received) or /api/connection-requests (sent)
 * - For "sent" mode, filters client-side to show only pending requests user sent
 * - Accept/decline actions update via PUT to /api/connection-requests/{id}
 * 
 * State Management:
 * - TanStack Query for server state
 * - Local toast notifications for action feedback
 * - queryClient.invalidateQueries to refresh lists after mutations
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

/**
 * Props for ConnectionRequestList component.
 * @interface ConnectionRequestListProps
 * @property type - Which list to display: "received" (default) or "sent"
 */
interface ConnectionRequestListProps {
  type?: "sent" | "received";
}

/**
 * ConnectionRequestList displays connection requests with action capabilities.
 * 
 * Two display modes:
 * - "received" (default): Shows incoming requests with Accept/Decline buttons
 * - "sent": Shows outgoing pending requests (no actions available)
 * 
 * @param type - Selects between received and sent request lists
 */
export function ConnectionRequestList({ type = "received" }: ConnectionRequestListProps) {
  // Auth context for current user info (used to identify sender in sent mode)
  const { user, isLoading: userLoading } = useAuth();
  const { toast } = useToast();

  /**
   * Fetch connection requests from API based on type.
   * 
   * Received requests: /api/connection-pending (incoming requests)
   * Sent requests: /api/connection-requests (all user's sent requests)
   * 
   * Query is disabled until user is loaded (prevents auth errors)
   */
  const { data: requests, isLoading } = useQuery<any[]>({
    // Different endpoints for received vs sent mode
    queryKey: type === "received" 
      ? ["/api/connection-pending"] 
      : ["/api/connection-requests"],
    // Ensure user is loaded before fetching
    enabled: !!user && !userLoading,
  });

  /**
   * Handles responding to a connection request (accept or decline).
   * 
   * API: PUT /api/connection-requests/{requestId}
   * Payload: { status: "accepted" | "declined" }
   * 
   * @param requestId - ID of the request to respond to
   * @param status - New status for the request
   */
  const handleRespond = async (requestId: string, status: "accepted" | "declined") => {
    try {
      const res = await apiRequest("PUT", `/api/connection-requests/${requestId}`, { status });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to respond");
      toast({ title: `Connection ${status}` });
      
      // Refresh both request lists to reflect state change
      queryClient.invalidateQueries({ queryKey: ["/api/connection-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/connection-pending"] });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  // Return null during auth loading (avoids flash of wrong content)
  if (userLoading) return null;
  
  // Loading spinner during data fetch
  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  /**
   * Process requests for display based on type:
   * - "received": Use data directly (all items are incoming)
   * - "sent": Filter to only show pending requests the user sent
   */
  const requestsList: any = type === "received" 
    ? requests 
    : requests?.filter((r: any) => r.senderId === user?.id && r.status === "pending");

  // Empty state when no requests exist
  if (!requestsList || requestsList.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <p className="text-muted-foreground">
              {type === "received" 
                ? "No pending connection requests" 
                : "No pending sent requests"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Main render: scrollable list of request cards
  return (
    <Card>
      <CardContent className="p-6">
        {/* Section title based on mode */}
        <h3 className="text-lg font-semibold mb-4">
          {type === "received" ? "Pending Requests" : "Sent Requests"}
        </h3>
        
        {/* ScrollArea constrains list height for long request lists */}
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {requestsList.map((request: any) => {
              /**
               * Show the OTHER party of the request: for received requests
               * that's the sender; for sent requests it's the receiver.
               * The backend includes senderName/receiverName (full_name)
               * with senderUsername/receiverUsername fallbacks, so we never
               * render a bare numeric ID (the old code assigned
               * request.senderId — a number — here and displayed nothing).
               */
              const sentByMe = String(request.senderId) === String(user?.id);
              const displayName = sentByMe
                ? request.receiverName || request.receiverUsername
                : request.senderName || request.senderUsername;
              const initials = (
                (sentByMe ? request.receiverUsername : request.senderUsername) ||
                displayName ||
                "??"
              ).substring(0, 2).toUpperCase();

              return (
                <div 
                  key={request.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-accent/20"
                >
                  {/* User info: avatar + name + timestamp */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      {/* AvatarFallback shows initials from the other party */}
                      <AvatarFallback>
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(request.createdAt).toLocaleDateString()}
                      </p>
                      {/* Optional message preview if included */}
                      {request.message && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          "{request.message}"
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Action buttons: only shown for received requests */}
                  {type === "received" && (
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleRespond(request.id, "declined")}
                      >
                        Decline
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => handleRespond(request.id, "accepted")}
                      >
                        Accept
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
