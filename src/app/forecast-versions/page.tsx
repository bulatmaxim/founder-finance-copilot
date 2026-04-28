"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toast, type ToastMessage, type ToastType } from "@/components/Toast";
import {
  createForecastVersion,
  dateToDisplayMonth,
  forecastVersionStatuses,
  forecastVersionTypes,
  getFiscalMonthOptions,
  loadForecastVersionsForDisplay,
  rowsToForecastMonths,
  setSelectedForecastVersionId,
  updateForecastVersionMonthRows,
  updateForecastVersionStatus,
  type CreateForecastVersionInput,
  type ForecastVersionStatus,
  type ForecastVersionType,
  type ForecastVersionWithRows,
  type ForecastVersionRowRecord,
} from "@/lib/forecastVersions";
import { formatCurrency, formatPercent } from "@/lib/formatting";

type FormState = {
  name: string;
  fiscalYear: number;
  versionType: ForecastVersionType;
  sourceVersionId: string;
  actualsThroughMonth: string;
  notes: string;
};

const currentYear = new Date().getFullYear();

const defaultForm: FormState = {
  name: `FY${currentYear} Budget`,
  fiscalYear: currentYear,
  versionType: "Budget",
  sourceVersionId: "",
  actualsThroughMonth: "",
  notes: "",
};

export default function ForecastVersionsPage() {
  const [versions, setVersions] = useState<ForecastVersionWithRows[]>([]);
  const [selectedVersionId, setSelectedVersionIdState] = useState("");
  const [form, setForm] = useState<FormState>(defaultForm);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback((type: ToastType, title: string, detail?: string) => {
    setToast({ id: Date.now(), type, title, detail });
  }, []);

  const loadVersions = useCallback(async () => {
    setIsLoading(true);

    try {
      const loaded = await loadForecastVersionsForDisplay();
      setVersions(loaded);
      setSelectedVersionIdState((current) => current || loaded[0]?.id || "");
    } catch (error) {
      console.error("Forecast versions load failed", error);
      notify(
        "error",
        "Forecast versions could not be loaded.",
        error instanceof Error ? error.message : "Check Supabase setup.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadVersions();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadVersions]);

  const summary = useMemo(() => summarizeVersions(versions), [versions]);
  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null;
  const monthOptions = useMemo(
    () => getFiscalMonthOptions(form.fiscalYear),
    [form.fiscalYear],
  );

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function beginRollingForecast(sourceVersionId?: string) {
    const source = versions.find((version) => version.id === sourceVersionId);

    setForm({
      name: `FY${source?.fiscal_year ?? currentYear} Rolling Forecast`,
      fiscalYear: source?.fiscal_year ?? currentYear,
      versionType: "Rolling Forecast",
      sourceVersionId: source?.id ?? "",
      actualsThroughMonth: "",
      notes: "",
    });
    setShowForm(true);
  }

  async function handleCreateVersion() {
    setIsSaving(true);

    try {
      const payload: CreateForecastVersionInput = {
        name: form.name,
        fiscalYear: form.fiscalYear,
        versionType: form.versionType,
        sourceVersionId: form.sourceVersionId || undefined,
        actualsThroughMonth: form.actualsThroughMonth || undefined,
        notes: form.notes || undefined,
      };
      const version = await createForecastVersion(payload);

      notify(
        "success",
        "Forecast version created.",
        form.actualsThroughMonth
          ? "Approved Data Room actuals were used where available; remaining months use the selected source or placeholder assumptions."
          : "Future months use the selected source or placeholder assumptions.",
      );
      setSelectedVersionIdState(version.id);
      setSelectedForecastVersionId(version.id);
      setShowForm(false);
      setForm(defaultForm);
      await loadVersions();
    } catch (error) {
      console.error("Forecast version creation failed", error);
      notify(
        "error",
        "Forecast version could not be created.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: ForecastVersionStatus) {
    try {
      await updateForecastVersionStatus(id, status);
      notify("success", "Forecast version status updated.");
      await loadVersions();
    } catch (error) {
      console.error("Forecast version status update failed", error);
      notify(
        "error",
        "Status could not be updated.",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  }

  function handleUseInForecasts(id: string) {
    setSelectedForecastVersionId(id);
    setSelectedVersionIdState(id);
    notify("success", "Forecast version selected for reporting.");
  }

  return (
    <section className="space-y-8">
      <Toast message={toast} onClose={() => setToast(null)} />

      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
            Forecast Versions
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Forecast Version Manager
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
            Create, actualize, compare, and manage rolling forecast versions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => beginRollingForecast(selectedVersion?.id)}
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50"
          >
            Create Rolling Forecast
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(defaultForm);
              setShowForm(true);
            }}
            className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Create Forecast Version
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Total versions" value={String(summary.total)} />
        <SummaryCard label="Approved / Published" value={String(summary.approvedPublished)} />
        <SummaryCard label="Draft versions" value={String(summary.drafts)} />
        <SummaryCard label="Latest actualized month" value={summary.latestActualizedMonth || "None"} />
      </div>

      {showForm ? (
        <section className="rounded-md border border-neutral-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Create Forecast Version</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Rolling forecasts lock approved actual months and keep future
                months as forecast assumptions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <TextField
              label="Version name"
              value={form.name}
              onChange={(value) => updateForm({ name: value })}
            />
            <label className="text-sm font-medium text-neutral-700">
              Fiscal year
              <input
                type="number"
                value={form.fiscalYear}
                onChange={(event) =>
                  updateForm({ fiscalYear: Number(event.target.value) })
                }
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
              />
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Version type
              <select
                value={form.versionType}
                onChange={(event) =>
                  updateForm({ versionType: event.target.value as ForecastVersionType })
                }
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950"
              >
                {forecastVersionTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Starting version
              <select
                value={form.sourceVersionId}
                onChange={(event) => updateForm({ sourceVersionId: event.target.value })}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950"
              >
                <option value="">Placeholder assumptions</option>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Actuals through month
              <select
                value={form.actualsThroughMonth}
                onChange={(event) =>
                  updateForm({ actualsThroughMonth: event.target.value })
                }
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950"
              >
                <option value="">No actualized months</option>
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label="Notes"
              value={form.notes}
              onChange={(value) => updateForm({ notes: value })}
            />
          </div>

          <div className="mt-5">
            <button
              type="button"
              disabled={isSaving || !form.name || !form.fiscalYear}
              onClick={() => void handleCreateVersion()}
              className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {isSaving ? "Creating..." : "Create version"}
            </button>
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <section className="rounded-md border border-neutral-200 bg-white p-6">
          <p className="text-sm text-neutral-500">Loading forecast versions...</p>
        </section>
      ) : (
        <ForecastVersionTable
          versions={versions}
          selectedVersionId={selectedVersion?.id ?? ""}
          onView={setSelectedVersionIdState}
          onUse={handleUseInForecasts}
          onCreateRolling={beginRollingForecast}
          onStatusChange={(id, status) => void handleStatusChange(id, status)}
        />
      )}

      {selectedVersion ? (
        <ForecastVersionDetails
          version={selectedVersion}
          onSaved={async () => {
            notify("success", "Forecast month updated.");
            await loadVersions();
          }}
          onError={(error) =>
            notify(
              "error",
              "Forecast month could not be updated.",
              error instanceof Error ? error.message : "Try again.",
            )
          }
        />
      ) : null}
    </section>
  );
}

function ForecastVersionTable({
  versions,
  selectedVersionId,
  onView,
  onUse,
  onCreateRolling,
  onStatusChange,
}: {
  versions: ForecastVersionWithRows[];
  selectedVersionId: string;
  onView: (id: string) => void;
  onUse: (id: string) => void;
  onCreateRolling: (id: string) => void;
  onStatusChange: (id: string, status: ForecastVersionStatus) => void;
}) {
  if (versions.length === 0) {
    return (
      <section className="rounded-md border border-neutral-200 bg-white p-6">
        <p className="text-sm text-neutral-500">
          No forecast versions exist yet. Create a Budget or Rolling Forecast to
          start managing forecast versions.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base font-semibold">Forecast Versions</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Manage budget, rolling forecast, scenario, board, downside, and upside cases.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">Version name</th>
              <th className="px-4 py-3 font-medium">Fiscal year</th>
              <th className="px-4 py-3 font-medium">Version type</th>
              <th className="px-4 py-3 font-medium">Actual months</th>
              <th className="px-4 py-3 font-medium">Forecast months</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created date</th>
              <th className="px-4 py-3 font-medium">Last updated</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr
                key={version.id}
                className={`border-b border-neutral-100 ${version.id === selectedVersionId ? "bg-neutral-50" : ""}`}
              >
                <td className="px-4 py-4 font-medium text-neutral-950">
                  {version.name}
                </td>
                <td className="px-4 py-4">{version.fiscal_year}</td>
                <td className="px-4 py-4">{version.version_type}</td>
                <td className="px-4 py-4">{version.actualMonths}</td>
                <td className="px-4 py-4">{version.forecastMonths}</td>
                <td className="px-4 py-4">
                  <select
                    value={version.status}
                    onChange={(event) =>
                      onStatusChange(
                        version.id,
                        event.target.value as ForecastVersionStatus,
                      )
                    }
                    className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm outline-none focus:border-neutral-950"
                  >
                    {forecastVersionStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-4 text-neutral-600">
                  {formatDate(version.created_at)}
                </td>
                <td className="px-4 py-4 text-neutral-600">
                  {formatDate(version.updated_at)}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <SmallButton onClick={() => onView(version.id)}>View</SmallButton>
                    <SmallButton onClick={() => onUse(version.id)}>Use</SmallButton>
                    <SmallButton onClick={() => onCreateRolling(version.id)}>
                      Roll forward
                    </SmallButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ForecastVersionDetails({
  version,
  onSaved,
  onError,
}: {
  version: ForecastVersionWithRows;
  onSaved: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [draftRows, setDraftRows] = useState<ForecastVersionRowRecord[]>(
    version.rows,
  );
  const [savingMonth, setSavingMonth] = useState("");
  const hasActualsThrough = Boolean(version.actuals_through_month);
  const hasApprovedActualRows = draftRows.some((row) => row.row_type === "Actual");
  const periods = useMemo(() => rowsToForecastMonths(draftRows), [draftRows]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDraftRows(version.rows);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [version.rows]);

  function updateAmount(month: string, category: string, value: string) {
    const parsed = Number(value);

    setDraftRows((current) =>
      current.map((row) =>
        row.month === month && row.category === category
          ? { ...row, amount: Number.isFinite(parsed) ? parsed : 0 }
          : row,
      ),
    );
  }

  async function saveMonth(month: string) {
    setSavingMonth(month);

    try {
      await updateForecastVersionMonthRows({
        forecastVersionId: version.id,
        month,
        amounts: editableCategories.reduce<Record<string, number>>(
          (accumulator, category) => ({
            ...accumulator,
            [category]: amountForDraftRow(draftRows, month, category),
          }),
          {},
        ),
      });
      await onSaved();
    } catch (error) {
      console.error("Forecast month update failed", error);
      onError(error);
    } finally {
      setSavingMonth("");
    }
  }

  return (
    <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">{version.name}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {version.version_type} for FY{version.fiscal_year}
              {version.actuals_through_month
                ? `, actualized through ${dateToDisplayMonth(version.actuals_through_month)}`
                : ""}.
            </p>
          </div>
          <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
            {version.status}
          </span>
        </div>

        {hasActualsThrough && !hasApprovedActualRows ? (
          <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
            This version requested actualized months, but no approved Data Room
            actuals were found for the selected actualization period.
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-right text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Month</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Revenue</th>
              <th className="px-4 py-3 font-medium">Cost of revenue</th>
              <th className="px-4 py-3 font-medium">Gross profit</th>
              <th className="px-4 py-3 font-medium">Gross margin</th>
              <th className="px-4 py-3 font-medium">Operating expenses</th>
              <th className="px-4 py-3 font-medium">EBITDA / net income</th>
              <th className="px-4 py-3 font-medium">Cash impact</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => {
              const monthDate = displayMonthToDateLocal(period.month);
              const isEditable = period.periodType !== "Actual";

              return (
              <tr key={period.month} className="border-b border-neutral-100">
                <td className="px-4 py-3 text-left font-medium">{period.month}</td>
                <td className="px-4 py-3">
                  <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
                    {period.periodType}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <AmountCell
                    value={period.revenue}
                    editable={isEditable}
                    onChange={(value) => updateAmount(monthDate, "Revenue", value)}
                  />
                </td>
                <td className="px-4 py-3">
                  <AmountCell
                    value={period.costOfRevenue}
                    editable={isEditable}
                    onChange={(value) =>
                      updateAmount(monthDate, "Cost of Revenue", value)
                    }
                  />
                </td>
                <td className="px-4 py-3">{formatCurrency(period.grossProfit)}</td>
                <td className="px-4 py-3">{formatPercent(period.grossMargin)}</td>
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    <AmountCell
                      label="S&M"
                      value={period.salesAndMarketing}
                      editable={isEditable}
                      onChange={(value) =>
                        updateAmount(monthDate, "Sales & Marketing", value)
                      }
                    />
                    <AmountCell
                      label="R&D"
                      value={period.researchAndDevelopment}
                      editable={isEditable}
                      onChange={(value) =>
                        updateAmount(monthDate, "Research & Development", value)
                      }
                    />
                    <AmountCell
                      label="G&A"
                      value={period.generalAndAdministrative}
                      editable={isEditable}
                      onChange={(value) =>
                        updateAmount(monthDate, "General & Administrative", value)
                      }
                    />
                  </div>
                </td>
                <td className="px-4 py-3">{formatCurrency(period.ebitda)}</td>
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    <AmountCell
                      value={period.cashBalance}
                      editable={isEditable}
                      onChange={(value) => updateAmount(monthDate, "Cash Balance", value)}
                    />
                    {isEditable ? (
                      <button
                        type="button"
                        disabled={savingMonth === monthDate}
                        onClick={() => void saveMonth(monthDate)}
                        className="rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
                      >
                        {savingMonth === monthDate ? "Saving..." : "Save month"}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-md border border-neutral-200 bg-white p-5">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}

const editableCategories = [
  "Revenue",
  "Cost of Revenue",
  "Sales & Marketing",
  "Research & Development",
  "General & Administrative",
  "Cash Balance",
];

function AmountCell({
  value,
  editable,
  label,
  onChange,
}: {
  value: number;
  editable: boolean;
  label?: string;
  onChange: (value: string) => void;
}) {
  if (!editable) {
    return (
      <span>
        {label ? `${label}: ` : ""}
        {formatCurrency(value)}
      </span>
    );
  }

  return (
    <label className="flex items-center justify-end gap-2 text-xs text-neutral-500">
      {label ? <span>{label}</span> : null}
      <input
        type="number"
        value={Math.round(value)}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-28 rounded-md border border-neutral-300 px-2 text-right text-sm text-neutral-950 outline-none focus:border-neutral-950"
      />
    </label>
  );
}

function amountForDraftRow(
  rows: ForecastVersionRowRecord[],
  month: string,
  category: string,
) {
  return Number(
    rows.find((row) => row.month === month && row.category === category)?.amount ?? 0,
  );
}

function displayMonthToDateLocal(month: string) {
  const date = new Date(`${month} 1`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium text-neutral-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
      />
    </label>
  );
}

function SmallButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
    >
      {children}
    </button>
  );
}

function summarizeVersions(versions: ForecastVersionWithRows[]) {
  const latestActualizedMonth =
    versions
      .flatMap((version) =>
        version.periods
          .filter((period) => period.periodType === "Actual")
          .map((period) => period.month),
      )
      .at(-1) ?? "";

  return {
    total: versions.length,
    approvedPublished: versions.filter(
      (version) => version.status === "Approved" || version.status === "Published",
    ).length,
    drafts: versions.filter((version) => version.status === "Draft").length,
    latestActualizedMonth,
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not saved";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}
