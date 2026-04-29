"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Toast, type ToastMessage, type ToastType } from "@/components/Toast";
import {
  categoryLabel,
  createBlankYearlyDataEntryRow,
  loadYearlyDataEntryWorkspace,
  previewYearlyDataEntrySave,
  saveYearlyDataEntryRows,
  type DataEntryAdjustment,
  type YearlyDataEntryRow,
  type YearlyDataEntrySavePreview,
} from "@/lib/dataEntry";
import {
  monthlyCloseCategories,
  type MonthlyCloseCategory,
} from "@/lib/monthlyClose";

const monthLabels = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const priorityCategories: MonthlyCloseCategory[] = ["actuals", "budget", "cash"];

export default function DataEntryPage() {
  return (
    <Suspense fallback={<DataEntryLoading />}>
      <YearlyDataEntryWorkspace />
    </Suspense>
  );
}

function YearlyDataEntryWorkspace() {
  const searchParams = useSearchParams();
  const initialMonth = searchParams.get("month");
  const [reportingYear, setReportingYear] = useState(
    Number(searchParams.get("year")) ||
      Number(initialMonth?.slice(0, 4)) ||
      new Date().getFullYear(),
  );
  const [fileCategory, setFileCategory] = useState<MonthlyCloseCategory>(
    (searchParams.get("category") as MonthlyCloseCategory | null) || "actuals",
  );
  const [rows, setRows] = useState<YearlyDataEntryRow[]>([]);
  const [originalRows, setOriginalRows] = useState<YearlyDataEntryRow[]>([]);
  const [deletedRowIds, setDeletedRowIds] = useState<Set<string>>(new Set());
  const [adjustments, setAdjustments] = useState<DataEntryAdjustment[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [preview, setPreview] = useState<YearlyDataEntrySavePreview | null>(null);
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const monthKeys = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) =>
        `${reportingYear}-${String(index + 1).padStart(2, "0")}-01`,
      ),
    [reportingYear],
  );
  const hasUnsavedChanges =
    JSON.stringify(rows) !== JSON.stringify(originalRows) || deletedRowIds.size > 0;

  const notify = useCallback((type: ToastType, title: string, detail?: string) => {
    setToast({ id: Date.now(), type, title, detail });
  }, []);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);

    try {
      const workspace = await loadYearlyDataEntryWorkspace({
        reportingYear,
        fileCategory,
      });
      setRows(workspace.rows);
      setOriginalRows(workspace.rows);
      setDeletedRowIds(new Set());
      setAdjustments(workspace.adjustments);
      setCompanyName(workspace.companyName);
      setPreview(null);
    } catch (error) {
      console.error("Yearly Data Entry load failed", error);
      notify(
        "error",
        "Data Entry workspace could not be loaded.",
        error instanceof Error ? error.message : "Check Supabase setup.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [fileCategory, notify, reportingYear]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadWorkspace]);

  useEffect(() => {
    function warnIfUnsaved(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warnIfUnsaved);
    return () => window.removeEventListener("beforeunload", warnIfUnsaved);
  }, [hasUnsavedChanges]);

  function updateRow(rowId: string, patch: Partial<YearlyDataEntryRow>) {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  }

  function updateMonth(rowId: string, month: string, value: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? { ...row, months: { ...row.months, [month]: value } }
          : row,
      ),
    );
  }

  function addRow() {
    const row = createBlankYearlyDataEntryRow();
    row.months = Object.fromEntries(monthKeys.map((month) => [month, ""]));
    setRows((current) => [...current, row]);
  }

  function deleteRow(row: YearlyDataEntryRow) {
    if (!window.confirm(`Delete ${row.accountName || "this row"} from the worksheet?`)) {
      return;
    }

    setRows((current) => current.filter((item) => item.id !== row.id));
    if (!row.isNew) {
      setDeletedRowIds((current) => new Set([...current, row.id]));
    }
  }

  async function reviewSave() {
    try {
      setPreview(
        await previewYearlyDataEntrySave({
          originalRows,
          nextRows: rows,
          deletedRowIds,
          fileCategory,
        }),
      );
    } catch (error) {
      notify(
        "error",
        "Save preview failed.",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  }

  async function confirmSave() {
    if (!preview) return;

    setIsSaving(true);

    try {
      await saveYearlyDataEntryRows({
        reportingYear,
        fileCategory,
        rows,
        originalRows,
        deletedRowIds,
        adjustmentNote,
      });
      setPreview(null);
      setAdjustmentNote("");
      await loadWorkspace();
      notify("success", "Yearly worksheet changes saved.");
    } catch (error) {
      console.error("Yearly Data Entry save failed", error);
      notify(
        "error",
        "Worksheet changes could not be saved.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-8">
      <Toast message={toast} onClose={() => setToast(null)} />

      <div className="premium-card rounded-3xl p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200/70">
              Data Entry
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[color:var(--text-strong)]">
              Yearly Data Entry Workspace
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
              Enter or adjust a full reporting year in a finance worksheet.
              Changes stage data for Data Room review before reporting uses it.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[560px]">
            <label>
              <span className="text-sm font-medium text-[color:var(--text-soft)]">
                Reporting Year
              </span>
              <input
                type="number"
                value={reportingYear}
                onChange={(event) => setReportingYear(Number(event.target.value))}
                className="mt-2 h-10 w-full rounded-xl border px-3 text-sm outline-none"
              />
            </label>
            <label>
              <span className="text-sm font-medium text-[color:var(--text-soft)]">
                Data Category
              </span>
              <select
                value={fileCategory}
                onChange={(event) =>
                  setFileCategory(event.target.value as MonthlyCloseCategory)
                }
                className="mt-2 h-10 w-full rounded-xl border px-3 text-sm outline-none"
              >
                {monthlyCloseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                    {priorityCategories.includes(category.id) ? "" : " (basic support)"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <StatusCard title="Company" value={companyName || "Company profile required"} detail="One workspace maps to one company." />
        <StatusCard title="Worksheet" value={`FY${reportingYear}`} detail={categoryLabel(fileCategory)} />
        <StatusCard title="Rows" value={String(rows.length)} detail={hasUnsavedChanges ? "Unsaved changes" : "Saved state loaded"} />
      </div>

      {isLoading ? (
        <section className="premium-card rounded-2xl p-6">
          <div className="premium-skeleton h-24 rounded-2xl" />
        </section>
      ) : (
        <>
          <YearlyGrid
            rows={rows}
            monthKeys={monthKeys}
            onUpdateRow={updateRow}
            onUpdateMonth={updateMonth}
            onDelete={deleteRow}
            onAddRow={addRow}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void reviewSave()}
              disabled={isSaving || !hasUnsavedChanges}
              className="h-10 rounded-xl bg-neutral-950 px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={addRow}
              className="premium-pill h-10 rounded-xl px-4 text-sm font-medium"
            >
              Add Line Item
            </button>
          </div>

          <RecentAdjustments adjustments={adjustments} />
        </>
      )}

      {preview ? (
        <ConfirmYearlySaveModal
          reportingYear={reportingYear}
          fileCategory={fileCategory}
          preview={preview}
          adjustmentNote={adjustmentNote}
          onAdjustmentNoteChange={setAdjustmentNote}
          onCancel={() => setPreview(null)}
          onConfirm={() => void confirmSave()}
          isSaving={isSaving}
        />
      ) : null}
    </section>
  );
}

function YearlyGrid({
  rows,
  monthKeys,
  onUpdateRow,
  onUpdateMonth,
  onDelete,
  onAddRow,
}: {
  rows: YearlyDataEntryRow[];
  monthKeys: string[];
  onUpdateRow: (rowId: string, patch: Partial<YearlyDataEntryRow>) => void;
  onUpdateMonth: (rowId: string, month: string, value: string) => void;
  onDelete: (row: YearlyDataEntryRow) => void;
  onAddRow: () => void;
}) {
  return (
    <section className="premium-card overflow-hidden rounded-2xl">
      <div className="premium-panel-header flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--text-strong)]">
            Yearly Worksheet
          </h2>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            Rows are accounts or line items. Blank months are editable. Totals
            calculate automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddRow}
          className="premium-pill h-10 rounded-xl px-4 text-sm font-medium"
        >
          Add Row
        </button>
      </div>
      <div className="max-h-[680px] overflow-auto">
        <table className="w-full min-w-[1680px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-[1]">
            <tr>
              <th className="w-64 px-3 py-3 text-left font-medium">Account / Line Item</th>
              <th className="w-48 px-3 py-3 text-left font-medium">Department</th>
              <th className="w-56 px-3 py-3 text-left font-medium">Category</th>
              {monthLabels.map((month) => (
                <th key={month} className="w-32 px-3 py-3 text-right font-medium">
                  {month}
                </th>
              ))}
              <th className="w-36 px-3 py-3 text-right font-medium">Total</th>
              <th className="w-72 px-3 py-3 text-left font-medium">Notes</th>
              <th className="w-32 px-3 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={18} className="px-4 py-12 text-center text-[color:var(--text-muted)]">
                  No rows found for this year. Add a line item to start.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-white/10 align-top">
                  <td className="sticky left-0 bg-[color:var(--surface-soft)] px-2 py-2">
                    <input
                      value={row.accountName}
                      onChange={(event) => onUpdateRow(row.id, { accountName: event.target.value })}
                      className="h-9 w-full rounded-lg border px-2 text-sm"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.department}
                      onChange={(event) => onUpdateRow(row.id, { department: event.target.value })}
                      className="h-9 w-full rounded-lg border px-2 text-sm"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.category}
                      onChange={(event) => onUpdateRow(row.id, { category: event.target.value })}
                      className="h-9 w-full rounded-lg border px-2 text-sm"
                    />
                  </td>
                  {monthKeys.map((month) => (
                    <td key={month} className="px-2 py-2">
                      <input
                        value={row.months[month] ?? ""}
                        onChange={(event) => onUpdateMonth(row.id, month, event.target.value)}
                        className="h-9 w-full rounded-lg border px-2 text-right text-sm tabular-nums"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {formatTotal(row)}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.notes}
                      onChange={(event) => onUpdateRow(row.id, { notes: event.target.value })}
                      className="h-9 w-full rounded-lg border px-2 text-sm"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
                      className="premium-pill h-9 rounded-xl px-3 text-xs font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ConfirmYearlySaveModal({
  reportingYear,
  fileCategory,
  preview,
  adjustmentNote,
  onAdjustmentNoteChange,
  onCancel,
  onConfirm,
  isSaving,
}: {
  reportingYear: number;
  fileCategory: MonthlyCloseCategory;
  preview: YearlyDataEntrySavePreview;
  adjustmentNote: string;
  onAdjustmentNoteChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <section className="premium-card w-full max-w-2xl rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-[color:var(--text-strong)]">
          Confirm Yearly Data Changes
        </h2>
        <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
          You are about to save manual changes to financial data for this
          reporting year. These changes may affect dashboards, CFO Briefs,
          forecasts, reports, and exported decks.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ConfirmMetric label="Reporting year" value={String(reportingYear)} />
          <ConfirmMetric label="Data category" value={categoryLabel(fileCategory)} />
          <ConfirmMetric label="Rows added" value={String(preview.rowsAdded)} />
          <ConfirmMetric label="Rows changed" value={String(preview.rowsChanged)} />
          <ConfirmMetric label="Rows deleted" value={String(preview.rowsDeleted)} />
          <ConfirmMetric label="Months affected" value={preview.monthsAffected.length ? preview.monthsAffected.map(shortMonth).join(", ") : "None"} />
          <ConfirmMetric label="Review reset" value={preview.mayResetApproval ? "Yes" : "No"} />
          <ConfirmMetric label="Next status" value={preview.nextStatus} />
        </div>
        <label className="mt-5 block">
          <span className="text-sm font-medium text-[color:var(--text-soft)]">
            Adjustment note
          </span>
          <textarea
            value={adjustmentNote}
            onChange={(event) => onAdjustmentNoteChange(event.target.value)}
            rows={3}
            className="mt-2 w-full rounded-2xl border px-3 py-2 text-sm outline-none"
          />
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="premium-pill h-10 rounded-xl px-4 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className="h-10 rounded-xl bg-neutral-950 px-4 text-sm font-medium disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Confirm and Save"}
          </button>
        </div>
      </section>
    </div>
  );
}

function RecentAdjustments({ adjustments }: { adjustments: DataEntryAdjustment[] }) {
  return (
    <section className="premium-card rounded-2xl p-5">
      <h2 className="text-base font-semibold text-[color:var(--text-strong)]">
        Recent Adjustment Activity
      </h2>
      {adjustments.length === 0 ? (
        <p className="mt-3 text-sm text-[color:var(--text-muted)]">
          No manual worksheet adjustments have been logged for this year yet.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-white/10">
          {adjustments.map((adjustment) => (
            <div
              key={adjustment.id}
              className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-[color:var(--text-strong)]">
                  {adjustment.source_type}
                </p>
                <p className="mt-1 text-[color:var(--text-muted)]">
                  +{adjustment.rows_added} / {adjustment.rows_changed} changed / {adjustment.rows_deleted} deleted
                </p>
              </div>
              <p className="text-[color:var(--text-muted)]">
                {formatDateTime(adjustment.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="premium-card rounded-2xl p-5">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">{title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--text-strong)]">{value}</p>
      <p className="mt-2 text-sm leading-5 text-[color:var(--text-muted)]">{detail}</p>
    </article>
  );
}

function ConfirmMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="premium-pill rounded-2xl px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[color:var(--text-strong)]">{value}</p>
    </div>
  );
}

function DataEntryLoading() {
  return (
    <section className="space-y-8">
      <div className="premium-card rounded-3xl p-6">
        <div className="premium-skeleton h-28 rounded-2xl" />
      </div>
    </section>
  );
}

function formatTotal(row: YearlyDataEntryRow) {
  const total = Object.values(row.months).reduce((sum, value) => {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);

  return total.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function shortMonth(month: string) {
  const date = new Date(`${month}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? month
    : date.toLocaleDateString("en-US", { month: "short" });
}

function formatDateTime(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
