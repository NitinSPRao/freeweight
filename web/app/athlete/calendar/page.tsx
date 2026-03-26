"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { athleteApi, Workout } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";

export default function AthleteCalendarPage() {
  const router = useRouter();
  const { user } = getAuthData();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDayWorkouts, setSelectedDayWorkouts] = useState<Workout[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [newWorkoutName, setNewWorkoutName] = useState("");
  const [newWorkoutDescription, setNewWorkoutDescription] = useState("");
  const [newExercises, setNewExercises] = useState<Array<{ name: string; sets: number; reps: number }>>([
    { name: "", sets: 3, reps: 10 },
  ]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get calendar workouts for the entire month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: calendarWorkouts, isLoading } = useQuery({
    queryKey: ["calendar", format(monthStart, "yyyy-MM-dd"), format(monthEnd, "yyyy-MM-dd")],
    queryFn: () => athleteApi.getCalendar(
      format(monthStart, "yyyy-MM-dd"),
      format(monthEnd, "yyyy-MM-dd")
    ),
    enabled: mounted,
  });

  const queryClient = useQueryClient();

  const handleDayClick = (workouts: Workout[], date: Date) => {
    setSelectedDayWorkouts(workouts.length > 0 ? workouts : []);
    setSelectedDate(date);
  };

  const openCreateModal = (date: Date, e: React.MouseEvent) => {
    e.stopPropagation();
    setCreateDate(date);
    setNewWorkoutName("");
    setNewWorkoutDescription("");
    setNewExercises([{ name: "", sets: 3, reps: 10 }]);
    setShowCreateModal(true);
  };

  const handleCreateWorkout = async () => {
    if (!createDate || !newWorkoutName.trim()) return;
    setIsCreating(true);
    try {
      const exercises = newExercises
        .filter((ex) => ex.name.trim())
        .map((ex, idx) => ({ ...ex, order: idx + 1 }));
      await athleteApi.createWorkout({
        name: newWorkoutName.trim(),
        description: newWorkoutDescription.trim() || undefined,
        scheduled_date: format(createDate, "yyyy-MM-dd"),
        exercises,
      });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      setShowCreateModal(false);
    } finally {
      setIsCreating(false);
    }
  };

  const addExerciseRow = () => {
    setNewExercises([...newExercises, { name: "", sets: 3, reps: 10 }]);
  };

  const updateExerciseRow = (index: number, field: string, value: string | number) => {
    setNewExercises(newExercises.map((ex, i) => i === index ? { ...ex, [field]: value } : ex));
  };

  const removeExerciseRow = (index: number) => {
    if (newExercises.length > 1) {
      setNewExercises(newExercises.filter((_, i) => i !== index));
    }
  };

  const closeModal = () => {
    setSelectedDayWorkouts(null);
    setSelectedDate(null);
  };

  const handleStartWorkout = (workoutId: number) => {
    router.push(`/athlete/workout/${workoutId}`);
  };

  const previousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  if (!mounted) {
    return (
      <AuthGuard requiredUserType="athlete">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-secondary">Loading...</p>
        </div>
      </AuthGuard>
    );
  }

  // Get all days in the current month view (including padding days from prev/next month)
  const firstDayOfMonth = startOfMonth(currentMonth);
  const lastDayOfMonth = endOfMonth(currentMonth);
  const startDate = new Date(firstDayOfMonth);
  startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay()); // Start from Sunday
  const endDate = new Date(lastDayOfMonth);
  endDate.setDate(endDate.getDate() + (6 - lastDayOfMonth.getDay())); // End on Saturday

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
  const workoutsArray = Array.isArray(calendarWorkouts) ? calendarWorkouts : [];

  return (
    <AuthGuard requiredUserType="athlete">
      <div className="min-h-screen bg-background">
        <NavBar userName={user?.name || ""} userType="athlete" />

        <main className="max-w-7xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-heading font-bold text-text">
              Training Calendar
            </h1>
            <div className="flex gap-2">
              <button onClick={previousMonth} className="btn-secondary px-4 py-2">
                ← Prev
              </button>
              <button onClick={goToToday} className="btn-secondary px-4 py-2">
                Today
              </button>
              <button onClick={nextMonth} className="btn-secondary px-4 py-2">
                Next →
              </button>
            </div>
          </div>

          {/* Month/Year Display */}
          <h2 className="text-2xl font-heading font-bold text-text mb-6 text-center">
            {format(currentMonth, "MMMM yyyy")}
          </h2>

          {/* Calendar Grid */}
          <div className="bg-[#1F2937] rounded-lg p-6">
            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-4 mb-4">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="text-center text-secondary font-semibold text-sm">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day) => {
                const dayWorkouts = workoutsArray.filter(
                  (w) => format(new Date(w.scheduled_date), "yyyy-MM-dd") === format(day, "yyyy-MM-dd")
                );
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isToday = isSameDay(day, new Date());
                const hasWorkout = dayWorkouts.length > 0;

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => handleDayClick(dayWorkouts, day)}
                    className={`
                      group relative min-h-[140px] p-2 rounded-lg border transition-all text-left flex flex-col
                      ${isCurrentMonth ? "bg-background" : "bg-background/40"}
                      ${isToday ? "border-2 border-primary" : "border border-secondary/20"}
                      cursor-pointer hover:border-primary/60 hover:shadow-lg
                    `}
                  >
                    {/* Date Number */}
                    <div className={`text-sm font-bold mb-2 ${
                      isToday ? "text-primary" : isCurrentMonth ? "text-text" : "text-secondary/60"
                    }`}>
                      {format(day, "d")}
                    </div>

                    {/* Workout Details */}
                    {hasWorkout ? (
                      <div className="space-y-1 flex-1 overflow-hidden">
                        {dayWorkouts.map((workout) => (
                          <div
                            key={workout.id}
                            className={`text-xs p-2 rounded border ${
                              workout.is_completed
                                ? "bg-primary/10 border-primary/30"
                                : "bg-secondary/5 border-secondary/20"
                            }`}
                          >
                            {/* Workout Name */}
                            <div className={`font-bold text-[11px] mb-1 ${
                              workout.is_completed ? "text-primary" : "text-text"
                            }`}>
                              {workout.name.split(' - ')[0]}
                            </div>

                            {/* Exercise List */}
                            <div className="space-y-0.5">
                              {workout.exercises?.slice(0, 4).map((exercise, idx) => (
                                <div key={exercise.id} className="text-[10px] text-secondary">
                                  <div className="truncate">
                                    {exercise.name}
                                  </div>
                                  <div className="text-[9px] opacity-70">
                                    {exercise.sets} × {exercise.reps}
                                    {exercise.percentage_of_max && ` @ ${Math.round(exercise.percentage_of_max * 100)}%`}
                                  </div>
                                </div>
                              ))}
                              {(workout.exercises?.length || 0) > 4 && (
                                <div className="text-[9px] text-secondary/60 italic mt-1">
                                  +{(workout.exercises?.length || 0) - 4} more...
                                </div>
                              )}
                            </div>

                            {/* Completion Badge */}
                            {workout.is_completed && (
                              <div className="mt-1 pt-1 border-t border-primary/20">
                                <span className="text-[9px] text-primary font-bold">✓ COMPLETED</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex-1" />
                    )}

                    {/* Add Workout Button — visible on hover */}
                    <button
                      onClick={(e) => openCreateModal(day, e)}
                      className="
                        opacity-0 group-hover:opacity-100 transition-opacity
                        mt-1 w-full py-1 rounded border border-dashed border-secondary/30
                        hover:border-primary hover:bg-primary/10
                        text-secondary/50 hover:text-primary text-lg leading-none
                        flex items-center justify-center
                      "
                      title={`Add workout on ${format(day, "MMM d")}`}
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-6 flex justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-primary/20 border border-primary/40 rounded"></div>
              <span className="text-secondary">Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-secondary/10 border border-secondary/20 rounded"></div>
              <span className="text-secondary">Assigned</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary rounded"></div>
              <span className="text-secondary">Today</span>
            </div>
          </div>
        </main>

        {/* Workout Detail Modal */}
        {selectedDayWorkouts !== null && selectedDate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={closeModal}>
            <div className="bg-[#1F2937] rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-heading font-bold text-text mb-2">
                    {selectedDayWorkouts.length > 0 ? selectedDayWorkouts[0].name : "No Workout"}
                  </h3>
                  <p className="text-secondary text-sm">
                    {format(selectedDate, "EEEE, MMMM d, yyyy")}
                  </p>
                </div>
                <button onClick={closeModal} className="text-secondary hover:text-text text-2xl">
                  ×
                </button>
              </div>

              {selectedDayWorkouts.length > 0 ? (
                <>
                  {selectedDayWorkouts[0].is_completed && (
                    <div className="bg-primary/10 border border-primary/40 rounded-lg p-3 mb-4">
                      <span className="text-primary font-semibold">✓ Completed</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <h4 className="font-semibold text-text">Exercises</h4>
                    {selectedDayWorkouts[0].exercises?.map((exercise, idx) => (
                      <div key={exercise.id} className="bg-background rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-text font-medium">
                            {idx + 1}. {exercise.name}
                          </span>
                          <span className="text-secondary text-sm">
                            {exercise.sets} × {exercise.reps}
                          </span>
                        </div>
                        {exercise.percentage_of_max && (
                          <p className="text-primary text-sm mb-1">
                            @ {Math.round(exercise.percentage_of_max * 100)}% of {exercise.target_exercise}
                          </p>
                        )}
                        {exercise.coach_notes && (
                          <p className="text-secondary text-sm italic">{exercise.coach_notes}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button onClick={closeModal} className="btn-secondary flex-1">
                      Close
                    </button>
                    {!selectedDayWorkouts[0].is_completed && (
                      <button
                        onClick={() => {
                          closeModal();
                          handleStartWorkout(selectedDayWorkouts[0].id);
                        }}
                        className="btn-primary flex-1"
                      >
                        Start Workout
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-8">
                  <p className="text-center text-secondary text-lg">No workout scheduled</p>
                  <div className="mt-6 flex gap-3">
                    <button onClick={closeModal} className="btn-secondary flex-1">
                      Close
                    </button>
                    <button
                      onClick={() => {
                        closeModal();
                        if (selectedDate) {
                          setCreateDate(selectedDate);
                          setNewWorkoutName("");
                          setNewWorkoutDescription("");
                          setNewExercises([{ name: "", sets: 3, reps: 10 }]);
                          setShowCreateModal(true);
                        }
                      }}
                      className="btn-primary flex-1"
                    >
                      Add Workout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Create Workout Modal */}
        {showCreateModal && createDate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowCreateModal(false)}>
            <div className="bg-[#1F2937] rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-heading font-bold text-text">New Workout</h3>
                  <p className="text-secondary text-sm">{format(createDate, "EEEE, MMMM d, yyyy")}</p>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="text-secondary hover:text-text text-2xl">×</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-secondary mb-1">Workout Name</label>
                  <input
                    type="text"
                    value={newWorkoutName}
                    onChange={(e) => setNewWorkoutName(e.target.value)}
                    placeholder="e.g. Upper Body Push"
                    className="w-full bg-background border border-secondary/30 rounded-lg px-3 py-2 text-text placeholder-secondary/50 focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-secondary mb-1">Description (optional)</label>
                  <input
                    type="text"
                    value={newWorkoutDescription}
                    onChange={(e) => setNewWorkoutDescription(e.target.value)}
                    placeholder="e.g. Focus on chest and shoulders"
                    className="w-full bg-background border border-secondary/30 rounded-lg px-3 py-2 text-text placeholder-secondary/50 focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm text-secondary">Exercises</label>
                    <button onClick={addExerciseRow} className="text-primary text-sm hover:underline">+ Add Exercise</button>
                  </div>
                  <div className="space-y-2">
                    {newExercises.map((ex, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={ex.name}
                          onChange={(e) => updateExerciseRow(idx, "name", e.target.value)}
                          placeholder="Exercise name"
                          className="flex-1 bg-background border border-secondary/30 rounded px-2 py-1.5 text-sm text-text placeholder-secondary/50 focus:border-primary focus:outline-none"
                        />
                        <input
                          type="number"
                          value={ex.sets}
                          onChange={(e) => updateExerciseRow(idx, "sets", parseInt(e.target.value) || 0)}
                          className="w-14 bg-background border border-secondary/30 rounded px-2 py-1.5 text-sm text-text text-center focus:border-primary focus:outline-none"
                          title="Sets"
                        />
                        <span className="text-secondary text-sm">×</span>
                        <input
                          type="number"
                          value={ex.reps}
                          onChange={(e) => updateExerciseRow(idx, "reps", parseInt(e.target.value) || 0)}
                          className="w-14 bg-background border border-secondary/30 rounded px-2 py-1.5 text-sm text-text text-center focus:border-primary focus:outline-none"
                          title="Reps"
                        />
                        {newExercises.length > 1 && (
                          <button onClick={() => removeExerciseRow(idx)} className="text-secondary hover:text-red-400 text-lg">×</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={handleCreateWorkout}
                  disabled={!newWorkoutName.trim() || isCreating}
                  className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? "Creating..." : "Create Workout"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
