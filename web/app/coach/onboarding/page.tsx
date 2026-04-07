"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthData, saveAuthData } from "@/lib/auth";
import apiClient from "@/lib/api-client";
import { extractErrorMessage } from "@/lib/utils";

export default function CoachOnboardingPage() {
  const router = useRouter();
  const { user } = getAuthData();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    sport: "",
    team: "",
    coaching_credentials: "",
    bio: "",
    profile_photo_url: "",
  });

  const totalSteps = 2;

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    try {
      // Update user profile with onboarding data
      const response = await apiClient.patch("/api/auth/me", {
        ...formData,
        onboarding_completed: true,
      });

      // Update localStorage with server response to preserve all fields (e.g. invite_code)
      const { token } = getAuthData();
      if (token) {
        saveAuthData(token, response.data);
      }

      // Redirect to coach dashboard
      router.push("/coach/dashboard");
    } catch (err: any) {
      console.error("Onboarding error:", err);
      setError(extractErrorMessage(err, "Failed to complete onboarding"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-heading font-bold text-primary mb-2">
            Welcome to FreeWeight
          </h1>
          <p className="text-secondary text-lg">
            Let's set up your coaching profile
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text">
              Step {currentStep} of {totalSteps}
            </span>
            <span className="text-sm text-secondary">
              {Math.round((currentStep / totalSteps) * 100)}% complete
            </span>
          </div>
          <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-error/10 border border-error text-error px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Step Content */}
        <div className="bg-[#1F2937] rounded-xl border border-secondary/15 p-8">
          {/* Step 1: Profile Information */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-heading font-bold text-text mb-2">
                  Profile Information
                </h2>
                <p className="text-secondary">
                  Tell us about yourself and your coaching background
                </p>
              </div>

              <div>
                <label htmlFor="sport" className="block text-sm font-medium text-text mb-2">
                  Primary Sport <span className="text-error">*</span>
                </label>
                <input
                  id="sport"
                  type="text"
                  required
                  className="input-field"
                  placeholder="e.g., Rowing, Football, Track & Field"
                  value={formData.sport}
                  onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="team" className="block text-sm font-medium text-text mb-2">
                  Team/Organization <span className="text-error">*</span>
                </label>
                <input
                  id="team"
                  type="text"
                  required
                  className="input-field"
                  placeholder="e.g., Columbia University, Elite Performance Center"
                  value={formData.team}
                  onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="credentials" className="block text-sm font-medium text-text mb-2">
                  Coaching Credentials <span className="text-error">*</span>
                </label>
                <input
                  id="credentials"
                  type="text"
                  required
                  className="input-field"
                  placeholder="e.g., CSCS, USAW Level 2, 10 years experience"
                  value={formData.coaching_credentials}
                  onChange={(e) =>
                    setFormData({ ...formData, coaching_credentials: e.target.value })
                  }
                />
                <p className="text-xs text-secondary mt-1">
                  Include certifications, years of experience, or specializations
                </p>
              </div>

              <div>
                <label htmlFor="bio" className="block text-sm font-medium text-text mb-2">
                  Bio
                </label>
                <textarea
                  id="bio"
                  rows={4}
                  className="input-field resize-none"
                  placeholder="Share your coaching philosophy, approach, or what makes your training unique..."
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                />
                <p className="text-xs text-secondary mt-1">
                  This will be visible to your athletes
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Getting Started */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-heading font-bold text-text mb-2">
                  You're All Set!
                </h2>
                <p className="text-secondary">
                  Here's what you can do next in FreeWeight
                </p>
              </div>

              <div className="space-y-4">
                <div className="bg-background rounded-lg p-4 border border-secondary/10">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-primary font-bold">1</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-text mb-1">Set up your roster</h3>
                      <p className="text-sm text-secondary">
                        Create groups and subgroups to organize your athletes by team or training focus
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-background rounded-lg p-4 border border-secondary/10">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-primary font-bold">2</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-text mb-1">Invite your athletes</h3>
                      <p className="text-sm text-secondary">
                        Generate invite links to connect athletes to your roster automatically
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-background rounded-lg p-4 border border-secondary/10">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-primary font-bold">3</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-text mb-1">Build your first program</h3>
                      <p className="text-sm text-secondary">
                        Create workouts with auto-calculated percentages based on athlete maxes
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mt-6">
                <p className="text-sm text-text">
                  <span className="font-semibold">💡 Pro Tip:</span> Start by creating groups for
                  your different teams, then add subgroups for athletes with different training
                  focuses (e.g., Hypertrophy, Strength, Mobility).
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-4 mt-8">
            {currentStep > 1 && (
              <button
                onClick={handleBack}
                className="btn-secondary flex-1"
                disabled={loading}
              >
                Back
              </button>
            )}

            {currentStep < totalSteps ? (
              <button
                onClick={handleNext}
                className="btn-primary flex-1"
                disabled={
                  !formData.sport || !formData.team || !formData.coaching_credentials
                }
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="btn-primary flex-1"
                disabled={loading}
              >
                {loading ? "Completing setup..." : "Go to Dashboard"}
              </button>
            )}
          </div>
        </div>

        {/* Skip Option */}
        {currentStep === 1 && (
          <div className="text-center mt-4">
            <button
              onClick={handleSubmit}
              className="text-secondary hover:text-primary text-sm"
              disabled={loading}
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
