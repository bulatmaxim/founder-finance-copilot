"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <aside className="border-b border-white/10 bg-[#05080d]/95 backdrop-blur-xl lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col gap-5 px-4 py-4 lg:px-5 lg:py-6">
        <Link href="/dashboard" className="hidden lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-300/10 text-sm font-semibold text-sky-200 shadow-[0_0_34px_rgba(56,189,248,0.18)]">
              FF
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Founder Finance
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-slate-50">
                Copilot
              </p>
            </div>
          </div>
        </Link>

        <div className="hidden rounded-2xl border border-white/10 bg-white/[0.035] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:block">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Workspace
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-100">
            Single-company CFO OS
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-sky-300 to-cyan-500" />
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0">
          {navigationGroups.map((group) => (
            <div key={group.label} className="flex shrink-0 gap-2 lg:flex-col">
              <p className="hidden px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 lg:block">
                {group.label}
              </p>
              <div className="flex gap-2 lg:flex-col">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex h-10 shrink-0 items-center gap-3 rounded-2xl border px-3 text-sm font-medium ${
                        isActive
                          ? "border-sky-300/30 bg-sky-300/[0.12] text-sky-50 shadow-[0_0_28px_rgba(56,189,248,0.12)]"
                          : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.045] hover:text-slate-100"
                      }`}
                    >
                      <span
                        className={`hidden h-6 w-7 items-center justify-center rounded-lg border text-[10px] font-semibold lg:flex ${
                          isActive
                            ? "border-sky-300/30 bg-sky-300/15 text-sky-200"
                            : "border-white/10 bg-white/[0.03] text-slate-500 group-hover:text-slate-300"
                        }`}
                      >
                        {item.code}
                      </span>
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.055] to-white/[0.02] p-4 lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Close Readiness
          </p>
          <p className="mt-2 text-sm leading-5 text-slate-300">
            Approved data powers dashboards, forecasts, briefs, and reports.
          </p>
        </div>
      </div>
    </aside>
  );
}
