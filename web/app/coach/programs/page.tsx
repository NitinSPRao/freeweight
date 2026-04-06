"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { programApi } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

const BODY_REGION_LABELS: Record<string, string> = {
  neck_upper_back: "Neck & Upper Back",
  shoulder: "Shoulder",
  elbow_wrist: "Elbow & Wrist",
  core_ribs: "Core & Ribs",
  lower_back: "Lower Back",
  hip: "Hip",
  knee: "Knee",
  lower_leg_shin: "Lower Leg & Shin",
  ankle_foot: "Ankle & Foot",
};

export default function CoachProgramsPage() {
  const { user } = getAuthData();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createMethod, setCreateMethod] = useState<"manual" | "import">("manual");
  const [modalProgramType, setModalProgramType] = useState<"strength" | "rehab">("strength");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const queryClient = useQueryClient();

  const { data: activePrograms, isLoading: activeLoading } = useQuery({
    queryKey: ["programs", false],
    queryFn: () => programApi.list(),
  });

  const { data: archivedPrograms, isLoading: archivedLoading } = useQuery({
    queryKey: ["programs", true],
    queryFn: () => programApi.listArchived(),
  });

  const programs = showArchived ? archivedPrograms : activePrograms;
  const isLoading = showArchived ? archivedLoading : activeLoading;
  const activeCount = activePrograms ? activePrograms.length : null;
  const archivedCount = archivedPrograms ? archivedPrograms.length : null;

  // Close card menus on click outside
  useEffect(() => {
    if (openMenuId === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-program-menu]")) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["programs", false] }),
      queryClient.invalidateQueries({ queryKey: ["programs", true] }),
    ]);

  const handleDuplicate = async (programId: number) => {
    setOpenMenuId(null);
    setActionLoading(programId);
    try {
      await programApi.duplicate(programId);
      await invalidate();
    } finally {
      setActionLoading(null);
    }
  };

  const handleArchive = async (programId: number) => {
    setOpenMenuId(null);
    if (
      !window.confirm(
        "Archive this program? It will be hidden from your active programs list."
      )
    )
      return;
    await programApi.archive(programId);
    await invalidate();
  };

  const handleDelete = async (programId: number) => {
    setOpenMenuId(null);
    if (
      !window.confirm(
        "Permanently delete this program? This cannot be undone."
      )
    )
      return;
    await programApi.delete(programId);
    await invalidate();
  };

  return (
    <AuthGuard requiredUserType="coach">
      <div className="min-h-screen bg-background">
        <NavBar
          userName={user?.name || ""}
          userType="coach"
          profilePhoto={user?.profile_photo_url}
        />

        <main className="max-w-7xl mx-auto px-4 py-6">
          {/* Tabs + New Program button on one row */}
          <div className="flex items-end justify-between border-b-2 border-secondary/20 mt-8 mb-8">
            <div className="flex items-end">
            <button
              onClick={() => setShowArchived(false)}
              className={`px-6 py-3 text-sm font-medium transition-colors rounded-t border-l border-r border-t-2 border-b-0 -mb-0.5 ${
                !showArchived
                  ? "border-l-secondary/30 border-r-secondary/30 border-t-primary bg-background text-text"
                  : "border-l-secondary/20 border-r-secondary/20 border-t-secondary/20 bg-secondary/10 text-secondary hover:text-text"
              }`}
            >
              Active ({activeCount !== null ? activeCount : "…"})
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={`px-6 py-3 text-sm font-medium transition-colors rounded-t border-l border-r border-t-2 border-b-0 -mb-0.5 ${
                showArchived
                  ? "border-l-secondary/30 border-r-secondary/30 border-t-primary bg-background text-text"
                  : "border-l-secondary/20 border-r-secondary/20 border-t-secondary/20 bg-secondary/10 text-secondary hover:text-text"
              }`}
            >
              Archived ({archivedCount !== null ? archivedCount : "…"})
            </button>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="btn-primary mb-1"
            >
              New Program
            </button>
          </div>

          {isLoading ? (
            <div className="card">
              <p className="text-secondary">Loading programs...</p>
            </div>
          ) : programs && programs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {programs.map((program) => (
                <div
                  key={program.id}
                  className={`card hover:border-primary/40 transition-colors relative flex flex-col${program.program_type === "rehab" ? " border-l-4 border-l-amber-400" : ""}`}
                >
                  {/* Three-dot menu button */}
                  <div
                    className="absolute top-4 right-4"
                    data-program-menu
                  >
                    <button
                      onClick={() =>
                        setOpenMenuId(
                          openMenuId === program.id ? null : program.id
                        )
                      }
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-text bg-secondary/10 hover:bg-secondary/20 transition-colors text-xl font-bold leading-none"
                      aria-label="Program options"
                    >
                      ⋯
                    </button>

                    {openMenuId === program.id && (
                      <div className="absolute right-0 top-9 w-44 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden">
                        <button
                          onClick={() => handleDuplicate(program.id)}
                          className="w-full text-left px-4 py-2.5 text-sm text-zinc-100 hover:bg-zinc-800 transition-colors"
                        >
                          Duplicate
                        </button>
                        {showArchived ? (
                          <button
                            onClick={async () => {
                              setOpenMenuId(null);
                              await programApi.restore(program.id);
                              await invalidate();
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-amber-400 hover:bg-zinc-800 transition-colors"
                          >
                            Unarchive
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchive(program.id)}
                            className="w-full text-left px-4 py-2.5 text-sm text-amber-400 hover:bg-zinc-800 transition-colors"
                          >
                            Archive
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(program.id)}
                          className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card body — right-pad to avoid overlapping the ⋯ button */}
                  <div className="pr-10 flex-1">
                    <div className="flex items-start gap-2 mb-3">
                      <h3 className="text-xl font-heading font-bold text-text">
                        {program.name}
                      </h3>
                      {program.program_type === "rehab" && (
                        <span className="shrink-0 text-xs bg-amber-400/20 text-amber-400 px-2 py-1 rounded mt-0.5">
                          Rehab
                        </span>
                      )}
                      {program.archived && (
                        <span className="shrink-0 text-xs bg-secondary/20 text-secondary px-2 py-1 rounded mt-0.5">
                          Archived
                        </span>
                      )}
                    </div>

                    {program.description && (
                      <p className="text-secondary text-sm mb-4 line-clamp-2">
                        {program.description}
                      </p>
                    )}

                    {program.program_type === "rehab" && program.body_regions && program.body_regions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {program.body_regions.map((region) => (
                          <span
                            key={region}
                            className="text-xs bg-amber-400/10 text-amber-400 border border-amber-400/30 px-2 py-0.5 rounded-full"
                          >
                            {BODY_REGION_LABELS[region] ?? region}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2 text-sm mb-4">
                      {(program.workouts?.length || 0) > 0 && (
                        <p className="text-secondary">
                          <span className="font-medium">Workouts:</span>{" "}
                          {program.workouts.length}
                        </p>
                      )}
                      <p className="text-secondary">
                        <span className="font-medium">Created:</span>{" "}
                        {formatDate(program.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Single Open button */}
                  {actionLoading === program.id ? (
                    <div className="mt-4 w-full py-2 text-center text-sm text-secondary">
                      Duplicating...
                    </div>
                  ) : (
                    <Link
                      href={`/coach/programs/${program.id}`}
                      className="mt-4 block w-full btn-primary text-center text-sm"
                    >
                      Open
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card text-center py-12">
              <h3 className="text-xl font-heading font-bold text-text mb-2">
                {showArchived ? "No Archived Programs" : "No Programs Yet"}
              </h3>
              <p className="text-secondary mb-6">
                {showArchived
                  ? "Archived programs will appear here"
                  : "Create your first training program to get started"}
              </p>
              {!showArchived && (
                <button
                  onClick={() => setModalOpen(true)}
                  className="btn-primary inline-block"
                >
                  Create Program
                </button>
              )}
            </div>
          )}
        </main>

        {/* New Program modal */}
        {modalOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <div className="bg-background border border-secondary/30 rounded-2xl shadow-2xl w-full max-w-[520px] p-8 relative">
              <button
                onClick={() => setModalOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-text hover:bg-secondary/10 transition-colors text-lg"
                aria-label="Close"
              >
                ✕
              </button>

              <h2 className="text-xl font-heading font-bold text-text mb-6">New Program</h2>

              {/* Toggle group 1 — creation method */}
              <div className="mb-6">
                <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
                  How do you want to create it?
                </p>
                <div className="flex gap-2">
                  {(["manual", "import"] as const).map((method) => {
                    const label = method === "manual" ? "Enter manually" : "Import from spreadsheet";
                    const selected = createMethod === method;
                    return (
                      <button
                        key={method}
                        onClick={() => setCreateMethod(method)}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-colors ${
                          selected
                            ? "bg-lime-400/10 border-lime-400 text-lime-400"
                            : "bg-zinc-800/40 border-secondary/20 text-secondary hover:border-secondary/40"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Toggle group 2 — program type */}
              <div className="mb-8">
                <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
                  What type of program?
                </p>
                <div className="flex gap-2">
                  {(["strength", "rehab"] as const).map((type) => {
                    const label = type === "strength" ? "Strength Training" : "Rehab / PT";
                    const selected = modalProgramType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setModalProgramType(type)}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-colors ${
                          selected
                            ? "bg-amber-400/10 border-amber-400 text-amber-400"
                            : "bg-zinc-800/40 border-secondary/20 text-secondary hover:border-secondary/40"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Confirm */}
              <button
                onClick={() => {
                  setModalOpen(false);
                  const base = createMethod === "manual" ? "/coach/programs/create" : "/coach/programs/import";
                  const query = modalProgramType === "rehab" ? "?type=rehab" : "";
                  router.push(`${base}${query}`);
                }}
                className="w-full btn-primary"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
