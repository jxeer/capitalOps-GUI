/**
 * use-auth.tsx - Frontend Authentication Hook
 *
 * Provides authentication state and actions throughout the React application.
 * Auth tokens are stored in sessionStorage and sent as Bearer tokens.
 *
 * IMPORTANT: This file uses the OLD /api/login endpoint (compat layer).
 * The NEW /api/v1/auth/login endpoint is used directly in auth-page.tsx
 * for the MFA flow. This file is kept for backwards compatibility.
 *
 * AUTHENTICATION FLOW:
 * 1. User credentials sent to /api/login
 * 2. Server returns JWT in response body (accessToken field)
 * 3. JWT stored in sessionStorage and sent as Authorization: Bearer header
 * 4. AuthContext provides user state to entire app
 * 5. All requests use Authorization: Bearer <token> header
 */

import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { getAuthHeader, clearAccessToken } from "@/lib/auth-token";

const API_BASE = (import.meta.env as any).VITE_BACKEND_URL || "";

/**
 * User data type returned from authenticated endpoints.
 */
type AuthUser = {
  id: string;
  username: string;
  role: string;
  profileType?: string;
  profileStatus?: string;
  profileImage?: string;
  email?: string;
  title?: string;
  organization?: string;
  linkedInUrl?: string;
  bio?: string;
  geographicFocus?: string;
  investmentStage?: string;
  targetReturn?: string;
  checkSizeMin?: number;
  checkSizeMax?: number;
  riskTolerance?: "Conservative" | "Moderate" | "Aggressive";
  strategicInterest?: string;
  serviceTypes?: string;
  geographicServiceArea?: string;
  yearsOfExperience?: string;
  certifications?: string;
  averageProjectSize?: number;
  developmentFocus?: string;
  developmentType?: string;
  teamSize?: number;
  portfolioValue?: number;
};

/**
 * Authentication context type.
 */
type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email: string) => Promise<void>;
  logout: () => Promise<void>;
};

// Create React context for auth state
const AuthContext = createContext<AuthContextType | null>(null);

/**
 * AuthProvider Component
 *
 * Wraps the application to provide authentication state.
 * Uses React Query to fetch and cache user data.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

/**
    * Query to fetch current user from /api/user endpoint.
    * Uses Bearer token from sessionStorage — Authorization header.
    */
   const { data: user, isLoading } = useQuery<AuthUser | null>({
     queryKey: ["/api/user"],
     queryFn: async () => {
       const headers = { ...getAuthHeader(), "Content-Type": "application/json" };
       const res = await fetch(`${API_BASE}/api/user`, {
         headers,
       });
       if (res.status === 401) {
         clearAccessToken();
         return null;
       }
       if (!res.ok) throw new Error("Failed to fetch user");
       return res.json();
     },
     staleTime: Infinity,
     retry: false,
   });

/**
    * Login mutation (DEPRECATED — does not support MFA)
    */
   const loginMutation = useMutation({
     mutationFn: async ({ username, password }: { username: string; password: string }) => {
       const headers = { "Content-Type": "application/json" };
       const res = await fetch(`${API_BASE}/api/login`, {
         method: "POST",
         headers,
         body: JSON.stringify({ username, password }),
       });
       if (!res.ok) {
         const text = await res.text();
         throw new Error(`${res.status}: ${text}`);
       }
       return res.json();
     },
     onSuccess: (data) => {
       if (data.accessToken) {
         import("@/lib/auth-token").then(m => m.setAccessToken(data.accessToken));
       }
       queryClient.invalidateQueries();
       setLocation("/dashboard");
     },
     onError: (err: Error) => {
       toast({ title: "Login failed", description: err.message, variant: "destructive" });
     },
   });

  /**
   * Register mutation
   */
  const registerMutation = useMutation({
    mutationFn: async ({ username, password, email }: { username: string; password: string; email: string }) => {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers,
        body: JSON.stringify({ username, password, email }),
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    },
  });

/**
    * Logout mutation — clears token and redirects.
    */
   const logoutMutation = useMutation({
     mutationFn: async () => {
       try {
         await fetch(`${API_BASE}/api/v1/auth/logout`, {
           method: "POST",
           headers: getAuthHeader(),
         });
       } catch {
         // Ignore errors
       }
       clearAccessToken();
     },
     onSuccess: () => {
       queryClient.clear();
       window.location.href = "/auth";
     },
   });

  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };

  const register = async (username: string, password: string, email: string) => {
    await registerMutation.mutateAsync({ username, password, email });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth Hook
 *
 * Access authentication state from any component.
 * Must be used within an AuthProvider.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

// Re-export queryClient for backwards compatibility
export { queryClient } from "@/lib/queryClient";