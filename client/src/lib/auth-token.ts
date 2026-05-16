/**
 * auth-token.ts - JWT Token Storage and Retrieval
 *
 * Stores the JWT access token in sessionStorage (accessible to JavaScript).
 * This is used instead of httpOnly cookies because cross-origin requests
 * (Vercel frontend -> Railway backend) cannot set cookies on the frontend domain.
 *
 * Security Notes:
 * - Token is stored in sessionStorage (cleared on tab close)
 * - Token is sent as Authorization: Bearer header on every API request
 * - Logout clears the token from sessionStorage
 * - The JWT itself is signed by the backend and contains user identity + role
 */

const TOKEN_KEY = "capitalops_access_token";

export function getAccessToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // sessionStorage may be blocked (e.g., private browsing with storage limits)
    console.error("Failed to store access token in sessionStorage");
  }
}

export function clearAccessToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore errors during logout
  }
}

export function getAuthHeader(): Record<string, string> {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}