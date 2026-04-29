"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DataQualityPanel } from "@/components/data-room/DataQualityPanel";
import { Toast, type ToastMessage, type ToastType } from "@/components/Toast";
import {
  categoryLabel,
  createBlankDataEntryRow,
  createManualDataEntryBatch,
  currentReportingMonth,
  loadDataEntryWorkspace,
  previewDataEntrySave,
  saveDataEntryRows,
  type DataEntryAdjustment,
  type DataEntryBatch,
  type DataEntryRow,
  type DataEntrySavePreview,
} from "@/lib/dataEntry";
import {
  getReportingMonthOptions,
  monthlyCloseCategories,
  type MonthlyCloseCategory,
} from "@/lib/monthlyClose";

type ColumnConfig = {
  key: string;
  label: string;
  kind?: "text" | "number" | "date";
  width?: string;
  numeric?: boolean;
};

const baseColumns: Record<MonthlyCloseCategory, ColumnConfig[]> = {
  actuals: [
    { key: "period", label: "Period", width: "w-36" },
    { key: "rawAccountName", label: "Account Name", width: "w-64" },
    { key: "rawCategory", label: "Raw Category", width: "w-52" },
    { key: "department", label: "Department", width: "w-48" },
    { key: "amount", label: "Amount", width: "w-40", numeric: true },
    { key: "notes", label: "Notes", width: "w-72" },
  ],
  budget: [
    { key: "period", label: "Period", width: "w-36" },
    { key: "rawAccountName", label: "Account Name", width: "w-64" },
    { key: "rawCategory", label: "Raw Category", width: "w-52" },
    { key: "department", label: "Department", width: "w-48" },
    { key: "amount", label: "Budget Amount", width: "w-40", numeric: true },
    { key: "notes", label: "Notes", width: "w-72" },
  ],
  cash: [
    { key: "period", label: "Period", width: "w-36" },
    { key: "beginningCash", label: "Beginning Cash", width: "w-44", numeric: true },
    { key: "cashIn", label: "Cash In", width: "w-36", numeric: true },
    { key: "cashOut", label: "Cash Out", width: "w-36", numeric: true },
    { key: "endingCash", label: "Ending Cash", width: "w-44", numeric: true },
    { key: "notes", label: "Notes", width: "w-72" },
  ],
  payroll: [
    { key: "period", label: "Period", width: "w-36" },
    { key: "rawAccountName", label: "Employee / Role", width: "w-64" },
    { key: "department", label: "Department", width: "w-48" },
    { key: "amount", label: "Salary", width: "w-40", numeric: true },
    { key: "benefitsLoad", label: "Benefits Load %", width: "w-40", numeric: true },
    { key: "startDate", label: "Start Date", width: "w-40" },
    { key: "status", label: "Status", width: "w-36" },
    { key: "notes", label: "Notes", width: "w-72" },
  ],
  revenue: [
    { key: "period", label: "Period", width: "w-36" },
    { key: "rawAccountName", label: "Customer / Segment", width: "w-64" },
    { key: "rawCategory", label: "Revenue Type", width: "w-48" },
    { key: "amount", label: "Revenue Amount", width: "w-44", numeric: true },
    { key: "newExisting", label: "New / Existing", width: "w-40" },
    { key: "notes", label: "Notes", width: "w-72" },
  ],
  kpi: [
    { key: "period", label: "Period", width: "w-36" },
    { key: "rawAccountName", label: "KPI Name", width: "w-64" },
    { key: "amount", label: "KPI Value", width: "w-40", numeric: true },
    { key: "rawCategory", label: "Unit", width: "w-36" },
    { key: "notes", label: "Notes", width: "w-72" },
  ],
  notes: [
    { key: "period", label: "Period", width: "w-36" },
    { key: "rawAccountName", label: "Topic", width: "w-64" },
    { key: "notes", label: "Note", width: "w-96" },
    { key: "owner", label: "Owner", width: "w-40" },
    { key: "priority", label: "Priority", width: "w-36" },
  ],
};

export default function DataEntryPage() {
  return (
    <Suspense fallback={<DataEntryLoading />}>
      <DataEntryWorkspace />
    </Suspense>
  );
}

function DataEntryWorkspace() {
  const searchParams = useSearchParams();
  const reportingMonths = useMemo(() => getReportingMonthOptions(), []);
  const [reportingMonth, setReportingMonth] = useState(
    searchParams.get("month") || currentReportingMonth(),
  );
  const [fileCategory, setFileCategory] = useState<MonthlyCloseCategory>(
    (searchParams.get("category") as MonthlyCloseCategory | null) || "actuals",
  );
  const [batchId, setBatchId] = useState(searchParams.get("batchId"));
  const [batch, setBatch] = useState<DataEntryBatch | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [rows, setRows] = useState<DataEntryRow[]>([]);
  const [originalRows, setOriginalRows] = useState<DataEntryRow[]>([]);
  const [deletedRowIds, setDeletedRowIds] = useState<Set<string>>(new Set());
  const [adjustments, setAdjustments] = useState<DataEntryAdjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [preview, setPreview] = useState<DataEntrySavePreview | null>(null);
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const manualCreateAttempted = useRef(false);

  const hasUnsavedChanges =
    JSON.stringify(rows) !== JSON.stringify(originalRows) || deletedRowIds.size > 0;
  const validationIssues = preview?.validationSummary.issues ?? batch?.validation_summary?.issues ?? [];
  const mappedRows = rows.filter((row) => row.mappingStatus === "Mapped").length;
  const unmappedRows = rows.filter((row) =>
    ["Unmapped", "Suggested"].includes(row.mappingStatus),
  ).length;

  const notify = useCallback((type: ToastType, title: string, detail?: string) => {
    setToast({ id: Date.now(), type, title, detail });
  }, []);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await loadDataEntryWorkspace({
        reportingMonth,
        fileCategory,
        batchId,
      });
      setCompanyName(result.companyName);
      setBatch(result.batch);
      setRows(result.rows);
      setOriginalRows(result.rows);
      setDeletedRowIds(new Set());
      setAdjustments(result.adjustments);
      setPreview(null);

      if (
        searchParams.get("action") === "manual" &&
        !result.batch &&
        !manualCreateAttempted.current
      ) {
        manualCreateAttempted.current = true;
        setIsCreatingManual(true);
        const nextBatchId = await createManualDataEntryBatch({
          reportingMonth,
          fileCategory,
        });
        setBatchId(nextBatchId);
        notify("success", "Manual worksheet created.");
      }
    } catch (error) {
      console.error("Data Entry load failed", error);
      notify(
        "error",
        "Data Entry workspace could not be loaded.",
        error instanceof Error ? error.message : "Check Supabase setup.",
      );
    } finally {
      setIsLoading(false);
      setIsCreatingManual(false);
    }
  }, [batchId, fileCategory, notify, reportingMonth, searchParams]);

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

  function updateRow(rowId: string, key: string, value: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;

        if (key in row && key !== "rawData") {
          return { ...row, [key]: value };
        }

        const nextRawData = { ...row.rawData, [key]: value };

        return {
          ...row,
          rawData: nextRawData,
          amount: key === "endingCash" ? value : row.amount,
          rawCategory: key === "unit" ? value : row.rawCategory,
        };
      }),
    );
  }

  function handleAddRow() {
    setRows((current) => [
      ...current,
      createBlankDataEntryRow({ fileCategory, reportingMonth }),
    ]);
  }

  function handleDuplicateRow(row: DataEntryRow) {
    setRows((current) => [
      ...current,
      {
        ...row,
        id: `new-${crypto.randomUUID()}`,
        isNew: true,
        sourceRowNumber: null,
      },
    ]);
  }

  function handleDeleteRow(row: DataEntryRow) {
    const confirmed = window.confirm("Delete this worksheet row?");

    if (!confirmed) return;

    setRows((current) => current.filter((item) => item.id !== row.id));
    if (!row.isNew) {
      setDeletedRowIds((current) => new Set([...current, row.id]));
    }
  }

  async function handleCreateManual() {
    setIsCreatingManual(true);

    try {
      const nextBatchId = await createManualDataEntryBatch({
        reportingMonth,
        fileCategory,
      });
      setBatchId(nextBatchId);
      notify("success", "Manual worksheet created.");
    } catch (error) {
      console.error("Manual worksheet creation failed", error);
      notify(
        "error",
        "Manual worksheet could not be created.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsCreatingManual(false);
    }
  }

  async function handlePreviewSave() {
    if (!batch) {
      notify("error", "Create or open a worksheet before saving.");
      return;
    }

    try {
      setPreview(
        await previewDataEntrySave({
          originalRows,
          nextRows: rows,
          deletedRowIds,
          fileCategory,
        }),
      );
    } catch (error) {
      console.error("Data Entry preview failed", error);
      notify(
        "error",
        "Save preview failed.",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  }

  async function handleConfirmSave() {
    if (!batch || !preview) return;

    setIsSaving(true);

    try {
      await saveDataEntryRows({
        importBatchId: batch.id,
        reportingMonth,
        fileCategory,
        rows,
        deletedRowIds,
        originalRows,
        adjustmentNote,
      });
      setPreview(null);
      setAdjustmentNote("");
      await loadWorkspace();
      notify("success", "Worksheet changes saved.");
    } catch (error) {
      console.error("Data Entry save failed", error);
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
              Data Entry Workspace
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
              Enter, review, and adjust staged finance rows before mapping,
              validation, monthly close approval, and reporting.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[560px]">
            <label>
              <span className="text-sm font-medium text-[color:var(--text-soft)]">
                Reporting month
              </span>
              <select
                value={reportingMonth}
                onChange={(event) => {
                  setReportingMonth(event.target.value);
                  setBatchId(null);
                  manualCreateAttempted.current = false;
                }}
                className="mt-2 h-10 w-full rounded-xl border px-3 text-sm outline-none"
              >
                {reportingMonths.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-medium text-[color:var(--text-soft)]">
                Data category
              </span>
              <select
                value={fileCategory}
                onChange={(event) => {
                  setFileCategory(event.target.value as MonthlyCloseCategory);
                  setBatchId(null);
                  manualCreateAttempted.current = false;
                }}
                className="mt-2 h-10 w-full rounded-xl border px-3 text-sm outline-none"
              >
                {monthlyCloseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <StatusCard
          title="Source"
          value={sourceLabel(batch)}
          detail={companyName || "Company profile required"}
        />
        <StatusCard
          title="Worksheet Status"
          value={batch?.status ?? "No worksheet"}
          detail={batch?.uploaded_file_id ? "Uploaded source preserved" : "Manual staging batch"}
        />
        <StatusCard
          title="Mapping"
          value={`${mappedRows} mapped / ${unmappedRows} pending`}
          detail="Mapped accounts are used for reporting rollups after approval."
        />
      </div>

      {batch?.status === "Approved" ? (
        <div className="premium-warning rounded-2xl border px-4 py-3 text-sm">
          Editing approved data will reset the monthly close item back to review.
        </div>
      ) : null}

      {!batch && !isLoading ? (
        <section className="premium-card rounded-2xl p-6">
          <h2 className="text-base font-semibold text-[color:var(--text-strong)]">
            No worksheet found
          </h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
            Create a manual worksheet for {categoryLabel(fileCategory)} or open an
            uploaded/staged file from the Data Room.
          </p>
          <button
            type="button"
            disabled={isCreatingManual}
            onClick={() => void handleCreateManual()}
            className="mt-5 h-10 rounded-xl bg-neutral-950 px-4 text-sm font-medium"
          >
            {isCreatingManual ? "Creating..." : "Enter Manually"}
          </button>
        </section>
      ) : null}

      {isLoading ? (
        <section className="premium-card rounded-2xl p-6">
          <div className="premium-skeleton h-20 rounded-2xl" />
        </section>
      ) : batch ? (
        <>
          <SpreadsheetEditor
            category={fileCategory}
            rows={rows}
            onUpdate={updateRow}
            onAddRow={handleAddRow}
            onDuplicate={handleDuplicateRow}
            onDelete={handleDeleteRow}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handlePreviewSave()}
              disabled={isSaving || !hasUnsavedChanges}
              className="h-10 rounded-xl bg-neutral-950 px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              Review and Save Changes
            </button>
            <button
              type="button"
              onClick={handleAddRow}
              className="premium-pill h-10 rounded-xl px-4 text-sm font-medium"
            >
              Add Row
            </button>
            <Link
              href="/data-room"
              className="premium-pill inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium"
            >
              Back to Data Room
            </Link>
            {hasUnsavedChanges ? (
              <span className="text-sm text-[color:var(--text-muted)]">
                Unsaved changes
              </span>
            ) : null}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <DataQualityPanel issues={validationIssues} isLoading={false} />
            <MappingPanel rows={rows} />
          </div>

          <RecentAdjustments adjustments={adjustments} />
        </>
      ) : null}

      {preview ? (
        <ConfirmSaveModal
          reportingMonth={reportingMonth}
          fileCategory={fileCategory}
          preview={preview}
          adjustmentNote={adjustmentNote}
          onAdjustmentNoteChange={setAdjustmentNote}
          onCancel={() => setPreview(null)}
          onConfirm={() => void handleConfirmSave()}
          isSaving={isSaving}
        />
      ) : null}
    </section>
  );
}

function DataEntryLoading() {
  return (
    <section className="space-y-8">
      <div className="premium-card rounded-3xl p-6">
        <div className="premium-skeleton h-28 rounded-2xl" />
      </div>
      <div className="premium-card rounded-2xl p-6">
        <div className="premium-skeleton h-40 rounded-2xl" />
      </div>
    </section>
  );
}

function SpreadsheetEditor({
  category,
  rows,
  onUpdate,
  onAddRow,
  onDuplicate,
  onDelete,
}: {
  category: MonthlyCloseCategory;
  rows: DataEntryRow[];
  onUpdate: (rowId: string, key: string, value: string) => void;
  onAddRow: () => void;
  onDuplicate: (row: DataEntryRow) => void;
  onDelete: (row: DataEntryRow) => void;
}) {
  const columns = baseColumns[category];

  return (
    <section className="premium-card overflow-hidden rounded-2xl">
      <div className="premium-panel-header flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--text-strong)]">
            Spreadsheet Editor
          </h2>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            Flexible worksheet rows staged for mapping, validation, and close approval.
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
      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-[1]">
            <tr>
              <th className="w-14 px-3 py-3 text-left font-medium">#</th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`${column.width ?? "w-48"} px-3 py-3 text-left font-medium`}
                >
                  {column.label}
                </th>
              ))}
              <th className="w-40 px-3 py-3 text-left font-medium">Status</th>
              <th className="w-48 px-3 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 3} className="px-4 py-10 text-center text-[color:var(--text-muted)]">
                  No worksheet rows yet. Add a row to start manual entry.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`border-b align-top ${
                    row.validationStatus === "Critical"
                      ? "bg-red-500/5"
                      : row.validationStatus === "Warning"
                        ? "bg-amber-500/5"
                        : ""
                  }`}
                >
                  <td className="px-3 py-2 text-[color:var(--text-muted)]">
                    {index + 1}
                  </td>
                  {columns.map((column) => (
                    <td key={column.key} className="px-2 py-2">
                      <input
                        value={cellValue(row, column.key)}
                        onChange={(event) =>
                          onUpdate(row.id, column.key, event.target.value)
                        }
                        className={`h-9 w-full rounded-lg border px-2 text-sm outline-none ${
                          column.numeric ? "text-right tabular-nums" : ""
                        }`}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <span className="premium-pill inline-flex h-7 w-fit items-center rounded-xl px-2 text-xs font-medium">
                        {row.validationStatus}
                      </span>
                      <span className="premium-pill inline-flex h-7 w-fit items-center rounded-xl px-2 text-xs font-medium">
                        {row.mappingStatus}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onDuplicate(row)}
                        className="premium-pill h-8 rounded-xl px-3 text-xs font-medium"
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(row)}
                        className="premium-pill h-8 rounded-xl px-3 text-xs font-medium"
                      >
                        Delete
                      </button>
                    </div>
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

function ConfirmSaveModal({
  reportingMonth,
  fileCategory,
  preview,
  adjustmentNote,
  onAdjustmentNoteChange,
  onCancel,
  onConfirm,
  isSaving,
}: {
  reportingMonth: string;
  fileCategory: MonthlyCloseCategory;
  preview: DataEntrySavePreview;
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
          Confirm Manual Data Changes
        </h2>
        <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
          You are about to save manual changes to financial data. These changes
          may affect dashboards, CFO Briefs, forecasts, reports, and exported decks.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ConfirmMetric label="Reporting month" value={reportingMonth} />
          <ConfirmMetric label="Data category" value={categoryLabel(fileCategory)} />
          <ConfirmMetric label="Rows added" value={String(preview.rowsAdded)} />
          <ConfirmMetric label="Rows changed" value={String(preview.rowsChanged)} />
          <ConfirmMetric label="Rows deleted" value={String(preview.rowsDeleted)} />
          <ConfirmMetric label="New unmapped rows" value={String(preview.unmappedAccounts)} />
          <ConfirmMetric label="Close status after save" value={preview.nextStatus} />
          <ConfirmMetric label="Approval reset" value="Yes, if previously approved" />
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
            placeholder="Optional note about why this worksheet was changed"
          />
        </label>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
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

function MappingPanel({ rows }: { rows: DataEntryRow[] }) {
  const mapped = rows.filter((row) => row.mappingStatus === "Mapped").length;
  const suggested = rows.filter((row) => row.mappingStatus === "Suggested").length;
  const unmapped = rows.filter((row) => row.mappingStatus === "Unmapped").length;
  const ignored = rows.filter((row) => row.mappingStatus === "Ignored").length;

  return (
    <section className="premium-card rounded-2xl p-5">
      <h2 className="text-base font-semibold text-[color:var(--text-strong)]">
        Mapping Status
      </h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <StatusCard title="Mapped" value={String(mapped)} detail="Ready for rollups" />
        <StatusCard title="Suggested" value={String(suggested)} detail="Review before approval" />
        <StatusCard title="Unmapped" value={String(unmapped)} detail="Requires mapping" />
        <StatusCard title="Ignored" value={String(ignored)} detail="Excluded from mapping needs" />
      </div>
      <Link
        href="/account-mapping"
        className="premium-pill mt-5 inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium"
      >
        Open Account Mapping
      </Link>
    </section>
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
          No manual worksheet adjustments have been logged for this period yet.
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
                  +{adjustment.rows_added} / {adjustment.rows_changed} changed /{" "}
                  {adjustment.rows_deleted} deleted
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

function StatusCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="premium-card rounded-2xl p-5">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">{title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--text-strong)]">
        {value}
      </p>
      <p className="mt-2 text-sm leading-5 text-[color:var(--text-muted)]">
        {detail}
      </p>
    </article>
  );
}

function ConfirmMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="premium-pill rounded-2xl px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[color:var(--text-strong)]">
        {value}
      </p>
    </div>
  );
}

function cellValue(row: DataEntryRow, key: string) {
  if (key === "period") return row.period;
  if (key === "rawAccountName") return row.rawAccountName;
  if (key === "rawCategory") return row.rawCategory;
  if (key === "department") return row.department;
  if (key === "amount") return row.amount;
  if (key === "notes") return row.notes;

  return row.rawData[key] ?? "";
}

function sourceLabel(batch: DataEntryBatch | null) {
  if (!batch) return "No worksheet";
  if (!batch.uploaded_file_id) return "Manual Entry";
  if (batch.validation_summary?.issues.some((issue) => issue.id.includes("worksheet"))) {
    return "Manually Adjusted Upload";
  }

  return batch.uploaded_file?.file_name ?? "Uploaded file";
}

function formatDateTime(value: string | null) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
