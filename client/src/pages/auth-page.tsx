import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Loader2 } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/config";
import { queryClient } from "@/lib/queryClient";

export default function AuthPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const { toast } = useToast();

  const urlParams = new URLSearchParams(window.location.search);
  const googleError = urlParams.get("error");

  if (googleError && googleError === "google_failed") {
    toast({ title: "Google sign-in failed", description: "Please try again or use username/password.", variant: "destructive" });
    window.history.replaceState({}, "", "/auth");
  }

  // Redirect to dashboard if already logged in - useEffect to avoid render side-effects
  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl" data-testid="text-auth-title">
              {mode === "login" ? "Sign in to CapitalOps" : "Create an account"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Enter your credentials to access the platform"
                : "Register a new account to get started"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GoogleSignInButton />
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>
            {mode === "login" ? <LoginForm /> : <RegisterForm />}
            <div className="mt-6 text-center text-sm">
              {mode === "login" ? (
                <p className="text-muted-foreground">
                  Don't have an account?{" "}
                  <button
                    onClick={() => setMode("register")}
                    className="text-primary font-medium hover:underline"
                    data-testid="button-switch-register"
                  >
                    Sign up
                  </button>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    onClick={() => setMode("login")}
                    className="text-primary font-medium hover:underline"
                    data-testid="button-switch-login"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center bg-primary/5 p-12">
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">CapitalOps</h2>
          <p className="text-lg text-muted-foreground">
            Capital + Governance operating layer for real estate development, built on Coral8.
          </p>
          <div className="space-y-4">
            <Feature title="Capital Engine" desc="Deal pipeline, investor matching, and allocation tracking" />
            <Feature title="Execution Control" desc="Project milestones, budgets, and risk management" />
            <Feature title="Asset & Vendor Control" desc="Vendor management, work orders, and performance" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function GoogleSignInButton() {
  const backendUrl = (import.meta.env as any).VITE_BACKEND_URL || "";
  const googleClientId = (import.meta.env as any).VITE_GOOGLE_CLIENT_ID || "";
  const { login } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!googleClientId || !backendUrl) return;

    const { google } = window as any;
    if (!google) return;

    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response: any) => {
        if (!response.credential) {
          toast({ title: "No credential received", variant: "destructive" });
          return;
        }
        try {
          const url = `${backendUrl}/api/v1/auth/google/`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: response.credential }),
          });
          const data = await res.json();
          if (data.accessToken || res.ok) {
            // Auth handled via httpOnly cookie set by backend
            setLocation("/dashboard");
          } else if (data.error) {
            toast({ title: "Sign-in failed", description: data.error, variant: "destructive" });
          }
        } catch (e) {
          toast({ title: "Network error", description: String(e), variant: "destructive" });
        }
      },
    });

    google.accounts.id.renderButton(
      document.getElementById("google-signin-btn"),
      { theme: "outline", size: "large", text: "signin_with", shape: "rectangular" }
    );
  }, [googleClientId, backendUrl, login, toast, setLocation]);

  return (
    <Button
      variant="outline"
      className="w-full gap-2"
      data-testid="button-google-signin"
      id="google-signin-btn"
    >
      <SiGoogle className="h-4 w-4" />
      Sign in with Google
    </Button>
  );
}

/**
 * LoginForm Component
 * 
 * Handles username/password login with MFA verification.
 * 
 * LOGIN FLOW:
 * 1. User enters username/password and submits
 * 2. Backend validates credentials and returns MFA required
 * 3. If MFA required, show MFA code input (code displayed on-screen in debug mode)
 * 4. User enters 6-digit code from email
 * 5. Backend validates code and returns JWT
 * 6. Redirect to dashboard
 * 
 * SECURITY:
 * - MFA is mandatory for all password-based logins (defense in depth)
 * - Codes are 6 digits, valid 5 minutes, single-use
 * - Generic error messages prevent username enumeration
 */
function LoginForm() {
  // State for form fields
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  // MFA state - tracks whether we're waiting for MFA verification
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");  // User's entered MFA code

  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  /**
   * Handle username/password form submission
   * 
   * Sends credentials to backend. If valid, backend returns MFA required.
   * We then show the MFA input screen.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // Call backend login endpoint
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      
      // Check response - backend returns MFA required
      if (data.mfaRequired) {
        setMfaRequired(true);
      } else {
        toast({ title: "Error", description: data.error || "Login failed", variant: "destructive" });
      }
    } catch {
      // Network error - couldn't reach backend
      toast({ title: "Network error", description: "Could not connect to server", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle MFA code verification submission
   * 
   * Sends the 6-digit code to backend for verification.
   * If valid, backend returns JWT and we redirect to dashboard.
   */
  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode) {
      toast({ title: "Please enter the code", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // Call backend MFA verification endpoint
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/login/verify-mfa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, code: mfaCode }),
      });
      const data = await res.json();

      if (res.ok) {
        // Auth handled via httpOnly cookie set by backend
        queryClient.invalidateQueries();
        setLocation("/dashboard");
      } else {
        toast({ title: "Error", description: data.error || "Invalid code", variant: "destructive" });
      }
    } catch {
      // Network error
      toast({ title: "Network error", description: "Could not connect to server", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Show MFA verification screen when required
  if (mfaRequired) {
    return (
      <form onSubmit={handleMfaSubmit} className="space-y-4">
        <div className="text-center space-y-2 mb-4">
          <h2 className="text-xl font-semibold">Enter Login Code</h2>
          <p className="text-sm text-muted-foreground">
            We sent a code to your email. Enter it below.
          </p>
        </div>
        
        {/* 6-digit numeric code input */}
        <div className="space-y-2">
          <Label htmlFor="mfa-code">6-Digit Code</Label>
          <Input
            id="mfa-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="text-center text-2xl tracking-widest font-mono"
            autoComplete="one-time-code"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Verify Code
        </Button>
        <div className="text-center">
          <button
            type="button"
            onClick={() => { setMfaRequired(false); setMfaCode(""); }}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            Back to login
          </button>
        </div>
      </form>
    );
  }

  // Show username/password login form
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-username">Username</Label>
        <Input
          id="login-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          data-testid="input-username"
          autoComplete="username"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          data-testid="input-password"
          autoComplete="current-password"
        />
      </div>
      <div className="text-right">
        <button
          type="button"
          onClick={() => setLocation("/auth/forgot-password")}
          className="text-xs text-muted-foreground hover:text-primary"
        >
          Forgot password?
        </button>
      </div>
      <Button type="submit" className="w-full" disabled={loading} data-testid="button-login">
        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Sign In
      </Button>
    </form>
  );
}

function RegisterForm() {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email || !password || !confirmPassword) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await register(username, password, email);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="register-username">Username</Label>
        <Input
          id="register-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Choose a username"
          data-testid="input-register-username"
          autoComplete="username"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          data-testid="input-register-email"
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-password">Password</Label>
        <Input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Choose a password (min 6 characters)"
          data-testid="input-register-password"
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-confirm">Confirm Password</Label>
        <Input
          id="register-confirm"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm your password"
          data-testid="input-register-confirm"
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading} data-testid="button-register">
        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Create Account
      </Button>
    </form>
  );
}
