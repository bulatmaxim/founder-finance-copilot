"use client";

import { useCallback, useEffect, useState } from "react";
import { Toast, type ToastMessage } from "@/components/Toast";
import {
  getDemoWorkspaceStatus,
  loadDemoCompanyData,
} from "@/lib/demoCompany";
import { hydrateLocalDataFromSupabase } from "@/lib/supabase/hydrateLocalData";

type DemoCompanyLoaderProps = {
  compact?: boolean;
  onLoaded?: () => void;
};

export function DemoCompanyLoader({
  compact = false,
  onLoaded,
}: DemoCompanyLoaderProps) {
  const [hasExistingData, setHasExistingData] = useState(false);
  const [hasDemoData, setHasDemoData] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const loadStatus = useCallback(async () => {
    setIsLoadingStatus(true);

    try {
      const status = await getDemoWorkspaceStatus();

      setHasExistingData(status.hasExistingData);
      setHasDemoData(status.hasDemoData);
      setCompanyName(status.companyName);
    } catch (error) {
      console.error("Demo workspace status failed", error);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadStatus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadStatus]);

  async function handleConfirmLoad() {
    setIsLoadingDemo(true);

    try {
      const result = await loadDemoCompanyData();

      await hydrateLocalDataFromSupabase();
      await loadStatus();
      setToast({
        id: Date.now(),
        type: "success",
        title: "Demo company loaded.",
        detail: `${result.companyName} now has ${result.rowsSeeded.toLocaleString()} demo rows, approved close data for Apr 2026, and ${result.forecastVersionName}.`,
      });
      setShowConfirm(false);
      onLoaded?.();
    } catch (error) {
      console.error("Demo company load failed", error);
      setToast({
        id: Date.now(),
        type: "error",
        title: "Demo company could not be loaded.",
        detail: error instanceof Error ? error.message : "Check Supabase setup and try again.",
      });
    } finally {
      setIsLoadingDemo(false);
    }
  }

  return (
    <>
      <Toast message={toast} onClose={() => setToast(null)} />

      <section
        className={
          compact
            ? "premium-notice rounded-2xl px-4 py-3"
            : "premium-card rounded-2xl p-5"
        }
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200/70">
              Demo Workspace
            </p>
            <h2 className="mt-2 text-base font-semibold text-[color:var(--text-strong)]">
              Load Demo Company
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
              Populate this workspace with Northstar Analytics, a fictional
              Series A B2B SaaS/data infrastructure company with approved close
              data, account mappings, forecasts, a CFO Brief, and a ready report.
            </p>
            <p className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
              Demo data is labeled as Demo Data. Existing real data is not
              deleted, but loading demo data updates the current workspace and
              Apr 2026 Data Room state after confirmation.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:min-w-56">
            <button
              type="button"
              disabled={isLoadingStatus || isLoadingDemo}
              onClick={() => setShowConfirm(true)}
              className="h-10 rounded-xl bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isLoadingDemo ? "Loading demo..." : "Load Demo Company"}
            </button>
            <p className="text-xs leading-5 text-[color:var(--text-muted)]">
              {hasDemoData
                ? "Demo data is already present. Loading again refreshes demo records."
                : hasExistingData
                  ? "Existing workspace data detected."
                  : companyName
                    ? `Current workspace: ${companyName}.`
                    : "A company profile will be created if needed."}
            </p>
          </div>
        </div>
      </section>

      {showConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="premium-card w-full max-w-xl rounded-3xl p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200/70">
              Confirm Demo Load
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[color:var(--text-strong)]">
              Load Northstar Analytics demo data?
            </h2>
            <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
              Demo data will be added to the current workspace and the company
              profile will be set to Northstar Analytics. Apr 2026 Data Room
              checklist items will point to demo uploads so dashboards,
              forecasts, CFO Briefs, and reports populate immediately.
            </p>
            {hasExistingData ? (
              <div className="premium-warning mt-4 rounded-2xl border px-4 py-3 text-sm">
                Existing workspace data was detected. This will not delete your
                real records, but it will update the current company profile and
                Apr 2026 demo close state.
              </div>
            ) : null}
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-[color:var(--text-muted)]">
              Clear Demo Data is not shown because the demo load intentionally
              touches the current workspace state. Replace demo data by uploading
              and approving real company files in the Data Room.
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isLoadingDemo}
                onClick={() => setShowConfirm(false)}
                className="h-10 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm font-medium text-[color:var(--text-strong)] hover:border-sky-300/30 hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isLoadingDemo}
                onClick={() => void handleConfirmLoad()}
                className="h-10 rounded-xl bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isLoadingDemo ? "Loading..." : "Confirm and Load Demo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
