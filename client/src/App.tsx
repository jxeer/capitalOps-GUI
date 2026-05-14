/**
 * CapitalOps Frontend Application Entry Point
 * 
 * This is the root React component that sets up:
 * - Theme provider (light/dark mode)
 * - React Query for data fetching
 * - Tooltip provider for UI
 * - Authentication routing
 * - Protected routes with layout
 * 
 * ROUTING STRUCTURE:
 * 
 * Public Routes (no authentication required):
 *   "/"             → Splash page (marketing/landing page)
 *   "/auth"        → Login/Register page (wrapped in AuthProvider)
 *   "/auth/forgot-password" → Password reset request
 *   "/auth/reset-password"  → Password reset with token
 * 
 * Protected Routes (require authentication):
 *   All other routes are wrapped in AuthProvider + ProtectedLayout
 *   They redirect to /auth if user is not authenticated
 * 
 * PROTECTED LAYOUT:
 *   The ProtectedLayout component provides:
 *   - Sidebar navigation (AppSidebar)
 *   - Header with user menu and theme toggle
 *   - Route switching for authenticated pages
 * 
 * AUTHENTICATION FLOW:
 *   1. App mounts and renders routes
 *   2. AuthProvider checks localStorage for auth_token
 *   3. If token exists, fetches /api/user to validate and get user data
 *   4. Protected routes check if user is loaded, redirect to /auth if not
 *   5. After login, redirects to /dashboard
 *   6. Google OAuth callback stores token in localStorage
 * 
 * IMPORTANT: ThemeProvider and QueryClientProvider wrap everything because
 * many components deep need access to theme and data fetching.
 */

import { useEffect } from "react";
import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Moon, Sun, LogOut, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Assets from "@/pages/assets";
import Projects from "@/pages/projects";
import Deals from "@/pages/deals";
import Investors from "@/pages/investors";
import Allocations from "@/pages/allocations";
import Milestones from "@/pages/milestones";
import RiskFlags from "@/pages/risk-flags";
import Vendors from "@/pages/vendors";
import WorkOrders from "@/pages/work-orders";
import InvestorPortal from "@/pages/investor-portal";
import Profile from "@/pages/profile";
import Connections from "@/pages/connections";
import EntitlementPage from "@/pages/entitlement";
import Reports from "@/pages/reports";
import AuthPage from "@/pages/auth-page";
import ForgotPasswordPage from "@/pages/forgot-password-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import Splash from "@/pages/splash";


/**
 * ThemeToggle Component
 * 
 * Button that toggles between light and dark theme.
 * Uses the theme context from ThemeProvider.
 */
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const icons = { light: <Sun className="h-4 w-4" />, dark: <Moon className="h-4 w-4" /> };
  const labels = { light: "Switch to dark mode", dark: "Switch to light mode" };
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle" aria-label={labels[theme as keyof typeof labels]}>
      {icons[theme as keyof typeof icons]}
    </Button>
  );
}


/**
 * UserMenu Component
 * 
 * Dropdown menu showing current user info and actions.
 * Displays:
 * - User avatar (from profile image or initials fallback)
 * - Username and role
 * - Profile type and status badges
 * - Link to view full profile
 * - Logout button
 * 
 * Only renders if user is logged in (null otherwise).
 */
function UserMenu() {
  const { user, logout } = useAuth();

  // Don't render if no user is logged in
  if (!user) return null;

  // Generate avatar fallback from username initials (defensive: handle null/undefined)
  const avatarFallback = ((user.username ?? "")).substring(0, 2).toUpperCase() || "NA";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full overflow-hidden ring-1 ring-ring/20" aria-label="Open profile menu">
          {/* Show profile image if available, otherwise show initials */}
          {user.profileImage ? (
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.profileImage} alt={user.username} />
              <AvatarFallback>{avatarFallback}</AvatarFallback>
            </Avatar>
          ) : (
            <Avatar className="h-8 w-8 bg-primary text-primary-foreground">
              <AvatarFallback>{avatarFallback}</AvatarFallback>
            </Avatar>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      {/* Dropdown content with user info and actions */}
      <DropdownMenuContent align="end" className="w-72">
        {/* User info header */}
        <div className="flex items-center gap-2 p-2 border-b">
          {user.profileImage ? (
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.profileImage} alt={user.username} />
              <AvatarFallback>{avatarFallback}</AvatarFallback>
            </Avatar>
          ) : (
            <Avatar className="h-10 w-10 bg-primary text-primary-foreground">
              <AvatarFallback>{avatarFallback}</AvatarFallback>
            </Avatar>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{user.username}</p>
            <p className="text-[10px] text-muted-foreground truncate capitalize">{user.role}</p>
          </div>
        </div>
        
        {/* Profile type */}
        <div className="p-3 space-y-2 border-b">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Profile Type</Label>
          <p className="text-sm font-medium capitalize">{user.profileType || "Investor"}</p>
        </div>
        
        {/* Account status */}
        <div className="p-3 space-y-2 border-b">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Account Status</Label>
          <Badge variant="secondary" className="capitalize">
            {user.profileStatus || "pending"}
          </Badge>
        </div>
        
        <DropdownMenuSeparator />
        
        {/* View profile link */}
        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
            <User className="h-4 w-4" />
            <span className="text-sm">View Profile</span>
          </Link>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        {/* Logout button */}
        <DropdownMenuItem onSelect={() => logout()} className="text-destructive cursor-pointer">
          <LogOut className="h-4 w-4" />
          <span className="text-sm">Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


/**
 * ProtectedLayout Component
 * 
 * Layout wrapper for authenticated routes.
 * Provides:
 * - Sidebar navigation (collapsible)
 * - Header with sidebar trigger, user menu, theme toggle
 * - Main content area with route switching
 * 
 * SECURITY:
 * - Checks if user is authenticated
 * - Shows loading skeleton while checking auth
 * - Redirects to /auth if not authenticated
 * 
 * Routes inside:
 *   /dashboard, /assets, /projects, /deals, /investors,
 *   /allocations, /milestones, /risk-flags, /vendors,
 *   /work-orders, /investor-portal, /profile, /connections
 */
// CSS custom properties for sidebar dimensions (typed correctly as CSS custom properties)
const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
} as React.CSSProperties & Record<string, string>;

function ProtectedLayout() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to /auth if not authenticated
  useEffect(() => {
    if (!user && !isLoading) {
      setLocation("/auth");
    }
  }, [user, isLoading, setLocation]);

  // Show loading skeleton while auth state is being determined
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  // Show loading while redirecting
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  // Render authenticated layout with sidebar and content
  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        {/* Navigation sidebar */}
        <AppSidebar />
        
        {/* Main content area */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Top header with navigation trigger, user menu, theme toggle */}
          <header className="flex items-center justify-between gap-1 p-2 border-b h-12 shrink-0">
            {/* Sidebar toggle button */}
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            
            {/* Right side: user menu and theme toggle */}
            <div className="flex items-center gap-1">
              <UserMenu />
              <ThemeToggle />
            </div>
          </header>
          
          {/* Page content area - switches based on route */}
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/assets" component={Assets} />
              <Route path="/projects" component={Projects} />
              <Route path="/deals" component={Deals} />
              <Route path="/investors" component={Investors} />
              <Route path="/allocations" component={Allocations} />
              <Route path="/milestones" component={Milestones} />
              <Route path="/risk-flags" component={RiskFlags} />
              <Route path="/vendors" component={Vendors} />
              <Route path="/work-orders" component={WorkOrders} />
              <Route path="/entitlement" component={EntitlementPage} />
              <Route path="/reports" component={Reports} />
              <Route path="/investor-portal" component={InvestorPortal} />
              <Route path="/profile" component={Profile} />
              <Route path="/connections" component={Connections} />
              {/* 404 for unknown routes */}
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}


/**
 * App Component - Root Application Component
 * 
 * Sets up all context providers and routing.
 * 
 * PROVIDERS:
 * - ThemeProvider: Dark/light theme support
 * - QueryClientProvider: React Query for data fetching/caching
 * - TooltipProvider: Tooltips for UI elements
 * - AuthProvider: Authentication state management
 * 
 * ROUTING:
 * - Public routes at top level (/, /auth, /auth/forgot-password, /auth/reset-password)
 * - Catch-all route wraps in AuthProvider + ProtectedLayout for protected routes
 */
export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Switch>
              {/* Splash/marketing page - public */}
              <Route path="/" component={Splash} />

              {/* Auth pages - use children to maintain AuthProvider context */}
              <Route path="/auth">
                <AuthPage />
              </Route>
              <Route path="/auth/forgot-password">
                <ForgotPasswordPage />
              </Route>
              <Route path="/auth/reset-password">
                <ResetPasswordPage />
              </Route>

              {/* All other routes - protected with authentication */}
              <Route component={ProtectedLayout} />
            </Switch>

            {/* Toast notifications */}
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
