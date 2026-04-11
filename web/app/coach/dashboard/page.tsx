"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import NavBar from "@/components/NavBar";
import AthleteStatusPanel from "@/components/AthleteStatusPanel";
import { coachApi } from "@/lib/api-endpoints";
import { getAuthData } from "@/lib/auth";

export default function CoachDashboardPage() {
  const { user } = getAuthData();
  const [copied, setCopied] = useState(false);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["coachDashboard"],
    queryFn: () => coachApi.getDashboard(),
  });

  const { data: inviteCodeData } = useQuery({
    queryKey: ["coachInviteCode"],
    queryFn: () => coachApi.getInviteCode(),
  });

  const inviteCode = inviteCodeData?.invite_code || user?.invite_code;

  const copyInviteCode = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AuthGuard requiredUserType="coach">
      <div className="min-h-screen bg-background">
        <NavBar userName={user?.name || ""} userType="coach" profilePhoto={user?.profile_photo_url} />

        <div className="max-w-[1400px] mx-auto px-4 py-8 flex gap-6">
          {/* Left sidebar — Athlete Status Panel */}
          <aside className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-24 h-[calc(100vh-8rem)] card !p-4">
              <AthleteStatusPanel />
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            <div className="mb-8">
              <h1 className="text-3xl font-heading font-bold text-text mb-2">Dashboard</h1>
              <p className="text-secondary">Welcome back, {user?.name}</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="card">
                <div className="text-secondary text-sm mb-2">Workouts Completed Today</div>
                <div className="text-4xl font-heading font-bold text-primary">
                  {isLoading ? "..." : dashboard?.completed_today || 0}
                </div>
              </div>

              <div className="card">
                <div className="text-secondary text-sm mb-2">Flagged Workouts</div>
                <div className="text-4xl font-heading font-bold text-error">
                  {isLoading ? "..." : dashboard?.flagged_workouts || 0}
                </div>
              </div>

              <div className="card">
                <div className="text-secondary text-sm mb-2">Total Athletes</div>
                <div className="text-4xl font-heading font-bold text-text">
                  {isLoading ? "..." : dashboard?.total_athletes || 0}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Invite Code Card */}
              <div className="card">
                <h2 className="text-xl font-heading font-bold text-text mb-4">Invite Athletes</h2>
                <p className="text-secondary text-sm mb-4">
                  Share this code with athletes to add them to your roster
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-background border-2 border-primary rounded-lg px-6 py-4">
                    <div className="text-3xl font-heading font-bold text-primary tracking-wider text-center">
                      {user?.invite_code || "------"}
                    </div>
                  </div>
                  <button
                    onClick={copyInviteCode}
                    className="btn-secondary whitespace-nowrap"
                  >
                    {copied ? "Copied!" : "Copy Code"}
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="card">
                <h2 className="text-xl font-heading font-bold text-text mb-4">Quick Actions</h2>
                <div className="space-y-3">
                  <Link
                    href="/coach/programs"
                    className="block w-full btn-primary text-center"
                  >
                    Create New Program
                  </Link>
                  <Link
                    href="/coach/roster"
                    className="block w-full btn-secondary text-center"
                  >
                    View Roster
                  </Link>
                </div>
              </div>
            </div>

            {/* Flagged Athletes */}
            {dashboard?.flagged_athletes && dashboard.flagged_athletes.length > 0 && (
              <div className="mt-8">
                <h2 className="text-2xl font-heading font-bold text-text mb-4">
                  Flagged Workouts ({dashboard.flagged_athletes.length})
                </h2>
                <div className="space-y-3">
                  {dashboard.flagged_athletes.map((flagged, idx) => (
                    <div key={idx} className="card hover:border-error/40 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-text mb-1">
                            {flagged.name}
                          </h3>
                          <p className="text-sm text-secondary mb-2">{flagged.workout_name}</p>
                          <p className="text-error text-sm">
                            <span className="font-medium">Reason:</span> {flagged.flag_reason}
                          </p>
                        </div>
                        <Link
                          href={`/coach/roster?athlete=${flagged.id}`}
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          View Details →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile Athlete Panel — shown below content on smaller screens */}
            <div className="mt-8 lg:hidden">
              <div className="card !p-4 max-h-[400px] overflow-hidden">
                <AthleteStatusPanel />
              </div>
            </div>

          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
