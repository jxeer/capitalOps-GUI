// Server routes configuration for CapitalOps API endpoints
// Handles proxying to Flask backend OR fallback to in-memory storage
// All routes follow the pattern: try backend first, use local storage if unavailable

import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { log } from "./index";
import { setupAuth, requireAuth, hashPassword, comparePasswords, setJwtCookie, clearJwtCookie, getUserFromRequest } from "./auth";
import passport from "passport";

// Multer middleware for parsing multipart/form-data file uploads

// const multer = require("multer"); // disabled due to type issues


// Backend URL from environment - proxies /api/* routes to Flask backend
const BACKEND_URL = process.env.BACKEND_URL || "";

const PATH_MAP: Record<string, string> = {
  "/api/projects":          "/api/v1/execution/projects",
  "/api/assets":            "/api/v1/execution/assets",
  "/api/milestones":        "/api/v1/execution/milestones",
  "/api/deals":             "/api/v1/capital/deals",
  "/api/investors":         "/api/v1/capital/investors",
  "/api/allocations":       "/api/v1/capital/allocations",
  "/api/vendors":           "/api/v1/vendor/vendors",
  "/api/work-orders":       "/api/v1/vendor/work-orders",
  "/api/risk-flags":        "/api/v1/execution/risk-flags",
  "/api/dashboard/stats":   "/api/v1/dashboard/stats",
  "/api/portfolios":        "/api/v1/capital/portfolios",
};

function translatePath(path: string): string {
  return PATH_MAP[path] ?? path;
}

// Proxy request to Flask backend and return result
// Falls back to local storage if backend unavailable
async function proxyToBackend(path: string, method: string, body?: unknown, isFormData?: boolean): Promise<{ ok: boolean; status: number; data: unknown }> {
  // If no backend URL configured, use local storage
  if (!BACKEND_URL) return { ok: false, status: 0, data: null };

  try {
    const url = `${BACKEND_URL}${path}`;
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };
    // Add API key for authentication with backend
    if (process.env.COMPAT_API_KEY) {
      headers["X-API-Key"] = process.env.COMPAT_API_KEY;
    }
    
    let bodyData: BodyInit | null | undefined = undefined;
    if (body) {
      if (isFormData) {
        // For multipart/form-data, body is already a FormData object
        bodyData = body as BodyInit;
      } else if (method === "POST" || method === "PUT" || method === "PATCH") {
        // For JSON data, stringify the body
        bodyData = JSON.stringify(body);
        headers["Content-Type"] = "application/json";
      }
    }
    
    const options: RequestInit = { method, headers, body: bodyData };
    
    const response = await fetch(url, options);
    if (response.ok) {
      const data = await response.json();
      return { ok: true, status: response.status, data };
    }
    return { ok: false, status: response.status, data: null };
  } catch (err) {
    log(`Backend proxy error for ${path}: ${err}`, "proxy");
    return { ok: false, status: 0, data: null };
  }
}

// Helper to try backend first, fallback to local storage for any request type
// Logs which method was used for debugging
// Used for POST/PUT/DELETE mutations that require write operations
async function withBackendFallback(
  req: Request,
  res: Response,
  localHandler: () => Promise<unknown>
) {
  const backendPath = translatePath(req.originalUrl);
  const result = await proxyToBackend(backendPath, req.method, req.body);

  if (result.ok) {
    log(`Proxied ${req.method} ${backendPath} -> backend (${result.status})`, "proxy");
    const corsHeaders = {"Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": "true", "Vary": "Origin"}; res.set(corsHeaders); return res.status(result.status).json(result.data);
  }

  // Backend unavailable - use in-memory storage
  log(`Backend unavailable for ${backendPath}, using local storage`, "proxy");
  await localHandler();
}

// Check if ID matches seed data pattern (asset|proj|deal|inv|alloc|ms|vend|wo|rf|port)-\d+
// Seed IDs are pre-populated with realistic test data
function isSeedId(id: string): boolean {
  return /^(asset|proj|deal|inv|alloc|ms|vend|wo|rf|port)-\d+$/.test(id);
}

// Check if user is admin
async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await storage.getUser(userId);
  return user?.role === "admin";
}

// Filter out seed data for non-admin users
async function filterSeedData<T extends { id: string }>(items: T[], userId: string | undefined): Promise<T[]> {
  const admin = await isAdmin(userId);
  return admin ? items : items.filter(item => !isSeedId(item.id));
}

// For GET list requests - merge backend results with locally-created items
// Backend returns seed data, local storage has user-created items with UUIDs
// Combines both to show complete list to user
async function withMergedList<T extends { id: string }>(
  req: Request,
  res: Response,
  getLocal: () => Promise<T[]>
) {
  const backendPath = translatePath(req.originalUrl);
  const result = await proxyToBackend(backendPath, "GET");
  const user = getUserFromRequest(req);

  if (result.ok && Array.isArray(result.data)) {
    log(`Proxied GET ${backendPath} -> backend (${result.status})`, "proxy");
    const localItems = await getLocal();
    const backendIds = new Set((result.data as T[]).map(item => item.id));
    // Include seed items not covered by backend + any user-created local items
    const localNotInBackend = localItems.filter(item => !backendIds.has(item.id));
    const merged = [...(result.data as T[]), ...localNotInBackend];
    // Filter seed data for non-admin users
    const filtered = await filterSeedData(merged, user?.id);
    return res.json(filtered);
  }

  // Backend unavailable - use only local storage
  log(`Backend unavailable for ${backendPath}, using local storage`, "proxy");
  const localItems = await getLocal();
  // Filter seed data for non-admin users
  const filtered = await filterSeedData(localItems, user?.id);
  res.json(filtered);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  // Seed a default admin user if none exists
  (async () => {
    const existing = await storage.getUserByUsername("admin");
    if (!existing) {
      const hashed = await hashPassword("admin123");
      const admin = await storage.createUser({
        username: "admin",
        password: hashed,
        role: "admin",
        profileStatus: "active",
        profileType: "developer",
        title: "System Administrator",
        organization: "CapitalOps",
        email: "admin@capitalops.com",
      });
      log("Default admin user created (admin/admin123)");
      
      // Seed data for admin user
      await storage.seed(admin.id);
      log("Seed data populated for admin user");
    }
  })();

  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      if (username.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const hashed = await hashPassword(password);
      const user = await storage.createUser({ 
        username, 
        password: hashed, 
        role: "viewer", 
        profileStatus: "active",
        title: username,
      });

      const userData = { id: user.id, username: user.username, role: user.role };
      setJwtCookie(res, userData);
      res.status(201).json(userData);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      const userData = { id: user.id, username: user.username, role: user.role };
      setJwtCookie(res, userData);
      
      // Seed data for admin users on first login
      if (user.role === "admin") {
        await storage.seed(user.id);
      }
      
      res.json(userData);
    })(req, res, next);
  });

  app.post("/api/logout", (_req, res) => {
    clearJwtCookie(res);
    res.json({ message: "Logged out" });
  });

   app.get("/api/users", async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const users = await storage.getUsers();
      const search = req.query.search as string;
      if (search) {
        const lowerSearch = search.toLowerCase();
        const filtered = users.filter(u => 
          u.username?.toLowerCase().includes(lowerSearch) ||
          u.title?.toLowerCase().includes(lowerSearch) ||
          u.organization?.toLowerCase().includes(lowerSearch)
        );
        return res.json(filtered);
      }
      res.json(users);
    });
  });

  app.get("/api/user", requireAuth, async (req, res) => {
     const user = getUserFromRequest(req);
     if (!user) return res.status(401).json({ message: "Not authenticated" });
     const fullUser = await storage.getUser(user.id);
     if (!fullUser) return res.status(404).json({ message: "User not found" });
     res.json({
       id: fullUser.id,
       username: fullUser.username,
       role: fullUser.role,
       profileType: fullUser.profileType,
       profileStatus: fullUser.profileStatus,
       profileImage: fullUser.profileImage,
       email: fullUser.email,
       title: fullUser.title,
       organization: fullUser.organization,
       linkedInUrl: fullUser.linkedInUrl,
       bio: fullUser.bio,
       geographicFocus: fullUser.geographicFocus,
       investmentStage: fullUser.investmentStage,
       targetReturn: fullUser.targetReturn,
       checkSizeMin: fullUser.checkSizeMin,
       checkSizeMax: fullUser.checkSizeMax,
       riskTolerance: fullUser.riskTolerance,
       strategicInterest: fullUser.strategicInterest,
       serviceTypes: fullUser.serviceTypes,
       geographicServiceArea: fullUser.geographicServiceArea,
       yearsOfExperience: fullUser.yearsOfExperience,
       certifications: fullUser.certifications,
       averageProjectSize: fullUser.averageProjectSize,
       developmentFocus: fullUser.developmentFocus,
       developmentType: fullUser.developmentType,
       teamSize: fullUser.teamSize,
       portfolioValue: fullUser.portfolioValue,
     });
   });

  app.put("/api/users/:id", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const updatedUser = await storage.updateUser(req.params["id"] as string, req.body);
      if (!updatedUser) return res.status(404).json({ message: "User not found" });
      res.json(updatedUser);
    } catch (err) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  app.get("/api/auth/google", (req, res, next) => {
    if (!googleEnabled) {
      return res.status(503).json({ message: "Google sign-in is not configured" });
    }
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    if (!googleEnabled) {
      return res.redirect("/auth?error=google_failed");
    }
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const base = process.env.APP_URL || `${proto}://${host}`;

    passport.authenticate("google", (err: any, user: any, info: any) => {
      if (err) {
        console.error("[auth] Google callback error:", err);
        return res.redirect(`${base}/auth?error=google_failed`);
      }
      if (!user) {
        console.warn("[auth] Google callback: no user returned, info:", info);
        return res.redirect(`${base}/auth?error=google_failed`);
      }
      console.log("[auth] Google login success for user:", user.username);
      setJwtCookie(res, { id: user.id, username: user.username, role: user.role });
      res.redirect(`${base}/`);
    })(req, res, next);
  });

  app.get("/api/auth/google/status", (_req, res) => {
    res.json({ enabled: googleEnabled });
  });

  app.get("/api/backend-status", async (_req, res) => {
    if (!BACKEND_URL) {
      return res.json({ connected: false, url: null, mode: "local" });
    }
    try {
      const response = await fetch(BACKEND_URL);
      const data = await response.json();
      res.json({ connected: response.ok, url: BACKEND_URL, mode: "proxy", backendInfo: data });
    } catch {
      res.json({ connected: false, url: BACKEND_URL, mode: "local-fallback" });
    }
  });

  app.get("/api/dashboard/stats", async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const stats = await storage.getDashboardStats();
      const user = getUserFromRequest(req);
      const admin = await isAdmin(user?.id);
      if (!admin) {
        res.json({
          totalAssets: 0,
          activeProjects: 0,
          totalCapitalRequired: 0,
          totalCapitalRaised: 0,
          activeDeals: 0,
          totalInvestors: 0,
          openWorkOrders: 0,
          riskFlags: 0,
        });
      } else {
        res.json(stats);
      }
    });
  });

  app.get("/api/portfolios", async (req, res) => {
    await withMergedList(req, res, () => storage.getPortfolios());
  });

  // Assets
  app.get("/api/assets", async (req, res) => {
    await withMergedList(req, res, () => storage.getAssets());
  });

  app.get("/api/assets/:id", async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const asset = await storage.getAsset(req.params["id"] as string);
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      res.json(asset);
    });
  });

  app.post("/api/assets", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const asset = await storage.createAsset(req.body);
      res.status(201).json(asset);
    });
  });

  app.put("/api/assets/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const asset = await storage.updateAsset(req.params["id"] as string, req.body);
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      res.json(asset);
    });
  });

  app.delete("/api/assets/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deleted = await storage.deleteAsset(req.params["id"] as string);
      if (!deleted) return res.status(404).json({ message: "Asset not found" });
      res.json({ message: "Deleted" });
    });
  });

  // Projects
  app.get("/api/projects", async (req, res) => {
    await withMergedList(req, res, () => storage.getProjects());
  });

  app.get("/api/projects/:id", async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const project = await storage.getProject(req.params["id"] as string);
      if (!project) return res.status(404).json({ message: "Project not found" });
      res.json(project);
    });
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const project = await storage.createProject(req.body);
      res.status(201).json(project);
    });
  });

  app.put("/api/projects/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const project = await storage.updateProject(req.params["id"] as string, req.body);
      if (!project) return res.status(404).json({ message: "Project not found" });
      res.json(project);
    });
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deleted = await storage.deleteProject(req.params["id"] as string);
      if (!deleted) return res.status(404).json({ message: "Project not found" });
      res.json({ message: "Deleted" });
    });
  });

  // Deals
  app.get("/api/deals", async (req, res) => {
    await withMergedList(req, res, () => storage.getDeals());
  });

  app.get("/api/deals/:id", async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deal = await storage.getDeal(req.params["id"] as string);
      if (!deal) return res.status(404).json({ message: "Deal not found" });
      res.json(deal);
    });
  });

  app.post("/api/deals", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deal = await storage.createDeal(req.body);
      res.status(201).json(deal);
    });
  });

  app.put("/api/deals/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deal = await storage.updateDeal(req.params["id"] as string, req.body);
      if (!deal) return res.status(404).json({ message: "Deal not found" });
      res.json(deal);
    });
  });

  app.delete("/api/deals/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deleted = await storage.deleteDeal(req.params["id"] as string);
      if (!deleted) return res.status(404).json({ message: "Deal not found" });
      res.json({ message: "Deleted" });
    });
  });

  // Investors
  app.get("/api/investors", async (req, res) => {
    await withMergedList(req, res, () => storage.getInvestors());
  });

  app.get("/api/investors/:id", async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const investor = await storage.getInvestor(req.params["id"] as string);
      if (!investor) return res.status(404).json({ message: "Investor not found" });
      res.json(investor);
    });
  });

  app.post("/api/investors", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const investor = await storage.createInvestor(req.body);
      res.status(201).json(investor);
    });
  });

  app.put("/api/investors/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const investor = await storage.updateInvestor(req.params["id"] as string, req.body);
      if (!investor) return res.status(404).json({ message: "Investor not found" });
      res.json(investor);
    });
  });

  app.delete("/api/investors/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deleted = await storage.deleteInvestor(req.params["id"] as string);
      if (!deleted) return res.status(404).json({ message: "Investor not found" });
      res.json({ message: "Deleted" });
    });
  });

  // Allocations
  app.get("/api/allocations", async (req, res) => {
    await withMergedList(req, res, () => storage.getAllocations());
  });

  app.post("/api/allocations", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const allocation = await storage.createAllocation(req.body);
      res.status(201).json(allocation);
    });
  });

  app.put("/api/allocations/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const allocation = await storage.updateAllocation(req.params["id"] as string, req.body);
      if (!allocation) return res.status(404).json({ message: "Allocation not found" });
      res.json(allocation);
    });
  });

  app.delete("/api/allocations/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deleted = await storage.deleteAllocation(req.params["id"] as string);
      if (!deleted) return res.status(404).json({ message: "Allocation not found" });
      res.json({ message: "Deleted" });
    });
  });

  // Milestones
  app.get("/api/milestones", async (req, res) => {
    await withMergedList(req, res, () => storage.getMilestones());
  });

  app.get("/api/milestones/project/:projectId", async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const milestones = await storage.getMilestonesByProject(req.params.projectId);
      res.json(milestones);
    });
  });

  app.post("/api/milestones", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const milestone = await storage.createMilestone(req.body);
      res.status(201).json(milestone);
    });
  });

  app.put("/api/milestones/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const milestone = await storage.updateMilestone(req.params["id"] as string, req.body);
      if (!milestone) return res.status(404).json({ message: "Milestone not found" });
      res.json(milestone);
    });
  });

  app.delete("/api/milestones/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deleted = await storage.deleteMilestone(req.params["id"] as string);
      if (!deleted) return res.status(404).json({ message: "Milestone not found" });
      res.json({ message: "Deleted" });
    });
  });

  // Vendors
  app.get("/api/vendors", async (req, res) => {
    await withMergedList(req, res, () => storage.getVendors());
  });

  app.get("/api/vendors/:id", async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const vendor = await storage.getVendor(req.params["id"] as string);
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });
      res.json(vendor);
    });
  });

  app.post("/api/vendors", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const vendor = await storage.createVendor(req.body);
      res.status(201).json(vendor);
    });
  });

  app.put("/api/vendors/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const vendor = await storage.updateVendor(req.params["id"] as string, req.body);
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });
      res.json(vendor);
    });
  });

  app.delete("/api/vendors/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deleted = await storage.deleteVendor(req.params["id"] as string);
      if (!deleted) return res.status(404).json({ message: "Vendor not found" });
      res.json({ message: "Deleted" });
    });
  });

  // Work Orders
  app.get("/api/work-orders", async (req, res) => {
    await withMergedList(req, res, () => storage.getWorkOrders());
  });

  app.get("/api/work-orders/vendor/:vendorId", async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const workOrders = await storage.getWorkOrdersByVendor(req.params.vendorId);
      res.json(workOrders);
    });
  });

  app.post("/api/work-orders", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const workOrder = await storage.createWorkOrder(req.body);
      res.status(201).json(workOrder);
    });
  });

  app.put("/api/work-orders/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const workOrder = await storage.updateWorkOrder(req.params["id"] as string, req.body);
      if (!workOrder) return res.status(404).json({ message: "Work order not found" });
      res.json(workOrder);
    });
  });

  app.delete("/api/work-orders/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deleted = await storage.deleteWorkOrder(req.params["id"] as string);
      if (!deleted) return res.status(404).json({ message: "Work order not found" });
      res.json({ message: "Deleted" });
    });
  });

  // Risk Flags
  app.get("/api/risk-flags", async (req, res) => {
    await withMergedList(req, res, () => storage.getRiskFlags());
  });

  app.get("/api/risk-flags/project/:projectId", async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const riskFlags = await storage.getRiskFlagsByProject(req.params.projectId);
      res.json(riskFlags);
    });
  });

  app.post("/api/risk-flags", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const flag = await storage.createRiskFlag({ ...req.body, createdAt: req.body.createdAt || new Date().toISOString() });
      res.status(201).json(flag);
    });
  });

  app.put("/api/risk-flags/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const flag = await storage.updateRiskFlag(req.params["id"] as string, req.body);
      if (!flag) return res.status(404).json({ message: "Risk flag not found" });
      res.json(flag);
    });
  });

  app.delete("/api/risk-flags/:id", requireAuth, async (req, res) => {
    await withBackendFallback(req, res, async () => {
      const deleted = await storage.deleteRiskFlag(req.params["id"] as string);
      if (!deleted) return res.status(404).json({ message: "Risk flag not found" });
      res.json({ message: "Deleted" });
    });
  });

  // Connection Request Routes
  app.get("/api/connection-requests", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const requests = await storage.getConnectionRequestsByUserId(user.id);
      res.json(requests);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch connection requests" });
    }
  });

  app.post("/api/connection-requests", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { receiverId, message } = req.body;
      if (!receiverId) return res.status(400).json({ message: "Receiver ID is required" });
      
      const existing = await storage.getConnectionRequestsByUserId(user.id).then(reqs => 
        reqs.find(r => 
          (r.senderId === user.id && r.receiverId === receiverId) ||
          (r.senderId === receiverId && r.receiverId === user.id)
        )
      );
      if (existing && existing.status === "pending") {
        return res.status(400).json({ message: "Connection request already exists" });
      }
      
      const request = await storage.createConnectionRequest({
        senderId: user.id,
        receiverId,
        message,
      });
      res.status(201).json(request);
    } catch (err) {
      res.status(500).json({ message: "Failed to create connection request" });
    }
  });

  app.put("/api/connection-requests/:id", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { status } = req.body;
      if (status !== "accepted" && status !== "declined") {
        return res.status(400).json({ message: "Status must be 'accepted' or 'declined'" });
      }
      
      const request = await storage.getConnectionRequestById(req.params["id"] as string);
      if (!request) return res.status(404).json({ message: "Connection request not found" });
      if (request.receiverId !== user.id) return res.status(403).json({ message: "Only the receiver can respond" });
      
      const updated = await storage.updateConnectionRequest(req.params["id"] as string, status);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update connection request" });
    }
  });

  app.delete("/api/connection-requests/:id", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const request = await storage.getConnectionRequestById(req.params["id"] as string);
      if (!request) return res.status(404).json({ message: "Connection request not found" });
      if (request.senderId !== user.id && request.receiverId !== user.id) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      const deleted = await storage.deleteConnectionRequest(req.params["id"] as string);
      if (!deleted) return res.status(404).json({ message: "Connection request not found" });
      res.json({ message: "Deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete connection request" });
    }
  });

  app.get("/api/connections", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const connectedUsers = await storage.getConnectedUsers(user.id);
      res.json(connectedUsers);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch connections" });
    }
  });

  app.get("/api/connection-pending", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const pendingRequests = await storage.getPendingConnectionRequests(user.id);
      res.json(pendingRequests);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch pending requests" });
    }
  });

  // Conversation Routes
  app.get("/api/conversations", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const conversations = await storage.getConversationsForUser(user.id);
      res.json(conversations);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { otherUserId } = req.body;
      if (!otherUserId) return res.status(400).json({ message: "Other user ID is required" });
      
      const conversation = await storage.getOrCreateConversation(user.id, otherUserId);
      res.status(201).json(conversation);
    } catch (err) {
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // Message Routes
  app.get("/api/messages", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { conversationId } = req.query;
      if (!conversationId || typeof conversationId !== "string") {
        return res.status(400).json({ message: "Conversation ID is required" });
      }
      const messages = await storage.getMessagesByConversation(conversationId);
      res.json(messages);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { conversationId, content } = req.body;
      if (!conversationId || !content) {
        return res.status(400).json({ message: "Conversation ID and content are required" });
      }
      
      await storage.updateConversation(conversationId);
      const message = await storage.createMessage({
        conversationId,
        senderId: user.id,
        content,
      });
      res.status(201).json(message);
    } catch (err) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.put("/api/messages/:id/read", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const message = await storage.updateMessageReadStatus(req.params["id"] as string);
      if (!message) return res.status(404).json({ message: "Message not found" });
      res.json(message);
    } catch (err) {
      res.status(500).json({ message: "Failed to update message" });
    }
  });

  app.delete("/api/messages/:id", requireAuth, async (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    try {
      const message = await storage.getMessageById(req.params["id"] as string);
      if (!message) return res.status(404).json({ message: "Message not found" });
      if (message.senderId !== user.id) {
        return res.status(403).json({ message: "Not authorized to delete this message" });
      }
      
      const deleted = await storage.deleteMessage(req.params["id"] as string);
      if (!deleted) return res.status(404).json({ message: "Message not found" });
      res.json({ message: "Deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete message" });
    }
  });

  // Upload route - proxy base64-encoded images to Flask backend
  app.post("/api/upload", requireAuth, async (req, res) => {
    log("POST /api/upload received", "proxy");
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    // Expect JSON body with base64-encoded image
    const body = req.body;
    if (!body || !body.imageData) {
      return res.status(400).json({ error: "imageData required" });
    }

    if (BACKEND_URL) {
      try {
        const url = `${BACKEND_URL}/api/upload`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (process.env.COMPAT_API_KEY) {
          headers["X-API-Key"] = process.env.COMPAT_API_KEY;
        }

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (response.ok) {
          const data = await response.json();
          log(`Proxied POST /api/upload -> backend (${response.status})`, "proxy");
          res.set({
            "Access-Control-Allow-Origin": "http://localhost:3000",
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin"
          });
          return res.status(response.status).json(data);
        }
        log(`Backend proxy failed for /api/upload: ${response.status}`, "proxy");
      } catch (err) {
        log(`Backend proxy error for /api/upload: ${err}`, "proxy");
      }
    }

    res.status(500).json({ error: "Upload service unavailable" });
  });

  return httpServer;
}
