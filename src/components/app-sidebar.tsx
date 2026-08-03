"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Nav model. Icons from the Marmik set are not in the handoff bundle, so items
// use a small reticle tick marker + label (the handoff's sanctioned fallback).
// Drop real SVGs into public/brand/icons and swap the marker when available.
const NAV: { label: string; href: string }[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Timesheet", href: "/timesheet" },
  { label: "Approvals", href: "/approvals" },
  { label: "Expenses", href: "/expenses" },
  { label: "Projects", href: "/projects" },
  { label: "Invoices", href: "/invoices" },
  { label: "Reports", href: "/reports" },
  { label: "Clients", href: "/clients" },
  { label: "Resources", href: "/resources" },
  { label: "Indirect codes", href: "/indirect-codes" },
  { label: "Import", href: "/import" },
  { label: "Connections", href: "/connections" },
  { label: "Entities", href: "/entities" },
];

// A tiny reticle logo mark (placeholder for the Marmik logo.svg).
function Reticle() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="8" stroke="var(--bone)" strokeWidth="1.4" />
      <path d="M11 1v6M11 15v6M1 11h6M15 11h6" stroke="var(--acid)" strokeWidth="1.4" />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function AppSidebar({
  switcher,
  userName,
  role,
  counts,
}: {
  switcher: ReactNode;
  userName: string;
  role: string;
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const statusWord =
    role === "owner" || role === "admin"
      ? "reviewing"
      : role === "manager"
        ? "reviewing"
        : "logging";

  return (
    <aside className="sticky top-0 flex h-screen w-[244px] shrink-0 flex-col border-r border-line bg-graphite">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-4">
        <Reticle />
        <div>
          <div className="font-display text-[15px] font-bold tracking-[-0.02em] text-bone">
            HoldCo OS
          </div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-alum-2 uppercase">
            rev_02
          </div>
        </div>
      </div>

      {switcher}

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-3">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const count = counts?.[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors duration-150 ${
                active
                  ? "bg-steel text-bone"
                  : "text-alum hover:bg-steel/50 hover:text-bone"
              }`}
            >
              <span
                className={`h-[6px] w-[6px] shrink-0 rounded-[1px] ${
                  active ? "bg-acid" : "bg-alum-2 group-hover:bg-alum"
                }`}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {count !== undefined && count > 0 && (
                <span
                  className={`font-mono text-[10px] ${active ? "text-acid" : "text-alum-2"}`}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <Link
        href="/account"
        className="flex items-center gap-2.5 border-t border-line px-[18px] py-3.5 transition-colors hover:bg-steel/50"
      >
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-line bg-steel font-mono text-[10px] text-alum">
          {initials(userName)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12.5px] text-bone">{userName}</div>
          <div className="font-mono text-[10px] tracking-[0.05em] text-alum-2 uppercase">
            {role}
          </div>
        </div>
      </Link>
      <div className="border-t border-line px-[18px] py-2 font-mono text-[10px] text-alum-2">
        {"// status: "}
        {statusWord}
      </div>
    </aside>
  );
}
