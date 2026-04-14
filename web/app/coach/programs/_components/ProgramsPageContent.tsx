"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { programApi, folderApi, FolderContents, Program } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core";

// ─── Icons ────────────────────────────────────────────────────────────────────

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

// ─── DroppableFolderCard ──────────────────────────────────────────────────────

function DroppableFolderCard({
  folder,
  openFolderMenuId,
  onToggleMenu,
  onNavigate,
  onRename,
  onMove,
  onArchive,
  onDelete,
}: {
  folder: FolderContents;
  openFolderMenuId: number | null;
  onToggleMenu: (id: number | null) => void;
  onNavigate: (id: number) => void;
  onRename: (folder: FolderContents) => void;
  onMove: (folder: FolderContents) => void;
  onArchive: (folder: FolderContents) => void;
  onDelete: (folder: FolderContents) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder-${folder.id}` });
  return (
    <div
      ref={setNodeRef}
      key={folder.id}
      onClick={() => onNavigate(folder.id)}
      className={`relative flex flex-col gap-3 p-5 rounded-xl border transition-colors cursor-pointer ${
        isOver
          ? "border-2 border-primary bg-primary/10"
          : "border border-secondary/20 bg-secondary/5 hover:border-primary/30 hover:bg-secondary/10"
      }`}
    >
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none z-10">
          <span className="text-xs font-medium text-primary bg-background/80 border border-primary/30 px-2.5 py-1 rounded-full">
            Drop here
          </span>
        </div>
      )}

      {/* Three-dot menu */}
      <div
        className="absolute top-4 right-4"
        data-menu
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onToggleMenu(openFolderMenuId === folder.id ? null : folder.id)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text bg-secondary/10 hover:bg-secondary/20 transition-colors text-xl font-bold leading-none"
          aria-label="Folder options"
        >
          ⋯
        </button>
        {openFolderMenuId === folder.id && (
          <div className="absolute right-0 top-9 w-44 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden">
            <button
              onClick={() => { onToggleMenu(null); onRename(folder); }}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              Rename
            </button>
            <button
              onClick={() => { onToggleMenu(null); onMove(folder); }}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              Move to…
            </button>
            <button
              onClick={() => onArchive(folder)}
              className="w-full text-left px-4 py-2.5 text-sm text-amber-400 hover:bg-zinc-800 transition-colors"
            >
              Archive folder
            </button>
            <button
              onClick={() => onDelete(folder)}
              className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
            >
              Delete folder
            </button>
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="pr-10 flex items-center gap-3">
        <FolderIcon className="w-8 h-8 text-primary/70 flex-shrink-0" />
        <h3 className="text-base font-heading font-bold text-text truncate">
          {folder.name}
        </h3>
      </div>

      <div className="text-sm text-secondary space-y-0.5">
        <p>
          {folder.subfolders.length}{" "}
          {folder.subfolders.length === 1 ? "folder" : "folders"},{" "}
          {folder.program_count}{" "}
          {folder.program_count === 1 ? "program" : "programs"}
        </p>
        {folder.archived_program_count > 0 && (
          <p className="text-secondary/60 text-xs">
            {folder.archived_program_count} archived
          </p>
        )}
      </div>
    </div>
  );
}

// ─── DraggableProgramCard ─────────────────────────────────────────────────────

function DraggableProgramCard({
  program,
  openMenuId,
  showArchived,
  actionLoading,
  onToggleMenu,
  onMove,
  onDuplicate,
  onArchive,
  onDelete,
  onRestore,
}: {
  program: Program;
  openMenuId: number | null;
  showArchived: boolean;
  actionLoading: number | null;
  onToggleMenu: (id: number | null) => void;
  onMove: (program: Program) => void;
  onDuplicate: (id: number) => void;
  onArchive: (id: number) => void;
  onDelete: (id: number) => void;
  onRestore: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `program-${program.id}`,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="card hover:border-primary/40 transition-colors relative flex flex-col"
    >
      {/* Three-dot menu */}
      <div className="absolute top-4 right-4" data-menu>
        <button
          onClick={() => onToggleMenu(openMenuId === program.id ? null : program.id)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text bg-secondary/10 hover:bg-secondary/20 transition-colors text-xl font-bold leading-none"
          aria-label="Program options"
        >
          ⋯
        </button>
        {openMenuId === program.id && (
          <div className="absolute right-0 top-9 w-44 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden">
            <button
              onClick={() => { onToggleMenu(null); onMove(program); }}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              Move to folder
            </button>
            <button
              onClick={() => onDuplicate(program.id)}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              Duplicate
            </button>
            {showArchived ? (
              <button
                onClick={() => onRestore(program.id)}
                className="w-full text-left px-4 py-2.5 text-sm text-amber-400 hover:bg-zinc-800 transition-colors"
              >
                Unarchive
              </button>
            ) : (
              <button
                onClick={() => onArchive(program.id)}
                className="w-full text-left px-4 py-2.5 text-sm text-amber-400 hover:bg-zinc-800 transition-colors"
              >
                Archive
              </button>
            )}
            <button
              onClick={() => onDelete(program.id)}
              className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Card body */}
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
          {program.program_type === "rehab" && (
            <span className="shrink-0 text-xs bg-amber-400/20 text-amber-400 px-2 py-1 rounded mt-0.5">
              Rehab / PT
            </span>
          )}
        </div>

        {program.description && (
          <p className="text-secondary text-sm mb-4 line-clamp-2">
            {program.description}
          </p>
        )}

        <div className="space-y-2 text-sm mb-4">
          <p className="text-secondary">
            <span className="font-medium">Created:</span>{" "}
            {formatDate(program.created_at)}
          </p>
        </div>
      </div>

      {/* Open button */}
      {actionLoading === program.id ? (
        <div className="mt-4 w-full py-2 text-center text-sm text-secondary">
          Duplicating…
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
  );
}

// ─── Move Modal ───────────────────────────────────────────────────────────────

interface MoveModalState {
  open: boolean;
  itemType: "program" | "folder";
  id: number | null;
  currentLocationId: number | null;
}

function MoveModal({
  state,
  onClose,
  onMoved,
}: {
  state: MoveModalState;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [selectedDest, setSelectedDest] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [childrenCache, setChildrenCache] = useState<
    Record<number, FolderContents[]>
  >({});
  const [moving, setMoving] = useState(false);

  const { data: rootData } = useQuery({
    queryKey: ["folder-tree-picker"],
    queryFn: () => folderApi.getRoot(),
    enabled: state.open,
  });

  // Reset selection when modal opens
  useEffect(() => {
    if (state.open) {
      setSelectedDest(state.currentLocationId ?? null);
      setExpanded(new Set());
      setChildrenCache({});
    }
  }, [state.open, state.currentLocationId]);

  const handleToggleExpand = useCallback(
    async (folderId: number, e: React.MouseEvent) => {
      e.stopPropagation();
      if (expanded.has(folderId)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(folderId);
          return next;
        });
        return;
      }
      setExpanded((prev) => new Set([...prev, folderId]));
      if (!childrenCache[folderId]) {
        try {
          const data = await folderApi.getFolder(folderId);
          setChildrenCache((prev) => ({
            ...prev,
            [folderId]: data.subfolders,
          }));
        } catch {
          // silently fail — no children shown
        }
      }
    },
    [expanded, childrenCache]
  );

  const handleMove = async () => {
    if (state.id === null) return;
    setMoving(true);
    try {
      if (state.itemType === "program") {
        await programApi.move(state.id, selectedDest);
      } else {
        await folderApi.move(state.id, selectedDest);
      }
      onMoved();
      onClose();
    } catch {
      // errors bubble up via the invalidation
    } finally {
      setMoving(false);
    }
  };

  const renderFolder = (
    folder: FolderContents,
    depth: number
  ): React.ReactNode => {
    const isSelected = selectedDest === folder.id;
    const isDisabled =
      state.itemType === "folder" && folder.id === state.id;
    const isExpanded = expanded.has(folder.id);
    const children = childrenCache[folder.id] ?? [];

    return (
      <div key={folder.id}>
        <div
          onClick={() => !isDisabled && setSelectedDest(folder.id)}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
          className={`flex items-center gap-2 py-2 pr-3 rounded-lg cursor-pointer select-none transition-colors ${
            isDisabled
              ? "opacity-40 cursor-not-allowed"
              : isSelected
              ? "bg-primary/15 text-primary"
              : "hover:bg-secondary/10 text-text"
          }`}
        >
          <button
            type="button"
            onClick={(e) => handleToggleExpand(folder.id, e)}
            className="w-4 h-4 flex items-center justify-center text-secondary flex-shrink-0 text-xs"
          >
            {isExpanded ? "▾" : "▸"}
          </button>
          <FolderIcon className="w-4 h-4 flex-shrink-0 text-primary/60" />
          <span className="text-sm truncate flex-1">{folder.name}</span>
          {isSelected && (
            <span className="text-xs text-primary flex-shrink-0">✓</span>
          )}
        </div>
        {isExpanded &&
          children.map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  };

  if (!state.open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background border border-secondary/30 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-heading font-bold text-text mb-4">
          Move to…
        </h2>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-secondary/20 p-1">
          {/* Root option */}
          <div
            onClick={() => setSelectedDest(null)}
            className={`flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer select-none transition-colors ${
              selectedDest === null
                ? "bg-primary/15 text-primary"
                : "hover:bg-secondary/10 text-text"
            }`}
          >
            <HomeIcon className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-medium flex-1">Programs (root)</span>
            {selectedDest === null && (
              <span className="text-xs text-primary">✓</span>
            )}
          </div>

          {/* Folder tree */}
          {rootData?.subfolders.map((folder) => renderFolder(folder, 0))}

          {!rootData && (
            <p className="text-secondary text-sm text-center py-4">
              Loading…
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleMove}
            disabled={moving}
            className="flex-1 btn-primary"
          >
            {moving ? "Moving…" : "Move Here"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Programs Page Content ─────────────────────────────────────────────

export function ProgramsPageContent({
  currentFolderId,
}: {
  currentFolderId: number | null;
}) {
  const { user } = getAuthData();
  const router = useRouter();
  const queryClient = useQueryClient();

  // ── State ────────────────────────────────────────────────────────────────────
  const [showArchived, setShowArchived] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<number | null>(null);

  // New Program modal
  const [modalOpen, setModalOpen] = useState(false);
  const [createMethod, setCreateMethod] = useState<"manual" | "import">(
    "manual"
  );
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // New Folder modal
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Rename Folder modal
  const [renameFolderModal, setRenameFolderModal] = useState<{
    open: boolean;
    folder: FolderContents | null;
    nameValue: string;
  }>({ open: false, folder: null, nameValue: "" });

  // Move modal (programs and folders share this)
  const [moveModal, setMoveModal] = useState<MoveModalState>({
    open: false,
    itemType: "program",
    id: null,
    currentLocationId: null,
  });

  // Drag-and-drop
  const [activeProgram, setActiveProgram] = useState<Program | null>(null);
  const [overFolderId, setOverFolderId] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: folderData, isLoading } = useQuery({
    queryKey: ["folder", currentFolderId ?? "root"],
    queryFn: () =>
      currentFolderId
        ? folderApi.getFolder(currentFolderId)
        : folderApi.getRoot(),
  });

  const { data: archivedData } = useQuery({
    queryKey: ["programs", "archived"],
    queryFn: () => programApi.listArchived(),
    enabled: showArchived && currentFolderId === null,
  });

  // ── Invalidation ─────────────────────────────────────────────────────────────

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["folder"] });
    queryClient.invalidateQueries({ queryKey: ["programs"] });
  };

  // ── Navigation ───────────────────────────────────────────────────────────────

  const navigateToFolder = (folderId: number | null) => {
    if (folderId === null) {
      router.push("/coach/programs");
    } else {
      router.push(`/coach/programs/folders/${folderId}`);
    }
  };

  // ── Click-outside for card menus ─────────────────────────────────────────────

  useEffect(() => {
    if (openMenuId === null && openFolderMenuId === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-menu]")) {
        setOpenMenuId(null);
        setOpenFolderMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId, openFolderMenuId]);

  // ── Program handlers ─────────────────────────────────────────────────────────

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

  const handleArchiveProgram = async (programId: number) => {
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

  const handleDeleteProgram = async (programId: number) => {
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

  const handleRestoreProgram = async (programId: number) => {
    setOpenMenuId(null);
    await programApi.restore(programId);
    await invalidate();
  };

  // ── Folder handlers ──────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await folderApi.create({
        name: newFolderName.trim(),
        parent_id: currentFolderId,
      });
      setNewFolderModalOpen(false);
      setNewFolderName("");
      await invalidate();
    } catch {
      // TODO: surface error
    }
  };

  const handleRenameFolder = async () => {
    if (!renameFolderModal.folder || !renameFolderModal.nameValue.trim())
      return;
    try {
      await folderApi.rename(
        renameFolderModal.folder.id,
        renameFolderModal.nameValue.trim()
      );
      setRenameFolderModal({ open: false, folder: null, nameValue: "" });
      await invalidate();
    } catch {
      // TODO: surface error
    }
  };

  const handleArchiveFolder = async (folder: FolderContents) => {
    setOpenFolderMenuId(null);
    if (
      !window.confirm(
        `Archive this folder? All programs inside will be archived.`
      )
    )
      return;
    await folderApi.archive(folder.id);
    await invalidate();
  };

  const handleDeleteFolder = async (folder: FolderContents) => {
    setOpenFolderMenuId(null);
    const total = folder.program_count + folder.archived_program_count;
    if (
      !window.confirm(
        `Delete "${folder.name}"? This will permanently delete ${total} program${total !== 1 ? "s" : ""} and all their workouts. This cannot be undone.`
      )
    )
      return;
    await folderApi.delete(folder.id);
    // If we're currently inside this folder, go to root
    if (currentFolderId === folder.id) {
      router.push("/coach/programs");
    }
    await invalidate();
  };

  // ── Drag-and-drop handlers ───────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    const idStr = String(event.active.id);
    if (!idStr.startsWith("program-")) return;
    const programId = parseInt(idStr.replace("program-", ""), 10);
    setActiveProgram(programs.find((p) => p.id === programId) ?? null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id ? String(event.over.id) : null;
    setOverFolderId(
      overId?.startsWith("folder-")
        ? parseInt(overId.replace("folder-", ""), 10)
        : null
    );
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const overId = event.over?.id ? String(event.over.id) : null;
    if (overId?.startsWith("folder-") && activeProgram !== null) {
      const folderId = parseInt(overId.replace("folder-", ""), 10);
      if (activeProgram.folder_id !== folderId) {
        await programApi.move(activeProgram.id, folderId);
        invalidate();
      }
    }
    setActiveProgram(null);
    setOverFolderId(null);
  };

  // ── Derived display data ─────────────────────────────────────────────────────

  const subfolders = currentFolderId === null && showArchived
    ? []
    : (folderData?.subfolders ?? []);

  const programs =
    currentFolderId === null && showArchived
      ? (archivedData ?? [])
      : (folderData?.programs ?? []);

  const breadcrumbs = folderData?.breadcrumbs ?? [];
  const activeCount = folderData?.programs?.length ?? null;
  const archivedCount = archivedData?.length ?? null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AuthGuard requiredUserType="coach">
      <div className="min-h-screen bg-background">
        <NavBar
          userName={user?.name || ""}
          userType="coach"
          profilePhoto={user?.profile_photo_url}
        />

        <main className="max-w-7xl mx-auto px-4 py-6">
          {/* ── Header: breadcrumbs + action buttons ───────────────────────── */}
          <div className="flex items-center justify-between mt-8 mb-6 gap-4">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 flex-wrap text-sm min-w-0">
              {currentFolderId === null ? (
                <span className="font-heading font-bold text-text text-xl">
                  Programs
                </span>
              ) : (
                <>
                  <button
                    onClick={() => navigateToFolder(null)}
                    className="font-heading font-bold text-text text-xl hover:text-primary transition-colors"
                  >
                    Programs
                  </button>
                  {breadcrumbs.map((crumb, idx) => {
                    const isLast = idx === breadcrumbs.length - 1;
                    return (
                      <span key={crumb.id} className="flex items-center gap-1.5">
                        <span className="text-secondary">›</span>
                        {isLast ? (
                          <span className="font-medium text-text truncate max-w-[180px]">
                            {crumb.name}
                          </span>
                        ) : (
                          <button
                            onClick={() => navigateToFolder(crumb.id)}
                            className="font-medium text-secondary hover:text-text transition-colors truncate max-w-[140px]"
                          >
                            {crumb.name}
                          </button>
                        )}
                      </span>
                    );
                  })}
                </>
              )}
            </nav>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  setNewFolderName("");
                  setNewFolderModalOpen(true);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-secondary/30 text-secondary hover:text-text hover:border-secondary/60 transition-colors"
              >
                New Folder
              </button>
              <button
                onClick={() => setModalOpen(true)}
                className="btn-primary"
              >
                New Program
              </button>
            </div>
          </div>

          {/* ── Tabs (root only) ───────────────────────────────────────────── */}
          {currentFolderId === null && (
            <div className="flex items-end border-b-2 border-secondary/20 mb-8">
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
          )}

          {/* ── Content ────────────────────────────────────────────────────── */}
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {isLoading ? (
              <div className="card">
                <p className="text-secondary">Loading…</p>
              </div>
            ) : subfolders.length === 0 && programs.length === 0 ? (
              <div className="card text-center py-12">
                <h3 className="text-xl font-heading font-bold text-text mb-2">
                  {showArchived && currentFolderId === null
                    ? "No Archived Programs"
                    : currentFolderId !== null
                    ? "This folder is empty"
                    : "No Programs Yet"}
                </h3>
                <p className="text-secondary mb-6">
                  {showArchived && currentFolderId === null
                    ? "Archived programs will appear here"
                    : currentFolderId !== null
                    ? "Add programs or create subfolders to organize your work"
                    : "Create your first training program to get started"}
                </p>
                {!(showArchived && currentFolderId === null) && (
                  <button
                    onClick={() => setModalOpen(true)}
                    className="btn-primary inline-block"
                  >
                    Create Program
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* ── Folder cards ─────────────────────────────────────────── */}
                {subfolders.map((folder) => (
                  <DroppableFolderCard
                    key={folder.id}
                    folder={folder}
                    openFolderMenuId={openFolderMenuId}
                    onToggleMenu={setOpenFolderMenuId}
                    onNavigate={navigateToFolder}
                    onRename={(f) =>
                      setRenameFolderModal({
                        open: true,
                        folder: f,
                        nameValue: f.name,
                      })
                    }
                    onMove={(f) =>
                      setMoveModal({
                        open: true,
                        itemType: "folder",
                        id: f.id,
                        currentLocationId: f.parent_id,
                      })
                    }
                    onArchive={handleArchiveFolder}
                    onDelete={handleDeleteFolder}
                  />
                ))}

                {/* ── Program cards ─────────────────────────────────────────── */}
                {programs.map((program) => (
                  <DraggableProgramCard
                    key={program.id}
                    program={program}
                    openMenuId={openMenuId}
                    showArchived={showArchived}
                    actionLoading={actionLoading}
                    onToggleMenu={setOpenMenuId}
                    onMove={(p) =>
                      setMoveModal({
                        open: true,
                        itemType: "program",
                        id: p.id,
                        currentLocationId: p.folder_id ?? null,
                      })
                    }
                    onDuplicate={handleDuplicate}
                    onArchive={handleArchiveProgram}
                    onDelete={handleDeleteProgram}
                    onRestore={handleRestoreProgram}
                  />
                ))}
              </div>
            )}

            <DragOverlay>
              {activeProgram && (
                <div className="opacity-80 rotate-1 scale-105 shadow-2xl">
                  <div className="card p-4 font-bold text-text">
                    {activeProgram.name}
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </main>

        {/* ── New Folder modal ─────────────────────────────────────────────── */}
        {newFolderModalOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setNewFolderModalOpen(false);
            }}
          >
            <div className="bg-background border border-secondary/30 rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
              <button
                onClick={() => setNewFolderModalOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-text hover:bg-secondary/10 transition-colors text-lg"
                aria-label="Close"
              >
                ✕
              </button>
              <h2 className="text-lg font-heading font-bold text-text mb-5">
                New Folder
              </h2>
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Folder name
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolder();
                  }}
                  className="input-field"
                  placeholder="e.g. Off-Season 2025"
                  autoFocus
                />
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setNewFolderModalOpen(false)}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="flex-1 btn-primary"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Rename Folder modal ──────────────────────────────────────────── */}
        {renameFolderModal.open && (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget)
                setRenameFolderModal({ open: false, folder: null, nameValue: "" });
            }}
          >
            <div className="bg-background border border-secondary/30 rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
              <button
                onClick={() =>
                  setRenameFolderModal({
                    open: false,
                    folder: null,
                    nameValue: "",
                  })
                }
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-text hover:bg-secondary/10 transition-colors text-lg"
                aria-label="Close"
              >
                ✕
              </button>
              <h2 className="text-lg font-heading font-bold text-text mb-5">
                Rename Folder
              </h2>
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Folder name
                </label>
                <input
                  type="text"
                  value={renameFolderModal.nameValue}
                  onChange={(e) =>
                    setRenameFolderModal((prev) => ({
                      ...prev,
                      nameValue: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameFolder();
                  }}
                  className="input-field"
                  autoFocus
                />
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() =>
                    setRenameFolderModal({
                      open: false,
                      folder: null,
                      nameValue: "",
                    })
                  }
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRenameFolder}
                  disabled={!renameFolderModal.nameValue.trim()}
                  className="flex-1 btn-primary"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Move modal ───────────────────────────────────────────────────── */}
        <MoveModal
          state={moveModal}
          onClose={() =>
            setMoveModal({
              open: false,
              itemType: "program",
              id: null,
              currentLocationId: null,
            })
          }
          onMoved={invalidate}
        />

        {/* ── New Program modal ────────────────────────────────────────────── */}
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

              <h2 className="text-xl font-heading font-bold text-text mb-6">
                New Program
              </h2>

              {/* Toggle group 1 — creation method */}
              <div className="mb-8">
                <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
                  How do you want to create it?
                </p>
                <div className="flex gap-2">
                  {(["manual", "import"] as const).map((method) => {
                    const label =
                      method === "manual"
                        ? "Enter manually"
                        : "Import from spreadsheet";
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

              {/* Confirm */}
              <button
                onClick={() => {
                  setModalOpen(false);
                  const base =
                    createMethod === "manual"
                      ? "/coach/programs/create"
                      : "/coach/programs/import";
                  const qs_params = new URLSearchParams();
                  if (currentFolderId !== null)
                    qs_params.set("folder_id", String(currentFolderId));
                  const qs = qs_params.toString();
                  router.push(`${base}${qs ? `?${qs}` : ""}`);
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
