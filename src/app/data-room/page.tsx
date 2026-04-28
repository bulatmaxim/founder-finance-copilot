"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataQualityPanel } from "@/components/data-room/DataQualityPanel";
import { MonthlyCloseChecklist } from "@/components/data-room/MonthlyCloseChecklist";
import { MonthlyCloseSummaryCards } from "@/components/data-room/MonthlyCloseSummaryCards";
import { Toast, type ToastMessage, type ToastType } from "@/components/Toast";
import {
  collectValidationIssues,
  formatReportingMonth,
  getOverallCloseStatus,
  getReportingMonthOptions,
  loadMonthlyCloseItems,
  reportingMonthKey,
  removeMonthlyCloseFile,
  updateMonthlyCloseItemStatus,
  uploadMonthlyCloseFile,
  type MonthlyCloseActivity,
  type MonthlyCloseCategory,
  type MonthlyCloseItem,
  type MonthlyCloseStatus,
} from "@/lib/monthlyClose";
import { hydrateLocalDataFromSupabase } from "@/lib/supabase/hydrateLocalData";

export default function DataRoomPage() {
  const reportingMonths = useMemo(() => getReportingMonthOptions(), []);
  const currentReportingMonth = useMemo(() => {
    const today = new Date();

    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0",
    )}-01`;
  }, []);
  const [selectedMonth, setSelectedMonth] = useState(
    currentReportingMonth,
  );
  const [items, setItems] = useState<MonthlyCloseItem[]>([]);
  const [activity, setActivity] = useState<MonthlyCloseActivity[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingCategory, setUploadingCategory] =
    useState<MonthlyCloseCategory | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const validationIssues = useMemo(() => collectValidationIssues(items), [items]);
  const overallStatus = getOverallCloseStatus(items);

  const notify = useCallback((type: ToastType, title: string, detail?: string) => {
    setToast({ id: Date.now(), type, title, detail });
  }, []);

  const loadChecklist = useCallback(
    async (reportingMonth: string) => {
      setIsLoading(true);

      try {
        const result = await loadMonthlyCloseItems(reportingMonth);
        setCompanyName(result.company.name);
        setItems(result.items);
        setActivity(result.activity);
      } catch (error) {
        console.error("Data Room load failed", error);
        setItems([]);
        setActivity([]);
        notify(
          "error",
          "Monthly close checklist could not be loaded.",
          error instanceof Error ? error.message : "Check Supabase setup and auth.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadChecklist(selectedMonth);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadChecklist, selectedMonth]);

  async function handleUpload(category: MonthlyCloseCategory, file: File) {
    if (!selectedMonth) {
      notify("error", "Select a reporting month before uploading.");
      return;
    }

    setUploadingCategory(category);

    try {
      const result = await uploadMonthlyCloseFile({
        reportingMonth: selectedMonth,
        fileCategory: category,
        file,
      });
      setItems(result.items);
      setActivity(result.activity);
      setCompanyName(result.company.name);
      await hydrateLocalDataFromSupabase();
      notify(
        "success",
        "File uploaded.",
        `${file.name} was saved for ${formatReportingMonth(selectedMonth)}.`,
      );
    } catch (error) {
      console.error("Data Room upload failed", error);
      notify(
        "error",
        "Upload failed.",
        error instanceof Error ? error.message : "Check the file and try again.",
      );
    } finally {
      setUploadingCategory(null);
    }
  }

  async function handleStatusChange(
    item: MonthlyCloseItem,
    status: Exclude<MonthlyCloseStatus, "Not uploaded">,
  ) {
    setSavingItemId(item.id);

    try {
      const result = await updateMonthlyCloseItemStatus({ item, status });
      setItems(result.items);
      setActivity(result.activity);
      await hydrateLocalDataFromSupabase();
      notify("success", `Marked ${status}.`);
    } catch (error) {
      console.error("Monthly close status update failed", error);
      notify(
        "error",
        "Status update failed.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleRemove(item: MonthlyCloseItem) {
    if (!item.uploaded_file_id) {
      notify("info", "No uploaded file to remove.");
      return;
    }

    const confirmed = window.confirm(
      `Remove ${item.file_name ?? "this file"} from the monthly close checklist? Parsed dashboard data will not be deleted.`,
    );

    if (!confirmed) {
      return;
    }

    setSavingItemId(item.id);

    try {
      const result = await removeMonthlyCloseFile(item);
      setItems(result.items);
      setActivity(result.activity);
      await hydrateLocalDataFromSupabase();
      notify("success", "File removed from checklist.");
    } catch (error) {
      console.error("Monthly close file removal failed", error);
      notify(
        "error",
        "Remove file failed.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSavingItemId(null);
    }
  }

  return (
    <section className="space-y-8">
      <Toast message={toast} onClose={() => setToast(null)} />

      <div className="premium-card overflow-hidden rounded-3xl p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200/70">
              Data Room
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-50">
              Monthly Close Data Room
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Upload, validate, and approve monthly financial data before
              reports and CFO insights are generated.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[620px]">
            <label className="block">
              <span className="text-sm font-medium text-slate-300">
                Reporting month
              </span>
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950"
              >
                {reportingMonths.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="text-sm font-medium text-slate-300">Company</p>
              <div className="premium-pill mt-2 flex h-10 items-center rounded-xl px-3 text-sm font-medium">
                {companyName || "Company profile required"}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-300">Close status</p>
              <div className="premium-pill mt-2 flex h-10 items-center rounded-xl px-3">
                <span className="rounded-xl border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-xs font-medium text-sky-100">
                  {isLoading ? "Loading" : overallStatus}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4 text-sm text-slate-500">
          Selected period: {reportingMonthKey(selectedMonth)}
        </div>
      </div>

      {isLoading ? (
        <section className="premium-card rounded-2xl p-6">
          <div className="premium-skeleton h-16 rounded-2xl border border-white/10" />
        </section>
      ) : (
        <>
          <MonthlyCloseSummaryCards items={items} />
          <MonthlyCloseChecklist
            items={items}
            reportingMonth={selectedMonth}
            uploadingCategory={uploadingCategory}
            savingItemId={savingItemId}
            onUpload={(category, file) => void handleUpload(category, file)}
            onStatusChange={(item, status) =>
              void handleStatusChange(item, status)
            }
            onRemove={(item) => void handleRemove(item)}
          />
          <DataQualityPanel
            issues={validationIssues}
            isLoading={Boolean(uploadingCategory)}
          />
          <RecentActivity activity={activity} />
        </>
      )}
    </section>
  );
}

function RecentActivity({ activity }: { activity: MonthlyCloseActivity[] }) {
  return (
    <section className="premium-card overflow-hidden rounded-2xl">
      <div className="premium-panel-header px-5 py-4">
        <h2 className="text-base font-semibold text-slate-50">Recent Activity</h2>
        <p className="mt-1 text-sm text-slate-400">
          Data Room actions for the selected reporting month.
        </p>
      </div>
      <div className="p-5">
        {activity.length === 0 ? (
          <p className="text-sm text-slate-400">
            No Data Room activity has been recorded for this month yet.
          </p>
        ) : (
          <div className="divide-y divide-white/10">
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-100">
                    {formatAction(item.action)}
                  </p>
                  <p className="mt-1 text-slate-500">
                    {String(item.details?.file_name ?? item.file_category)}
                  </p>
                </div>
                <p className="text-slate-500">{formatActivityDate(item.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function formatAction(action: string) {
  const labels: Record<string, string> = {
    uploaded_file: "Uploaded file",
    replaced_file: "Replaced file",
    removed_file: "Removed file",
    marked_needs_review: "Marked needs review",
    approved_file: "Approved file",
  };

  return labels[action] ?? action;
}

function formatActivityDate(value: string | null) {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
