"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi, saveAuthData } from "@/lib/auth";
import { extractErrorMessage } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check for auth data passed from landing page via URL params
  useEffect(() => {
    const token = searchParams.get("token");
    const userStr = searchParams.get("user");

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        saveAuthData(token, user);

        // Redirect based on user type and onboarding status
        if (user.user_type === "coach") {
          if (!user.onboarding_completed) {
            router.push("/coach/onboarding");
          } else {
            router.push("/coach/dashboard");
          }
        } else if (!user.onboarding_completed) {
          router.push("/athlete/onboarding");
        } else {
          router.push("/athlete/home");
        }
      } catch (err) {
        console.error("Failed to parse auth data from URL:", err);
        setError("Invalid authentication data. Please try logging in again.");
      }
    }
  }, [searchParams, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await authApi.login(email, password);
      saveAuthData(response.access_token, response.user);

      // Redirect based on user type and onboarding status
      if (response.user.user_type === "coach") {
        if (!response.user.onboarding_completed) {
          router.push("/coach/onboarding");
        } else {
          router.push("/coach/dashboard");
        }
      } else if (!response.user.onboarding_completed) {
        router.push("/athlete/onboarding");
      } else {
        router.push("/athlete/home");
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, "Login failed. Please check your credentials."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo/Brand */}
        <div className="text-center">
          <h1 className="text-4xl font-heading font-bold text-primary mb-2">FreeWeight</h1>
          <h2 className="text-2xl font-heading text-text">Welcome Back</h2>
          <p className="mt-2 text-secondary">Sign in to your account</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="mt-8 space-y-6">
          {error && (
            <div className="bg-error/10 border border-error text-error px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                className="input-field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <div className="text-center">
            <p className="text-secondary">
              Don't have an account?{" "}
              <Link href="/signup" className="text-primary hover:underline font-medium">
                Sign up
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
