"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { useState, useCallback } from "react";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import RestTimer from "@/components/RestTimer";
import { athleteApi, Exercise, FlagResult } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";
import { calculateTargetWeight } from "@/lib/utils";

interface SetEntry {
  exercise_id: number;
  set_number: number;
  weight_used: number;
  reps_completed: number;
  rpe?: number;
  was_modified: boolean;
}

export default function WorkoutPage() {
  const router = useRouter();
  const params = useParams();
  const workoutId = parseInt(params.id as string);
  const { user } = getAuthData();
  const queryClient = useQueryClient();

  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [loggedSets, setLoggedSets] = useState<Record<string, SetEntry>>({});
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [flagOptInRehab, setFlagOptInRehab] = useState(false);
  const [flagRehabTarget, setFlagRehabTarget] = useState("");
  const [flagSubmitted, setFlagSubmitted] = useState(false);
  const [flagResult, setFlagResult] = useState<FlagResult | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restDuration, setRestDuration] = useState(90);

  const { data: workout, isLoading } = useQuery({
    queryKey: ["workout", workoutId],
    queryFn: () => athleteApi.getWorkout(workoutId),
  });

  const { data: maxes } = useQuery({
    queryKey: ["progress"],
    queryFn: () => athleteApi.getProgress(),
  });

  const startWorkoutMutation = useMutation({
    mutationFn: () => athleteApi.startWorkout(workoutId),
    onSuccess: () => setWorkoutStarted(true),
  });

  const logSetMutation = useMutation({
    mutationFn: (data: {
      exercise_id: number;
      set_number: number;
      weight_used: number;
      reps_completed: number;
      rpe?: number;
      was_modified: boolean;
    }) => athleteApi.logSet(workoutId, data),
  });

  const completeWorkoutMutation = useMutation({
    mutationFn: (notes?: string) => athleteApi.completeWorkout(workoutId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todayWorkout"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      router.push("/athlete/home");
    },
  });

  const flagWorkoutMutation = useMutation({
    mutationFn: (data: {
      reason: string;
      opt_in_rehab?: boolean;
      rehab_target?: string | null;
    }) => athleteApi.flagWorkout(workoutId, data),
    onSuccess: (data: FlagResult) => {
      setFlagResult(data);
      setFlagSubmitted(true);
    },
  });

  const exercises = workout?.exercises || [];
  const currentExercise = exercises[currentExerciseIndex];
  const totalExercises = exercises.length;

  const getTargetWeight = useCallback(
    (exercise: Exercise | undefined) => {
      if (!exercise?.percentage_of_max || !exercise?.target_exercise || !maxes) return null;
      const maxArr = Array.isArray(maxes) ? maxes : [];
      const max = maxArr.find(
        (m: any) =>
          (m.exercise_name || "").toLowerCase() === exercise.target_exercise?.toLowerCase()
      );
      if (!max) return null;
      return calculateTargetWeight(
        (max as any).max_weight || (max as any).data?.[0]?.max_weight || 0,
        exercise.percentage_of_max
      );
    },
    [maxes]
  );

  const currentSetKey = currentExercise
    ? `${currentExercise.id}-${currentSetIndex + 1}`
    : "";
  const isCurrentSetLogged = !!loggedSets[currentSetKey];

  const completedSetsForExercise = currentExercise
    ? Array.from({ length: currentExercise.sets }, (_, i) => `${currentExercise.id}-${i + 1}`)
        .filter((k) => loggedSets[k]).length
    : 0;
  const allSetsComplete = currentExercise
    ? completedSetsForExercise >= currentExercise.sets
    : false;

  const totalSets = exercises.reduce((sum, e) => sum + e.sets, 0);
  const completedTotal = Object.keys(loggedSets).length;
  const progressPercent = totalSets > 0 ? (completedTotal / totalSets) * 100 : 0;

  const targetWeight = getTargetWeight(currentExercise);
  const prescribedReps = currentExercise?.reps || 0;

  const logCurrentSet = (weight: number, reps: number, wasModified: boolean, rpe?: number) => {
    if (!currentExercise) return;
    const entry: SetEntry = {
      exercise_id: currentExercise.id,
      set_number: currentSetIndex + 1,
      weight_used: weight,
      reps_completed: reps,
      rpe,
      was_modified: wasModified,
    };
    const key = `${currentExercise.id}-${currentSetIndex + 1}`;
    setLoggedSets((prev) => ({ ...prev, [key]: entry }));
    logSetMutation.mutate(entry);

    // Check if we should show rest timer (not last set of exercise)
    const isLastSetOfExercise = currentSetIndex + 1 >= currentExercise.sets;

    if (!isLastSetOfExercise) {
      // Show rest timer with coach-prescribed duration or default 90s
      const duration = currentExercise.rest_seconds || 90;
      setRestDuration(duration);
      setShowRestTimer(true);
    } else {
      // Auto-advance without timer
      if (currentExerciseIndex + 1 < totalExercises) {
        setCurrentExerciseIndex(currentExerciseIndex + 1);
        setCurrentSetIndex(0);
        setShowCustomInput(false);
      } else {
        setShowCompletionModal(true);
      }
    }
  };

  const handleCompletedAsPlanned = () => {
    logCurrentSet(targetWeight || 0, prescribedReps, false);
  };

  const handleRestComplete = () => {
    setShowRestTimer(false);
    // Auto-advance to next set
    setCurrentSetIndex(currentSetIndex + 1);
    setShowCustomInput(false);
  };

  const handleSkipRest = () => {
    setShowRestTimer(false);
    // Auto-advance to next set
    setCurrentSetIndex(currentSetIndex + 1);
    setShowCustomInput(false);
  };

  // ─── Loading / Error ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AuthGuard requiredUserType="athlete">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-secondary">Loading workout...</p>
        </div>
      </AuthGuard>
    );
  }

  if (!workout) {
    return (
      <AuthGuard requiredUserType="athlete">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <p className="text-error mb-4">Workout not found</p>
            <button onClick={() => router.push("/athlete/home")} className="btn-primary">
              Back to Home
            </button>
          </div>
        </div>
      </AuthGuard>
    );
  }

  // ─── Pre-start Screen ─────────────────────────────────────────────────────

  if (!workoutStarted && !workout.workout_log_id) {
    return (
      <AuthGuard requiredUserType="athlete">
        <div className="min-h-screen bg-background">
          <NavBar userName={user?.name || ""} userType="athlete" />
          <main className="max-w-2xl mx-auto px-4 py-8">
            <div className="card text-center py-12">
              <h1 className="text-3xl font-heading font-bold text-text mb-4">{workout.name}</h1>
              <p className="text-secondary mb-2">{exercises.length} exercises</p>
              <div className="space-y-1 mb-8">
                {exercises.map((ex, i) => (
                  <p key={ex.id} className="text-sm text-text">
                    {i + 1}. {ex.name} — {ex.sets}&times;{ex.reps}
                    {ex.percentage_of_max && (
                      <span className="text-primary ml-1">
                        ({Math.round(ex.percentage_of_max * 100)}%)
                      </span>
                    )}
                  </p>
                ))}
              </div>
              <button
                onClick={() => startWorkoutMutation.mutate()}
                disabled={startWorkoutMutation.isPending}
                className="btn-primary text-lg px-12 py-4"
              >
                {startWorkoutMutation.isPending ? "Starting..." : "Start Workout"}
              </button>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  // Auto-mark started if resuming
  if (!workoutStarted && workout.workout_log_id) {
    setWorkoutStarted(true);
  }

  // ─── Active Workout ───────────────────────────────────────────────────────

  return (
    <AuthGuard requiredUserType="athlete">
      <div className="min-h-screen bg-background">
        <NavBar userName={user?.name || ""} userType="athlete" />

        <main className="max-w-2xl mx-auto px-4 py-8">
          {/* Header + Progress */}
          <div className="mb-6">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h1 className="text-2xl font-heading font-bold text-text">{workout.name}</h1>
                <p className="text-secondary text-sm">
                  Exercise {currentExerciseIndex + 1}/{totalExercises} &middot;
                  Set {Math.min(currentSetIndex + 1, currentExercise?.sets || 1)}/{currentExercise?.sets || 0}
                </p>
              </div>
              <button
                onClick={() => setShowFlagModal(true)}
                className="flex items-center gap-1.5 border border-red-400 text-red-400 rounded-lg px-3 py-1 text-sm hover:bg-red-400/10 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Flag
              </button>
            </div>
            <div className="w-full bg-secondary/20 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {currentExercise && (
            <div className="space-y-4">
              {/* Exercise Info */}
              <div className="card">
                <h2 className="text-2xl font-heading font-bold text-text mb-2">
                  {currentExercise.name}
                </h2>
                <div className="flex gap-6 mb-3">
                  <div>
                    <span className="text-secondary text-xs block">Prescribed</span>
                    <span className="text-text font-semibold">
                      {currentExercise.sets} &times; {currentExercise.reps}
                    </span>
                  </div>
                  {targetWeight !== null && (
                    <div>
                      <span className="text-secondary text-xs block">Target Weight</span>
                      <span className="text-primary font-bold text-lg">
                        {targetWeight} lbs
                      </span>
                      <span className="text-secondary text-xs ml-1">
                        ({Math.round((currentExercise.percentage_of_max || 0) * 100)}%)
                      </span>
                    </div>
                  )}
                </div>
                {currentExercise.coach_notes && (
                  <div className="bg-background rounded-lg p-3">
                    <p className="text-secondary text-xs mb-0.5">Coach Notes</p>
                    <p className="text-text text-sm">{currentExercise.coach_notes}</p>
                  </div>
                )}
              </div>

              {/* Set Progress Dots */}
              <div className="flex justify-center gap-2">
                {Array.from({ length: currentExercise.sets }, (_, i) => {
                  const key = `${currentExercise.id}-${i + 1}`;
                  const logged = loggedSets[key];
                  const isCurrent = i === currentSetIndex && !isCurrentSetLogged;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setCurrentSetIndex(i);
                        setShowCustomInput(false);
                      }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        logged
                          ? logged.was_modified
                            ? "bg-yellow-400 text-background"
                            : "bg-primary text-background"
                          : isCurrent
                          ? "border-2 border-primary text-primary"
                          : "border-2 border-secondary/40 text-secondary"
                      }`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>

              {/* Action Area */}
              {!isCurrentSetLogged && !showCustomInput && (
                <div className="space-y-3">
                  {/* COMPLETED AS PLANNED — Primary action */}
                  <button
                    onClick={handleCompletedAsPlanned}
                    className="w-full bg-primary text-background font-bold py-5 px-6 rounded-xl text-lg hover:opacity-90 transition-opacity"
                  >
                    Completed as Planned
                    <span className="block text-sm font-normal mt-1 opacity-80">
                      {targetWeight !== null ? `${targetWeight} lbs` : "Bodyweight"} &times; {prescribedReps} reps
                    </span>
                  </button>

                  {/* Different — Secondary */}
                  <button
                    onClick={() => setShowCustomInput(true)}
                    className="w-full border border-secondary/40 text-secondary font-medium py-3 px-6 rounded-xl text-sm hover:text-text hover:border-secondary transition-colors"
                  >
                    I did something different
                  </button>
                </div>
              )}

              {/* Custom Input */}
              {!isCurrentSetLogged && showCustomInput && (
                <CustomSetInput
                  defaultWeight={targetWeight || 0}
                  defaultReps={prescribedReps}
                  onLog={(weight, reps) => logCurrentSet(weight, reps, true)}
                  onCancel={() => setShowCustomInput(false)}
                />
              )}

              {/* Set already logged */}
              {isCurrentSetLogged && (
                <div className="card bg-primary/5 border-primary/30 text-center py-6">
                  <p className="text-primary font-bold text-lg mb-1">Set {currentSetIndex + 1} Logged</p>
                  <p className="text-text">
                    {loggedSets[currentSetKey].weight_used} lbs &times;{" "}
                    {loggedSets[currentSetKey].reps_completed} reps
                    {loggedSets[currentSetKey].was_modified && (
                      <span className="text-yellow-400 text-sm ml-2">(modified)</span>
                    )}
                  </p>
                </div>
              )}

              {/* Exercise Navigation */}
              <div className="flex gap-3 pt-2">
                {currentExerciseIndex > 0 && (
                  <button
                    onClick={() => {
                      setCurrentExerciseIndex(currentExerciseIndex - 1);
                      setCurrentSetIndex(0);
                      setShowCustomInput(false);
                    }}
                    className="btn-secondary flex-1"
                  >
                    &larr; Prev Exercise
                  </button>
                )}
                {allSetsComplete && currentExerciseIndex < totalExercises - 1 && (
                  <button
                    onClick={() => {
                      setCurrentExerciseIndex(currentExerciseIndex + 1);
                      setCurrentSetIndex(0);
                      setShowCustomInput(false);
                    }}
                    className="btn-primary flex-1"
                  >
                    Next Exercise &rarr;
                  </button>
                )}
                {allSetsComplete && currentExerciseIndex === totalExercises - 1 && (
                  <button
                    onClick={() => setShowCompletionModal(true)}
                    className="btn-primary flex-1"
                  >
                    Finish Workout
                  </button>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Completion Modal */}
        {showCompletionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-[#1F2937] rounded-lg p-6 max-w-md w-full">
              <h3 className="text-2xl font-heading font-bold text-text mb-2">Great Work!</h3>
              <p className="text-secondary text-sm mb-4">
                {completedTotal}/{totalSets} sets completed.
                {Object.values(loggedSets).some((s) => s.was_modified) && (
                  <span className="text-yellow-400"> Some sets were modified from the plan.</span>
                )}
              </p>
              <textarea
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Any notes about this workout? (optional)"
                className="input-field mb-4 min-h-[80px]"
              />
              <div className="flex gap-3">
                <button onClick={() => setShowCompletionModal(false)} className="btn-secondary flex-1">
                  Back
                </button>
                <button
                  onClick={() => completeWorkoutMutation.mutate(completionNotes || undefined)}
                  disabled={completeWorkoutMutation.isPending}
                  className="btn-primary flex-1"
                >
                  {completeWorkoutMutation.isPending ? "Saving..." : "Complete Workout"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Flag Modal */}
        {showFlagModal && (() => {
          const closeFlagModal = () => {
            setShowFlagModal(false);
            setFlagReason("");
            setFlagOptInRehab(false);
            setFlagRehabTarget("");
            setFlagSubmitted(false);
            setFlagResult(null);
          };

          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-[#1F2937] rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
                {flagSubmitted ? (
                  /* Confirmation screen */
                  <div>
                    <h3 className="text-xl font-heading font-bold text-text mb-1">Report Submitted</h3>
                    <p className="text-secondary text-sm mb-3">
                      {!flagOptInRehab || flagResult === null ? (
                        "Your coach has been notified and will follow up with you."
                      ) : flagResult.matched && flagResult.confidence === "high" ? (
                        <>A recovery plan has been matched: <span className="text-text font-medium">'{flagResult.program_name}'</span> has been added to your dashboard.</>
                      ) : flagResult.matched && flagResult.confidence === "medium" ? (
                        <><span className="text-text font-medium">'{flagResult.program_name}'</span> has been added to your dashboard. Your coach will review to confirm it is the right fit.</>
                      ) : (
                        "Your coach has been notified and will assign a recovery plan manually."
                      )}
                    </p>
                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={() => router.push("/athlete/home")}
                        className="btn-secondary flex-1"
                      >
                        End Workout
                      </button>
                      <button
                        onClick={closeFlagModal}
                        className="btn-primary flex-1"
                      >
                        Continue Workout
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Flag form */
                  <div>
                    <h3 className="text-xl font-heading font-bold text-text mb-1">Report Concern</h3>
                    <p className="text-secondary text-sm mb-5">Your coach will be notified and will follow up with you.</p>

                    {/* Section 1 — What happened? */}
                    <div className="mb-5">
                      <textarea
                        value={flagReason}
                        onChange={(e) => setFlagReason(e.target.value)}
                        placeholder="Describe what happened..."
                        className="input-field min-h-[100px]"
                      />
                    </div>

                    <hr className="border-secondary/20" />

                    {/* Section 2 — Recovery */}
                    <div className="mt-5 mb-5">
                      <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">Recovery</p>
                      <p className="text-sm text-text mb-2">Would you like a recovery plan?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setFlagOptInRehab(true)}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                            flagOptInRehab
                              ? "bg-amber-400 text-zinc-900"
                              : "bg-zinc-800 text-secondary hover:text-text"
                          }`}
                        >
                          Yes, request a plan
                        </button>
                        <button
                          onClick={() => { setFlagOptInRehab(false); setFlagRehabTarget(""); }}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                            !flagOptInRehab
                              ? "bg-zinc-700 text-text"
                              : "bg-zinc-800 text-secondary hover:text-text"
                          }`}
                        >
                          No thanks
                        </button>
                      </div>
                      {flagOptInRehab && (
                        <div className="mt-3">
                          <label className="block text-sm font-medium text-text mb-1">
                            What would you like to focus on?
                          </label>
                          <textarea
                            value={flagRehabTarget}
                            onChange={(e) => setFlagRehabTarget(e.target.value)}
                            placeholder="e.g. tight hip flexors, lower back tightness, shoulder discomfort when pressing"
                            className="input-field text-sm min-h-[80px] resize-y"
                          />
                          <p className="mt-1.5 text-xs text-secondary">
                            Be as specific as you can — this helps us find the right program for you.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button onClick={closeFlagModal} className="btn-secondary flex-1">
                        Cancel
                      </button>
                      <button
                        onClick={() =>
                          flagWorkoutMutation.mutate({
                            reason: flagReason,
                            opt_in_rehab: flagOptInRehab,
                            rehab_target: flagRehabTarget || null,
                          })
                        }
                        disabled={!flagReason.trim() || flagWorkoutMutation.isPending}
                        className="btn-primary flex-1"
                      >
                        {flagWorkoutMutation.isPending ? "Submitting…" : "Submit Flag"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Rest Timer */}
        {showRestTimer && currentExercise && (
          <RestTimer
            durationSeconds={restDuration}
            nextSetInfo={`Set ${currentSetIndex + 2}/${currentExercise.sets}`}
            onComplete={handleRestComplete}
            onSkip={handleSkipRest}
          />
        )}
      </div>
    </AuthGuard>
  );
}


// ─── Custom Set Input ───────────────────────────────────────────────────────

function CustomSetInput({
  defaultWeight,
  defaultReps,
  onLog,
  onCancel,
}: {
  defaultWeight: number;
  defaultReps: number;
  onLog: (weight: number, reps: number) => void;
  onCancel: () => void;
}) {
  const [weight, setWeight] = useState(defaultWeight.toString());
  const [reps, setReps] = useState(defaultReps.toString());

  return (
    <div className="card space-y-3">
      <h4 className="text-sm font-medium text-text">Log Actual Set</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-secondary block mb-1">Weight (lbs)</label>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="input-field py-2 text-sm text-center"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs text-secondary block mb-1">Reps</label>
          <input
            type="number"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="input-field py-2 text-sm text-center"
          />
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="btn-secondary flex-1 py-2 text-sm">
          Cancel
        </button>
        <button
          onClick={() => {
            const w = parseFloat(weight);
            const r = parseInt(reps);
            if (!isNaN(w) && !isNaN(r) && r > 0) {
              onLog(w, r);
            }
          }}
          className="btn-primary flex-1 py-2 text-sm"
        >
          Log Set
        </button>
      </div>
    </div>
  );
}
