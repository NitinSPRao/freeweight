"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { coachApi, programApi, AthleteProfile, Workout } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";
import { extractErrorMessage } from "@/lib/utils";

// ─── Local types ────────────────────────────────────────────────────────────

interface WorkoutDraft {
  name: string;
  day_offset: number;
}

interface ExerciseDraft {
  name: string;
  sets: number;
  reps: number;
  target_weight: string;
  coach_notes: string;
}

// ─── Step indicators ─────────────────────────────────────────────────────────

const STEPS = [
  "Program Details",
  "Workouts",
  "Exercises",
  "Assign",
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;
        return (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  isDone
                    ? "bg-primary text-background"
                    : isActive
                    ? "bg-primary text-background"
                    : "bg-secondary/20 text-secondary"
                }`}
              >
                {isDone ? "✓" : stepNum}
              </div>
              <span
                className={`text-sm font-medium hidden sm:block ${
                  isActive ? "text-text" : "text-secondary"
                }`}
              >
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px w-8 ${
                  isDone ? "bg-primary" : "bg-secondary/20"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CreateProgramPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <CreateProgramContent />
    </Suspense>
  );
}

function CreateProgramContent() {
  const { user } = getAuthData();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Wizard state
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const folderIdParam = searchParams.get("folder_id");
  const folderId = folderIdParam ? parseInt(folderIdParam) : null;

  // Step 1: program info
  const [programName, setProgramName] = useState("");
  const [programDesc, setProgramDesc] = useState("");
  const [programType, setProgramType] = useState<"strength" | "rehab">(
    searchParams.get("type") === "rehab" ? "rehab" : "strength"
  );
  // Created program ID (set after step 1 mutation)
  const [programId, setProgramId] = useState<number | null>(null);

  // Step 2: workout drafts
  const [workoutDrafts, setWorkoutDrafts] = useState<WorkoutDraft[]>([
    { name: "", day_offset: 1 },
  ]);

  // Created workouts (returned from API after step 2)
  const [createdWorkouts, setCreatedWorkouts] = useState<Workout[]>([]);

  // Step 3: exercises per workout index
  const [exerciseDrafts, setExerciseDrafts] = useState<ExerciseDraft[][]>([]);

  // Step 4: assignment
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createProgramMutation = useMutation({
    mutationFn: () => programApi.create({
      name: programName,
      description: programDesc || undefined,
      program_type: programType,
      folder_id: folderId,
    }),
    onSuccess: (data) => {
      setProgramId(data.id);
      setStep(2);
      setError(null);
    },
    onError: (err: any) => {
      setError(extractErrorMessage(err, "Failed to create program."));
    },
  });

  const addWorkoutsMutation = useMutation({
    mutationFn: async () => {
      if (!programId) throw new Error("No program ID");
      const results: Workout[] = [];
      for (const w of workoutDrafts) {
        const created = await programApi.addWorkout(programId, {
          name: w.name,
          day_offset: w.day_offset,
        });
        results.push(created as Workout);
      }
      return results;
    },
    onSuccess: (workouts) => {
      setCreatedWorkouts(workouts);
      setExerciseDrafts(workouts.map(() => [{ name: "", sets: 3, reps: 10, target_weight: "", coach_notes: "" }]));
      setStep(3);
      setError(null);
    },
    onError: (err: any) => {
      setError(extractErrorMessage(err, "Failed to add workouts."));
    },
  });

  const addExercisesMutation = useMutation({
    mutationFn: async () => {
      for (let wi = 0; wi < createdWorkouts.length; wi++) {
        const workout = createdWorkouts[wi];
        const exercises = exerciseDrafts[wi] ?? [];
        for (let ei = 0; ei < exercises.length; ei++) {
          const ex = exercises[ei];
          if (!ex.name.trim()) continue;
          await programApi.addExercise(workout.id, {
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            coach_notes: ex.coach_notes || undefined,
            order: ei + 1,
          });
        }
      }
    },
    onSuccess: () => {
      setStep(4);
      setError(null);
    },
    onError: (err: any) => {
      setError(extractErrorMessage(err, "Failed to add exercises."));
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => {
      if (!programId || !selectedAthleteId || !startDate) {
        throw new Error("Missing required fields.");
      }
      return programApi.assign(programId, {
        athlete_id: selectedAthleteId as number,
        start_date: startDate,
      });
    },
    onSuccess: () => {
      router.push("/coach/programs");
    },
    onError: (err: any) => {
      setError(extractErrorMessage(err, "Failed to assign program."));
    },
  });

  // Roster query (used in step 4)
  const { data: rosterData } = useQuery({
    queryKey: ["roster"],
    queryFn: () => coachApi.getRoster(),
    enabled: step === 4,
  });
  const roster = rosterData?.athletes;

  // ── Workout draft helpers ─────────────────────────────────────────────────

  const addWorkoutDraft = () =>
    setWorkoutDrafts((prev) => [...prev, { name: "", day_offset: prev.length + 1 }]);

  const removeWorkoutDraft = (idx: number) =>
    setWorkoutDrafts((prev) => prev.filter((_, i) => i !== idx));

  const updateWorkoutDraft = (idx: number, field: keyof WorkoutDraft, value: string | number) =>
    setWorkoutDrafts((prev) =>
      prev.map((w, i) => (i === idx ? { ...w, [field]: value } : w))
    );

  // ── Exercise draft helpers ────────────────────────────────────────────────

  const addExerciseDraft = (workoutIdx: number) =>
    setExerciseDrafts((prev) => {
      const next = [...prev];
      next[workoutIdx] = [...(next[workoutIdx] ?? []), { name: "", sets: 3, reps: 10, target_weight: "", coach_notes: "" }];
      return next;
    });

  const removeExerciseDraft = (workoutIdx: number, exIdx: number) =>
    setExerciseDrafts((prev) => {
      const next = [...prev];
      next[workoutIdx] = next[workoutIdx].filter((_, i) => i !== exIdx);
      return next;
    });

  const updateExerciseDraft = (
    workoutIdx: number,
    exIdx: number,
    field: keyof ExerciseDraft,
    value: string | number
  ) =>
    setExerciseDrafts((prev) => {
      const next = [...prev];
      next[workoutIdx] = next[workoutIdx].map((ex, i) =>
        i === exIdx ? { ...ex, [field]: value } : ex
      );
      return next;
    });

  // ── Validation ────────────────────────────────────────────────────────────

  const step1Valid = programName.trim().length > 0;
  const step2Valid = workoutDrafts.length > 0 && workoutDrafts.every((w) => w.name.trim().length > 0);
  const step4Valid = !!selectedAthleteId && !!startDate;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AuthGuard requiredUserType="coach">
      <div className="min-h-screen bg-background">
        <NavBar userName={user?.name || ""} userType="coach" />

        <main className="max-w-3xl mx-auto px-4 py-8">
          <div className="mb-6">
            <button
              onClick={() => router.push("/coach/programs")}
              className="text-secondary hover:text-text text-sm mb-4 inline-flex items-center gap-1"
            >
              ← Back to Programs
            </button>
            <h1 className="text-3xl font-heading font-bold text-text">Create Program</h1>
          </div>

          <StepIndicator current={step} />

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-error/10 border border-error/40 text-error text-sm">
              {error}
            </div>
          )}

          {/* ── Step 1: Program Details ──────────────────────────────────── */}
          {step === 1 && (
            <div className="card">
              <h2 className="text-xl font-heading font-bold text-text mb-6">Program Details</h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Program Name <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={programName}
                    onChange={(e) => setProgramName(e.target.value)}
                    className="input-field"
                    placeholder="e.g. 8-Week Strength Block"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Description & When to Use</label>
                  <textarea
                    value={programDesc}
                    onChange={(e) => setProgramDesc(e.target.value)}
                    className="input-field min-h-[100px]"
                    placeholder="e.g. For athletes experiencing anterior knee pain or patellar tendinopathy. Use when an athlete reports knee discomfort during loading phases, squatting, or landing. Avoid if acute swelling is present."
                  />
                  <p className="mt-1.5 text-xs text-secondary">
                    For rehab programs: describe symptoms and situations where this plan is appropriate. This helps match the right program to injured athletes automatically.
                  </p>
                </div>

                {/* Program type toggle */}
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Program Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setProgramType("strength")}
                      className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-colors ${
                        programType === "strength"
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-background border-secondary/30 text-secondary hover:border-secondary/60"
                      }`}
                    >
                      Strength Training
                    </button>
                    <button
                      type="button"
                      onClick={() => setProgramType("rehab")}
                      className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-colors ${
                        programType === "rehab"
                          ? "bg-amber-400/20 border-amber-400 text-amber-400"
                          : "bg-background border-secondary/30 text-secondary hover:border-secondary/60"
                      }`}
                    >
                      Rehab / PT
                    </button>
                  </div>
                </div>

              </div>
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => createProgramMutation.mutate()}
                  disabled={!step1Valid || createProgramMutation.isPending}
                  className="btn-primary"
                >
                  {createProgramMutation.isPending ? "Creating..." : "Next: Add Workouts →"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Workouts ─────────────────────────────────────────── */}
          {step === 2 && (
            <div className="card">
              <h2 className="text-xl font-heading font-bold text-text mb-2">Add Workouts</h2>
              <p className="text-secondary text-sm mb-6">
                Define the sessions in this program. Day offset is the day number within the program (e.g. Day 1, Day 3…).
              </p>

              <div className="space-y-4">
                {workoutDrafts.map((workout, idx) => (
                  <div key={idx} className="p-4 rounded-lg border border-secondary/20 bg-background space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-primary">Session {idx + 1}</span>
                      {workoutDrafts.length > 1 && (
                        <button
                          onClick={() => removeWorkoutDraft(idx)}
                          className="text-error text-sm hover:opacity-80"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-secondary mb-1">Name</label>
                        <input
                          type="text"
                          value={workout.name}
                          onChange={(e) => updateWorkoutDraft(idx, "name", e.target.value)}
                          className="input-field"
                          placeholder="e.g. Upper Body A"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1">Day Offset</label>
                        <input
                          type="number"
                          min={1}
                          value={workout.day_offset}
                          onChange={(e) => updateWorkoutDraft(idx, "day_offset", parseInt(e.target.value) || 1)}
                          className="input-field"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addWorkoutDraft}
                className="mt-4 w-full py-3 rounded-lg border border-dashed border-primary/40 text-primary text-sm font-medium hover:border-primary hover:bg-primary/5 transition-colors"
              >
                + Add Another Session
              </button>

              <div className="mt-8 flex justify-between">
                <button onClick={() => setStep(1)} className="btn-secondary">
                  ← Back
                </button>
                <button
                  onClick={() => addWorkoutsMutation.mutate()}
                  disabled={!step2Valid || addWorkoutsMutation.isPending}
                  className="btn-primary"
                >
                  {addWorkoutsMutation.isPending ? "Saving..." : "Next: Add Exercises →"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Exercises ────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="card">
                <h2 className="text-xl font-heading font-bold text-text mb-2">Add Exercises</h2>
                <p className="text-secondary text-sm">Add exercises to each session. You can skip sessions and add exercises later.</p>
              </div>

              {createdWorkouts.map((workout, wi) => (
                <div key={workout.id} className="card">
                  <h3 className="text-lg font-heading font-bold text-text mb-1">{workout.name}</h3>
                  <p className="text-secondary text-xs mb-4">Day {workout.day_offset}</p>

                  <div className="space-y-4">
                    {(exerciseDrafts[wi] ?? []).map((ex, ei) => (
                      <div key={ei} className="p-4 rounded-lg border border-secondary/20 bg-background">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-medium text-primary">Exercise {ei + 1}</span>
                          {(exerciseDrafts[wi]?.length ?? 0) > 1 && (
                            <button
                              onClick={() => removeExerciseDraft(wi, ei)}
                              className="text-error text-sm hover:opacity-80"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-secondary mb-1">Exercise Name</label>
                            <input
                              type="text"
                              value={ex.name}
                              onChange={(e) => updateExerciseDraft(wi, ei, "name", e.target.value)}
                              className="input-field"
                              placeholder="e.g. Back Squat"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-secondary mb-1">Sets</label>
                            <input
                              type="number"
                              min={1}
                              value={ex.sets}
                              onChange={(e) => updateExerciseDraft(wi, ei, "sets", parseInt(e.target.value) || 1)}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-secondary mb-1">Reps</label>
                            <input
                              type="number"
                              min={1}
                              value={ex.reps}
                              onChange={(e) => updateExerciseDraft(wi, ei, "reps", parseInt(e.target.value) || 1)}
                              className="input-field"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-secondary mb-1">Coach Notes</label>
                            <input
                              type="text"
                              value={ex.coach_notes}
                              onChange={(e) => updateExerciseDraft(wi, ei, "coach_notes", e.target.value)}
                              className="input-field"
                              placeholder="Cues, tempo, focus points…"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => addExerciseDraft(wi)}
                    className="mt-3 w-full py-2 rounded-lg border border-dashed border-primary/40 text-primary text-sm font-medium hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    + Add Exercise
                  </button>
                </div>
              ))}

              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="btn-secondary">
                  ← Back
                </button>
                <button
                  onClick={() => addExercisesMutation.mutate()}
                  disabled={addExercisesMutation.isPending}
                  className="btn-primary"
                >
                  {addExercisesMutation.isPending ? "Saving..." : "Next: Assign →"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Assign ───────────────────────────────────────────── */}
          {step === 4 && (
            <div className="card">
              <h2 className="text-xl font-heading font-bold text-text mb-2">Assign to Athlete</h2>
              <p className="text-secondary text-sm mb-6">
                Choose an athlete and a start date. The program workouts will be scheduled based on the day offsets.
              </p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Athlete <span className="text-error">*</span>
                  </label>
                  {!roster ? (
                    <div className="input-field text-secondary">Loading athletes...</div>
                  ) : roster.length === 0 ? (
                    <div className="p-4 rounded-lg border border-secondary/20 text-secondary text-sm">
                      No athletes on your roster yet. Add athletes first using your invite code.
                    </div>
                  ) : (
                    <select
                      value={selectedAthleteId}
                      onChange={(e) => setSelectedAthleteId(e.target.value ? Number(e.target.value) : "")}
                      className="input-field"
                    >
                      <option value="">Select an athlete…</option>
                      {roster.map((athlete: AthleteProfile) => (
                        <option key={athlete.id} value={athlete.id}>
                          {athlete.name} {athlete.sport ? `— ${athlete.sport}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Start Date <span className="text-error">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-between">
                <button onClick={() => setStep(3)} className="btn-secondary">
                  ← Back
                </button>
                <button
                  onClick={() => assignMutation.mutate()}
                  disabled={!step4Valid || assignMutation.isPending}
                  className="btn-primary"
                >
                  {assignMutation.isPending ? "Assigning..." : "Create & Assign Program"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
