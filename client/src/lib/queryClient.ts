/**
 * CapitalOps API Query Client Configuration
 *
 * Purpose: Provides standardized API request handling and TanStack Query configuration
 * for all data fetching operations in the application.
 *
 * Security:
 * - Auth tokens are stored in sessionStorage (accessible to JavaScript)
 * - Token is sent as Authorization: Bearer header on every API request
 * - 401 responses trigger logout and redirect to /auth
 *
 * Approach:
 * - apiRequest() - Bearer token fetch with 401 handling
 * - getQueryFn() - Creates query functions with 401 handling
 * - queryClient - Global TanStack Query instance with caching and retry configuration
 */

import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { uploadToS3 } from "./s3";
import { clearAccessToken, getAuthHeader } from "./auth-token";

const API_BASE = (import.meta.env as any).VITE_BACKEND_URL || "";

const LOGOUT_URL = `${API_BASE}/api/v1/auth/logout`;

/**
 * Throw error if response status is not OK (2xx).
 * Extracts error message from response body for better debugging.
 */
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Handle 401 response by clearing token and redirecting to /auth.
 */
async function handleUnauthorized(): Promise<void> {
  clearAccessToken();
  try {
    const headers = getAuthHeader();
    await fetch(LOGOUT_URL, {
      method: "POST",
      headers,
    });
  } catch {
    // Ignore logout errors — we're redirecting anyway
  }
  window.location.href = "/auth";
}

/**
 * Makes HTTP request to API with Bearer token auth.
 *
 * @param method - HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param url - API endpoint URL
 * @param data - Optional request body for POST/PUT/PATCH
 * @returns Promise that resolves to Response object
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...getAuthHeader(),
    ...(data ? { "Content-Type": "application/json" } : {}),
  };
  const fullUrl = API_BASE + url;
  const res = await fetch(fullUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  if (res.status === 401) {
    handleUnauthorized();
  }

  await throwIfResNotOk(res);
  return res;
}

export { uploadToS3 };

type UnauthorizedBehavior = "returnNull" | "throw";

/**
 * Creates TanStack Query function factory with authentication handling
 *
 * @param options.on401 - Behavior when 401 (unauthorized) response received
 * @returns QueryFunction that fetches data with Bearer token auth and handles auth errors
 */
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers = getAuthHeader();
    const fullUrl = API_BASE + queryKey.join("/");
    const res = await fetch(fullUrl, {
      headers,
    });

    if (res.status === 401) {
      clearAccessToken();
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      handleUnauthorized();
      throw new Error("Unauthorized");
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

/**
 * Global TanStack Query client instance
 *
 * Configuration:
 * - queries: Infinite stale time (manual refetch only), no retry on failure
 * - mutations: No retry to avoid duplicate operations
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});