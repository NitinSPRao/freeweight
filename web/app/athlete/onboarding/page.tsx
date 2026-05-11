"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuthData, saveAuthData, authApi } from "@/lib/auth";
import { athleteApi } from "@/lib/api-endpoints";
import { extractErrorMessage } from "@/lib/utils";

const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Beginner", desc: "New to strength training (< 1 year)" },
  { value: "intermediate", label: "Intermediate", desc: "Consistent training (1-3 years)" },
  { value: "advanced", label: "Advanced", desc: "Experienced lifter (3+ years)" },
];

const GOAL_OPTIONS = [
  { value: "strength", label: "Build Strength", desc: "Increase maxes on compound lifts" },
  { value: "hypertrophy", label: "Build Muscle", desc: "Maximize muscle size and aesthetics" },
  { value: "athletic performance", label: "Athletic Performance", desc: "Sport-specific power and conditioning" },
  { value: "general fitness", label: "General Fitness", desc: "Overall health and well-rounded training" },
];

const CORE_LIFTS = [
  { key: "squat", label: "Back Squat" },
  { key: "bench", label: "Bench Press" },
  { key: "deadlift", label: "Deadlift" },
  { key: "clean", label: "Power Clean" },
];

export default function AthleteOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasCoach, setHasCoach] = useState(false);

  // Step 1: Sport & Team
  const [sport, setSport] = useState("");
  const [team, setTeam] = useState("");

  // Step 2: Goals & Experience
  const [trainingGoal, setTrainingGoal] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");

  // Step 3: Injuries
  const [injuries, setInjuries] = useState("");

  // Step 4: Maxes
  const [maxes, setMaxes] = useState<Record<string, string>>({
    squat: "",
    bench: "",
    deadlift: "",
    clean: "",
  });

  // Step 5: Strength Goals (optional)
  const [strengthGoals, setStrengthGoals] = useState<Record<string, { target: string; date: string }>>({
    squat: { target: "", date: "" },
    bench: { target: "", date: "" },
    deadlift: { target: "", date: "" },
    clean: { target: "", date: "" },
  });

  useEffect(() => {
    const { user } = getAuthData();
    if (!user || user.user_type !== "athlete") {
      router.push("/login");
      return;
    }
    if (user.onboarding_completed) {
      router.push("/athlete/home");
      return;
    }
    const coachFlag = localStorage.getItem("has_coach");
    setHasCoach(coachFlag === "true");
  }, [router]);

  const totalSteps = 5;

  const handleNext = () => {
    setError("");
    setStep((s) => Math.min(s + 1, totalSteps));
  };

  const handleBack = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    try {
      const maxesObj: Record<string, number> = {};
      for (const [key, val] of Object.entries(maxes)) {
        const num = parseFloat(val);
        if (!isNaN(num) && num > 0) {
          maxesObj[key] = num;
        }
      }

      // Build goals object
      const goalsObj: Record<string, { target_weight: number; target_date: string }> = {};
      for (const [key, val] of Object.entries(strengthGoals)) {
        const targetNum = parseFloat(val.target);
        if (!isNaN(targetNum) && targetNum > 0 && val.date) {
          goalsObj[key] = { target_weight: targetNum, target_date: val.date };
        }
      }

      await athleteApi.onboarding({
        sport: sport || undefined,
        team: team || undefined,
        training_goals: trainingGoal || undefined,
        injuries: injuries || undefined,
        experience_level: experienceLevel || undefined,
        maxes: Object.keys(maxesObj).length > 0 ? maxesObj : undefined,
        has_coach: hasCoach,
        goals: Object.keys(goalsObj).length > 0 ? goalsObj : undefined,
      });

      const updatedUser = await authApi.getMe();
      const token = localStorage.getItem("auth_token");
      if (token) {
        saveAuthData(token, updatedUser);
      }

      localStorage.removeItem("has_coach");
      router.push("/athlete/home");
    } catch (err: any) {
      console.error("Athlete onboarding submit failed:", {
        status: err?.response?.status,
        data: err?.response?.data,
        message: err?.message,
        url: err?.config?.url,
      });
      const status = err?.response?.status;
      const fallback = status
        ? `Something went wrong (${status}). Please try again.`
        : "Could not reach the server. Check your connection and try again.";
      setError(extractErrorMessage(err, fallback));
    } finally {
      setLoading(false);
    }
  };

  // Check if any goals have been set
  const hasAnyGoals = Object.values(strengthGoals).some(
    (g) => g.target && g.date
  );

  // Get lifts that have maxes entered (for goal suggestions)
  const liftsWithMaxes = CORE_LIFTS.filter((lift) => {
    const val = parseFloat(maxes[lift.key]);
    return !isNaN(val) && val > 0;
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-heading font-bold text-primary mb-2">FreeWeight</h1>
          <h2 className="text-2xl font-heading text-text">Let&apos;s Get You Set Up</h2>
          <p className="mt-2 text-secondary">
            {hasCoach
              ? "Your coach will build your programs. We just need a few details."
              : "Tell us about yourself and we'll build your first program."}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-2">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full flex-1 transition-colors ${
                i < step ? "bg-primary" : "bg-secondary/30"
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-error/10 border border-error text-error px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Step 1: Sport & Team */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                What sport do you play?
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Football, Basketball, Track & Field..."
                value={sport}
                onChange={(e) => setSport(e.target.value)}
              />
              <p className="text-xs text-secondary mt-1">Leave blank if you&apos;re not training for a sport</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Team or gym name (optional)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Columbia Lions, Equinox..."
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              />
            </div>
            <button onClick={handleNext} className="w-full btn-primary">
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Goals & Experience */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text mb-3">
                What&apos;s your main training goal?
              </label>
              <div className="space-y-3">
                {GOAL_OPTIONS.map((goal) => (
                  <button
                    key={goal.value}
                    type="button"
                    onClick={() => setTrainingGoal(goal.value)}
                    className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                      trainingGoal === goal.value
                        ? "border-primary bg-primary/10"
                        : "border-secondary/30 hover:border-secondary"
                    }`}
                  >
                    <span className="font-medium text-text">{goal.label}</span>
                    <span className="block text-sm text-secondary mt-0.5">{goal.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-3">
                Experience level
              </label>
              <div className="grid grid-cols-3 gap-3">
                {EXPERIENCE_LEVELS.map((lvl) => (
                  <button
                    key={lvl.value}
                    type="button"
                    onClick={() => setExperienceLevel(lvl.value)}
                    className={`px-3 py-3 rounded-lg border-2 text-center transition-all ${
                      experienceLevel === lvl.value
                        ? "border-primary bg-primary/10"
                        : "border-secondary/30 hover:border-secondary"
                    }`}
                  >
                    <span className="font-medium text-text text-sm">{lvl.label}</span>
                    <span className="block text-xs text-secondary mt-0.5">{lvl.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleBack} className="flex-1 btn-secondary">
                Back
              </button>
              <button
                onClick={handleNext}
                disabled={!trainingGoal || !experienceLevel}
                className="flex-1 btn-primary"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Injuries */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Any injuries or limitations we should know about?
              </label>
              <textarea
                className="input-field min-h-[120px] resize-none"
                placeholder="e.g. Left knee ACL reconstruction 6 months ago, mild lower back pain during heavy deadlifts..."
                value={injuries}
                onChange={(e) => setInjuries(e.target.value)}
              />
              <p className="text-xs text-secondary mt-1">
                {hasCoach
                  ? "This helps your coach tailor your programming."
                  : "We'll adjust your program to avoid exercises that could aggravate injuries."}
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={handleBack} className="flex-1 btn-secondary">
                Back
              </button>
              <button onClick={handleNext} className="flex-1 btn-primary">
                {injuries ? "Continue" : "Skip"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Maxes */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Enter your current 1-rep maxes (lbs)
              </label>
              <p className="text-xs text-secondary mb-4">
                {hasCoach
                  ? "Your coach uses these to calculate your training weights."
                  : "We'll use these to set the right weights in your program."}
                {" "}Leave blank if you don&apos;t know.
              </p>
              <div className="space-y-3">
                {CORE_LIFTS.map((lift) => (
                  <div key={lift.key} className="flex items-center gap-3">
                    <label className="w-32 text-sm text-text font-medium">{lift.label}</label>
                    <input
                      type="number"
                      min="0"
                      className="input-field flex-1"
                      placeholder="—"
                      value={maxes[lift.key]}
                      onChange={(e) =>
                        setMaxes((prev) => ({ ...prev, [lift.key]: e.target.value }))
                      }
                    />
                    <span className="text-sm text-secondary w-8">lbs</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleBack} className="flex-1 btn-secondary">
                Back
              </button>
              <button onClick={handleNext} className="flex-1 btn-primary">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Strength Goals (optional) */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Set a strength goal (optional)
              </label>
              <p className="text-xs text-secondary mb-4">
                Pick a target weight and date for any lift. We&apos;ll show your projected path and track your progress.
              </p>

              <div className="space-y-4">
                {CORE_LIFTS.map((lift) => {
                  const currentMax = parseFloat(maxes[lift.key]);
                  const hasMax = !isNaN(currentMax) && currentMax > 0;
                  const goal = strengthGoals[lift.key];

                  return (
                    <div key={lift.key} className="bg-[#1F2937] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-text font-medium">{lift.label}</span>
                        {hasMax && (
                          <span className="text-xs text-secondary">Current: {currentMax} lbs</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-secondary block mb-1">Target weight</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              className="input-field py-2 text-sm flex-1"
                              placeholder={hasMax ? `e.g. ${Math.round(currentMax * 1.2)}` : "—"}
                              value={goal.target}
                              onChange={(e) =>
                                setStrengthGoals((prev) => ({
                                  ...prev,
                                  [lift.key]: { ...prev[lift.key], target: e.target.value },
                                }))
                              }
                            />
                            <span className="text-xs text-secondary">lbs</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-secondary block mb-1">By when</label>
                          <input
                            type="date"
                            className="input-field py-2 text-sm"
                            value={goal.date}
                            onChange={(e) =>
                              setStrengthGoals((prev) => ({
                                ...prev,
                                [lift.key]: { ...prev[lift.key], date: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {!hasCoach && (
              <div className="card">
                <p className="text-sm text-text">
                  Based on your goals (<span className="text-primary font-medium">{
                    GOAL_OPTIONS.find((g) => g.value === trainingGoal)?.label || trainingGoal
                  }</span>) and experience level (<span className="text-primary font-medium">{experienceLevel}</span>),
                  we&apos;ll generate a personalized training program for you.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleBack} className="flex-1 btn-secondary">
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 btn-primary"
              >
                {loading
                  ? "Setting up..."
                  : hasCoach
                  ? "Complete Setup"
                  : "Generate My Program"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
