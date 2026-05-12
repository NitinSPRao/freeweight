"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { coachApi } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export default function CoachAthleteDetailPage() {
  const { user } = getAuthData();
  const router = useRouter();
  const params = useParams();
  const athleteId = parseInt(params.id as string);

  const queryClient = useQueryClient();

  const { data: athlete, isLoading, isError } = useQuery({
    queryKey: ["athleteDetail", athleteId],
    queryFn: () => coachApi.getAthleteDetail(athleteId),
    enabled: !isNaN(athleteId),
  });

  const [responseInputs, setResponseInputs] = useState<Record<number, string>>({});
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<number>>(new Set());

  const acknowledgeMutation = useMutation({
    mutationFn: ({ logId, response }: { logId: number; response?: string }) =>
      coachApi.acknowledgeWorkoutLog(logId, response),
    onSuccess: (_data, { logId }) => {
      setAcknowledgedIds((prev) => new Set(prev).add(logId));
      queryClient.invalidateQueries({ queryKey: ["athleteDetail", athleteId] });
    },
  });

  if (isLoading) {
    return (
      <AuthGuard requiredUserType="coach">
        <div className="min-h-screen bg-background">
          <NavBar userName={user?.name || ""} userType="coach" />
          <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
            <p className="text-secondary">Loading athlete...</p>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (isError || !athlete) {
    return (
      <AuthGuard requiredUserType="coach">
        <div className="min-h-screen bg-background">
          <NavBar userName={user?.name || ""} userType="coach" />
          <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
            <div className="text-center">
              <p className="text-error mb-4">Could not load athlete details.</p>
              <button onClick={() => router.push("/coach/roster")} className="btn-primary">
                Back to Roster
              </button>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  const completedCount = athlete.recent_workouts?.filter((w) => w.is_completed).length ?? 0;
  const flaggedCount = athlete.recent_workouts?.filter((w) => w.is_flagged).length ?? 0;

  return (
    <AuthGuard requiredUserType="coach">
      <div className="min-h-screen bg-background">
        <NavBar userName={user?.name || ""} userType="coach" />

        <main className="max-w-4xl mx-auto px-4 py-8">
          {/* Back link */}
          <button
            onClick={() => router.push("/coach/roster")}
            className="text-secondary hover:text-primary text-sm font-medium mb-6 inline-flex items-center gap-1"
          >
            ← Back to Roster
          </button>

          {/* Athlete header */}
          <div className="card mb-6">
            <h1 className="text-3xl font-heading font-bold text-text mb-1">{athlete.name}</h1>
            <p className="text-secondary mb-6">{athlete.email}</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-secondary/20 pt-4">
              <div>
                <p className="text-secondary text-sm mb-1">Sport</p>
                <p className="text-text font-medium">{athlete.sport || "—"}</p>
              </div>
              <div>
                <p className="text-secondary text-sm mb-1">Team</p>
                <p className="text-text font-medium">{athlete.team || "—"}</p>
              </div>
              <div>
                <p className="text-secondary text-sm mb-1">Training Goals</p>
                <p className="text-text font-medium">{athlete.training_goals || "—"}</p>
              </div>
            </div>
          </div>

          {/* Injuries & Health */}
          {athlete.injuries && (
            <div className="card mb-6 border-amber-500/40 bg-amber-500/5">
              <h2 className="text-lg font-heading font-bold text-amber-400 mb-2">
                Injuries &amp; Health
              </h2>
              <p className="text-text text-sm whitespace-pre-wrap">{athlete.injuries}</p>
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="card">
              <div className="text-secondary text-sm mb-2">Workouts Completed</div>
              <div className="text-4xl font-heading font-bold text-primary">{completedCount}</div>
            </div>
            <div className="card">
              <div className="text-secondary text-sm mb-2">Flagged Workouts</div>
              <div className="text-4xl font-heading font-bold text-error">{flaggedCount}</div>
            </div>
          </div>

          {/* Maxes */}
          <section className="mb-8">
            <h2 className="text-2xl font-heading font-bold text-text mb-4">Current Maxes</h2>

            {athlete.maxes && athlete.maxes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {athlete.maxes.map((max) => (
                  <div key={max.id} className="card">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-heading font-bold text-text capitalize">
                        {max.exercise_name}
                      </h3>
                      <span className="text-secondary text-xs">
                        Updated {formatDate(max.updated_at || max.recorded_at)}
                      </span>
                    </div>
                    <div className="text-4xl font-heading font-bold text-primary">
                      {max.max_weight}{" "}
                      <span className="text-2xl text-secondary">{max.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card text-center py-10">
                <p className="text-secondary">No maxes recorded yet.</p>
              </div>
            )}
          </section>

          {/* Recent workout history */}
          <section>
            <h2 className="text-2xl font-heading font-bold text-text mb-4">Recent Workouts</h2>

            {athlete.recent_workouts && athlete.recent_workouts.length > 0 ? (
              <div className="space-y-3">
                {athlete.recent_workouts.map((workout) => (
                  <div
                    key={workout.id}
                    className={`card ${workout.is_flagged ? "border-error/40" : ""}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-text mb-1">{workout.workout_name}</h3>
                        <p className="text-secondary text-sm">
                          {workout.completed_at
                            ? formatDate(workout.completed_at)
                            : "Not completed"}
                        </p>
                        {workout.notes && (
                          <p className="text-text text-sm mt-2 italic">{workout.notes}</p>
                        )}
                        {workout.is_flagged && workout.flag_reason && (
                          <div className="mt-2">
                            <p className="text-error text-sm">
                              <span className="font-medium">Flagged:</span> {workout.flag_reason}
                            </p>
                            {workout.coach_acknowledged || acknowledgedIds.has(workout.id) ? (
                              <div className="mt-2">
                                <p className="text-primary text-sm font-medium">Acknowledged</p>
                                {workout.coach_response && (
                                  <p className="text-secondary text-sm italic mt-1">
                                    Your response: {workout.coach_response}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="mt-3 space-y-2">
                                <textarea
                                  value={responseInputs[workout.id] ?? ""}
                                  onChange={(e) =>
                                    setResponseInputs((prev) => ({
                                      ...prev,
                                      [workout.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Optional response to athlete..."
                                  className="w-full text-sm border border-secondary/30 rounded-lg px-3 py-2 bg-background text-text placeholder:text-secondary resize-none focus:outline-none focus:border-primary"
                                  rows={2}
                                />
                                <button
                                  onClick={() =>
                                    acknowledgeMutation.mutate({
                                      logId: workout.id,
                                      response: responseInputs[workout.id] || undefined,
                                    })
                                  }
                                  disabled={acknowledgeMutation.isPending}
                                  className="btn-secondary text-sm py-1 px-3"
                                >
                                  {acknowledgeMutation.isPending ? "Saving..." : "Acknowledge"}
                                </button>
                                {acknowledgeMutation.isError && (
                                  <p className="text-error text-xs">Failed to acknowledge. Try again.</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-4">
                        {workout.is_completed && (
                          <span className="text-primary text-sm font-medium">Completed</span>
                        )}
                        {workout.has_modifications && (
                          <span className="text-secondary text-xs">Modified</span>
                        )}
                        {workout.is_flagged && (
                          <span className="text-error text-sm font-medium">Flagged</span>
                        )}
                        {workout.is_completed && (
                          <Link
                            href={`/coach/athletes/${athleteId}/workouts/${workout.id}`}
                            className="text-primary text-sm hover:underline"
                          >
                            View Summary →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card text-center py-10">
                <p className="text-secondary">No workout history yet.</p>
              </div>
            )}
          </section>
        </main>
      </div>
    </AuthGuard>
  );
}
