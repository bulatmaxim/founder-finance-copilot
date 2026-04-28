"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { sampleCompany } from "@/data/sampleCompany";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";

export function TopBar() {
  const [companyName, setCompanyName] = useState(sampleCompany.name);

  useEffect(() => {
    async function loadCompanyName() {
      if (!hasSupabaseBrowserEnv()) {
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const { data } = await supabase
        .from("companies")
        .select("name")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (data?.name) {
        setCompanyName(data.name);
      }
    }

    void loadCompanyName();
  }, []);

  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[#05080d]/[0.82] px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10 xl:px-12">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/70">
            Finance cockpit
          </p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-slate-50">
            Founder Finance Copilot
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {companyName}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="font-medium text-slate-100">
              Current Reporting Period: Latest Month
            </p>
            <p className="mt-1 text-slate-500">Single-company workspace</p>
          </div>
          <Link
            href="/logout"
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm font-medium text-slate-200 hover:border-sky-300/30 hover:bg-sky-300/10 hover:text-sky-50"
          >
            Log out
          </Link>
        </div>
      </div>
    </header>
  );
}
