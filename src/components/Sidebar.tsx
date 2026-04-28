"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navigationGroups = [
  {
    label: "Operate",
    items: [
      { name: "Dashboard", href: "/dashboard", code: "DB" },
      { name: "Data Room", href: "/data-room", code: "DR" },
      { name: "Uploads", href: "/uploads", code: "UP" },
      { name: "Account Mapping", href: "/account-mapping", code: "AM" },
    ],
  },
  {
    label: "Plan",
    items: [
      { name: "Budget vs Actuals", href: "/budget-vs-actuals", code: "BA" },
      { name: "Forecasts", href: "/forecasts", code: "FC" },
      { name: "Forecast Versions", href: "/forecast-versions", code: "FV" },
      { name: "Decision Center", href: "/decision-center", code: "DC" },
    ],
  },
  {
    label: "Publish",
    items: [
      { name: "Reports", href: "/reports", code: "RP" },
      { name: "Company Profile", href: "/company-profile", code: "CP" },
      { name: "Settings", href: "/settings", code: "ST" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        aria-label="Open navigation"
        className="premium-sidebar-panel fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold lg:hidden"
      >
        FF
      </button>

      {isMobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <aside
        className={`premium-sidebar fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-2rem))] max-w-80 flex-col border-r backdrop-blur-xl transition-transform duration-200 lg:z-20 lg:w-72 lg:max-w-[18rem] lg:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent onClose={() => setIsMobileOpen(false)} pathname={pathname} />
      </aside>
    </>
  );
}

function SidebarContent({
  onClose,
  pathname,
}: {
  onClose: () => void;
  pathname: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 lg:px-5 lg:py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="flex min-w-0 items-center gap-3"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-300/25 bg-sky-300/10 text-sm font-semibold text-sky-300 shadow-[0_0_34px_rgba(56,189,248,0.16)]">
            FF
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sidebar-muted)]">
              Founder Finance
            </p>
            <p className="mt-1 truncate text-xl font-semibold tracking-tight text-[color:var(--text-strong)]">
              Copilot
            </p>
          </div>
        </Link>
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="premium-sidebar-panel flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm lg:hidden"
        >
          X
        </button>
      </div>

      <div className="premium-sidebar-panel rounded-2xl p-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--sidebar-muted)]">
          Workspace
        </p>
        <p className="mt-2 text-sm font-semibold text-[color:var(--text-strong)]">
          Single-company CFO OS
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-3)]">
          <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-sky-300 to-cyan-500" />
        </div>
      </div>

      <nav className="flex flex-col gap-5">
        {navigationGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-2">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--sidebar-muted)]">
              {group.label}
            </p>
            <div className="flex flex-col gap-1.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`premium-nav-link flex min-h-10 items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium ${
                      isActive ? "premium-nav-link-active" : ""
                    }`}
                  >
                    <span
                      className={`premium-nav-code flex h-6 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold ${
                        isActive ? "premium-nav-code-active" : ""
                      }`}
                    >
                      {item.code}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="premium-sidebar-panel mt-auto rounded-2xl p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--sidebar-muted)]">
          Close Readiness
        </p>
        <p className="mt-2 text-sm leading-5 text-[color:var(--text-soft)]">
          Approved data powers dashboards, forecasts, briefs, and reports.
        </p>
      </div>
    </div>
  );
}
