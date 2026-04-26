"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { athleteApi, Exercise, FlagResult } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";
import { calculateTargetWeight } from "@/lib/utils";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetEntry {
  exercise_id: number;
  set_number: number;
  weight_used: number;
  reps_completed: number;
  rpe?: number;
  was_modified: boolean;
}

interface QueueItem {
  id: string;            // `${exerciseId}-${setNumber}` — stable DnD key
  exerciseId: number;
  exerciseName: string;
  setNumber: number;     // 1-indexed within this exercise
  totalSets: number;
  reps: number;
  restSeconds: number;
  coachNotes: string | null;
  groupLabel: string | null;
  colorIndex: number;
}

interface WorkoutSummaryData {
  workoutId: number;
  workoutName: string;
  scheduledDate: string;
  completedAt: string;
  exercises: Array<{
    id: number;
    name: string;
    sets: number;
    reps: number;
    group_label: string | null;
    percentage_of_max?: number;
    target_exercise?: string;
  }>;
  loggedSets: Record<string, SetEntry>;
  completionNotes: string;
  totalSets: number;
  completedTotal: number;
}

// ─── Color palette — 6 colors, not green (green = primary UI color) ───────────

const EXERCISE_COLORS = [
  { border: "border-blue-400",   bg: "bg-blue-400/10",   text: "text-blue-400"   },
  { border: "border-orange-400", bg: "bg-orange-400/10", text: "text-orange-400" },
  { border: "border-purple-400", bg: "bg-purple-400/10", text: "text-purple-400" },
  { border: "border-teal-400",   bg: "bg-teal-400/10",   text: "text-teal-400"   },
  { border: "border-pink-400",   bg: "bg-pink-400/10",   text: "text-pink-400"   },
  { border: "border-yellow-400", bg: "bg-yellow-400/10", text: "text-yellow-400" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkoutPage() {
  const router = useRouter();
  const params = useParams();
  const workoutId = parseInt(params.id as string);
  const { user } = getAuthData();
  const queryClient = useQueryClient();

  // ── Queue state ───────────────────────────────────────────────────────────
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [completedItems, setCompletedItems] = useState<QueueItem[]>([]);
  const [queueInitialized, setQueueInitialized] = useState(false);
  const [showDoneSection, setShowDoneSection] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────
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
  const [pendingRestSeconds, setPendingRestSeconds] = useState<number | null>(null);
  const [showRestBanner, setShowRestBanner] = useState(false);
  const [restBannerDuration, setRestBannerDuration] = useState(90);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: workout, isLoading } = useQuery({
    queryKey: ["workout", workoutId],
    queryFn: () => athleteApi.getWorkout(workoutId),
  });

  const { data: maxes } = useQuery({
    queryKey: ["progress"],
    queryFn: () => athleteApi.getProgress(),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
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

  // ── Target weight helper ──────────────────────────────────────────────────
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

  // ── Queue initialization ──────────────────────────────────────────────────
  useEffect(() => {
    if (!workout || !workoutStarted || queueInitialized) return;
    const items: QueueItem[] = [];
    (workout.exercises || []).forEach((ex, exIdx) => {
      for (let s = 1; s <= ex.sets; s++) {
        items.push({
          id: `${ex.id}-${s}`,
          exerciseId: ex.id,
          exerciseName: ex.name,
          setNumber: s,
          totalSets: ex.sets,
          reps: ex.reps,
          restSeconds: ex.rest_seconds || 90,
          coachNotes: ex.coach_notes || null,
          groupLabel: ex.group_label || null,
          colorIndex: exIdx % EXERCISE_COLORS.length,
        });
      }
    });
    setQueue(items);
    setQueueInitialized(true);
  }, [workout, workoutStarted, queueInitialized]);

  // ── DnD ───────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setQueue((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setShowCustomInput(false);
  };

  // ── Log set ───────────────────────────────────────────────────────────────
  const logActiveSet = (weight: number, reps: number, wasModified: boolean) => {
    const activeItem = queue[0];
    if (!activeItem) return;

    const entry: SetEntry = {
      exercise_id: activeItem.exerciseId,
      set_number: activeItem.setNumber,
      weight_used: weight,
      reps_completed: reps,
      was_modified: wasModified,
    };
    const key = `${activeItem.exerciseId}-${activeItem.setNumber}`;
    setLoggedSets((prev) => ({ ...prev, [key]: entry }));
    logSetMutation.mutate(entry);

    setQueue((prev) => prev.slice(1));
    setCompletedItems((prev) => [...prev, activeItem]);
    setShowCustomInput(false);

    // Offer rest timer if more sets remain; otherwise open completion modal
    const hasMoreSets = queue.length > 1;
    if (hasMoreSets) {
      setShowRestBanner(false);
      setPendingRestSeconds(activeItem.restSeconds || 90);
    } else {
      setPendingRestSeconds(null);
      setShowCompletionModal(true);
    }
  };

  const handleCompletedAsPlanned = () => {
    const activeItem = queue[0];
    if (!activeItem) return;
    const exercise = workout?.exercises.find((e) => e.id === activeItem.exerciseId);
    logActiveSet(getTargetWeight(exercise) || 0, activeItem.reps, false);
  };

  const completeAllForExercise = (exerciseId: number) => {
    const exercise = exercises.find((e) => e.id === exerciseId);
    const targetWeight = getTargetWeight(exercise);
    const itemsToComplete = queue.filter((item) => item.exerciseId === exerciseId);
    if (itemsToComplete.length === 0) return;

    const newEntries: Record<string, SetEntry> = {};
    for (const item of itemsToComplete) {
      const entry: SetEntry = {
        exercise_id: item.exerciseId,
        set_number: item.setNumber,
        weight_used: targetWeight || 0,
        reps_completed: item.reps,
        was_modified: false,
      };
      newEntries[`${item.exerciseId}-${item.setNumber}`] = entry;
      logSetMutation.mutate(entry);
    }

    setLoggedSets((prev) => ({ ...prev, ...newEntries }));
    setCompletedItems((prev) => [...prev, ...itemsToComplete]);
    setQueue((prev) => prev.filter((item) => item.exerciseId !== exerciseId));
    setShowCustomInput(false);

    const remaining = queue.filter((item) => item.exerciseId !== exerciseId);
    if (remaining.length === 0) {
      setPendingRestSeconds(null);
      setShowCompletionModal(true);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const exercises = workout?.exercises || [];
  const totalSets = exercises.reduce((sum, e) => sum + e.sets, 0);
  const completedTotal = completedItems.length;
  const progressPercent = totalSets > 0 ? (completedTotal / totalSets) * 100 : 0;

  const activeItem = queue[0] ?? null;
  const activeExercise = activeItem
    ? exercises.find((e) => e.id === activeItem.exerciseId)
    : undefined;
  const activeTargetWeight = getTargetWeight(activeExercise);
  const activeColor = activeItem
    ? EXERCISE_COLORS[activeItem.colorIndex % EXERCISE_COLORS.length]
    : null;

  // For each queue item: should it show the "Complete All" button?
  // True when it's the first queue item for that exercise AND none of its sets are done yet.
  const queueCompleteAllFlags = useMemo(() => {
    const seenIds = new Set<number>();
    const completedIds = new Set(completedItems.map((ci) => ci.exerciseId));
    return queue.map((item) => {
      const isFirst = !seenIds.has(item.exerciseId);
      seenIds.add(item.exerciseId);
      return isFirst && !completedIds.has(item.exerciseId);
    });
  }, [queue, completedItems]);

  // ── Loading / Error ───────────────────────────────────────────────────────

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

  // ── Pre-start Screen (unchanged) ──────────────────────────────────────────

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

  // Auto-mark started if resuming a workout that already has a log
  if (!workoutStarted && workout.workout_log_id) {
    setWorkoutStarted(true);
  }

  // ── Active Workout ────────────────────────────────────────────────────────

  return (
    <AuthGuard requiredUserType="athlete">
      <div className="min-h-screen bg-background">
        <NavBar userName={user?.name || ""} userType="athlete" />

        <main className="max-w-2xl mx-auto px-4 py-6 pb-12">

          {/* ── Header + Progress bar ─────────────────────────────────────── */}
          <div className="mb-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h1 className="text-xl font-heading font-bold text-text">{workout.name}</h1>
                <p className="text-secondary text-sm">
                  {completedTotal} / {totalSets} sets done
                </p>
              </div>
              <button
                onClick={() => setShowFlagModal(true)}
                className="flex items-center gap-1.5 border border-red-400 text-red-400 rounded-lg px-3 py-1 text-sm hover:bg-red-400/10 transition-colors flex-shrink-0"
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

          {/* ── Section 1: Current Set Card ───────────────────────────────── */}
          {activeItem && activeColor ? (
            <div className="mb-6">
              {/* Group label chip */}
              {activeItem.groupLabel && (
                <div className="mb-2">
                  <span
                    className={`inline-block text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${activeColor.bg} ${activeColor.text}`}
                  >
                    {activeItem.groupLabel}
                  </span>
                </div>
              )}

              {/* Card */}
              <div className={`rounded-xl border-l-[6px] ${activeColor.border} ${activeColor.bg} p-5`}>
                <div className="flex justify-between items-start mb-1">
                  <h2 className={`text-2xl font-heading font-bold ${activeColor.text}`}>
                    {activeItem.exerciseName}
                  </h2>
                  <span className="text-secondary text-sm flex-shrink-0 mt-1.5">
                    Set {activeItem.setNumber} / {activeItem.totalSets}
                  </span>
                </div>

                <p className="text-text text-lg font-semibold mb-5">
                  {activeTargetWeight !== null
                    ? `${activeTargetWeight} lbs × ${activeItem.reps} reps`
                    : `${activeItem.reps} reps`}
                </p>

                {/* Action buttons */}
                {!showCustomInput ? (
                  <div className="space-y-2">
                    <button
                      onClick={handleCompletedAsPlanned}
                      className="w-full bg-primary text-background font-bold py-4 px-6 rounded-xl text-base hover:opacity-90 transition-opacity"
                    >
                      Completed as Planned
                      <span className="block text-sm font-normal mt-0.5 opacity-80">
                        {activeTargetWeight !== null
                          ? `${activeTargetWeight} lbs`
                          : "Bodyweight"}{" "}
                        × {activeItem.reps} reps
                      </span>
                    </button>
                    <button
                      onClick={() => setShowCustomInput(true)}
                      className="w-full border border-secondary/40 text-secondary font-medium py-2.5 px-6 rounded-xl text-sm hover:text-text hover:border-secondary transition-colors"
                    >
                      I did something different
                    </button>
                  </div>
                ) : (
                  <CustomSetInput
                    defaultWeight={activeTargetWeight || 0}
                    defaultReps={activeItem.reps}
                    onLog={(weight, reps) => logActiveSet(weight, reps, true)}
                    onCancel={() => setShowCustomInput(false)}
                  />
                )}

                {/* Rest timer offer */}
                {pendingRestSeconds !== null && (
                  <button
                    onClick={() => {
                      setRestBannerDuration(pendingRestSeconds);
                      setPendingRestSeconds(null);
                      setShowRestBanner(true);
                    }}
                    className="mt-3 w-full border border-secondary/30 text-secondary text-sm font-medium py-2 px-4 rounded-xl hover:border-secondary/60 hover:text-text transition-colors"
                  >
                    Start Rest Timer ({pendingRestSeconds}s)
                  </button>
                )}

                {/* Coach notes */}
                {activeItem.coachNotes && (
                  <div className="mt-4 bg-background/50 rounded-lg p-3">
                    <p className="text-secondary text-xs mb-0.5">Coach Notes</p>
                    <p className="text-text text-sm">{activeItem.coachNotes}</p>
                  </div>
                )}
              </div>
            </div>
          ) : queueInitialized && queue.length === 0 && completedItems.length > 0 ? (
            /* All sets finished */
            <div className="mb-6 card text-center py-10">
              <p className="text-primary font-bold text-xl mb-1">All sets complete!</p>
              <p className="text-secondary text-sm mb-5">
                {completedTotal} / {totalSets} sets done
              </p>
              <button onClick={() => setShowCompletionModal(true)} className="btn-primary">
                Finish Workout
              </button>
            </div>
          ) : null}

          {/* ── Section 2: Set Queue ──────────────────────────────────────── */}
          {queueInitialized && (queue.length > 0 || completedItems.length > 0) && (
            <div>
              {/* Queue header */}
              {queue.length > 0 && (
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider">
                    Queue
                  </h3>
                  <span className="text-xs text-secondary">{queue.length} remaining</span>
                </div>
              )}

              {/* Sortable pending sets */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={queue.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1.5">
                    {queue.map((item, idx) => {
                      const exercise = exercises.find((e) => e.id === item.exerciseId);
                      const showCA = queueCompleteAllFlags[idx] ?? false;
                      return (
                        <SortableQueueItem
                          key={item.id}
                          item={item}
                          isActive={idx === 0}
                          targetWeight={getTargetWeight(exercise)}
                          showCompleteAll={showCA}
                          onCompleteAll={showCA ? () => completeAllForExercise(item.exerciseId) : undefined}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Done section (collapsed by default) */}
              {completedItems.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowDoneSection((v) => !v)}
                    className="flex items-center gap-2 w-full text-left py-1 text-xs font-semibold text-secondary uppercase tracking-wider"
                  >
                    <span className="text-primary">✓</span>
                    Done ({completedItems.length})
                    <span className="ml-auto">{showDoneSection ? "▲" : "▼"}</span>
                  </button>

                  {showDoneSection && (
                    <div className="space-y-1.5 mt-2">
                      {completedItems.map((item) => {
                        const color = EXERCISE_COLORS[item.colorIndex % EXERCISE_COLORS.length];
                        const logEntry = loggedSets[`${item.exerciseId}-${item.setNumber}`];
                        return (
                          <div
                            key={`done-${item.id}`}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-4 ${color.border} bg-background/30 opacity-50`}
                          >
                            <span className="text-primary text-xs flex-shrink-0">✓</span>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-secondary line-through">
                                {item.exerciseName}
                              </span>
                              <span className="text-secondary/60 text-xs ml-2">
                                Set {item.setNumber}
                                {logEntry
                                  ? ` · ${logEntry.weight_used} lbs × ${logEntry.reps_completed}`
                                  : ""}
                                {logEntry?.was_modified ? " ✱" : ""}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>

        {/* ── Completion Modal (unchanged) ───────────────────────────────── */}
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
                  onClick={async () => {
                    const summaryData: WorkoutSummaryData = {
                      workoutId,
                      workoutName: workout.name,
                      scheduledDate: workout.scheduled_date,
                      completedAt: new Date().toISOString(),
                      exercises: exercises.map((e) => ({
                        id: e.id,
                        name: e.name,
                        sets: e.sets,
                        reps: e.reps,
                        group_label: e.group_label ?? null,
                        percentage_of_max: e.percentage_of_max,
                        target_exercise: e.target_exercise,
                      })),
                      loggedSets,
                      completionNotes,
                      totalSets,
                      completedTotal,
                    };
                    try {
                      await completeWorkoutMutation.mutateAsync(completionNotes || undefined);
                      sessionStorage.setItem("workoutSummary", JSON.stringify(summaryData));
                      router.push(`/athlete/workout/${workoutId}/summary`);
                    } catch {
                      // Mutation error — stay on modal
                    }
                  }}
                  disabled={completeWorkoutMutation.isPending}
                  className="btn-primary flex-1"
                >
                  {completeWorkoutMutation.isPending ? "Saving..." : "Complete Workout"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Flag Modal (unchanged) ─────────────────────────────────────── */}
        {showFlagModal &&
          (() => {
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
                    <div>
                      <h3 className="text-xl font-heading font-bold text-text mb-1">
                        Report Submitted
                      </h3>
                      <p className="text-secondary text-sm mb-3">
                        {!flagOptInRehab || flagResult === null ? (
                          "Your coach has been notified and will follow up with you."
                        ) : flagResult.matched && flagResult.confidence === "high" ? (
                          <>
                            A recovery plan has been matched:{" "}
                            <span className="text-text font-medium">
                              &apos;{flagResult.program_name}&apos;
                            </span>{" "}
                            has been added to your dashboard.
                          </>
                        ) : flagResult.matched && flagResult.confidence === "medium" ? (
                          <>
                            <span className="text-text font-medium">
                              &apos;{flagResult.program_name}&apos;
                            </span>{" "}
                            has been added to your dashboard. Your coach will review to confirm it
                            is the right fit.
                          </>
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
                        <button onClick={closeFlagModal} className="btn-primary flex-1">
                          Continue Workout
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-xl font-heading font-bold text-text mb-1">
                        Report Concern
                      </h3>
                      <p className="text-secondary text-sm mb-5">
                        Your coach will be notified and will follow up with you.
                      </p>
                      <div className="mb-5">
                        <textarea
                          value={flagReason}
                          onChange={(e) => setFlagReason(e.target.value)}
                          placeholder="Describe what happened..."
                          className="input-field min-h-[100px]"
                        />
                      </div>
                      <hr className="border-secondary/20" />
                      <div className="mt-5 mb-5">
                        <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
                          Recovery
                        </p>
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
                            onClick={() => {
                              setFlagOptInRehab(false);
                              setFlagRehabTarget("");
                            }}
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
                              Be as specific as you can — this helps us find the right program for
                              you.
                            </p>
                          </div>
                        )}
                      </div>
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

        {/* ── Rest Timer Banner ─────────────────────────────────────────── */}
        {showRestBanner && (
          <RestTimerBanner
            durationSeconds={restBannerDuration}
            nextSetInfo={
              queue[0]
                ? `${queue[0].exerciseName} — Set ${queue[0].setNumber}/${queue[0].totalSets}`
                : undefined
            }
            onDismiss={() => setShowRestBanner(false)}
          />
        )}
      </div>
    </AuthGuard>
  );
}

// ─── SortableQueueItem ────────────────────────────────────────────────────────

function SortableQueueItem({
  item,
  isActive,
  targetWeight,
  showCompleteAll,
  onCompleteAll,
}: {
  item: QueueItem;
  isActive: boolean;
  targetWeight: number | null;
  showCompleteAll?: boolean;
  onCompleteAll?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const color = EXERCISE_COLORS[item.colorIndex % EXERCISE_COLORS.length];

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={[
        "flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-4 transition-colors",
        color.border,
        isActive
          ? `${color.bg} ring-1 ring-primary/60`
          : "bg-background/50",
      ].join(" ")}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-secondary/30 hover:text-secondary/60 flex-shrink-0 touch-none select-none"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        ⠿
      </button>

      {/* Set info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isActive ? color.text : "text-text"}`}>
          {item.exerciseName}
        </p>
        <p className="text-xs text-secondary">
          Set {item.setNumber}/{item.totalSets}
          {targetWeight !== null
            ? ` · ${targetWeight} lbs × ${item.reps}`
            : ` · ${item.reps} reps`}
        </p>
      </div>

      {/* "Complete All" button — first set of exercise, none done yet */}
      {showCompleteAll && onCompleteAll && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onCompleteAll}
          className="text-xs text-secondary/50 hover:text-primary border border-secondary/15 hover:border-primary/40 rounded px-1.5 py-0.5 flex-shrink-0 transition-colors"
          title={`Complete all ${item.totalSets} sets as planned`}
        >
          All ✓
        </button>
      )}

      {/* "NOW" badge on active set */}
      {isActive && (
        <span className={`text-xs font-bold flex-shrink-0 ${color.text}`}>NOW</span>
      )}
    </div>
  );
}

// ─── RestTimerBanner ─────────────────────────────────────────────────────────

function RestTimerBanner({
  durationSeconds,
  nextSetInfo,
  onDismiss,
}: {
  durationSeconds: number;
  nextSetInfo?: string;
  onDismiss: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const display = `${mins}:${secs.toString().padStart(2, "0")}`;
  const expired = secondsLeft <= 0;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 max-w-2xl mx-auto">
      <div className="bg-[#1F2937] border border-secondary/20 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
        {/* Countdown */}
        <span className={`text-2xl font-mono font-bold flex-shrink-0 tabular-nums ${expired ? "text-primary" : "text-text"}`}>
          {expired ? "Done" : display}
        </span>

        {/* Next set info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-secondary truncate">Rest</p>
          {nextSetInfo && (
            <p className="text-xs text-text truncate">{nextSetInfo}</p>
          )}
        </div>

        {/* ±15s controls */}
        <button
          onClick={() => setSecondsLeft((s) => Math.max(0, s - 15))}
          className="text-secondary hover:text-text text-xs px-2 py-1 rounded border border-secondary/20 hover:border-secondary/40 transition-colors flex-shrink-0"
        >
          −15s
        </button>
        <button
          onClick={() => setSecondsLeft((s) => s + 15)}
          className="text-secondary hover:text-text text-xs px-2 py-1 rounded border border-secondary/20 hover:border-secondary/40 transition-colors flex-shrink-0"
        >
          +15s
        </button>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="text-secondary/50 hover:text-secondary text-lg leading-none flex-shrink-0 ml-1"
          aria-label="Dismiss timer"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ─── CustomSetInput (unchanged) ───────────────────────────────────────────────

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
    <div className="mt-3 space-y-3">
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
