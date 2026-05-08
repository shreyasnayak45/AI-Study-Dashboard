"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { GraduationCap, ChevronUp, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/constants/nav";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ProfileDropdown } from "@/components/profile/ProfileDropdown";
import type { User, UserProfile } from "@/types";

interface SidebarProps {
  user:    User;
  profile: UserProfile | null;
}

export function Sidebar({ user, profile }: SidebarProps) {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen,   setMobileOpen]   = useState(false);

  const displayName =
    profile?.display_name ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "Student";

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <>
      {/* ── Mobile top bar — hamburger + logo + avatar ─────────────── */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.06] bg-surface-800/90 px-4 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/55 hover:bg-white/[0.06] hover:text-white/80"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 ring-1 ring-brand-500/25">
            <GraduationCap className="h-4 w-4 text-brand-400" />
          </div>
          <span className="text-sm font-semibold text-white">StudyFlow</span>
        </div>

        <UserAvatar
          avatarUrl={profile?.avatar_url}
          displayName={displayName}
          email={user.email}
          size="sm"
        />
      </header>

      {/* ── Backdrop — tap outside to close drawer ──────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* ── Sidebar / Drawer ────────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-72 shrink-0 flex-col",
          "border-r border-white/[0.06] bg-surface-800/95 backdrop-blur-xl",
          "will-change-transform transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: static in the normal flow, always visible
          "lg:relative lg:w-60 lg:translate-x-0 lg:bg-surface-800/80"
        )}
      >
        {/* Mobile close button */}
        <button
          type="button"
          onClick={closeMobile}
          className="absolute right-3 top-3.5 flex h-8 w-8 items-center justify-center rounded-xl text-white/35 hover:bg-white/[0.06] hover:text-white/60 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 ring-1 ring-brand-500/25">
            <GraduationCap className="h-5 w-5 text-brand-400" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">StudyFlow</p>
            <p className="truncate text-xs text-white/35">AI Dashboard</p>
          </div>
        </div>

        <div className="mx-4 h-px bg-white/[0.05]" />

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150",
                  isActive
                    ? "bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/15"
                    : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"
                )}
              >
                <item.icon
                  className={cn(
                    "h-[17px] w-[17px] shrink-0",
                    isActive ? "text-brand-400" : "text-white/35 group-hover:text-white/55"
                  )}
                />
                <span className="truncate">{item.label}</span>
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section — click to open profile dropdown */}
        <div className="relative border-t border-white/[0.05] p-3">
          <ProfileDropdown
            user={user}
            profile={profile}
            isOpen={dropdownOpen}
            onClose={() => setDropdownOpen(false)}
          />

          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors",
              dropdownOpen ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
            )}
          >
            <UserAvatar
              avatarUrl={profile?.avatar_url}
              displayName={displayName}
              email={user.email}
              size="sm"
              priority
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white/75">{displayName}</p>
              <p className="truncate text-xs text-white/35">{user.email}</p>
            </div>
            <ChevronUp
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-white/20 transition-transform duration-200",
                dropdownOpen ? "rotate-0" : "rotate-180"
              )}
            />
          </button>
        </div>
      </aside>
    </>
  );
}
