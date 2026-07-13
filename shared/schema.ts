import { z } from "zod";

export const mediaSchema = z.object({
  url: z.string(),
  type: z.enum(["image", "video"]),
  name: z.string(),
});
export type Media = z.infer<typeof mediaSchema>;

export const portfolioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});
export type Portfolio = z.infer<typeof portfolioSchema>;

export const assetSchema = z.object({
  id: z.string(),
  portfolioId: z.string(),
  name: z.string(),
  location: z.string(),
  assetType: z.string(),
  squareFootage: z.number(),
  status: z.enum(["Pre-dev", "Active", "Stabilized"]),
  assetManager: z.string(),
  media: z.array(mediaSchema).optional().default([]),
  // How the CURRENT USER can access this asset — only present on the by-id
  // GET (owner or share recipient); the list endpoint omits it (lists are
  // portfolio-scoped, so everything there is owned). "view" renders the
  // edit dialog read-only.
  accessLevel: z.enum(["owner", "edit", "view"]).optional(),
});
export type Asset = z.infer<typeof assetSchema>;
export const insertAssetSchema = assetSchema.omit({ id: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;

export const projectSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  portfolioId: z.string(),
  phase: z.string(),
  startDate: z.string(),
  targetCompletion: z.string(),
  budgetTotal: z.number(),
  budgetActual: z.number(),
  status: z.enum(["Planning", "In Progress", "On Track", "At Risk", "On Hold", "Complete", "Completed"]),
  pmAssigned: z.string(),
  description: z.string().optional(),
  media: z.array(mediaSchema).optional().default([]),
  // Current user's access — by-id GET only (see assetSchema.accessLevel)
  accessLevel: z.enum(["owner", "edit", "view"]).optional(),
});
export type Project = z.infer<typeof projectSchema>;
export const insertProjectSchema = projectSchema.omit({ id: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;

export const dealSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  portfolioId: z.string(),
  capitalRequired: z.number(),
  capitalRaised: z.number(),
  returnProfile: z.string(),
  duration: z.string(),
  riskLevel: z.enum(["Low", "Medium", "High"]),
  complexity: z.enum(["Simple", "Moderate", "Complex"]),
  phase: z.string(),
  status: z.enum(["Draft", "Open", "Active", "Funded", "Closed"]),
  // Current user's access — by-id GET only (see assetSchema.accessLevel)
  accessLevel: z.enum(["owner", "edit", "view"]).optional(),
});
export type Deal = z.infer<typeof dealSchema>;
export const insertDealSchema = dealSchema.omit({ id: true });
export type InsertDeal = z.infer<typeof insertDealSchema>;

export const investorSchema = z.object({
  id: z.string(),
  name: z.string(),
  accreditationStatus: z.enum(["Accredited", "Qualified Purchaser", "Pending"]),
  checkSizeMin: z.number(),
  checkSizeMax: z.number(),
  assetPreference: z.string(),
  geographyPreference: z.string(),
  riskTolerance: z.enum(["Conservative", "Moderate", "Aggressive"]),
  structurePreference: z.string(),
  timelinePreference: z.string(),
  strategicInterest: z.string(),
  tierLevel: z.enum(["Tier 1", "Tier 2"]),
  status: z.enum(["Active", "Inactive", "Prospect"]),
});
export type Investor = z.infer<typeof investorSchema>;
export const insertInvestorSchema = investorSchema.omit({ id: true });
export type InsertInvestor = z.infer<typeof insertInvestorSchema>;

export const allocationSchema = z.object({
  id: z.string(),
  investorId: z.string(),
  dealId: z.string(),
  softCommitAmount: z.number(),
  hardCommitAmount: z.number(),
  status: z.enum(["Pending", "Approved", "Soft Commit", "Hard Commit", "Funded", "Declined", "Withdrawn"]),
  timestamp: z.string(),
  notes: z.string().optional(),
});
export type Allocation = z.infer<typeof allocationSchema>;
export const insertAllocationSchema = allocationSchema.omit({ id: true });
export type InsertAllocation = z.infer<typeof insertAllocationSchema>;

export const milestoneSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  category: z.string(),
  targetDate: z.string(),
  completionDate: z.string().optional(),
  status: z.enum(["Not Started", "Pending", "In Progress", "Complete", "Completed", "Delayed"]),
  delayExplanation: z.string().optional(),
  riskFlag: z.boolean(),
});
export type Milestone = z.infer<typeof milestoneSchema>;
export const insertMilestoneSchema = milestoneSchema.omit({ id: true });
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;

export const vendorSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  name: z.string(),
  type: z.string(),
  coiStatus: z.enum(["Current", "Expired", "Pending"]),
  slaType: z.string(),
  performanceScore: z.number(),
  // Current user's access — by-id GET only (see assetSchema.accessLevel)
  accessLevel: z.enum(["owner", "edit", "view"]).optional(),
});
export type Vendor = z.infer<typeof vendorSchema>;
export const insertVendorSchema = vendorSchema.omit({ id: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;

export const workOrderSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  assetId: z.string(),
  type: z.string(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]),
  cost: z.number(),
  capExFlag: z.boolean(),
  status: z.enum(["Open", "In Progress", "Completed", "Cancelled"]),
  completionDate: z.string().optional(),
  description: z.string().optional(),
});
export type WorkOrder = z.infer<typeof workOrderSchema>;
export const insertWorkOrderSchema = workOrderSchema.omit({ id: true });
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;

export const riskFlagSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  category: z.string(),
  severity: z.enum(["Low", "Medium", "High", "Critical"]),
  description: z.string(),
  status: z.enum(["Open", "Mitigated", "Resolved"]),
  createdAt: z.string(),
});
export type RiskFlag = z.infer<typeof riskFlagSchema>;

export const userSchema = z.object({
  id: z.string(),
  username: z.string().min(3),
  password: z.string().optional(),
  role: z.enum(["admin", "manager", "viewer"]).default("viewer"),
  googleId: z.string().optional(),
  email: z.string().optional(),
  profileImage: z.string().optional(),
  profileType: z.enum(["investor", "vendor", "developer"]).optional(),
  profileStatus: z.enum(["active", "inactive", "pending", "suspended"]).default("pending"),
  // General professional fields
  title: z.string().optional(),
  organization: z.string().optional(),
  linkedInUrl: z.string().optional(),
  bio: z.string().optional(),
  // Investor-specific fields
  geographicFocus: z.string().optional(),
  investmentStage: z.string().optional(),
  targetReturn: z.string().optional(),
  checkSizeMin: z.number().optional(),
  checkSizeMax: z.number().optional(),
  riskTolerance: z.enum(["Conservative", "Moderate", "Aggressive"]).optional(),
  strategicInterest: z.string().optional(),
  // Vendor-specific fields
  serviceTypes: z.string().optional(),
  geographicServiceArea: z.string().optional(),
  yearsOfExperience: z.string().optional(),
  certifications: z.string().optional(),
  averageProjectSize: z.number().optional(),
  // Developer-specific fields
  developmentFocus: z.string().optional(),
  developmentType: z.string().optional(),
  teamSize: z.number().optional(),
  portfolioValue: z.number().optional(),
});
export type User = z.infer<typeof userSchema>;
export const insertUserSchema = userSchema.omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;

export const connectionRequestSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  receiverId: z.string(),
  status: z.enum(["pending", "accepted", "declined"]).default("pending"),
  message: z.string().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
  respondedAt: z.string().optional(),
});
export type ConnectionRequest = z.infer<typeof connectionRequestSchema>;
export const insertConnectionRequestSchema = connectionRequestSchema.omit({ id: true }).partial().required({ senderId: true, receiverId: true });
export type InsertConnectionRequest = z.infer<typeof insertConnectionRequestSchema>;

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  content: z.string(),
  // Shared-record card attached to the message, or null for plain text.
  // recordName is the backend's display-name snapshot from send time, so
  // the card renders without fetching the record (and still shows a name
  // if the share is later revoked). Matches Message.to_dict().
  attachment: z
    .object({
      recordType: z.string(),
      recordId: z.number(),
      recordName: z.string(),
    })
    .nullable()
    .optional(),
  readAt: z.string().optional(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof messageSchema>;
export const insertMessageSchema = messageSchema.omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  userId1: z.string(),
  userId2: z.string(),
  // Participant display names (full_name) with username fallbacks,
  // provided by the backend so conversation lists can label the other
  // party without an extra user lookup.
  user1Name: z.string().nullable().optional(),
  user1Username: z.string().nullable().optional(),
  user2Name: z.string().nullable().optional(),
  user2Username: z.string().nullable().optional(),
  // Number of messages addressed to the CURRENT USER (the JWT caller) not
  // yet read — viewer-dependent, computed per request by the backend.
  unreadCount: z.number().optional(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;
export const insertConversationSchema = conversationSchema.omit({ id: true, updatedAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
