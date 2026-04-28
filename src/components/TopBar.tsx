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
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xl font-semibold tracking-tight">
            Founder Finance Copilot
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {companyName}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm">
            <p className="font-medium text-neutral-950">
              Current Reporting Period: Latest Month
            </p>
            <p className="mt-1 text-neutral-500">Single-company workspace</p>
          </div>
          <Link
            href="/logout"
            className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50"
          >
            Log out
          </Link>
        </div>
      </div>
    </header>
  );
}
