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

export default function CoachProgramsPage() {
  const { user } = getAuthData();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
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
                  className="card hover:border-primary/40 transition-colors relative flex flex-col"
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
            <div className="bg-background border border-secondary/30 rounded-2xl shadow-2xl w-full max-w-lg p-8 relative">
              <button
                onClick={() => setModalOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-text hover:bg-secondary/10 transition-colors text-lg"
                aria-label="Close"
              >
                ✕
              </button>

              <h2 className="text-xl font-heading font-bold text-text mb-6">
                How do you want to create a program?
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => { setModalOpen(false); router.push("/coach/programs/create"); }}
                  className="group border border-secondary/30 hover:border-primary rounded-xl p-5 text-left bg-background transition-colors"
                >
                  <div className="text-2xl mb-3">✏️</div>
                  <p className="font-heading font-bold text-text text-sm mb-1 group-hover:text-primary transition-colors">
                    Enter manually
                  </p>
                  <p className="text-secondary text-xs">
                    Build your program workout by workout
                  </p>
                </button>

                <button
                  onClick={() => { setModalOpen(false); router.push("/coach/programs/import"); }}
                  className="group border border-secondary/30 hover:border-primary rounded-xl p-5 text-left bg-background transition-colors"
                >
                  <div className="text-2xl mb-3">📊</div>
                  <p className="font-heading font-bold text-text text-sm mb-1 group-hover:text-primary transition-colors">
                    Import from spreadsheet
                  </p>
                  <p className="text-secondary text-xs">
                    Upload an Excel file and AI will structure it
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
