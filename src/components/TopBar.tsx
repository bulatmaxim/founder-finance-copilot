"use client";

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
    <header className="premium-topbar sticky top-0 z-10 border-b py-4 pl-16 pr-5 backdrop-blur-xl sm:px-8 lg:px-10 xl:px-12">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/70">
            Finance cockpit
          </p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--text-strong)]">
            Founder Finance Copilot
          </p>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            {companyName}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="premium-pill rounded-2xl px-4 py-3 text-sm">
            <p className="font-medium text-[color:var(--text-strong)]">
              Current Reporting Period: Latest Month
            </p>
            <p className="mt-1 text-[color:var(--text-muted)]">Single-company workspace</p>
          </div>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="premium-pill inline-flex h-10 items-center justify-center rounded-2xl px-4 text-sm font-medium hover:border-sky-300/30 hover:bg-sky-300/10"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
