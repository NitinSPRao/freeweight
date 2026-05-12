"use client";

import { Fragment, Suspense, useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { programApi, Exercise, Workout } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";
import { extractErrorMessage } from "@/lib/utils";
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

interface ExerciseCell {
  kind: "exercise";
  id: string;
  name: string;
  sets: number;
  reps: number;
  coach_notes: string;
  rest_seconds: string;
  target_exercise: string;      // "" | "squat" | "bench" | "deadlift" | "clean"
  percentage_of_max: string;    // user-entered 0-100, stored as string for input
}

const LIFT_OPTIONS: { value: string; label: string }[] = [
  { value: "squat", label: "Squat" },
  { value: "bench", label: "Bench" },
  { value: "deadlift", label: "Deadlift" },
  { value: "clean", label: "Clean" },
];

interface SectionCell {
  kind: "section";
  id: string;
  name: string;
  level: 1 | 2;
}

type Cell = ExerciseCell | SectionCell;

type CellUpdate =
  | Partial<
      Pick<
        ExerciseCell,
        | "name"
        | "sets"
        | "reps"
        | "coach_notes"
        | "rest_seconds"
        | "target_exercise"
        | "percentage_of_max"
      >
    >
  | Partial<Pick<SectionCell, "name" | "level">>;

interface DayDraft {
  id: string;
  label: string;
  cells: Cell[];
}

const WEEKDAYS = [
  "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
] as const;
const WEEKDAY_OFFSETS: Record<string, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
  Friday: 4, Saturday: 5, Sunday: 6,
};

let _uid = 0;
const uid = () => `${++_uid}-${Math.random().toString(36).slice(2)}`;

// ─── Workout → cell conversion (for edit mode pre-population) ────────────────

function exercisesToCells(exercises: Exercise[]): Cell[] {
  const cells: Cell[] = [];
  let lastGroup: string | null = null;

  for (const ex of exercises) {
    const group = ex.group_label ?? null;
    if (group !== null && group !== lastGroup) {
      cells.push({ kind: "section", id: uid(), name: group, level: 1 });
    }
    lastGroup = group;
    cells.push({
      kind: "exercise",
      id: uid(),
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      coach_notes: ex.coach_notes ?? "",
      rest_seconds: ex.rest_seconds != null ? String(ex.rest_seconds) : "",
      target_exercise: ex.target_exercise ?? "",
      percentage_of_max:
        ex.percentage_of_max != null
          ? String(Math.round(ex.percentage_of_max * 100))
          : "",
    });
  }
  return cells;
}

function workoutsToDayDrafts(workouts: Workout[]): DayDraft[][] {
  if (workouts.length === 0) return [];

  const byWeek = new Map<number, Workout[]>();
  for (const w of workouts) {
    const wk = w.week_number ?? 1;
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(w);
  }

  const sortedWeekNums = Array.from(byWeek.keys()).sort((a, b) => a - b);
  return sortedWeekNums.map((wk) => {
    const weekWorkouts = byWeek.get(wk)!.sort(
      (a, b) => (a.day_offset ?? 0) - (b.day_offset ?? 0)
    );
    return weekWorkouts.map((w) => ({
      id: uid(),
      label: w.day_label || `Day ${((w.day_offset ?? 0) % 7) + 1}`,
      cells: exercisesToCells(
        [...w.exercises].sort((a, b) => a.order - b.order)
      ),
    }));
  });
}

// ─── Move cells (section drag-with-children) ─────────────────────────────────

function moveCells(cells: Cell[], activeId: string, overId: string): Cell[] {
  const fromIdx = cells.findIndex((c) => c.id === activeId);
  if (fromIdx === -1) return cells;

  const dragged = cells[fromIdx];
  let groupEnd = fromIdx + 1;
  if (dragged.kind === "section") {
    while (groupEnd < cells.length) {
      const c = cells[groupEnd];
      if (c.kind === "section" && c.level <= dragged.level) break;
      groupEnd++;
    }
  }

  const group = cells.slice(fromIdx, groupEnd);
  const remaining = [...cells.slice(0, fromIdx), ...cells.slice(groupEnd)];
  const overIdx = remaining.findIndex((c) => c.id === overId);
  if (overIdx === -1) return cells;

  const originalOverIdx = cells.findIndex((c) => c.id === overId);
  const insertAt = originalOverIdx > fromIdx ? overIdx + 1 : overIdx;

  return [...remaining.slice(0, insertAt), ...group, ...remaining.slice(insertAt)];
}

// ─── Sortable cell ────────────────────────────────────────────────────────────

interface SortableCellProps {
  cell: Cell;
  isEmpty: boolean;
  onUpdate: (updates: CellUpdate) => void;
  onRemove: () => void;
  onChangeLevel: (delta: 1 | -1) => void;
}

function SortableCell({ cell, isEmpty, onUpdate, onRemove, onChangeLevel }: SortableCellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cell.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  if (cell.kind === "section") {
    const isL1 = cell.level === 1;
    return (
      <div ref={setNodeRef} style={style} className="mb-1">
        <div
          className={[
            "flex items-center gap-2 py-2 px-2 rounded-lg border-l-4",
            isL1
              ? "border-primary bg-primary/5"
              : "border-primary/50 bg-primary/[0.03] ml-5",
          ].join(" ")}
        >
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab text-secondary/30 hover:text-secondary/60 flex-shrink-0 touch-none select-none"
            tabIndex={-1}
            aria-label="drag section"
          >
            ⠿
          </button>
          <button
            onClick={() => onChangeLevel(-1)}
            disabled={cell.level <= 1}
            className="text-xs text-secondary/50 hover:text-text disabled:opacity-20 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors"
            title="Outdent"
          >
            {"<"}
          </button>
          <button
            onClick={() => onChangeLevel(1)}
            disabled={cell.level >= 2}
            className="text-xs text-secondary/50 hover:text-text disabled:opacity-20 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors"
            title="Indent"
          >
            {">"}
          </button>
          <input
            type="text"
            value={cell.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className={[
              "bg-transparent border-none outline-none flex-1 font-semibold min-w-0 placeholder-secondary/40",
              isL1 ? "text-primary text-sm" : "text-primary/60 text-xs",
            ].join(" ")}
            placeholder="Section name…"
            autoFocus={cell.name === ""}
          />
          <button
            onClick={onRemove}
            className="text-secondary/30 hover:text-error flex-shrink-0 px-1 text-xs transition-colors"
            title="Remove section"
          >
            ✕
          </button>
        </div>
        {isEmpty && (
          <div
            className={[
              "mt-1 mb-0.5 border border-dashed border-secondary/20 rounded-lg py-3 text-center text-secondary/40 text-xs italic",
              isL1 ? "mx-2" : "mx-6",
            ].join(" ")}
          >
            Drop exercises here or click + Exercise
          </div>
        )}
      </div>
    );
  }

  const hasPctFields = cell.target_exercise !== "" || cell.percentage_of_max !== "";
  const [showPctRow, setShowPctRow] = useState(hasPctFields);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="py-1.5 px-2 rounded hover:bg-secondary/5 group mb-0.5"
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-secondary/30 hover:text-secondary/60 flex-shrink-0 touch-none select-none"
          tabIndex={-1}
          aria-label="drag exercise"
        >
          ⠿
        </button>
        <input
          type="text"
          value={cell.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="input-field py-1 text-sm flex-1 min-w-[120px]"
          placeholder="Exercise name"
        />
        <input
          type="number"
          min={1}
          value={cell.sets}
          onChange={(e) => onUpdate({ sets: parseInt(e.target.value) || 1 })}
          className="input-field py-1 text-sm w-14 text-center"
          title="Sets"
          placeholder="Sets"
        />
        <input
          type="number"
          min={1}
          value={cell.reps}
          onChange={(e) => onUpdate({ reps: parseInt(e.target.value) || 1 })}
          className="input-field py-1 text-sm w-14 text-center"
          title="Reps"
          placeholder="Reps"
        />
        <input
          type="number"
          min={0}
          value={cell.rest_seconds}
          onChange={(e) => onUpdate({ rest_seconds: e.target.value })}
          className="input-field py-1 text-sm w-16 text-center"
          placeholder="Rest s"
          title="Rest (seconds)"
        />
        <input
          type="text"
          value={cell.coach_notes}
          onChange={(e) => onUpdate({ coach_notes: e.target.value })}
          className="input-field py-1 text-sm flex-1 min-w-[80px]"
          placeholder="Notes / load"
          title="Coach notes"
        />
        <button
          onClick={onRemove}
          className="text-secondary/40 hover:text-error flex-shrink-0 px-1 transition-colors"
          title="Remove exercise"
        >
          ✕
        </button>
      </div>
      {showPctRow ? (
        <div className="flex items-center gap-2 mt-1 pl-6">
          <label className="text-xs text-secondary">Lift</label>
          <select
            value={cell.target_exercise}
            onChange={(e) => onUpdate({ target_exercise: e.target.value })}
            className="input-field py-1 text-sm w-28"
            title="Target lift for % of max"
          >
            <option value="">—</option>
            {LIFT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="text-xs text-secondary">% of Max</label>
          <input
            type="number"
            min={0}
            max={100}
            value={cell.percentage_of_max}
            onChange={(e) => onUpdate({ percentage_of_max: e.target.value })}
            className="input-field py-1 text-sm w-20 text-center"
            placeholder="0-100"
          />
          <span className="text-xs text-secondary/60">%</span>
          <button
            onClick={() => {
              onUpdate({ target_exercise: "", percentage_of_max: "" });
              setShowPctRow(false);
            }}
            className="text-secondary/40 hover:text-error flex-shrink-0 px-1 text-xs transition-colors"
            title="Hide % of max"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="pl-6 mt-0.5">
          <button
            type="button"
            onClick={() => setShowPctRow(true)}
            className="text-xs text-secondary/50 hover:text-primary transition-colors"
          >
            + % of max
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Gap inserter — always-visible dashed divider with insertion buttons ──────

interface GapInserterProps {
  onAddExercise: () => void;
  onAddSection: () => void;
}

function GapInserter({ onAddExercise, onAddSection }: GapInserterProps) {
  return (
    <div className="flex items-center my-0.5 group">
      <div className="flex-1 border-t border-dashed border-secondary/15 group-hover:border-secondary/35 transition-colors" />
      <div className="flex items-center gap-0.5 px-1.5 shrink-0">
        <button
          onClick={onAddExercise}
          className="text-[10px] text-secondary/30 group-hover:text-primary/60 hover:text-primary px-1.5 py-0.5 rounded transition-all whitespace-nowrap"
        >
          + Exercise
        </button>
        <span className="text-secondary/20 group-hover:text-secondary/30 text-[10px] transition-colors select-none">
          ·
        </span>
        <button
          onClick={onAddSection}
          className="text-[10px] text-secondary/30 group-hover:text-secondary/60 hover:text-text px-1.5 py-0.5 rounded transition-all whitespace-nowrap"
        >
          + Section
        </button>
      </div>
      <div className="flex-1 border-t border-dashed border-secondary/15 group-hover:border-secondary/35 transition-colors" />
    </div>
  );
}

// ─── Sortable day card ────────────────────────────────────────────────────────

interface DayCardProps {
  day: DayDraft;
  dayIdx: number;
  weekIdx: number;
  dayMode: "offset" | "weekday";
  onUpdateLabel: (label: string) => void;
  onAddCell: (insertAfterIdx: number, kind: "exercise" | "section") => void;
  onUpdateCell: (cellIdx: number, updates: CellUpdate) => void;
  onRemoveCell: (cellIdx: number) => void;
  onReorderCells: (activeId: string, overId: string) => void;
  onRemoveDay: () => void;
}

function SortableDayCard(props: DayCardProps) {
  const {
    day,
    dayMode,
    onUpdateLabel,
    onAddCell,
    onUpdateCell,
    onRemoveCell,
    onReorderCells,
    onRemoveDay,
  } = props;

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: day.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleCellDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorderCells(String(active.id), String(over.id));
  };

  const isSectionEmpty = (cellIdx: number): boolean => {
    const cell = day.cells[cellIdx];
    if (cell.kind !== "section") return false;
    for (let i = cellIdx + 1; i < day.cells.length; i++) {
      const c = day.cells[i];
      if (c.kind === "section" && c.level <= cell.level) break;
      if (c.kind === "exercise") return false;
    }
    return true;
  };

  const exerciseCount = day.cells.filter((c) => c.kind === "exercise").length;
  const hasExerciseCells = day.cells.some((c) => c.kind === "exercise");

  return (
    <div ref={setNodeRef} style={style} className="card mb-3 bg-background/80">
      {/* Day card header */}
      <div className="flex items-center gap-2 mb-2">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab text-secondary/30 hover:text-secondary/60 flex-shrink-0 touch-none select-none"
          tabIndex={-1}
          aria-label="drag day"
        >
          ⠿
        </button>

        {dayMode === "weekday" ? (
          <select
            value={day.label}
            onChange={(e) => onUpdateLabel(e.target.value)}
            className="input-field py-1 text-sm font-semibold w-36"
          >
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-semibold text-text">{day.label}</span>
        )}

        <span className="text-xs text-secondary ml-1">
          {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""}
        </span>
        <div className="flex-1" />
        <button
          onClick={onRemoveDay}
          className="text-secondary/40 hover:text-error text-xs px-1 transition-colors"
          title="Remove day"
        >
          ✕
        </button>
      </div>

      {/* Column labels for exercise cells */}
      {hasExerciseCells && (
        <div className="flex items-center gap-2 px-2 pb-1 text-[10px] text-secondary/40 font-medium border-b border-secondary/10 mb-1">
          <span className="w-5 flex-shrink-0" />
          <span className="flex-1 min-w-[120px]">Exercise</span>
          <span className="w-14 text-center">Sets</span>
          <span className="w-14 text-center">Reps</span>
          <span className="w-16 text-center">Rest(s)</span>
          <span className="flex-1 min-w-[80px]">Notes</span>
          <span className="w-5" />
        </div>
      )}

      {/* Cell list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCellDragEnd}>
        <SortableContext items={day.cells.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <GapInserter
            onAddExercise={() => onAddCell(-1, "exercise")}
            onAddSection={() => onAddCell(-1, "section")}
          />

          {day.cells.map((cell, cellIdx) => (
            <Fragment key={cell.id}>
              <SortableCell
                cell={cell}
                isEmpty={isSectionEmpty(cellIdx)}
                onUpdate={(updates) => onUpdateCell(cellIdx, updates)}
                onRemove={() => onRemoveCell(cellIdx)}
                onChangeLevel={(delta) => {
                  if (cell.kind !== "section") return;
                  const newLevel = Math.max(1, Math.min(2, cell.level + delta)) as 1 | 2;
                  onUpdateCell(cellIdx, { level: newLevel });
                }}
              />
              <GapInserter
                onAddExercise={() => onAddCell(cellIdx, "exercise")}
                onAddSection={() => onAddCell(cellIdx, "section")}
              />
            </Fragment>
          ))}
        </SortableContext>
      </DndContext>

      {day.cells.length === 0 && (
        <p className="text-secondary/50 text-sm italic text-center py-3">
          Use the + buttons above to add exercises or sections
        </p>
      )}
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

  const folderIdParam = searchParams.get("folder_id");
  const folderId = folderIdParam ? parseInt(folderIdParam) : null;

  // Edit mode — present when navigated from /coach/programs/[id]/edit
  const editIdParam = searchParams.get("edit_id");
  const editId = editIdParam ? parseInt(editIdParam) : null;
  const isEditMode = editId !== null;

  const queryClient = useQueryClient();

  const { data: editProgram } = useQuery({
    queryKey: ["program", editId],
    queryFn: () => programApi.get(editId!),
    enabled: isEditMode,
  });

  // ── Step 1 state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);
  const [programName, setProgramName] = useState("");
  const [programDesc, setProgramDesc] = useState("");
  const [programType, setProgramType] = useState<"strength" | "rehab">(
    searchParams.get("type") === "rehab" ? "rehab" : "strength"
  );
  const [numWeeks, setNumWeeks] = useState(4);
  const [isOngoing, setIsOngoing] = useState(false);
  const [sameEveryWeek, setSameEveryWeek] = useState(false);
  const [dayMode, setDayMode] = useState<"offset" | "weekday">("offset");

  // ── Step 2 state ─────────────────────────────────────────────────────────────
  const [weeks, setWeeks] = useState<DayDraft[][]>([]);
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Track whether we've already pre-populated from edit data
  const [editInitialized, setEditInitialized] = useState(false);

  // Pre-populate state when editing an existing program
  useEffect(() => {
    if (!editProgram || editInitialized) return;

    setProgramName(editProgram.name);
    setProgramDesc(editProgram.description || "");
    setProgramType((editProgram.program_type as "strength" | "rehab") || "strength");
    setIsOngoing(editProgram.is_ongoing ?? false);
    setSameEveryWeek(editProgram.same_every_week ?? false);
    setNumWeeks(editProgram.num_weeks ?? 4);
    setDayMode((editProgram.day_mode as "offset" | "weekday") || "offset");

    const draftWeeks = workoutsToDayDrafts(editProgram.workouts ?? []);
    // Ensure at least one week slot exists
    setWeeks(draftWeeks.length > 0 ? draftWeeks : [[]]);
    setSelectedWeek(0);
    setStep(2);
    setEditInitialized(true);
  }, [editProgram, editInitialized]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────────
  // Only initializes weeks on first entry; subsequent visits preserve builder state.
  const goToBuilder = () => {
    if (weeks.length === 0) {
      const count = sameEveryWeek || isOngoing ? 1 : numWeeks;
      setWeeks(Array.from({ length: count }, () => []));
      setSelectedWeek(0);
    }
    setStep(2);
  };

  // ── Derived values ───────────────────────────────────────────────────────────
  // When sameEveryWeek is on we always operate on week 0; tabs are hidden
  const currentWeekIdx = sameEveryWeek ? 0 : selectedWeek;
  const currentDays = weeks[currentWeekIdx] ?? [];

  // ── Week helpers ─────────────────────────────────────────────────────────────
  const addWeek = () => setWeeks((prev) => [...prev, []]);

  // ── Day helpers ──────────────────────────────────────────────────────────────
  const addDay = useCallback((weekIdx: number) => {
    setWeeks((prev) => {
      const next = prev.map((w) => [...w]);
      const existing = next[weekIdx] ?? [];
      const label =
        dayMode === "weekday"
          ? WEEKDAYS[existing.length % WEEKDAYS.length]
          : `Day ${existing.length + 1}`;
      next[weekIdx] = [...existing, { id: uid(), label, cells: [] }];
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayMode]);

  const removeDay = (weekIdx: number, dayIdx: number) => {
    setWeeks((prev) => {
      const next = prev.map((w) => [...w]);
      next[weekIdx] = next[weekIdx].filter((_, i) => i !== dayIdx);
      if (dayMode === "offset") {
        next[weekIdx] = next[weekIdx].map((d, i) => ({ ...d, label: `Day ${i + 1}` }));
      }
      return next;
    });
  };

  const updateDayLabel = (weekIdx: number, dayIdx: number, label: string) => {
    setWeeks((prev) => {
      const next = prev.map((w) => [...w]);
      next[weekIdx] = next[weekIdx].map((d, i) => (i === dayIdx ? { ...d, label } : d));
      return next;
    });
  };

  const reorderDays = (weekIdx: number, oldIdx: number, newIdx: number) => {
    setWeeks((prev) => {
      const next = prev.map((w) => [...w]);
      next[weekIdx] = arrayMove(next[weekIdx], oldIdx, newIdx);
      if (dayMode === "offset") {
        next[weekIdx] = next[weekIdx].map((d, i) => ({ ...d, label: `Day ${i + 1}` }));
      }
      return next;
    });
  };

  // ── Cell helpers ─────────────────────────────────────────────────────────────
  const addCell = (
    weekIdx: number,
    dayIdx: number,
    insertAfterIdx: number,
    kind: "exercise" | "section"
  ) => {
    const newCell: Cell =
      kind === "exercise"
        ? { kind: "exercise", id: uid(), name: "", sets: 3, reps: 10, coach_notes: "", rest_seconds: "", target_exercise: "", percentage_of_max: "" }
        : { kind: "section", id: uid(), name: "", level: 1 };
    setWeeks((prev) => {
      const next = prev.map((w) => w.map((d) => ({ ...d, cells: [...d.cells] })));
      next[weekIdx][dayIdx].cells.splice(insertAfterIdx + 1, 0, newCell);
      return next;
    });
  };

  const removeCell = (weekIdx: number, dayIdx: number, cellIdx: number) => {
    setWeeks((prev) => {
      const next = prev.map((w) => w.map((d) => ({ ...d, cells: [...d.cells] })));
      next[weekIdx][dayIdx].cells.splice(cellIdx, 1);
      return next;
    });
  };

  const updateCell = (
    weekIdx: number,
    dayIdx: number,
    cellIdx: number,
    updates: CellUpdate
  ) => {
    setWeeks((prev) => {
      const next = prev.map((w) => w.map((d) => ({ ...d, cells: [...d.cells] })));
      const cell = next[weekIdx][dayIdx].cells[cellIdx];
      next[weekIdx][dayIdx].cells[cellIdx] = { ...cell, ...updates } as Cell;
      return next;
    });
  };

  const reorderCells = (
    weekIdx: number,
    dayIdx: number,
    activeId: string,
    overId: string
  ) => {
    setWeeks((prev) => {
      const next = prev.map((w) => w.map((d) => ({ ...d, cells: [...d.cells] })));
      next[weekIdx][dayIdx].cells = moveCells(next[weekIdx][dayIdx].cells, activeId, overId);
      return next;
    });
  };

  // ── Day DnD ──────────────────────────────────────────────────────────────────
  const handleDayDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = currentDays.findIndex((d) => d.id === active.id);
    const newIdx = currentDays.findIndex((d) => d.id === over.id);
    if (oldIdx !== -1 && newIdx !== -1) reorderDays(currentWeekIdx, oldIdx, newIdx);
  };

  // ── Build workout payload (shared between create and edit) ───────────────────
  const buildWorkoutPayload = () => {
    const weeksToSave = sameEveryWeek ? (weeks.length > 0 ? [weeks[0]] : []) : weeks;

    return weeksToSave.flatMap((days, wi) =>
      days.flatMap((day, di) => {
        const weekNum = wi + 1;
        const dayOffset =
          dayMode === "weekday"
            ? (weekNum - 1) * 7 + (WEEKDAY_OFFSETS[day.label] ?? di)
            : (weekNum - 1) * 7 + di;

        const exercises: {
          name: string;
          sets: number;
          reps: number;
          coach_notes: string | null;
          group_label: string | null;
          rest_seconds: number | null;
          target_exercise: string | null;
          percentage_of_max: number | null;
          order: number;
        }[] = [];
        let currentGroupLabel: string | null = null;

        for (const cell of day.cells) {
          if (cell.kind === "section") {
            currentGroupLabel = cell.name.trim() || null;
          } else if (cell.kind === "exercise" && cell.name.trim()) {
            const pctRaw = parseFloat(cell.percentage_of_max);
            const pctDecimal =
              Number.isFinite(pctRaw) && pctRaw > 0 ? pctRaw / 100 : null;
            exercises.push({
              name: cell.name.trim(),
              sets: cell.sets,
              reps: cell.reps,
              coach_notes: cell.coach_notes || null,
              group_label: currentGroupLabel,
              rest_seconds: cell.rest_seconds ? parseInt(cell.rest_seconds) : null,
              target_exercise: cell.target_exercise || null,
              percentage_of_max: pctDecimal,
              order: exercises.length,
            });
          }
        }

        return [{
          name: `Week ${weekNum} - ${day.label}`,
          day_offset: dayOffset,
          week_number: weekNum,
          day_label: day.label,
          description: null as null,
          exercises,
        }];
      })
    );
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const saveProgram = async () => {
    if (!programName.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const workouts = buildWorkoutPayload();

      if (isEditMode && editId !== null) {
        // ── Edit mode: single PUT replaces metadata + all template workouts ────
        const effectiveNumWeeks = isOngoing ? null : numWeeks;
        await programApi.update(editId, {
          name: programName.trim(),
          description: programDesc.trim() || null,
          program_type: programType,
          num_weeks: effectiveNumWeeks,
          day_mode: dayMode,
          is_ongoing: isOngoing,
          same_every_week: sameEveryWeek,
          workouts,
        });

        // Invalidate cached program data so the detail page fetches fresh data
        queryClient.invalidateQueries({ queryKey: ["program", editId] });
        router.push(`/coach/programs/${editId}`);
      } else {
        // ── Create mode ─────────────────────────────────────────────────────────
        const effectiveNumWeeks = isOngoing ? null : numWeeks;
        await programApi.importProgram({
          program_name: programName.trim(),
          description: programDesc.trim() || null,
          program_type: programType,
          num_weeks: effectiveNumWeeks,
          day_mode: dayMode,
          folder_id: folderId,
          is_ongoing: isOngoing,
          same_every_week: sameEveryWeek,
          workouts,
        });

        router.push("/coach/programs");
      }
    } catch (err: unknown) {
      setSaveError(extractErrorMessage(err, "Failed to save program."));
    } finally {
      setIsSaving(false);
    }
  };

  const step1Valid = programName.trim().length > 0;

  // Stats only count the weeks that will actually be saved
  const weeksForStats = sameEveryWeek ? (weeks.length > 0 ? [weeks[0]] : []) : weeks;
  const hasAnyContent = weeksForStats.some((w) =>
    w.some((d) => d.cells.some((c) => c.kind === "exercise" && c.name.trim()))
  );
  const totalDays = weeksForStats.reduce((t, w) => t + w.length, 0);
  const totalExercises = weeksForStats.reduce(
    (t, w) =>
      t + w.reduce(
        (t2, d) => t2 + d.cells.filter((c) => c.kind === "exercise" && c.name.trim()).length,
        0
      ),
    0
  );

  // In edit mode, show a loading state while the program data is being fetched
  if (isEditMode && !editInitialized && !editProgram) {
    return (
      <AuthGuard requiredUserType="coach">
        <div className="min-h-screen bg-background">
          <NavBar userName={user?.name || ""} userType="coach" />
          <main className="max-w-4xl mx-auto px-4 py-8">
            <div className="card">
              <p className="text-secondary">Loading program...</p>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AuthGuard requiredUserType="coach">
      <div className="min-h-screen bg-background">
        <NavBar userName={user?.name || ""} userType="coach" />

        <main className="max-w-4xl mx-auto px-4 py-8 pb-24">
          <div className="mb-6">
            <button
              onClick={() => {
                if (step === 2) {
                  setStep(1);
                } else if (isEditMode && editId !== null) {
                  router.push(`/coach/programs/${editId}`);
                } else {
                  router.push("/coach/programs");
                }
              }}
              className="text-secondary hover:text-text text-sm mb-4 inline-flex items-center gap-1"
            >
              ← {step === 2 ? "Back to Details" : isEditMode ? "Back to Program" : "Back to Programs"}
            </button>
            <h1 className="text-3xl font-heading font-bold text-text">
              {isEditMode ? "Edit Program" : "Create Program"}
            </h1>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-8">
            {["Program Details", "Build"].map((label, idx) => {
              const s = idx + 1;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    s <= step ? "bg-primary text-background" : "bg-secondary/20 text-secondary"
                  }`}>
                    {s < step ? "✓" : s}
                  </div>
                  <span className={`text-sm font-medium hidden sm:block ${s === step ? "text-text" : "text-secondary"}`}>
                    {label}
                  </span>
                  {idx === 0 && <div className={`h-px w-8 ${step > 1 ? "bg-primary" : "bg-secondary/20"}`} />}
                </div>
              );
            })}
          </div>

          {/* ── Step 1: Program Details ──────────────────────────────────────── */}
          {step === 1 && (
            <div className="card">
              <h2 className="text-xl font-heading font-bold text-text mb-6">Program Details</h2>
              <div className="space-y-5">
                {/* Name */}
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

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Description &amp; When to Use
                  </label>
                  <textarea
                    value={programDesc}
                    onChange={(e) => setProgramDesc(e.target.value)}
                    className="input-field min-h-[80px]"
                    placeholder="Purpose, focus, or conditions for using this program…"
                  />
                </div>

                {/* Program type */}
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Program Type</label>
                  <div className="flex gap-2">
                    {(["strength", "rehab"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setProgramType(t)}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-colors ${
                          programType === t
                            ? t === "rehab"
                              ? "bg-amber-400/20 border-amber-400 text-amber-400"
                              : "bg-primary/20 border-primary text-primary"
                            : "bg-background border-secondary/30 text-secondary hover:border-secondary/60"
                        }`}
                      >
                        {t === "strength" ? "Strength Training" : "Rehab / PT"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration toggle */}
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Duration</label>
                  <div className="flex gap-2">
                    {([false, true] as const).map((ongoing) => (
                      <button
                        key={String(ongoing)}
                        type="button"
                        onClick={() => setIsOngoing(ongoing)}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-colors ${
                          isOngoing === ongoing
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-background border-secondary/30 text-secondary hover:border-secondary/60"
                        }`}
                      >
                        {ongoing ? "Ongoing (no end date)" : "Fixed"}
                      </button>
                    ))}
                  </div>
                  {!isOngoing && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={52}
                        value={numWeeks}
                        onChange={(e) => setNumWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                        className="input-field w-20 text-center"
                      />
                      <span className="text-sm text-secondary">weeks</span>
                    </div>
                  )}
                </div>

                {/* Weekly variation toggle */}
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Weekly Content</label>
                  <div className="flex gap-2">
                    {([true, false] as const).map((same) => (
                      <button
                        key={String(same)}
                        type="button"
                        onClick={() => setSameEveryWeek(same)}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-colors ${
                          sameEveryWeek === same
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-background border-secondary/30 text-secondary hover:border-secondary/60"
                        }`}
                      >
                        {same ? "Same every week" : "Varies by week"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Day mode */}
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Day Labels</label>
                  <div className="flex gap-2">
                    {(["offset", "weekday"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setDayMode(mode)}
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-colors ${
                          dayMode === mode
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-background border-secondary/30 text-secondary hover:border-secondary/60"
                        }`}
                      >
                        {mode === "offset" ? "Day Numbers (Day 1, Day 2…)" : "Days of Week (Monday, Tuesday…)"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button
                  onClick={goToBuilder}
                  disabled={!step1Valid}
                  className="btn-primary"
                >
                  Next: Build Program →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Program Builder ──────────────────────────────────────── */}
          {step === 2 && (
            <div>
              {/* Edit mode warning banner */}
              {isEditMode && (
                <div className="mb-4 p-3 rounded-lg bg-amber-400/10 border border-amber-400/40 text-amber-400 text-sm flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">⚠</span>
                  <span>
                    You are editing a live program. Changes will apply immediately to all upcoming athlete workouts.
                  </span>
                </div>
              )}

              {saveError && (
                <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/40 text-error text-sm">
                  {saveError}
                </div>
              )}

              {/* Week tabs — hidden when sameEveryWeek */}
              {!sameEveryWeek && (
                <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
                  {weeks.map((_, wi) => (
                    <button
                      key={wi}
                      onClick={() => setSelectedWeek(wi)}
                      className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        selectedWeek === wi
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-background border-secondary/30 text-secondary hover:border-secondary/50"
                      }`}
                    >
                      Week {wi + 1}
                    </button>
                  ))}
                  {/* + Add Week only when ongoing + varies by week */}
                  {isOngoing && (
                    <button
                      onClick={() => { addWeek(); setSelectedWeek(weeks.length); }}
                      className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium border border-dashed border-primary/40 text-primary hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      + Add Week
                    </button>
                  )}
                </div>
              )}

              {/* Day cards */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDayDragEnd}>
                <SortableContext items={currentDays.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                  {currentDays.map((day, dayIdx) => (
                    <SortableDayCard
                      key={day.id}
                      day={day}
                      dayIdx={dayIdx}
                      weekIdx={currentWeekIdx}
                      dayMode={dayMode}
                      onUpdateLabel={(label) => updateDayLabel(currentWeekIdx, dayIdx, label)}
                      onAddCell={(insertAfterIdx, kind) =>
                        addCell(currentWeekIdx, dayIdx, insertAfterIdx, kind)
                      }
                      onUpdateCell={(cellIdx, updates) =>
                        updateCell(currentWeekIdx, dayIdx, cellIdx, updates)
                      }
                      onRemoveCell={(cellIdx) => removeCell(currentWeekIdx, dayIdx, cellIdx)}
                      onReorderCells={(activeId, overId) =>
                        reorderCells(currentWeekIdx, dayIdx, activeId, overId)
                      }
                      onRemoveDay={() => removeDay(currentWeekIdx, dayIdx)}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {currentDays.length === 0 && (
                <div className="card text-center py-10 text-secondary/60 text-sm mb-3">
                  {sameEveryWeek
                    ? <>No days yet. Click &ldquo;+ Add Day&rdquo; below.</>
                    : <>No days yet for Week {currentWeekIdx + 1}. Click &ldquo;+ Add Day&rdquo; below.</>
                  }
                </div>
              )}

              <button
                onClick={() => addDay(currentWeekIdx)}
                className="w-full py-3 rounded-lg border border-dashed border-primary/40 text-primary text-sm font-medium hover:border-primary hover:bg-primary/5 transition-colors mb-6"
              >
                + Add Day
              </button>
            </div>
          )}
        </main>

        {/* Sticky save bar */}
        {step === 2 && (
          <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-secondary/20 px-4 py-4 z-10">
            <div className="max-w-4xl mx-auto flex justify-between items-center gap-3">
              <p className="text-secondary text-sm">
                {totalDays} day{totalDays !== 1 ? "s" : ""} &middot; {totalExercises} exercise{totalExercises !== 1 ? "s" : ""}
                {!isEditMode && sameEveryWeek && !isOngoing && numWeeks > 1 && (
                  <span className="text-secondary/60"> &middot; repeats {numWeeks} weeks</span>
                )}
              </p>
              <button
                onClick={saveProgram}
                disabled={isSaving || !hasAnyContent}
                className="btn-primary"
              >
                {isSaving ? "Saving…" : isEditMode ? "Save Changes" : "Save Program"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
