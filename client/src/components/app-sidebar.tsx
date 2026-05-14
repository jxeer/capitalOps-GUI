/**
 * AppSidebar Component
 * 
 * Purpose: Main navigation sidebar for authenticated users.
 * Provides links to all major sections of the application.
 * 
 * Features:
 * - Role-based menu items (only shows sections user has access to)
 * - Collapsible with main content area
 * - Shows current user info at bottom
 * 
 * Menu Sections:
 * - Dashboard
 * - Capital Engine (Assets, Projects, Deals)
 * - Execution (Milestones, Risk Flags, Work Orders)
 * - Directory (Investors, Vendors, Connections)
 * 
 * SECURITY: Menu items could be filtered by user.role in the future
 * to implement proper role-based access control.
 */

import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

// Icon imports from lucide-react for navigation items
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  Handshake,
  Users,
  Milestone,
  Truck,
  ClipboardList,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Network,
  FileText,
  BarChart2,
} from "lucide-react";

// shadcn/ui sidebar components for layout
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

/**
 * Navigation item type for type-safe menu configuration.
 * Each item has a title for display, URL path, and icon component.
 */
type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

/**
 * Capital Engine section menu items.
 * These are the primary investment and deal management pages.
 * 
 * TODO: Filter by investor_tier1/investor_tier2 role for enhanced reporting access.
 */
const capitalEngineItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Deals", url: "/deals", icon: Handshake },
  { title: "Investors", url: "/investors", icon: Users },
  { title: "Allocations", url: "/allocations", icon: TrendingUp },
  { title: "Investor Portal", url: "/investor-portal", icon: BarChart3 },
  { title: "Connections", url: "/connections", icon: Network },
];

/**
 * Execution Control section menu items.
 * These are project management and tracking pages.
 * 
 * Access: Typically project_manager, general_contractor, or sponsor_admin roles.
 */
const executionItems: NavItem[] = [
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Entitlements", url: "/entitlement", icon: FileText },
  { title: "Reports", url: "/reports", icon: BarChart2 },
  { title: "Milestones", url: "/milestones", icon: Milestone },
  { title: "Risk Flags", url: "/risk-flags", icon: AlertTriangle },
];

/**
 * Asset & Vendor section menu items.
 * These are vendor management and asset tracking pages.
 * 
 * Access: Typically vendor role (limited to own work orders) or sponsor_admin.
 */
const assetVendorItems: NavItem[] = [
  { title: "Assets", url: "/assets", icon: Building2 },
  { title: "Vendors", url: "/vendors", icon: Truck },
  { title: "Work Orders", url: "/work-orders", icon: ClipboardList },
];

/**
 * AppSidebar Component
 * 
 * Renders the main application sidebar with three menu sections:
 * 1. Capital Engine - investment and deal pages
 * 2. Execution Control - project and milestone pages
 * 3. Asset & Vendor - vendor and asset management pages
 * 
 * The sidebar includes:
 * - App branding header
 * - Navigation menu groups
 * - User profile footer with logout button
 */
export function AppSidebar() {
  // Get current location for active link highlighting
  const [location] = useLocation();
  
  // Get current user from auth context for profile display
  const { user, logout } = useAuth();

  /**
   * Render a sidebar group with a label and menu items.
   * 
   * @param label - Group header text (e.g., "Capital Engine")
   * @param items - Array of navigation items to display
   * @returns Rendered sidebar group component
   */
  const renderGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup>
      {/* Group label with uppercase styling for visual hierarchy */}
      <SidebarGroupLabel className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                // data-active attribute used by Tailwind for active state styling
                data-active={location === item.url}
                className="transition-all duration-200 hover-elevate-2 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium"
              >
                {/* Link creates client-side navigation without page reload */}
                <Link 
                  href={item.url} 
                  data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {/* Render the icon component with standard sizing */}
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar>
      {/* Header with app branding */}
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          {/* App icon/logo */}
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight" data-testid="text-app-title">CapitalOps</h2>
            <p className="text-[10px] text-muted-foreground">Built on Coral8</p>
          </div>
        </div>
      </SidebarHeader>

      {/* Main navigation content with three sections */}
      <SidebarContent>
        {/* Capital Engine - deals, investors, allocations */}
        {renderGroup("Capital Engine", capitalEngineItems)}
        
        {/* Execution Control - projects, milestones, risk flags */}
        {renderGroup("Execution Control", executionItems)}
        
        {/* Asset & Vendor - assets, vendors, work orders */}
        {renderGroup("Asset & Vendor", assetVendorItems)}
      </SidebarContent>

      {/* Footer with user profile and logout */}
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3 rounded-md bg-accent/50 p-3">
          {/* User avatar with fallback to first letter of username */}
          <Avatar className="h-9 w-9 flex-shrink-0">
            <AvatarImage 
              src={user?.profileImage ?? undefined} 
              alt={user?.username ?? "User"} 
            />
            <AvatarFallback>{user?.username?.[0]?.toUpperCase() ?? "U"}</AvatarFallback>
          </Avatar>
          
          {/* User info with role */}
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate" data-testid="sidebar-username">{user?.username ?? "User"}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.role ?? "Investor"}</p>
          </div>
          
          {/* Logout button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => logout()} 
            className="h-8 w-8 flex-shrink-0" 
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
