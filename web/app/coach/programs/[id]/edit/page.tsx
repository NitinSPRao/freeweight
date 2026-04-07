"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { programApi } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";
import { extractErrorMessage } from "@/lib/utils";

// ─── Local state types ────────────────────────────────────────────────────────

interface LocalExercise {
  id: number;
  name: string;
  sets: number;
  reps: number;
  coach_notes: string;
  order: number;
}

interface LocalWorkout {
  id: number;
  name: string;
  day_offset: number;
  exercises: LocalExercise[];
}

// ─── Empty exercise/workout templates ────────────────────────────────────────

const blankExercise = () => ({ name: "", sets: 3, reps: 10, coach_notes: "" });
const blankWorkout = () => ({ name: "", day_offset: 1 });

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EditProgramPage() {
  const params = useParams();
  const { user } = getAuthData();
  const queryClient = useQueryClient();
  const programId = parseInt(params.id as string);

  // ── Server data ─────────────────────────────────────────────────────────
  const { data: program, isLoading } = useQuery({
    queryKey: ["program", programId],
    queryFn: () => programApi.get(programId),
  });

  // ── Local editable state ─────────────────────────────────────────────────
  const [programName, setProgramName] = useState("");
  const [programDesc, setProgramDesc] = useState("");
  const [workouts, setWorkouts] = useState<LocalWorkout[]>([]);

  // Which workout's add-exercise panel is open (null = none)
  const [addExerciseFor, setAddExerciseFor] = useState<number | null>(null);
  const [newExercise, setNewExercise] = useState(blankExercise());

  const [showAddWorkout, setShowAddWorkout] = useState(false);
  const [newWorkout, setNewWorkout] = useState(blankWorkout());

  const [error, setError] = useState<string | null>(null);
  const [savedProgram, setSavedProgram] = useState(false);

  // Initialize local state from server data (runs once on first load)
  useEffect(() => {
    if (program) {
      setProgramName(program.name);
      setProgramDesc(program.description ?? "");
      setWorkouts(
        [...(program.workouts ?? [])]
          .sort((a, b) => (a.day_offset ?? 0) - (b.day_offset ?? 0))
          .map((w) => ({
            id: w.id,
            name: w.name,
            day_offset: w.day_offset ?? 0,
            exercises: [...(w.exercises ?? [])]
              .sort((a, b) => a.order - b.order)
              .map((e) => ({
                id: e.id,
                name: e.name,
                sets: e.sets,
                reps: e.reps,
                coach_notes: e.coach_notes ?? "",
                order: e.order,
              })),
          }))
      );
    }
  }, [program]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const updateLocalWorkout = (
    id: number,
    field: "name" | "day_offset",
    value: string | number
  ) =>
    setWorkouts((prev) =>
      prev.map((w) => (w.id === id ? { ...w, [field]: value } : w))
    );

  const updateLocalExercise = (
    workoutId: number,
    exerciseId: number,
    field: "name" | "sets" | "reps" | "coach_notes",
    value: string | number
  ) =>
    setWorkouts((prev) =>
      prev.map((w) =>
        w.id === workoutId
          ? {
              ...w,
              exercises: w.exercises.map((e) =>
                e.id === exerciseId ? { ...e, [field]: value } : e
              ),
            }
          : w
      )
    );

  // ── Mutations ────────────────────────────────────────────────────────────

  const updateProgramMutation = useMutation({
    mutationFn: () =>
      programApi.update(programId, {
        name: programName,
        description: programDesc || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      setError(null);
      setSavedProgram(true);
      setTimeout(() => setSavedProgram(false), 2000);
    },
    onError: (err: any) =>
      setError(extractErrorMessage(err, "Failed to update program.")),
  });

  const updateWorkoutMutation = useMutation({
    mutationFn: ({
      id,
      name,
      day_offset,
    }: {
      id: number;
      name: string;
      day_offset: number;
    }) => programApi.updateWorkout(id, { name, day_offset }),
    onError: (err: any) =>
      setError(extractErrorMessage(err, "Failed to update workout.")),
  });

  const deleteWorkoutMutation = useMutation({
    mutationFn: (workoutId: number) => programApi.deleteWorkout(workoutId),
    onSuccess: (_, workoutId) => {
      setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
      setError(null);
    },
    onError: (err: any) =>
      setError(extractErrorMessage(err, "Failed to delete workout.")),
  });

  const addWorkoutMutation = useMutation({
    mutationFn: () =>
      programApi.addWorkout(programId, {
        name: newWorkout.name,
        day_offset: newWorkout.day_offset,
      }),
    onSuccess: (data: any) => {
      setWorkouts((prev) => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          day_offset: data.day_offset ?? 0,
          exercises: [],
        },
      ]);
      setNewWorkout(blankWorkout());
      setShowAddWorkout(false);
      setError(null);
    },
    onError: (err: any) =>
      setError(extractErrorMessage(err, "Failed to add workout.")),
  });

  const updateExerciseMutation = useMutation({
    mutationFn: ({
      id,
      name,
      sets,
      reps,
      coach_notes,
    }: {
      id: number;
      name: string;
      sets: number;
      reps: number;
      coach_notes: string;
    }) =>
      programApi.updateExercise(id, {
        name,
        sets,
        reps,
        coach_notes: coach_notes || undefined,
      }),
    onError: (err: any) =>
      setError(extractErrorMessage(err, "Failed to update exercise.")),
  });

  const deleteExerciseMutation = useMutation({
    mutationFn: ({
      exerciseId,
    }: {
      exerciseId: number;
      workoutId: number;
    }) => programApi.deleteExercise(exerciseId),
    onSuccess: (_, { exerciseId, workoutId }) => {
      setWorkouts((prev) =>
        prev.map((w) =>
          w.id === workoutId
            ? { ...w, exercises: w.exercises.filter((e) => e.id !== exerciseId) }
            : w
        )
      );
      setError(null);
    },
    onError: (err: any) =>
      setError(extractErrorMessage(err, "Failed to delete exercise.")),
  });

  const addExerciseMutation = useMutation({
    mutationFn: ({ workoutId }: { workoutId: number }) =>
      programApi.addExercise(workoutId, {
        name: newExercise.name,
        sets: newExercise.sets,
        reps: newExercise.reps,
        coach_notes: newExercise.coach_notes || undefined,
        order:
          (workouts.find((w) => w.id === workoutId)?.exercises.length ?? 0) +
          1,
      }),
    onSuccess: (data: any, { workoutId }) => {
      setWorkouts((prev) =>
        prev.map((w) =>
          w.id === workoutId
            ? {
                ...w,
                exercises: [
                  ...w.exercises,
                  {
                    id: data.id,
                    name: data.name,
                    sets: data.sets,
                    reps: data.reps,
                    coach_notes: data.coach_notes ?? "",
                    order: data.order,
                  },
                ],
              }
            : w
        )
      );
      setNewExercise(blankExercise());
      setAddExerciseFor(null);
      setError(null);
    },
    onError: (err: any) =>
      setError(extractErrorMessage(err, "Failed to add exercise.")),
  });

  // ── Loading / not found ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AuthGuard requiredUserType="coach">
        <div className="min-h-screen bg-background">
          <NavBar
            userName={user?.name ?? ""}
            userType="coach"
            profilePhoto={user?.profile_photo_url}
          />
          <main className="max-w-3xl mx-auto px-4 py-8">
            <div className="card">
              <p className="text-secondary">Loading program…</p>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  if (!program) {
    return (
      <AuthGuard requiredUserType="coach">
        <div className="min-h-screen bg-background">
          <NavBar
            userName={user?.name ?? ""}
            userType="coach"
            profilePhoto={user?.profile_photo_url}
          />
          <main className="max-w-3xl mx-auto px-4 py-8">
            <div className="card text-center py-12">
              <p className="text-text mb-4">Program not found.</p>
              <Link href="/coach/programs" className="btn-primary inline-block">
                Back to Programs
              </Link>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AuthGuard requiredUserType="coach">
      <div className="min-h-screen bg-background">
        <NavBar
          userName={user?.name ?? ""}
          userType="coach"
          profilePhoto={user?.profile_photo_url}
        />

        <main className="max-w-3xl mx-auto px-4 py-8">
          {/* ── Page header ── */}
          <div className="mb-6">
            <Link
              href={`/coach/programs/${programId}`}
              className="text-secondary hover:text-text text-sm mb-4 inline-flex items-center gap-1"
            >
              ← Back to Program
            </Link>
            <h1 className="text-3xl font-heading font-bold text-text">
              Edit Program
            </h1>
          </div>

          {/* ── Error banner ── */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-error/10 border border-error/40 text-error text-sm">
              {error}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              Section 1 — Program details
          ══════════════════════════════════════════════════════════════════ */}
          <div className="card mb-6">
            <h2 className="text-xl font-heading font-bold text-text mb-4">
              Program Details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Program Name
                </label>
                <input
                  type="text"
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Description
                </label>
                <textarea
                  value={programDesc}
                  onChange={(e) => setProgramDesc(e.target.value)}
                  className="input-field min-h-[80px]"
                  placeholder="Optional description…"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end items-center gap-3">
              {savedProgram && (
                <span className="text-primary text-sm">Saved!</span>
              )}
              <button
                onClick={() => updateProgramMutation.mutate()}
                disabled={
                  !programName.trim() || updateProgramMutation.isPending
                }
                className="btn-primary text-sm"
              >
                {updateProgramMutation.isPending ? "Saving…" : "Save Details"}
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              Section 2 — Workouts
          ══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-4 mb-4">
            {workouts.map((workout) => (
              <div key={workout.id} className="card">
                {/* ── Workout meta fields ── */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-secondary mb-1">
                      Workout Name
                    </label>
                    <input
                      type="text"
                      value={workout.name}
                      onChange={(e) =>
                        updateLocalWorkout(workout.id, "name", e.target.value)
                      }
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-secondary mb-1">
                      Day Offset
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={workout.day_offset}
                      onChange={(e) =>
                        updateLocalWorkout(
                          workout.id,
                          "day_offset",
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="input-field"
                    />
                  </div>
                </div>

                {/* ── Workout action row ── */}
                <div className="flex justify-between items-center mb-4">
                  <button
                    onClick={() =>
                      updateWorkoutMutation.mutate({
                        id: workout.id,
                        name: workout.name,
                        day_offset: workout.day_offset,
                      })
                    }
                    disabled={updateWorkoutMutation.isPending}
                    className="btn-secondary text-sm"
                  >
                    {updateWorkoutMutation.isPending
                      ? "Saving…"
                      : "Save Workout"}
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Delete "${workout.name}"? All exercises will be removed.`
                        )
                      ) {
                        deleteWorkoutMutation.mutate(workout.id);
                      }
                    }}
                    disabled={deleteWorkoutMutation.isPending}
                    className="text-error text-sm hover:opacity-80"
                  >
                    Delete Workout
                  </button>
                </div>

                {/* ── Exercises ── */}
                <div className="border-t border-secondary/15 pt-4">
                  <h4 className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
                    Exercises ({workout.exercises.length})
                  </h4>

                  {workout.exercises.length > 0 && (
                    <div className="space-y-3 mb-3">
                      {workout.exercises.map((ex, idx) => (
                        <div
                          key={ex.id}
                          className="p-3 rounded-lg border border-secondary/20 bg-background"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-medium text-primary">
                              #{idx + 1}
                            </span>
                            <button
                              onClick={() => {
                                if (confirm(`Delete "${ex.name}"?`)) {
                                  deleteExerciseMutation.mutate({
                                    exerciseId: ex.id,
                                    workoutId: workout.id,
                                  });
                                }
                              }}
                              disabled={deleteExerciseMutation.isPending}
                              className="text-error text-xs hover:opacity-80"
                            >
                              Delete
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="col-span-2">
                              <label className="block text-xs text-secondary mb-1">
                                Name
                              </label>
                              <input
                                type="text"
                                value={ex.name}
                                onChange={(e) =>
                                  updateLocalExercise(
                                    workout.id,
                                    ex.id,
                                    "name",
                                    e.target.value
                                  )
                                }
                                className="input-field text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-secondary mb-1">
                                Sets
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={ex.sets}
                                onChange={(e) =>
                                  updateLocalExercise(
                                    workout.id,
                                    ex.id,
                                    "sets",
                                    parseInt(e.target.value) || 1
                                  )
                                }
                                className="input-field text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-secondary mb-1">
                                Reps
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={ex.reps}
                                onChange={(e) =>
                                  updateLocalExercise(
                                    workout.id,
                                    ex.id,
                                    "reps",
                                    parseInt(e.target.value) || 1
                                  )
                                }
                                className="input-field text-sm"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs text-secondary mb-1">
                                Coach Notes
                              </label>
                              <input
                                type="text"
                                value={ex.coach_notes}
                                onChange={(e) =>
                                  updateLocalExercise(
                                    workout.id,
                                    ex.id,
                                    "coach_notes",
                                    e.target.value
                                  )
                                }
                                className="input-field text-sm"
                                placeholder="Cues, tempo, focus points…"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={() =>
                                updateExerciseMutation.mutate({
                                  id: ex.id,
                                  name: ex.name,
                                  sets: ex.sets,
                                  reps: ex.reps,
                                  coach_notes: ex.coach_notes,
                                })
                              }
                              disabled={updateExerciseMutation.isPending}
                              className="text-primary text-xs font-medium hover:opacity-80"
                            >
                              {updateExerciseMutation.isPending
                                ? "Saving…"
                                : "Save Exercise"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Add exercise panel ── */}
                  {addExerciseFor === workout.id ? (
                    <div className="p-3 rounded-lg border border-primary/30 bg-background">
                      <p className="text-xs font-medium text-primary mb-3">
                        New Exercise
                      </p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="col-span-2">
                          <label className="block text-xs text-secondary mb-1">
                            Name
                          </label>
                          <input
                            type="text"
                            value={newExercise.name}
                            onChange={(e) =>
                              setNewExercise((p) => ({
                                ...p,
                                name: e.target.value,
                              }))
                            }
                            className="input-field text-sm"
                            placeholder="e.g. Back Squat"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-secondary mb-1">
                            Sets
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={newExercise.sets}
                            onChange={(e) =>
                              setNewExercise((p) => ({
                                ...p,
                                sets: parseInt(e.target.value) || 1,
                              }))
                            }
                            className="input-field text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-secondary mb-1">
                            Reps
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={newExercise.reps}
                            onChange={(e) =>
                              setNewExercise((p) => ({
                                ...p,
                                reps: parseInt(e.target.value) || 1,
                              }))
                            }
                            className="input-field text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-secondary mb-1">
                            Coach Notes
                          </label>
                          <input
                            type="text"
                            value={newExercise.coach_notes}
                            onChange={(e) =>
                              setNewExercise((p) => ({
                                ...p,
                                coach_notes: e.target.value,
                              }))
                            }
                            className="input-field text-sm"
                            placeholder="Optional…"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <button
                          onClick={() => {
                            setAddExerciseFor(null);
                            setNewExercise(blankExercise());
                          }}
                          className="text-secondary text-xs hover:text-text"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() =>
                            addExerciseMutation.mutate({
                              workoutId: workout.id,
                            })
                          }
                          disabled={
                            !newExercise.name.trim() ||
                            addExerciseMutation.isPending
                          }
                          className="btn-primary text-xs py-1.5 px-4"
                        >
                          {addExerciseMutation.isPending
                            ? "Adding…"
                            : "Add Exercise"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setNewExercise(blankExercise());
                        setAddExerciseFor(workout.id);
                      }}
                      className="w-full py-2 rounded-lg border border-dashed border-primary/40 text-primary text-xs font-medium hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      + Add Exercise
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              Section 3 — Add workout
          ══════════════════════════════════════════════════════════════════ */}
          {showAddWorkout ? (
            <div className="card mb-6">
              <h3 className="text-lg font-heading font-bold text-text mb-4">
                New Workout
              </h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-secondary mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newWorkout.name}
                    onChange={(e) =>
                      setNewWorkout((p) => ({ ...p, name: e.target.value }))
                    }
                    className="input-field"
                    placeholder="e.g. Lower Body B"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">
                    Day Offset
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newWorkout.day_offset}
                    onChange={(e) =>
                      setNewWorkout((p) => ({
                        ...p,
                        day_offset: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="input-field"
                  />
                </div>
              </div>
              <div className="flex justify-between">
                <button
                  onClick={() => {
                    setShowAddWorkout(false);
                    setNewWorkout(blankWorkout());
                  }}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => addWorkoutMutation.mutate()}
                  disabled={
                    !newWorkout.name.trim() || addWorkoutMutation.isPending
                  }
                  className="btn-primary text-sm"
                >
                  {addWorkoutMutation.isPending ? "Adding…" : "Add Workout"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddWorkout(true)}
              className="w-full py-3 rounded-lg border border-dashed border-primary/40 text-primary text-sm font-medium hover:border-primary hover:bg-primary/5 transition-colors mb-6"
            >
              + Add Workout
            </button>
          )}

          {/* ── Footer ── */}
          <div className="flex justify-end">
            <Link
              href={`/coach/programs/${programId}`}
              className="btn-primary"
            >
              Done Editing
            </Link>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
