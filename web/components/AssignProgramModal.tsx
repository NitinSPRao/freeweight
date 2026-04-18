"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { programApi, coachApi } from "@/lib/api-endpoints";
import { extractErrorMessage } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type FromRosterProps = {
  mode: "from-roster";
  /** The athlete or group receiving the program */
  targetType: "athlete" | "group";
  targetId: number;
  targetName: string;
};

type FromProgramsProps = {
  mode: "from-programs";
  /** The program being assigned */
  programId: number;
  programName: string;
};

export type AssignProgramModalProps = (FromRosterProps | FromProgramsProps) & {
  isOpen: boolean;
  onClose: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignProgramModal(props: AssignProgramModalProps) {
  const { isOpen, onClose } = props;

  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [selectedTargetType, setSelectedTargetType] = useState<"athlete" | "group">("athlete");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch programs — only needed when coming from the roster page
  const { data: programs } = useQuery({
    queryKey: ["programs-for-assign"],
    queryFn: () => programApi.list(),
    enabled: isOpen && props.mode === "from-roster",
  });

  // Fetch roster — only needed when coming from the programs page
  const { data: rosterData } = useQuery({
    queryKey: ["roster-for-assign"],
    queryFn: () => coachApi.getRoster(),
    enabled: isOpen && props.mode === "from-programs",
  });

  // Fetch groups — only needed when coming from the programs page
  const { data: groups } = useQuery({
    queryKey: ["groups-for-assign"],
    queryFn: () => coachApi.listGroups(),
    enabled: isOpen && props.mode === "from-programs",
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!startDate) throw new Error("Please select a start date.");

      if (props.mode === "from-roster") {
        if (!selectedProgramId) throw new Error("Please select a program.");
        const assignData =
          props.targetType === "athlete"
            ? { start_date: startDate, athlete_id: props.targetId }
            : { start_date: startDate, group_id: props.targetId };
        return programApi.assign(Number(selectedProgramId), assignData);
      } else {
        if (!selectedTargetId) throw new Error("Please select an athlete or group.");
        const assignData =
          selectedTargetType === "athlete"
            ? { start_date: startDate, athlete_id: Number(selectedTargetId) }
            : { start_date: startDate, group_id: Number(selectedTargetId) };
        return programApi.assign(props.programId, assignData);
      }
    },
    onSuccess: () => {
      setSuccess(true);
      setError(null);
    },
    onError: (err: any) => {
      setError(extractErrorMessage(err, "Failed to assign program."));
    },
  });

  const handleClose = () => {
    setSelectedProgramId("");
    setSelectedTargetType("athlete");
    setSelectedTargetId("");
    setStartDate("");
    setError(null);
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  const title =
    props.mode === "from-roster"
      ? `Assign Program to ${props.targetName}`
      : `Assign "${props.programName}"`;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-background border border-secondary/30 rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-text hover:bg-secondary/10 transition-colors text-lg"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="text-lg font-heading font-bold text-text mb-5 pr-8">
          {title}
        </h2>

        {success ? (
          <div className="text-center py-4">
            <p className="text-primary font-medium mb-1">Program assigned!</p>
            <p className="text-secondary text-sm mb-4">
              The program will appear on the athlete's calendar on the scheduled start date.
            </p>
            <button onClick={handleClose} className="btn-secondary text-sm">
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Program picker — shown when coming from the roster page */}
            {props.mode === "from-roster" && (
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Program
                </label>
                <select
                  value={selectedProgramId}
                  onChange={(e) => setSelectedProgramId(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select a program…</option>
                  {programs
                    ?.filter((p) => !p.archived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Target picker — shown when coming from the programs page */}
            {props.mode === "from-programs" && (
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Assign to
                </label>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTargetType("athlete");
                      setSelectedTargetId("");
                    }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      selectedTargetType === "athlete"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-secondary/30 text-secondary hover:border-secondary/60"
                    }`}
                  >
                    Athlete
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTargetType("group");
                      setSelectedTargetId("");
                    }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      selectedTargetType === "group"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-secondary/30 text-secondary hover:border-secondary/60"
                    }`}
                  >
                    Group
                  </button>
                </div>

                {selectedTargetType === "athlete" ? (
                  <select
                    value={selectedTargetId}
                    onChange={(e) => setSelectedTargetId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Select an athlete…</option>
                    {rosterData?.athletes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={selectedTargetId}
                    onChange={(e) => setSelectedTargetId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Select a group…</option>
                    {groups?.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Start date (always shown) */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-field"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-error/10 border border-error/40 text-error text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => assignMutation.mutate()}
                disabled={assignMutation.isPending}
                className="flex-1 btn-primary"
              >
                {assignMutation.isPending ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
