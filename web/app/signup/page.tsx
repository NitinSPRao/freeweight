"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, saveAuthData, SignupData } from "@/lib/auth";
import { extractErrorMessage } from "@/lib/utils";

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<SignupData>({
    email: "",
    password: "",
    name: "",
    user_type: "athlete",
  });
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const signupData = {
        ...formData,
        invite_code: inviteCode || undefined,
      };

      const response = await authApi.signup(signupData);
      saveAuthData(response.access_token, response.user);

      // Redirect based on user type
      if (response.user.user_type === "coach") {
        router.push("/coach/onboarding");
      } else {
        // Set flag so onboarding knows if athlete has a coach
        if (inviteCode) {
          localStorage.setItem("has_coach", "true");
        }
        router.push("/athlete/onboarding");
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, "Signup failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full space-y-8">
        {/* Logo/Brand */}
        <div className="text-center">
          <h1 className="text-4xl font-heading font-bold text-primary mb-2">FreeWeight</h1>
          <h2 className="text-2xl font-heading text-text">Create Your Account</h2>
          <p className="mt-2 text-secondary">Start training smarter today</p>
        </div>

        {/* Signup Form */}
        <form onSubmit={handleSignup} className="mt-8 space-y-6">
          {error && (
            <div className="bg-error/10 border border-error text-error px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-text mb-2">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                className="input-field"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

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
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                minLength={6}
                className="input-field"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-3">
                I am a...
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                    formData.user_type === "athlete"
                      ? "border-primary bg-primary text-background"
                      : "border-secondary text-text hover:border-primary"
                  }`}
                  onClick={() => setFormData({ ...formData, user_type: "athlete" })}
                >
                  Athlete
                </button>
                <button
                  type="button"
                  className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                    formData.user_type === "coach"
                      ? "border-primary bg-primary text-background"
                      : "border-secondary text-text hover:border-primary"
                  }`}
                  onClick={() => setFormData({ ...formData, user_type: "coach" })}
                >
                  Coach
                </button>
              </div>
            </div>

            {formData.user_type === "athlete" && (
              <div>
                <label htmlFor="invite_code" className="block text-sm font-medium text-text mb-2">
                  Coach Invite Code (Optional)
                </label>
                <input
                  id="invite_code"
                  type="text"
                  maxLength={6}
                  className="input-field uppercase"
                  placeholder="ABC123"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                />
                <p className="text-xs text-secondary mt-1">
                  Enter your coach's invite code to join their team
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <div className="text-center">
            <p className="text-secondary">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
