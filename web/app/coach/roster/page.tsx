"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import apiClient from "@/lib/api-client";
import { programApi, coachApi } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";
import { extractErrorMessage } from "@/lib/utils";
import { AssignProgramModal } from "@/components/AssignProgramModal";

interface Athlete {
  id: number;
  name: string;
  email: string;
  sport?: string;
  team?: string;
  groups: Array<{ id: number; name: string }>;
  subgroups: Array<{ id: number; name: string; training_focus?: string }>;
}

interface Group {
  id: number;
  name: string;
  sport?: string;
  invite_code?: string;
  member_count: number;
  subgroups: Array<{
    id: number;
    name: string;
    training_focus?: string;
    member_count: number;
  }>;
}

export default function CoachRosterPage() {
  const { user } = getAuthData();
  const queryClient = useQueryClient();
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupSport, setNewGroupSport] = useState("");
  const [selectedView, setSelectedView] = useState<"all" | "groups">("all");

  // Group management panel state
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [assignProgramId, setAssignProgramId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState("");
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [copiedGroupCode, setCopiedGroupCode] = useState(false);

  const { data: rosterData } = useQuery({
    queryKey: ["roster"],
    queryFn: async () => {
      const response = await apiClient.get<{ athletes: Athlete[] }>("/api/coaches/roster");
      return response.data;
    },
  });
  const roster = rosterData?.athletes;

  const { data: groups } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const response = await apiClient.get<Group[]>("/api/coaches/groups");
      return response.data;
    },
  });

  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: () => programApi.list(),
    enabled: selectedGroup !== null,
  });

  const [createGroupError, setCreateGroupError] = useState<string | null>(null);

  const [assignModal, setAssignModal] = useState<{
    targetType: "athlete" | "group";
    targetId: number;
    targetName: string;
  } | null>(null);

  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string; sport?: string }) => {
      const response = await apiClient.post("/api/coaches/groups", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setShowGroupModal(false);
      setNewGroupName("");
      setNewGroupSport("");
      setCreateGroupError(null);
    },
    onError: (err: any) => {
      setCreateGroupError(extractErrorMessage(err, "Failed to create group."));
    },
  });

  const addAthleteMutation = useMutation({
    mutationFn: async (athleteId: number) => {
      const response = await apiClient.post(
        `/api/coaches/groups/${selectedGroup!.id}/athletes/${athleteId}`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["roster"] });
      setManageError(null);
    },
    onError: (err: any) => {
      setManageError(extractErrorMessage(err, "Failed to add athlete."));
    },
  });

  const removeAthleteMutation = useMutation({
    mutationFn: async (athleteId: number) => {
      const response = await apiClient.delete(
        `/api/coaches/groups/${selectedGroup!.id}/athletes/${athleteId}`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["roster"] });
      setManageError(null);
    },
    onError: (err: any) => {
      setManageError(extractErrorMessage(err, "Failed to remove athlete."));
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: () => coachApi.deleteGroup(selectedGroup!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["roster"] });
      closeManagePanel();
    },
    onError: (err: any) => {
      setManageError(extractErrorMessage(err, "Failed to delete group."));
    },
  });

  const assignProgramMutation = useMutation({
    mutationFn: () =>
      programApi.assign(Number(assignProgramId), {
        group_id: selectedGroup!.id,
        start_date: assignStartDate,
      }),
    onSuccess: () => {
      setAssignSuccess(true);
      setManageError(null);
      setAssignProgramId("");
      setAssignStartDate("");
    },
    onError: (err: any) => {
      setManageError(extractErrorMessage(err, "Failed to assign program."));
    },
  });

  const groupMembers = selectedGroup
    ? roster?.filter((a) => a.groups.some((g) => g.id === selectedGroup.id)) ?? []
    : [];

  const nonMembers = selectedGroup
    ? roster?.filter((a) => !a.groups.some((g) => g.id === selectedGroup.id)) ?? []
    : [];

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGroupName.trim()) {
      createGroupMutation.mutate({
        name: newGroupName,
        sport: newGroupSport || undefined,
      });
    }
  };

  const closeManagePanel = () => {
    setSelectedGroup(null);
    setAssignProgramId("");
    setAssignStartDate("");
    setAssignSuccess(false);
    setManageError(null);
    setCopiedGroupCode(false);
  };

  return (
    <AuthGuard requiredUserType="coach">
      <div className="min-h-screen bg-background">
        <NavBar userName={user?.name || ""} userType="coach" profilePhoto={user?.profile_photo_url} />

        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-heading font-bold text-text mb-2">Roster</h1>
              <p className="text-secondary">
                {roster?.length || 0} athlete{roster?.length !== 1 ? "s" : ""}
                {groups && groups.length > 0 && ` · ${groups.length} group${groups.length !== 1 ? "s" : ""}`}
              </p>
            </div>
            <button onClick={() => setShowGroupModal(true)} className="btn-primary">
              Create Group
            </button>
          </div>

          {/* View Toggle */}
          <div className="mb-6 flex gap-2">
            <button
              onClick={() => setSelectedView("all")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedView === "all"
                  ? "bg-primary text-background"
                  : "bg-secondary/20 text-secondary hover:text-text"
              }`}
            >
              All Athletes
            </button>
            <button
              onClick={() => setSelectedView("groups")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedView === "groups"
                  ? "bg-primary text-background"
                  : "bg-secondary/20 text-secondary hover:text-text"
              }`}
            >
              By Group
            </button>
          </div>

          {/* All Athletes View */}
          {selectedView === "all" && (
            <>
              {roster && roster.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {roster.map((athlete) => (
                    <div key={athlete.id} className="card hover:border-primary/40 transition-colors flex flex-col">
                      <Link href={`/coach/athletes/${athlete.id}`} className="block flex-1">
                        <h3 className="text-xl font-heading font-bold text-text mb-2">
                          {athlete.name}
                        </h3>
                        <div className="space-y-1 text-sm mb-3">
                          <p className="text-secondary text-xs">{athlete.email}</p>
                          {athlete.sport && (
                            <p className="text-secondary">
                              <span className="font-medium">Sport:</span> {athlete.sport}
                            </p>
                          )}
                          {athlete.team && (
                            <p className="text-secondary">
                              <span className="font-medium">Team:</span> {athlete.team}
                            </p>
                          )}
                        </div>

                        {/* Groups */}
                        {athlete.groups && athlete.groups.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {athlete.groups.map((group) => (
                              <span
                                key={group.id}
                                className="px-2 py-1 bg-primary/20 text-primary rounded text-xs font-medium"
                              >
                                {group.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </Link>
                      <div className="mt-3 pt-3 border-t border-secondary/10">
                        <button
                          onClick={() =>
                            setAssignModal({
                              targetType: "athlete",
                              targetId: athlete.id,
                              targetName: athlete.name,
                            })
                          }
                          className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                        >
                          Assign Program →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card text-center py-12">
                  <h3 className="text-xl font-heading font-bold text-text mb-2">
                    No Athletes Yet
                  </h3>
                  <p className="text-secondary mb-6">
                    Share your invite code to add athletes to your roster
                  </p>
                </div>
              )}
            </>
          )}

          {/* Groups View */}
          {selectedView === "groups" && (
            <div className="space-y-6">
              {groups && groups.length > 0 ? (
                groups.map((group) => {
                  const groupAthletes = roster?.filter((a) =>
                    a.groups.some((g) => g.id === group.id)
                  );

                  return (
                    <div key={group.id} className="card">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h2 className="text-2xl font-heading font-bold text-text">
                            {group.name}
                          </h2>
                          {group.sport && (
                            <p className="text-secondary text-sm mt-1">{group.sport}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 bg-primary/20 text-primary rounded-lg text-sm font-medium">
                            {group.member_count} members
                          </span>
                          <button
                            onClick={() =>
                              setAssignModal({
                                targetType: "group",
                                targetId: group.id,
                                targetName: group.name,
                              })
                            }
                            className="btn-secondary text-sm py-1 px-3"
                          >
                            Assign Program
                          </button>
                          <button
                            onClick={() => setSelectedGroup(group)}
                            className="btn-secondary text-sm py-1 px-3"
                          >
                            Manage
                          </button>
                        </div>
                      </div>

                      {groupAthletes && groupAthletes.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {groupAthletes.map((athlete) => (
                            <Link
                              key={athlete.id}
                              href={`/coach/athletes/${athlete.id}`}
                              className="bg-background rounded-lg p-4 border border-secondary/10 block hover:border-primary/40 transition-colors"
                            >
                              <h4 className="font-semibold text-text mb-1">{athlete.name}</h4>
                              <p className="text-xs text-secondary">{athlete.email}</p>
                              {athlete.team && (
                                <p className="text-xs text-secondary mt-1">{athlete.team}</p>
                              )}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="text-secondary text-sm">No athletes in this group yet</p>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="card text-center py-12">
                  <h3 className="text-xl font-heading font-bold text-text mb-2">
                    No Groups Yet
                  </h3>
                  <p className="text-secondary mb-6">
                    Create groups to organize your athletes by team or training focus
                  </p>
                  <button onClick={() => setShowGroupModal(true)} className="btn-primary">
                    Create Your First Group
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Create Group Modal */}
        {showGroupModal && (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
            onClick={() => { setShowGroupModal(false); setCreateGroupError(null); }}
          >
            <div
              className="bg-[#1F2937] rounded-xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-heading font-bold text-text mb-4">
                Create New Group
              </h2>
              {createGroupError && (
                <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/40 text-error text-sm">
                  {createGroupError}
                </div>
              )}
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div>
                  <label htmlFor="groupName" className="block text-sm font-medium text-text mb-2">
                    Group Name <span className="text-error">*</span>
                  </label>
                  <input
                    id="groupName"
                    type="text"
                    required
                    className="input-field"
                    placeholder="e.g., Rowing Team, Varsity Squad"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="groupSport" className="block text-sm font-medium text-text mb-2">
                    Sport (Optional)
                  </label>
                  <input
                    id="groupSport"
                    type="text"
                    className="input-field"
                    placeholder="e.g., Rowing, Football, Track & Field"
                    value={newGroupSport}
                    onChange={(e) => setNewGroupSport(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => { setShowGroupModal(false); setCreateGroupError(null); }}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-1"
                    disabled={createGroupMutation.isPending}
                  >
                    {createGroupMutation.isPending ? "Creating..." : "Create Group"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Group Management Panel */}
        {selectedGroup && (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
            onClick={closeManagePanel}
          >
            <div
              className="bg-[#1F2937] rounded-xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-heading font-bold text-text">
                    {selectedGroup.name}
                  </h2>
                  {selectedGroup.sport && (
                    <p className="text-secondary text-sm mt-1">{selectedGroup.sport}</p>
                  )}
                </div>
                <button
                  onClick={closeManagePanel}
                  className="text-secondary hover:text-text text-xl leading-none"
                >
                  ✕
                </button>
              </div>

              {/* Group Invite Code */}
              {selectedGroup.invite_code && (
                <div className="mb-6 p-4 rounded-lg bg-background border border-secondary/20">
                  <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">
                    Group Invite Code
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xl font-bold text-primary tracking-widest">
                      {selectedGroup.invite_code}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedGroup.invite_code!);
                        setCopiedGroupCode(true);
                        setTimeout(() => setCopiedGroupCode(false), 2000);
                      }}
                      className="text-xs px-3 py-1 rounded-md bg-primary/20 text-primary hover:bg-primary/30 transition-colors font-medium"
                    >
                      {copiedGroupCode ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-secondary mt-2">
                    Athletes can use this code (instead of your personal coach code) to sign up and be automatically added to this group.
                  </p>
                </div>
              )}

              {manageError && (
                <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/40 text-error text-sm">
                  {manageError}
                </div>
              )}

              {/* Section 1: Current Members */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-secondary uppercase tracking-wide mb-3">
                  Members ({groupMembers.length})
                </h3>
                {groupMembers.length > 0 ? (
                  <div className="space-y-2">
                    {groupMembers.map((athlete) => (
                      <div
                        key={athlete.id}
                        className="flex items-center justify-between bg-background rounded-lg px-4 py-3 border border-secondary/10"
                      >
                        <div>
                          <p className="font-medium text-text text-sm">{athlete.name}</p>
                          <p className="text-xs text-secondary">{athlete.email}</p>
                        </div>
                        <button
                          onClick={() => removeAthleteMutation.mutate(athlete.id)}
                          disabled={removeAthleteMutation.isPending}
                          className="text-xs text-error hover:text-error/80 font-medium disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-secondary text-sm">No members yet</p>
                )}
              </div>

              {/* Section 2: Add Athletes */}
              {nonMembers.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-secondary uppercase tracking-wide mb-3">
                    Add Athletes
                  </h3>
                  <div className="space-y-2">
                    {nonMembers.map((athlete) => (
                      <div
                        key={athlete.id}
                        className="flex items-center justify-between bg-background rounded-lg px-4 py-3 border border-secondary/10"
                      >
                        <div>
                          <p className="font-medium text-text text-sm">{athlete.name}</p>
                          <p className="text-xs text-secondary">{athlete.email}</p>
                        </div>
                        <button
                          onClick={() => addAthleteMutation.mutate(athlete.id)}
                          disabled={addAthleteMutation.isPending}
                          className="text-xs text-primary hover:text-primary/80 font-medium disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 3: Assign Program */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-secondary uppercase tracking-wide mb-3">
                  Assign Program to Group
                </h3>
                {assignSuccess ? (
                  <div className="text-center py-3">
                    <p className="text-primary font-medium mb-1">Program assigned!</p>
                    <p className="text-secondary text-sm mb-4">
                      All group members will see it on their scheduled start date.
                    </p>
                    <button
                      onClick={() => setAssignSuccess(false)}
                      className="btn-secondary text-sm"
                    >
                      Assign Another
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <select
                      value={assignProgramId}
                      onChange={(e) => setAssignProgramId(e.target.value)}
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
                    <input
                      type="date"
                      value={assignStartDate}
                      onChange={(e) => setAssignStartDate(e.target.value)}
                      className="input-field"
                    />
                    <button
                      onClick={() => assignProgramMutation.mutate()}
                      disabled={!assignProgramId || !assignStartDate || assignProgramMutation.isPending}
                      className="btn-primary w-full"
                    >
                      {assignProgramMutation.isPending ? "Assigning…" : "Assign Program"}
                    </button>
                  </div>
                )}
              </div>

              {/* Delete Group */}
              <div className="pt-4 border-t border-secondary/20">
                <button
                  onClick={() => {
                    if (
                      confirm(
                        "Are you sure? This will delete the group and remove all members."
                      )
                    ) {
                      deleteGroupMutation.mutate();
                    }
                  }}
                  disabled={deleteGroupMutation.isPending}
                  className="w-full py-2 px-4 rounded-lg font-medium text-sm text-error border border-error/40 hover:bg-error/10 transition-colors disabled:opacity-50"
                >
                  {deleteGroupMutation.isPending ? "Deleting…" : "Delete Group"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Assign Program Modal */}
      {assignModal && (
        <AssignProgramModal
          mode="from-roster"
          targetType={assignModal.targetType}
          targetId={assignModal.targetId}
          targetName={assignModal.targetName}
          isOpen={true}
          onClose={() => setAssignModal(null)}
        />
      )}
    </AuthGuard>
  );
}
