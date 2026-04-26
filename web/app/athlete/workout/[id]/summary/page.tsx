"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { getAuthData } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetEntry {
  exercise_id: number;
  set_number: number;
  weight_used: number;
  reps_completed: number;
  was_modified: boolean;
}

interface SummaryExercise {
  id: number;
  name: string;
  sets: number;
  reps: number;
  group_label: string | null;
  percentage_of_max?: number;
  target_exercise?: string;
}

interface WorkoutSummaryData {
  workoutId: number;
  workoutName: string;
  scheduledDate: string;
  completedAt: string;
  exercises: SummaryExercise[];
  loggedSets: Record<string, SetEntry>;
  completionNotes: string;
  totalSets: number;
  completedTotal: number;
}

interface ExerciseGroup {
  label: string | null;
  exercises: SummaryExercise[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkoutSummaryPage() {
  const router = useRouter();
  const { user } = getAuthData();

  const [summary, setSummary] = useState<WorkoutSummaryData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("workoutSummary");
    if (!raw) return; // No data yet — keep loading state, don't redirect
    try {
      const data: WorkoutSummaryData = JSON.parse(raw);
      setSummary(data);
    } catch {
      // Malformed data — stay on loading state
    }
    // Do NOT removeItem here: React 18 StrictMode runs effects twice in dev
    // (mount → cleanup → remount). Clearing here causes the remount to find
    // nothing and leaves the page blank. Clear only when navigating away.
  }, []);

  const handleShare = () => {
    if (!summary) return;
    const lines: string[] = [];
    lines.push(summary.workoutName);
    lines.push(format(new Date(summary.completedAt), "EEEE, MMMM d, yyyy"));
    lines.push(`${summary.completedTotal}/${summary.totalSets} sets completed`);
    lines.push("");

    let currentGroup: string | null | undefined = undefined;
    for (const ex of summary.exercises) {
      if (ex.group_label !== currentGroup) {
        currentGroup = ex.group_label;
        if (currentGroup) lines.push(`[${currentGroup}]`);
      }
      lines.push(ex.name);
      for (let s = 1; s <= ex.sets; s++) {
        const entry = summary.loggedSets[`${ex.id}-${s}`];
        if (entry) {
          const w = entry.weight_used > 0 ? `${entry.weight_used} lbs × ` : "";
          lines.push(`  Set ${s}: ${w}${entry.reps_completed} reps${entry.was_modified ? " (modified)" : ""}`);
        } else {
          lines.push(`  Set ${s}: —`);
        }
      }
    }

    if (summary.completionNotes) {
      lines.push("");
      lines.push(`Notes: ${summary.completionNotes}`);
    }

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!summary) {
    return (
      <AuthGuard requiredUserType="athlete">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-secondary">Loading...</p>
        </div>
      </AuthGuard>
    );
  }

  // Group exercises by group_label (preserving order)
  const groups: ExerciseGroup[] = [];
  let currentGroup: ExerciseGroup | null = null;
  for (const ex of summary.exercises) {
    const gl = ex.group_label ?? null;
    if (!currentGroup || currentGroup.label !== gl) {
      currentGroup = { label: gl, exercises: [] };
      groups.push(currentGroup);
    }
    currentGroup.exercises.push(ex);
  }

  return (
    <AuthGuard requiredUserType="athlete">
      <div className="min-h-screen bg-background">
        <NavBar userName={user?.name || ""} userType="athlete" />

        <main className="max-w-2xl mx-auto px-4 py-6 pb-28">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-primary text-xl font-bold">✓</span>
              <h1 className="text-2xl font-heading font-bold text-text">{summary.workoutName}</h1>
            </div>
            <p className="text-secondary text-sm">
              {format(new Date(summary.completedAt), "EEEE, MMMM d, yyyy")}
            </p>
            <p className="text-secondary text-sm mt-1">
              <span className="text-text font-medium">{summary.completedTotal}</span>
              /{summary.totalSets} sets completed
            </p>
          </div>

          {/* ── Exercise groups ──────────────────────────────────────────────── */}
          <div className="space-y-4">
            {groups.map((group, gi) => (
              <div key={gi}>
                {group.label && (
                  <div className="flex items-center gap-2 mb-2 border-l-[3px] border-primary pl-3">
                    <span className="text-xs font-bold text-primary uppercase tracking-wide">
                      {group.label}
                    </span>
                  </div>
                )}

                <div className={`space-y-3 ${group.label ? "pl-4" : ""}`}>
                  {group.exercises.map((ex) => {
                    const entries = Array.from({ length: ex.sets }, (_, i) =>
                      summary.loggedSets[`${ex.id}-${i + 1}`] ?? null
                    );
                    const completedCount = entries.filter(Boolean).length;

                    return (
                      <div key={ex.id} className="card">
                        <div className="flex justify-between items-start mb-3 pb-2 border-b border-secondary/10">
                          <h3 className="text-text font-semibold text-sm">{ex.name}</h3>
                          <span className="text-secondary text-xs flex-shrink-0 ml-3">
                            {completedCount}/{ex.sets} sets
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {entries.map((entry, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <span className="text-secondary text-xs">Set {i + 1}</span>
                              {entry ? (
                                <span
                                  className={`text-xs font-medium ${
                                    entry.was_modified ? "text-yellow-400" : "text-primary"
                                  }`}
                                >
                                  {entry.weight_used > 0
                                    ? `${entry.weight_used} lbs × `
                                    : ""}
                                  {entry.reps_completed} reps
                                  {entry.was_modified && (
                                    <span className="ml-1 text-yellow-400/70">✱</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-secondary/30 text-xs">—</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ── Completion notes ─────────────────────────────────────────────── */}
          {summary.completionNotes && (
            <div className="mt-4 card">
              <p className="text-secondary text-xs mb-1">Notes</p>
              <p className="text-text text-sm">{summary.completionNotes}</p>
            </div>
          )}
        </main>

        {/* ── Fixed bottom buttons ─────────────────────────────────────────── */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-secondary/10 p-4">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button
              onClick={() => {
                sessionStorage.removeItem("workoutSummary");
                router.push("/athlete/home");
              }}
              className="btn-secondary flex-1"
            >
              Back to Home
            </button>
            <button
              onClick={handleShare}
              className="btn-primary flex-1"
            >
              {copied ? "Copied!" : "Share Summary"}
            </button>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
