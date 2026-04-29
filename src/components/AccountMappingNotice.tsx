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

  if (
    !summary ||
    (summary.unmappedAccounts === 0 &&
      summary.suggestedAccounts === 0 &&
      summary.needsReview === 0)
  ) {
    return null;
  }

  return (
    <div className="premium-notice rounded-2xl px-4 py-3 text-sm">
      <div className="flex items-start gap-3">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-300 shadow-[0_0_16px_rgba(125,211,252,0.7)]" />
        <span>
          {summary.unmappedAccounts > 0 ? (
            <>
              {summary.unmappedAccounts} account
              {summary.unmappedAccounts === 1 ? " is" : "s are"} unmapped.
            </>
          ) : null}{" "}
          {summary.suggestedAccounts > 0 ? (
            <>
              {summary.suggestedAccounts} account
              {summary.suggestedAccounts === 1 ? " has" : "s have"} suggested
              mappings pending save.
            </>
          ) : null}{" "}
          {summary.needsReview > 0 ? (
            <>
              {summary.needsReview} mapping
              {summary.needsReview === 1 ? " needs" : "s need"} review.
            </>
          ) : null}{" "}
          Reporting may be less accurate until mapping is completed.
        </span>
      </div>
    </div>
  );
}
