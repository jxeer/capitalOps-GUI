/**
 * CapitalOps Connections Page
 * 
 * Purpose: Manages professional networking through connections, connection requests,
 * and 1-on-1 messaging between users on the platform.
 * 
 * Approach:
 * - Tabbed interface separating connections, requests, and messages
 * - Search/discover users by username
 * - Send/accept/decline connection requests
 * - Real-time messaging with connected users
 * 
 * Key Features:
 * - All Connections tab: List of accepted connections with search
 * - Connection Requests tab: Pending incoming/outgoing requests
 * - Messages tab: 1-on-1 conversations with connected users
 * - Discover tab: server-side user search + send connection requests
 * - CommunicationCenter component for messaging UI
 *
 * Related Components:
 * - CommunicationCenter: Full messaging interface
 * - ConnectionRequestList: Request management UI
 * - ConnectionRequestButton: Connect/withdraw/accept actions per user
 *
 * Related Backend Routes:
 * - GET /api/connections - List user's accepted connections
 * - GET /api/connection-pending - List pending requests
 * - GET /api/users?search= - Discover users (excludes current user)
 * - POST /api/connection-requests - Send connection request
 * - PUT /api/connection-requests/:id - Accept/decline request
 * - GET /api/conversations - List user's conversations
 * - POST /api/messages - Send message
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommunicationCenter } from "@/components/communication-center";
import { ConnectionRequestList } from "@/components/connection-request-list";
import { ConnectionRequestButton } from "@/components/connection-request-button";
import { User, MessageSquare, UserPlus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { User as UserType } from "@shared/schema";

/**
 * Main Connections Page Component
 * 
 * Three main tabs:
 * 1. "all" - Accepted connections with search
 * 2. "requests" - Pending connection requests
 * 3. "messages" - 1-on-1 messaging
 */
export default function Connections() {
  const { user, isLoading } = useAuth();

  // Search/filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [discoverTerm, setDiscoverTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // When set, the Messages tab opens in targeted mode for this user —
  // set by the Message button on a connection card, cleared when the
  // user leaves the Messages tab or closes the targeted view.
  const [messageTargetId, setMessageTargetId] = useState<string | null>(null);

  /**
   * Open the Messages tab targeted at a specific connection.
   * This is the Message button's click handler — previously the button
   * had NO onClick at all, so clicking it did nothing.
   */
  const handleOpenMessages = (targetId: string) => {
    setMessageTargetId(String(targetId));
    setActiveTab("messages");
  };

  /**
   * Tab switcher — clears the message target when navigating away from
   * Messages so a stale target doesn't hijack the next visit to the tab.
   */
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab !== "messages") setMessageTargetId(null);
  };

  // Fetch user's accepted connections
  const { data: connections, isLoading: connectionsLoading } = useQuery<UserType[]>({
    queryKey: ["/api/connections"],
    enabled: !!user,
  });

  // Fetch pending connection requests (both sent and received)
  const { data: pendingRequests, isLoading: requestsLoading } = useQuery<any[]>({
    queryKey: ["/api/connection-pending"],
    enabled: !!user,
  });

  // Fetch users for the Discover tab. The backend's GET /api/users supports
  // ?search= (matches username/full_name/email, case-insensitive) and always
  // excludes the current user. discoverTerm is part of the queryKey so typing
  // a new term triggers a refetch (staleTime is Infinity, so each distinct
  // term is fetched once and then served from cache). The default queryFn
  // only reads queryKey[0] as the URL, so a custom queryFn builds the
  // search-param URL explicitly.
  const { data: discoveredUsers, isLoading: discoverLoading } = useQuery<UserType[]>({
    queryKey: ["/api/users", discoverTerm],
    queryFn: async () => {
      const term = discoverTerm.trim();
      const path = term
        ? `/api/users?search=${encodeURIComponent(term)}`
        : "/api/users";
      const res = await apiRequest("GET", path);
      return res.json();
    },
    enabled: !!user,
  });

  // Connection-state lookups for the Discover tab, so users we're already
  // linked to don't show a plain "Connect" button. IDs are compared as
  // strings because /api/users returns string IDs (compat convention) while
  // /api/connections and /api/connection-pending return numeric IDs.
  const connectedIds = new Set((connections ?? []).map((c) => String(c.id)));
  const incomingRequestSenderIds = new Set(
    (pendingRequests ?? []).map((r) => String(r.senderId))
  );

  // Show nothing while loading
  if (isLoading || (activeTab === "all" && connectionsLoading)) return null;

  // Filter connections by search term
  const filteredConnections = connections?.filter((u) =>
    u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Count pending requests for badge
  const pendingCount = pendingRequests?.length || 0;

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Connections</h1>
          <p className="text-muted-foreground">Manage your professional network</p>
        </div>
      </div>

      {/* Tabbed interface — controlled (value + onValueChange) so the
          Message button can programmatically switch to the Messages tab;
          with only defaultValue the tab state was internal to Radix and
          couldn't be driven from code */}
      <Tabs value={activeTab} className="space-y-4" onValueChange={handleTabChange}>
        <TabsList>
          {/* All Connections tab with count badge */}
          <TabsTrigger value="all">
            <User className="h-4 w-4 mr-2" />
            All Connections
            {connections && <span className="ml-2 bg-accent text-accent-foreground px-2 py-0.5 rounded-full text-xs">{connections.length}</span>}
          </TabsTrigger>
          
          {/* Connection Requests tab with pending count badge */}
          <TabsTrigger value="requests">
            <UserPlus className="h-4 w-4 mr-2" />
            Connection Requests
            {pendingCount > 0 && <span className="ml-2 bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-xs">{pendingCount}</span>}
          </TabsTrigger>
          
          {/* Messages tab */}
          <TabsTrigger value="messages">
            <MessageSquare className="h-4 w-4 mr-2" />
            Messages
          </TabsTrigger>

          {/* Discover tab — find new users to connect with */}
          <TabsTrigger value="discover">
            <Search className="h-4 w-4 mr-2" />
            Discover
          </TabsTrigger>
        </TabsList>

        {/* Tab Content */}
        <TabsContent value="all" className="space-y-4">
          {/* Search bar — filtering happens client-side as you type, so
              submitting just prevents a page reload */}
          <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
            <Input
              placeholder="Search connections..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" variant="secondary">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          {/* Connections list */}
          {filteredConnections && filteredConnections.length > 0 ? (
            <div className="grid gap-4">
              {filteredConnections.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  user={connection}
                  onMessage={handleOpenMessages}
                />
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No connections yet. Start networking!</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          {/* Connection request management */}
          <ConnectionRequestList requests={pendingRequests || []} />
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          {/* Messaging interface — targeted at a specific user when the
              Message button on a connection card was clicked */}
          <CommunicationCenter
            targetUserId={messageTargetId ?? undefined}
            onClose={() => setMessageTargetId(null)}
          />
        </TabsContent>

        <TabsContent value="discover" className="space-y-4">
          {/* Server-side user search — queries /api/users?search= as the
              user types (see discoveredUsers query above) */}
          <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
            <Input
              placeholder="Search people by name, username, or email..."
              value={discoverTerm}
              onChange={(e) => setDiscoverTerm(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" variant="secondary">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          {/* Discovered users list — mirrors the All Connections card grid */}
          {discoverLoading ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Searching...</p>
            </Card>
          ) : discoveredUsers && discoveredUsers.length > 0 ? (
            <div className="grid gap-4">
              {discoveredUsers.map((u) => (
                <DiscoverUserCard
                  key={u.id}
                  user={u}
                  currentUserId={String(user?.id ?? "")}
                  // Derive relationship state so the button renders the right
                  // action: already connected -> disabled "Connected";
                  // they sent us a pending request -> accept/decline;
                  // otherwise -> plain "Connect".
                  connectionStatus={
                    connectedIds.has(String(u.id))
                      ? "connected"
                      : incomingRequestSenderIds.has(String(u.id))
                        ? "request_received"
                        : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">
                {discoverTerm.trim()
                  ? "No users match your search."
                  : "No other users found yet."}
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * ConnectionCard Component
 *
 * Displays a single connection with avatar, name, and quick actions.
 *
 * @param onMessage - Called with this user's ID when Message is clicked;
 *   the parent opens the Messages tab targeted at them.
 */
function ConnectionCard({
  user,
  onMessage,
}: {
  user: UserType;
  onMessage: (targetId: string) => void;
}) {
  const avatarFallback = user.username?.substring(0, 2).toUpperCase() || "??";

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        {/* User avatar */}
        {user.profileImage ? (
          <Avatar className="h-12 w-12">
            <AvatarImage src={user.profileImage} alt={user.username} />
            <AvatarFallback>{avatarFallback}</AvatarFallback>
          </Avatar>
        ) : (
          <Avatar className="h-12 w-12 bg-primary text-primary-foreground">
            <AvatarFallback>{avatarFallback}</AvatarFallback>
          </Avatar>
        )}

        {/* User info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{user.fullName || user.username}</p>
          <p className="text-sm text-muted-foreground truncate">
            {user.title || user.profileType || "User"}
            {user.organization ? ` at ${user.organization}` : ""}
          </p>
        </div>

        {/* Message button — opens the Messages tab targeted at this user */}
        <Button size="sm" variant="outline" onClick={() => onMessage(String(user.id))}>
          <MessageSquare className="h-4 w-4 mr-2" />
          Message
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * DiscoverUserCard Component
 *
 * A single row in the Discover tab: avatar, name/username/role, and a
 * ConnectionRequestButton for sending a request. Mirrors ConnectionCard's
 * layout so the tabs look consistent, but swaps the Message action for a
 * connection action since these users aren't connections yet.
 *
 * @param user - Discovered user (safe public fields from /api/users)
 * @param currentUserId - Authenticated user's ID (string, for the button)
 * @param connectionStatus - Existing relationship, if any, so the button can
 *   render "Connected" / accept-decline instead of a fresh "Connect"
 */
function DiscoverUserCard({
  user,
  currentUserId,
  connectionStatus,
}: {
  user: UserType;
  currentUserId: string;
  connectionStatus?: "connected" | "request_sent" | "request_received";
}) {
  const avatarFallback = user.username?.substring(0, 2).toUpperCase() || "??";

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        {/* User avatar (same fallback pattern as ConnectionCard) */}
        {user.profileImage ? (
          <Avatar className="h-12 w-12">
            <AvatarImage src={user.profileImage} alt={user.username} />
            <AvatarFallback>{avatarFallback}</AvatarFallback>
          </Avatar>
        ) : (
          <Avatar className="h-12 w-12 bg-primary text-primary-foreground">
            <AvatarFallback>{avatarFallback}</AvatarFallback>
          </Avatar>
        )}

        {/* Name, username, and role — the safe fields /api/users returns */}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{user.fullName || user.username}</p>
          <p className="text-sm text-muted-foreground truncate">
            @{user.username}
            {user.role ? ` · ${user.role.replace(/_/g, " ")}` : ""}
          </p>
        </div>

        {/* Connect / Connected / Accept-Decline, based on relationship */}
        <ConnectionRequestButton
          userId={currentUserId}
          targetUserId={String(user.id)}
          connectionStatus={connectionStatus}
        />
      </CardContent>
    </Card>
  );
}
