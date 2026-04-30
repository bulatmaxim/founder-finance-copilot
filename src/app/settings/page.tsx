"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DemoCompanyLoader } from "@/components/DemoCompanyLoader";
import { ThemeControls } from "@/components/ThemeControls";
import { Toast, type ToastMessage } from "@/components/Toast";
import { clearAllLocalAppData } from "@/lib/localDataStore";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";

type ResetSummary = {
  databaseRecordsCleared: number;
  storageDeletedCount: number;
  localCacheCleared: boolean;
  companyProfileReset: boolean;
  warnings: string[];
};

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("Development user");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetCompanyProfile, setResetCompanyProfile] = useState(false);
  const [resetSummary, setResetSummary] = useState<ResetSummary | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    async function loadUser() {
      if (!hasSupabaseBrowserEnv()) {
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setEmail(user?.email ?? "Not logged in");
    }

    void loadUser();
  }, []);

  async function clearCompanyData() {
    if (resetPhrase !== "CLEAR COMPANY DATA") {
      return;
    }

    setIsResetting(true);

    try {
      const response = await fetch("/api/company/clear-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          confirmation: resetPhrase,
          resetCompanyProfile,
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        warnings?: string[];
        storageDeletedCount?: number;
        deletedTables?: string[];
        companyProfileReset?: boolean;
      };

      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "Workspace reset failed.");
      }

      clearAllLocalAppData();
      setResetSummary({
        databaseRecordsCleared: body.deletedTables?.length ?? 0,
        storageDeletedCount: body.storageDeletedCount ?? 0,
        localCacheCleared: true,
        companyProfileReset: Boolean(body.companyProfileReset),
        warnings: body.warnings ?? [],
      });
      setToast({
        id: Date.now(),
        type: body.warnings?.length ? "warning" : "success",
        title: "Workspace data cleared.",
        detail: body.warnings?.length
          ? body.warnings.join(" ")
          : "You now have a fresh workspace.",
      });
      setShowResetModal(false);
      setResetPhrase("");
      setResetCompanyProfile(false);
      router.refresh();
      router.push(body.companyProfileReset ? "/company-profile" : "/dashboard");
    } catch (error) {
      setToast({
        id: Date.now(),
        type: "error",
        title: "Could not clear company data.",
        detail: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <section className="space-y-6">
      <Toast message={toast} onClose={() => setToast(null)} duration={7000} />

      <div className="premium-card rounded-3xl p-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200/70">
          Settings
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[color:var(--text-strong)]">
          Workspace Settings
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          One account maps to one company finance workspace.
        </p>
      </div>

      <section className="premium-card rounded-2xl p-5">
        <h2 className="text-base font-semibold text-[color:var(--text-strong)]">Appearance</h2>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
          Choose how Founder Finance Copilot looks on this device.
        </p>
        <div className="mt-5">
          <ThemeControls />
        </div>
      </section>

      <DemoCompanyLoader />

      <section className="premium-card rounded-2xl p-5">
        <h2 className="text-base font-semibold text-[color:var(--text-strong)]">Account</h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-[color:var(--text-muted)]">Logged-in user</dt>
            <dd className="mt-2 text-lg font-semibold text-[color:var(--text-strong)]">{email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-[color:var(--text-muted)]">Workspace model</dt>
            <dd className="mt-2 text-lg font-semibold text-[color:var(--text-strong)]">Single company</dd>
          </div>
        </dl>
        <div className="mt-6">
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="premium-pill inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium hover:border-sky-300/30 hover:bg-sky-300/10"
            >
              Log out
            </button>
          </form>
        </div>
      </section>

      <section className="premium-card rounded-2xl border border-red-500/25 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-red-300/80">
              Danger Zone
            </p>
            <h2 className="mt-2 text-base font-semibold text-[color:var(--text-strong)]">
              Clear All Company Data
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
              Reset this workspace for testing without deleting your Supabase
              authenticated user or signing you out.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setResetSummary(null);
              setShowResetModal(true);
            }}
            className="h-10 rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-sm font-medium text-red-100 hover:bg-red-500/15"
          >
            Clear All Company Data
          </button>
        </div>
      </section>

      {resetSummary ? (
        <section className="premium-card rounded-2xl p-5">
          <h2 className="text-base font-semibold text-[color:var(--text-strong)]">
            Reset Summary
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ResetMetric label="Database tables cleared" value={String(resetSummary.databaseRecordsCleared)} />
            <ResetMetric label="Local cached data" value={resetSummary.localCacheCleared ? "Cleared" : "Not cleared"} />
            <ResetMetric label="Storage files cleared" value={String(resetSummary.storageDeletedCount)} />
            <ResetMetric label="Company profile reset" value={resetSummary.companyProfileReset ? "Yes" : "No"} />
          </div>
          {resetSummary.warnings.length > 0 ? (
            <div className="premium-warning mt-4 rounded-2xl border px-4 py-3 text-sm">
              {resetSummary.warnings.join(" ")}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="premium-card rounded-2xl p-5">
        <h2 className="text-base font-semibold text-[color:var(--text-strong)]">Development Note</h2>
        <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
          If Supabase environment variables are missing, the app keeps using
          local prototype data and localStorage fallbacks.
        </p>
      </section>

      {showResetModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <section className="premium-card w-full max-w-2xl rounded-3xl border border-red-500/25 p-6">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-red-300/80">
              Dangerous action
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--text-strong)]">
              Clear All Company Data?
            </h2>
            <p className="mt-4 text-sm leading-6 text-[color:var(--text-muted)]">
              This will permanently delete uploaded files, staged rows,
              mappings, forecasts, reports, AI briefs, decision memos, monthly
              close data, and manually entered data for this company. This
              cannot be undone.
            </p>
            <label className="mt-5 block">
              <span className="text-sm font-medium text-[color:var(--text-soft)]">
                Type CLEAR COMPANY DATA to confirm
              </span>
              <input
                value={resetPhrase}
                onChange={(event) => setResetPhrase(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border px-3 text-sm outline-none"
                autoComplete="off"
              />
            </label>
            <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[color:var(--line-soft)] bg-[color:var(--surface-soft)] p-4">
              <input
                type="checkbox"
                checked={resetCompanyProfile}
                onChange={(event) => setResetCompanyProfile(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-semibold text-[color:var(--text-strong)]">
                  Also reset company profile
                </span>
                <span className="mt-1 block text-sm leading-6 text-[color:var(--text-muted)]">
                  Clears demo profile values like Northstar Analytics and sends
                  you to Company Profile after the reset.
                </span>
              </span>
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => {
                  setShowResetModal(false);
                  setResetPhrase("");
                  setResetCompanyProfile(false);
                }}
                className="premium-pill h-10 rounded-xl px-4 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetPhrase !== "CLEAR COMPANY DATA" || isResetting}
                onClick={() => void clearCompanyData()}
                className="h-10 rounded-xl bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isResetting ? "Clearing..." : "Permanently Clear Data"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ResetMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="premium-pill rounded-2xl px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[color:var(--text-strong)]">
        {value}
      </p>
    </article>
  );
}
