"use client";

import { useState } from "react";
import { Program, ParsedProgram } from "@/lib/api-endpoints";

// ─── Normalized display types ────────────────────────────────────────────────

export interface DisplayExercise {
  name: string;
  sets: number;
  reps: number;
  rest_seconds?: number | null;
  coach_notes?: string | null;
  group_label?: string | null;
  order: number;
}

export interface DisplayWorkout {
  name: string;
  day_label?: string | null;
  week_number?: number | null;
  day_offset?: number;
  exercises: DisplayExercise[];
}

export interface DisplayProgram {
  name?: string;
  description?: string | null;
  same_every_week?: boolean;
  workouts: DisplayWorkout[];
}

// ─── Conversion helpers ──────────────────────────────────────────────────────

export function programToDisplay(program: Program): DisplayProgram {
  // Deduplicate workouts: the API returns both template workouts (athlete_id=null)
  // and athlete-specific copies that share the same (week_number, day_label).
  // Keep the one with the highest id (most recently created) per unique slot.
  const deduped = new Map<string, Program["workouts"][0]>();
  for (const w of program.workouts) {
    const key = `${w.week_number ?? ""}|${w.day_label ?? ""}|${w.day_offset ?? ""}`;
    const existing = deduped.get(key);
    if (!existing || w.id > existing.id) {
      deduped.set(key, w);
    }
  }
  const uniqueWorkouts = Array.from(deduped.values());

  return {
    name: program.name,
    description: program.description,
    same_every_week: program.same_every_week,
    workouts: uniqueWorkouts.map((w) => ({
      name: w.name,
      day_label: w.day_label,
      week_number: w.week_number,
      day_offset: w.day_offset,
      exercises: [...w.exercises]
        .sort((a, b) => a.order - b.order)
        .map((e) => ({
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          rest_seconds: e.rest_seconds,
          coach_notes: e.coach_notes,
          group_label: e.group_label,
          order: e.order,
        })),
    })),
  };
}

export function parsedProgramToDisplay(parsed: ParsedProgram): DisplayProgram {
  return {
    name: parsed.program_name,
    description: parsed.description,
    workouts: parsed.workouts.map((w) => ({
      name: w.name,
      day_label: w.day_label,
      week_number: w.week_number,
      day_offset: w.day_offset,
      exercises: w.exercises.map((e) => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        rest_seconds: e.rest_seconds,
        coach_notes: e.coach_notes,
        group_label: e.group_label,
        order: e.order,
      })),
    })),
  };
}

// ─── Section builder ─────────────────────────────────────────────────────────

interface ExerciseSection {
  label: string | null;
  exercises: DisplayExercise[];
}

function buildSections(exercises: DisplayExercise[]): ExerciseSection[] {
  const sections: ExerciseSection[] = [];
  let current: ExerciseSection = { label: null, exercises: [] };

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

// ─── Component ───────────────────────────────────────────────────────────────

interface ProgramDisplayProps {
  program: DisplayProgram;
  mode?: "preview" | "edit";
  onEdit?: () => void;
}

export default function ProgramDisplay({
  program,
  mode = "preview",
  onEdit,
}: ProgramDisplayProps) {
  const hasWeekData = program.workouts.some((w) => w.week_number != null);
  const showTabs = hasWeekData && !program.same_every_week;

  const weekNumbers: number[] = showTabs
    ? Array.from(
        new Set(program.workouts.map((w) => w.week_number ?? 1))
      ).sort((a, b) => a - b)
    : [];

  const [selectedWeek, setSelectedWeek] = useState<number>(weekNumbers[0] ?? 1);

  const workoutsForWeek = showTabs
    ? program.workouts
        .filter((w) => (w.week_number ?? 1) === selectedWeek)
        .sort((a, b) => (a.day_offset ?? 0) - (b.day_offset ?? 0))
    : [...program.workouts].sort(
        (a, b) => (a.day_offset ?? 0) - (b.day_offset ?? 0)
      );

  return (
    <div>
      {/* Edit button — only shown in edit mode */}
      {mode === "edit" && onEdit && (
        <div className="flex justify-end mb-4">
          <button onClick={onEdit} className="btn-secondary text-sm">
            Edit Program
          </button>
        </div>
      )}

      {/* Week tabs */}
      {showTabs && (
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {weekNumbers.map((wk) => (
            <button
              key={wk}
              onClick={() => setSelectedWeek(wk)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                selectedWeek === wk
                  ? "bg-primary/20 border-primary text-primary"
                  : "bg-background border-secondary/30 text-secondary hover:border-secondary/50"
              }`}
            >
              Week {wk}
            </button>
          ))}
        </div>
      )}

      {/* Day cards */}
      <div className="space-y-4">
        {workoutsForWeek.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-secondary text-sm">No workouts for this week.</p>
          </div>
        ) : (
          workoutsForWeek.map((workout, wi) => (
            <DayCard key={wi} workout={workout} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Day card ────────────────────────────────────────────────────────────────

function DayCard({ workout }: { workout: DisplayWorkout }) {
  const sections = buildSections(workout.exercises);
  // Strip the "Week N - " prefix that the builder stores in workout names.
  // The week context is already conveyed by the week tabs (or is irrelevant for
  // same_every_week programs), so showing it again in the card header is noise.
  const displayName = workout.name.replace(/^Week \d+ - /, "");

  return (
    <div className="card">
      <div className="mb-3 pb-3 border-b border-secondary/10">
        <h3 className="text-base font-heading font-semibold text-text">
          {workout.day_label ? (
            <span className="text-primary/80 font-normal text-sm mr-2">
              {workout.day_label}
            </span>
          ) : null}
          {displayName}
        </h3>
        <p className="text-xs text-secondary mt-0.5">
          {workout.exercises.length} exercise
          {workout.exercises.length !== 1 ? "s" : ""}
        </p>
      </div>

      {workout.exercises.length === 0 ? (
        <p className="text-secondary text-sm italic">No exercises for this day.</p>
      ) : (
        <div>
          {sections.map((section, si) => (
            <div key={si}>
              {section.label !== null && (
                <div className="flex items-center gap-2 mt-3 mb-1 border-l-[3px] border-primary pl-3 first:mt-0">
                  <span className="text-xs font-bold text-primary uppercase tracking-wide leading-none">
                    {section.label}
                  </span>
                </div>
              )}
              <div className={section.label !== null ? "pl-4" : ""}>
                {section.exercises.map((ex, ei) => (
                  <div key={ei} className="py-2 px-1 border-b border-secondary/8 last:border-0">
                    <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-text text-sm">{ex.name}</span>
                      <span className="text-xs text-secondary">
                        {ex.sets} × {ex.reps}
                      </span>
                      {ex.rest_seconds ? (
                        <span className="text-xs text-secondary">{ex.rest_seconds}s rest</span>
                      ) : null}
                    </div>
                    {ex.coach_notes ? (
                      <p className="text-xs text-secondary/60 mt-0.5 italic">{ex.coach_notes}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
