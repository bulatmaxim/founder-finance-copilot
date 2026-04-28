"use client";

import { useEffect, useState } from "react";
import {
  loadAccountMappingSummary,
  type AccountMappingSummary,
} from "@/lib/accountMapping";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/client";

export function AccountMappingNotice() {
  const [summary, setSummary] = useState<AccountMappingSummary | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSummary() {
      if (!hasSupabaseBrowserEnv()) {
        return;
      }

      try {
        const nextSummary = await loadAccountMappingSummary();

        if (isMounted) {
          setSummary(nextSummary);
        }
      } catch (error) {
        console.error("Account mapping summary failed", error);
      }
    }

    void loadSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!summary || (summary.unmappedAccounts === 0 && summary.needsReview === 0)) {
    return null;
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
      {summary.unmappedAccounts > 0 ? (
        <>
          {summary.unmappedAccounts} account
          {summary.unmappedAccounts === 1 ? " is" : "s are"} unmapped.
        </>
      ) : null}{" "}
      {summary.needsReview > 0 ? (
        <>
          {summary.needsReview} mapping
          {summary.needsReview === 1 ? " needs" : "s need"} review.
        </>
      ) : null}{" "}
      Reporting may be less accurate until mapping is completed.
    </div>
  );
}
