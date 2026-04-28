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
  updateMonthlyCloseItemStatus,
  uploadMonthlyCloseFile,
  type MonthlyCloseCategory,
  type MonthlyCloseItem,
  type MonthlyCloseStatus,
} from "@/lib/monthlyClose";

export default function DataRoomPage() {
  const reportingMonths = useMemo(() => getReportingMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(
    reportingMonths[reportingMonths.length - 1]?.value ?? "2026-04-01",
  );
  const [items, setItems] = useState<MonthlyCloseItem[]>([]);
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
      } catch (error) {
        console.error("Data Room load failed", error);
        setItems([]);
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
      setCompanyName(result.company.name);
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

  return (
    <section className="space-y-8">
      <Toast message={toast} onClose={() => setToast(null)} />

      <div className="rounded-md border border-neutral-200 bg-white p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
              Data Room
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Monthly Close Data Room
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              Upload, validate, and approve monthly financial data before
              reports and CFO insights are generated.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[620px]">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
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
              <p className="text-sm font-medium text-neutral-700">Company</p>
              <div className="mt-2 flex h-10 items-center rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm font-medium text-neutral-950">
                {companyName || "Company profile required"}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-neutral-700">Close status</p>
              <div className="mt-2 flex h-10 items-center rounded-md border border-neutral-200 bg-neutral-50 px-3">
                <span className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-950">
                  {isLoading ? "Loading" : overallStatus}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-neutral-100 pt-4 text-sm text-neutral-500">
          Selected period: {reportingMonthKey(selectedMonth)}
        </div>
      </div>

      {isLoading ? (
        <section className="rounded-md border border-neutral-200 bg-white p-6">
          <p className="text-sm text-neutral-500">Loading monthly close checklist...</p>
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
          />
          <DataQualityPanel
            issues={validationIssues}
            isLoading={Boolean(uploadingCategory)}
          />
        </>
      )}
    </section>
  );
}
