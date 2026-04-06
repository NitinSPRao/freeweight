"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/auth";
import { coachApi, Notification } from "@/lib/api-endpoints";

interface NavBarProps {
  userName: string;
  userType: "athlete" | "coach";
  profilePhoto?: string;
}

export default function NavBar({ userName, userType, profilePhoto }: NavBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    authApi.logout();
    router.push("/login");
  };

  const baseUrl = userType === "coach" ? "/coach" : "/athlete";

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="bg-[#1F2937] border-b border-secondary/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href={`${baseUrl}/home`} className="flex items-center">
              <h1 className="text-2xl font-heading font-bold text-primary">FreeWeight</h1>
            </Link>

            <div className="hidden md:flex space-x-1">
              {userType === "coach" ? (
                <>
                  <NavLink href="/coach/dashboard" label="Dashboard" active={isActive("/coach/dashboard")} />
                  <NavLink href="/coach/roster" label="Roster" active={isActive("/coach/roster")} />
                  <NavLink href="/coach/programs" label="Programs" active={isActive("/coach/programs")} />
                </>
              ) : (
                <>
                  <NavLink href="/athlete/home" label="Home" active={isActive("/athlete/home")} />
                  <NavLink href="/athlete/progress" label="Progress" active={isActive("/athlete/progress")} />
                  <NavLink href="/athlete/profile" label="Profile" active={isActive("/athlete/profile")} />
                </>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {userType === "coach" && <NotificationBell />}
            <Link href={`${baseUrl}/profile`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              {profilePhoto ? (
                <img
                  src={profilePhoto}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover border border-secondary/30"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold border border-secondary/30">
                  {(userName || "U").charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-text text-sm hidden sm:block">{userName}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="text-secondary hover:text-primary text-sm font-medium transition-colors ml-2"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(0, minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  return new Date(dateStr).toLocaleDateString();
}

function NotificationBell() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const { data: countData } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: coachApi.getUnreadNotificationCount,
    refetchInterval: 30000,
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: coachApi.getNotifications,
    enabled: isOpen,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => coachApi.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: coachApi.markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-notification-bell]")) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const unreadCount = countData?.count ?? 0;
  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div className="relative" data-notification-bell="">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 text-secondary hover:text-primary transition-colors"
        aria-label="Notifications"
      >
        {/* Bell icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none pointer-events-none">
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[480px] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 sticky top-0 bg-zinc-900">
            <span className="font-heading font-bold text-text text-sm">Notifications</span>
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="text-xs text-secondary hover:text-primary transition-colors disabled:opacity-50"
            >
              Mark all read
            </button>
          </div>

          {/* List */}
          {!notifications || notifications.length === 0 ? (
            <div className="p-8 text-center text-secondary text-sm">No notifications yet</div>
          ) : (
            notifications.map((n: Notification) => (
              <div
                key={n.id}
                className={[
                  "px-4 py-3 border-b border-zinc-800 cursor-pointer hover:bg-zinc-800/50 transition-colors border-l-4",
                  n.notification_type === "rehab_assigned"
                    ? "border-l-green-500"
                    : "border-l-amber-400",
                  !n.is_read ? "bg-zinc-800/30" : "",
                ].join(" ")}
                onClick={() => {
                  if (!n.is_read) markRead.mutate(n.id);
                }}
              >
                <p className="font-bold text-text text-sm">{n.athlete_name}</p>
                <p className="text-secondary text-xs mt-1 leading-relaxed">{n.message}</p>
                <p className="text-zinc-500 text-xs mt-1.5">{relativeTime(n.created_at)}</p>

                {/* Action buttons — stop propagation so they don't trigger mark-read */}
                <div
                  className="mt-2.5 flex gap-2 flex-wrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  {n.notification_type === "rehab_assigned" && (
                    <Link
                      href={`/coach/athletes/${n.athlete_id}`}
                      className="text-xs text-primary hover:underline font-medium"
                      onClick={() => setIsOpen(false)}
                    >
                      View Athlete →
                    </Link>
                  )}
                  {n.notification_type === "injury_no_rehab" && (
                    <>
                      <Link
                        href={`/coach/athletes/${n.athlete_id}`}
                        className="text-xs px-2.5 py-1 rounded bg-secondary/20 text-text hover:bg-secondary/30 transition-colors font-medium"
                        onClick={() => setIsOpen(false)}
                      >
                        Assign Program
                      </Link>
                      <Link
                        href={`/coach/programs/create?type=rehab${n.body_region ? `&body_region=${n.body_region}` : ""}`}
                        className="text-xs px-2.5 py-1 rounded bg-amber-400/20 text-amber-400 hover:bg-amber-400/30 transition-colors font-medium"
                        onClick={() => setIsOpen(false)}
                      >
                        Create Rehab Program
                      </Link>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? "text-primary bg-primary/10"
          : "text-text hover:text-primary"
      }`}
    >
      {label}
    </Link>
  );
}
