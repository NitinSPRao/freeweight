"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { coachApi, CoachWorkoutSummary, CoachWorkoutSummaryExercise } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";
import { formatDate, formatTime } from "@/lib/utils";

interface Section {
  label: string | null;
  exercises: CoachWorkoutSummaryExercise[];
}

function buildSections(exercises: CoachWorkoutSummaryExercise[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { label: null, exercises: [] };
  for (const ex of exercises) {
    const group = ex.group_label ?? null;
    if (group !== current.label) {
      if (current.exercises.length > 0) sections.push(current);
      current = { label: group, exercises: [] };
    }
    current.exercises.push(ex);
  }
  if (current.exercises.length > 0) sections.push(current);
  return sections;
}

export default function CoachWorkoutSummaryPage() {
  const { user } = getAuthData();
  const params = useParams();
  const athleteId = parseInt(params.id as string);
  const workoutLogId = parseInt(params.logId as string);

  const { data: athlete } = useQuery({
    queryKey: ["athleteDetail", athleteId],
    queryFn: () => coachApi.getAthleteDetail(athleteId),
    enabled: !isNaN(athleteId),
  });

  const {
    data: summary,
    isLoading,
    isError,
  } = useQuery<CoachWorkoutSummary>({
    queryKey: ["coachWorkoutSummary", athleteId, workoutLogId],
    queryFn: () => coachApi.getWorkoutSummary(athleteId, workoutLogId),
    enabled: !isNaN(athleteId) && !isNaN(workoutLogId),
  });

  return (
    <AuthGuard requiredUserType="coach">
      <div className="min-h-screen bg-background">
        <NavBar userName={user?.name || ""} userType="coach" />
        <main className="max-w-3xl mx-auto px-4 py-8">
          <div className="mb-6">
            <Link
              href={`/coach/athletes/${athleteId}`}
              className="text-primary text-sm hover:underline"
            >
              ← Back to {athlete?.name || "Athlete"}
            </Link>
          </div>

          {isLoading && (
            <div className="card text-center py-10 text-secondary">Loading summary…</div>
          )}

          {isError && (
            <div className="card text-center py-10 text-error">
              Could not load workout summary.
            </div>
          )}

          {summary && (
            <>
              <header className="mb-6">
                <h1 className="text-2xl font-heading font-bold text-text">
                  {summary.workout_name}
                </h1>
                <p className="text-secondary text-sm mt-1">
                  {summary.completed_at
                    ? `Completed ${formatDate(summary.completed_at)} at ${formatTime(summary.completed_at)}`
                    : "Not completed"}
                </p>
              </header>

              {summary.is_flagged && summary.flag_reason && (
                <div className="card border-error/40 mb-4">
                  <p className="text-error text-sm">
                    <span className="font-medium">Flagged:</span> {summary.flag_reason}
                  </p>
                  {summary.coach_response && (
                    <p className="text-secondary text-sm italic mt-2">
                      Your response: {summary.coach_response}
                    </p>
                  )}
                </div>
              )}

              <section className="space-y-4">
                {buildSections(summary.exercises).map((section, si) => (
                  <div key={si} className="card">
                    {section.label && (
                      <h2 className="text-xs font-bold text-primary uppercase tracking-wide mb-3">
                        {section.label}
                      </h2>
                    )}
                    <div className="space-y-4">
                      {section.exercises.map((ex) => (
                        <div key={ex.id} className="border-b border-secondary/10 last:border-0 pb-4 last:pb-0">
                          <div className="flex items-baseline justify-between mb-2">
                            <h3 className="font-semibold text-text">{ex.name}</h3>
                            <span className="text-xs text-secondary">
                              Prescribed: {ex.sets} × {ex.reps}
                            </span>
                          </div>
                          {ex.set_logs.length === 0 ? (
                            <p className="text-xs text-secondary italic">No sets logged</p>
                          ) : (
                            <ul className="space-y-1">
                              {ex.set_logs.map((sl) => (
                                <li
                                  key={sl.set_number}
                                  className={[
                                    "flex items-center justify-between text-sm px-3 py-1.5 rounded-md",
                                    sl.was_modified
                                      ? "bg-yellow-500/10 text-yellow-400"
                                      : "bg-primary/10 text-primary",
                                  ].join(" ")}
                                >
                                  <span>Set {sl.set_number}</span>
                                  <span>
                                    {sl.weight_used} lbs × {sl.reps_completed} reps
                                    {sl.was_modified ? " · modified" : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>

              {summary.notes && (
                <div className="card mt-4">
                  <h3 className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">
                    Completion Notes
                  </h3>
                  <p className="text-text text-sm whitespace-pre-wrap">{summary.notes}</p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
