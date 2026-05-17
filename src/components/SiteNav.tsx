"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  Briefcase,
  User,
  Bot,
  Code,
  LayoutDashboard,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { useMobileFilters } from "@/components/MobileFilters";
import { ThemeToggle } from "@/components/ThemeToggle";

interface Props {
  authed: boolean;
  isAdmin: boolean;
  username: string | null;
}

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/open-work", label: "Open Work", icon: Briefcase },
  { href: "/human-readme", label: "Human Readme", icon: User },
  { href: "/ai-readme", label: "AI Readme", icon: Bot },
  { href: "/docs", label: "API", icon: Code },
];

export function SiteNav({ authed, isAdmin, username }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMobileFilters();
  const showFilterToggle = pathname === "/open-work";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => setOpen(false);

  // The menu and the search/filter drawer are mutually exclusive on mobile -
  // opening one closes the other so they never overlay.
  function toggleMenu() {
    setOpen((o) => {
      if (!o) filters.close();
      return !o;
    });
  }
  function toggleFilters() {
    if (!filters.open) setOpen(false);
    filters.toggle();
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/v1/logout", { method: "POST", credentials: "include" });
      close();
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="nav-actions">
        <ThemeToggle />
        {showFilterToggle && (
          <button
            type="button"
            className={filters.open ? "nav-toggle filters-toggle on" : "nav-toggle filters-toggle"}
            aria-label={filters.open ? "Hide search & filters" : "Show search & filters"}
            aria-expanded={filters.open}
            onClick={toggleFilters}
          >
            <Search size={20} aria-hidden />
          </button>
        )}
        <button
          type="button"
          className="nav-toggle menu-toggle"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={toggleMenu}
        >
          <span className={open ? "nav-toggle-bars open" : "nav-toggle-bars"}>
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      <nav className={open ? "site-nav open" : "site-nav"} aria-label="primary">
        {LINKS.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.href} href={l.href} onClick={close} className="nav-link">
              <Icon size={16} aria-hidden />
              {l.label}
            </Link>
          );
        })}

        {authed ? (
          <>
            <Link href={isAdmin ? "/admin" : "/me"} onClick={close} className="nav-link">
              {isAdmin ? <Shield size={16} aria-hidden /> : <LayoutDashboard size={16} aria-hidden />}
              {isAdmin ? "Admin" : "Dashboard"}
            </Link>
            {username && <span className="nav-user">@{username}</span>}
            <button
              type="button"
              className="nav-cta"
              onClick={signOut}
              disabled={busy}
            >
              {busy ? "…" : "Sign out"}
            </button>
          </>
        ) : (
          <Link href="/signup" className="nav-cta" onClick={close}>
            Sign up
          </Link>
        )}
      </nav>
    </>
  );
}
