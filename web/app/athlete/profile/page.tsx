"use client";

import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import { athleteApi } from "@/lib/api-endpoints";
import { getAuthData, saveAuthData, authApi } from "@/lib/auth";
import { extractErrorMessage } from "@/lib/utils";

const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export default function AthleteProfilePage() {
  const { user, token } = getAuthData();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || "",
    sport: user?.sport || "",
    team: user?.team || "",
    training_goals: user?.training_goals || "",
    injuries: user?.injuries || "",
    experience_level: user?.experience_level || "",
  });

  const [showCoachChange, setShowCoachChange] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);

  // Get fresh progress data for the profile
  const { data: progressData } = useQuery({
    queryKey: ["progress"],
    queryFn: () => athleteApi.getProgress(),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: typeof formData) => athleteApi.updateProfile(data),
    onSuccess: async () => {
      setIsEditing(false);
      // Refresh user data from server
      const updatedUser = await authApi.getMe();
      if (token) {
        saveAuthData(token, updatedUser);
      }
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  const changeCoachMutation = useMutation({
    mutationFn: (code: string) => athleteApi.changeCoach(code),
    onSuccess: () => {
      setShowCoachChange(false);
      setInviteCode("");
      alert("Coach changed successfully!");
    },
    onError: (error: any) => {
      alert(extractErrorMessage(error, "Failed to change coach."));
    },
  });

  const handleSaveProfile = () => {
    updateProfileMutation.mutate(formData);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoUploading(true);
    try {
      const result = await athleteApi.uploadPhoto(file);
      // Update local user data with new photo
      const updatedUser = await authApi.getMe();
      if (token) {
        saveAuthData(token, updatedUser);
      }
      // Force re-render
      window.location.reload();
    } catch (err: any) {
      alert(extractErrorMessage(err, "Failed to upload photo."));
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleChangeCoach = () => {
    if (inviteCode.trim().length === 6) {
      changeCoachMutation.mutate(inviteCode.toUpperCase());
    } else {
      alert("Please enter a valid 6-character invite code");
    }
  };

  const handleLogout = () => {
    authApi.logout();
    router.push("/login");
  };

  return (
    <AuthGuard requiredUserType="athlete">
      <div className="min-h-screen bg-background">
        <NavBar userName={user?.name || ""} userType="athlete" profilePhoto={user?.profile_photo_url} />

        <main className="max-w-4xl mx-auto px-4 py-8">

          {/* ── Profile Header ── */}
          <div className="bg-[#1F2937] rounded-xl border border-secondary/15 p-6 mb-6">
            <div className="flex items-start gap-6">
              {/* Photo */}
              <div className="relative group">
                {user?.profile_photo_url ? (
                  <img
                    src={user.profile_photo_url}
                    alt=""
                    className="w-24 h-24 rounded-full object-cover border-3 border-primary/40"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center text-primary text-3xl font-bold border-3 border-primary/40">
                    {(user?.name || "A").charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoUploading}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <span className="text-white text-xs font-medium">
                    {photoUploading ? "..." : "Change"}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-2xl font-heading font-bold text-text">{user?.name}</h1>
                    <p className="text-secondary text-sm mt-0.5">{user?.email}</p>
                    {(user?.sport || user?.team) && (
                      <p className="text-secondary text-sm mt-1">
                        {user?.sport}{user?.sport && user?.team ? " \u2014 " : ""}{user?.team}
                      </p>
                    )}
                  </div>
                  {!isEditing && (
                    <button onClick={() => setIsEditing(true)} className="btn-secondary text-sm">
                      Edit Profile
                    </button>
                  )}
                </div>

                {/* Quick stats row */}
                <div className="flex gap-6 mt-4 pt-4 border-t border-secondary/15">
                  <div>
                    <p className="text-xs text-secondary uppercase tracking-wider">Level</p>
                    <p className="text-text font-medium capitalize">{user?.experience_level || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-secondary uppercase tracking-wider">Goal</p>
                    <p className="text-text font-medium capitalize">{user?.training_goals || "Not set"}</p>
                  </div>
                  {progressData && progressData.length > 0 && (
                    <div>
                      <p className="text-xs text-secondary uppercase tracking-wider">Lifts Tracked</p>
                      <p className="text-text font-medium">{progressData.filter(p => p.current_max).length}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Edit Form ── */}
          {isEditing && (
            <div className="bg-[#1F2937] rounded-xl border border-secondary/15 p-6 mb-6">
              <h2 className="text-xl font-heading font-bold text-text mb-4">Edit Profile</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text mb-2">Sport</label>
                    <input
                      type="text"
                      value={formData.sport}
                      onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
                      className="input-field"
                      placeholder="Football, Basketball, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text mb-2">Team</label>
                    <input
                      type="text"
                      value={formData.team}
                      onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                      className="input-field"
                      placeholder="Your team or gym"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Experience Level</label>
                  <div className="grid grid-cols-3 gap-3">
                    {EXPERIENCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, experience_level: opt.value })}
                        className={`px-3 py-2 rounded-lg border-2 text-center text-sm transition-all ${
                          formData.experience_level === opt.value
                            ? "border-primary bg-primary/10 text-text"
                            : "border-secondary/30 text-secondary hover:border-secondary"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Training Goals</label>
                  <textarea
                    value={formData.training_goals}
                    onChange={(e) => setFormData({ ...formData, training_goals: e.target.value })}
                    className="input-field min-h-[80px]"
                    placeholder="What are you working towards?"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Injuries & Limitations</label>
                  <textarea
                    value={formData.injuries}
                    onChange={(e) => setFormData({ ...formData, injuries: e.target.value })}
                    className="input-field min-h-[80px]"
                    placeholder="Any injuries or limitations to account for..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setFormData({
                        name: user?.name || "",
                        sport: user?.sport || "",
                        team: user?.team || "",
                        training_goals: user?.training_goals || "",
                        injuries: user?.injuries || "",
                        experience_level: user?.experience_level || "",
                      });
                    }}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={updateProfileMutation.isPending}
                    className="btn-primary flex-1"
                  >
                    {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Current Maxes ── */}
          {progressData && progressData.filter(p => p.current_max).length > 0 && (
            <div className="bg-[#1F2937] rounded-xl border border-secondary/15 p-6 mb-6">
              <h2 className="text-xl font-heading font-bold text-text mb-4">Current Maxes</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {progressData.filter(p => p.current_max).map((p) => (
                  <div key={p.exercise_name} className="bg-background rounded-lg p-4 text-center">
                    <p className="text-secondary text-xs uppercase tracking-wider mb-1 capitalize">
                      {p.exercise_name}
                    </p>
                    <p className="text-2xl font-heading font-bold text-primary">{p.current_max}</p>
                    <p className="text-secondary text-xs">lbs</p>
                    {p.goal && (
                      <p className="text-[10px] text-secondary mt-1">
                        Goal: {p.goal.target_weight} lbs
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Coach Section ── */}
          <div className="bg-[#1F2937] rounded-xl border border-secondary/15 p-6 mb-6">
            <h2 className="text-xl font-heading font-bold text-text mb-4">Coach</h2>

            {showCoachChange ? (
              <div className="space-y-4">
                <p className="text-secondary text-sm">
                  Enter your new coach&apos;s invite code.
                </p>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="input-field uppercase"
                  placeholder="ABC123"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowCoachChange(false); setInviteCode(""); }}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleChangeCoach}
                    disabled={changeCoachMutation.isPending || inviteCode.length !== 6}
                    className="btn-primary flex-1"
                  >
                    {changeCoachMutation.isPending ? "Changing..." : "Change Coach"}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-secondary text-sm mb-4">
                  Your coach assigns programs and monitors your progress.
                </p>
                <button onClick={() => setShowCoachChange(true)} className="btn-secondary text-sm">
                  Change Coach
                </button>
              </div>
            )}
          </div>

          {/* ── Account ── */}
          <div className="bg-[#1F2937] rounded-xl border border-error/20 p-6">
            <h2 className="text-xl font-heading font-bold text-text mb-4">Account</h2>
            <button onClick={handleLogout} className="bg-error text-white font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-opacity text-sm">
              Log Out
            </button>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
