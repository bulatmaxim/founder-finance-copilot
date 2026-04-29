"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toast, type ToastMessage, type ToastType } from "@/components/Toast";
import { ForecastGridWorkspace } from "@/components/forecast/ForecastGridWorkspace";
import {
  applyForecastDriversToVersion,
  buildForecastDriverPreview,
  defaultDriverAssumptions,
  loadForecastDriverAssumptions,
  saveForecastDriverAssumptions,
  summarizeForecastDriverAssumptions,
  type ForecastDriverAssumptions,
} from "@/lib/forecastDrivers";
import {
  createForecastVersion,
  dateToDisplayMonth,
  forecastVersionStatuses,
  forecastVersionTypes,
  getFiscalMonthOptions,
  loadForecastVersionsForDisplay,
  setSelectedForecastVersionId,
  updateForecastVersionStatus,
  type CreateForecastVersionInput,
  type ForecastVersionStatus,
  type ForecastVersionType,
  type ForecastVersionWithRows,
} from "@/lib/forecastVersions";
import { formatCurrency } from "@/lib/formatting";

type FormState = {
  name: string;
  fiscalYear: number;
  versionType: ForecastVersionType;
  forecastTemplate: StandardForecastTemplate;
  sourceVersionId: string;
  actualsThroughMonth: string;
  includeNextYear: boolean;
  notes: string;
};

const currentYear = new Date().getFullYear();
type StandardForecastTemplate =
  | "Budget"
  | "2+10 Forecast"
  | "5+7 Forecast"
  | "8+4 Forecast"
  | "10+2 Forecast";

const standardForecastTemplates: StandardForecastTemplate[] = [
  "Budget",
  "2+10 Forecast",
  "5+7 Forecast",
  "8+4 Forecast",
  "10+2 Forecast",
];

const defaultForm: FormState = {
  name: `FY${currentYear} Budget`,
  fiscalYear: currentYear,
  versionType: "Budget",
  forecastTemplate: "Budget",
  sourceVersionId: "",
  actualsThroughMonth: "",
  includeNextYear: false,
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
      setSelectedVersionIdState((current) =>
        current && loaded.some((version) => version.id === current)
          ? current
          : loaded[0]?.id || "",
      );
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

  function applyTemplate(template: StandardForecastTemplate, fiscalYear = form.fiscalYear) {
    updateForm({
      forecastTemplate: template,
      versionType: template === "Budget" ? "Budget" : "Rolling Forecast",
      actualsThroughMonth: actualsThroughMonthForTemplate(fiscalYear, template),
      name: `FY${fiscalYear} ${template}`,
    });
  }

  function beginRollingForecast(sourceVersionId?: string) {
    const source = versions.find((version) => version.id === sourceVersionId);

    setForm({
      name: `FY${source?.fiscal_year ?? currentYear} Rolling Forecast`,
      fiscalYear: source?.fiscal_year ?? currentYear,
      versionType: "Rolling Forecast",
      forecastTemplate: "5+7 Forecast",
      sourceVersionId: source?.id ?? "",
      actualsThroughMonth: actualsThroughMonthForTemplate(
        source?.fiscal_year ?? currentYear,
        "5+7 Forecast",
      ),
      includeNextYear: false,
      notes: "",
    });
    setShowForm(true);
  }

  async function handleCreateVersion() {
    const expectedActualMonth = actualsThroughMonthForTemplate(
      form.fiscalYear,
      form.forecastTemplate,
    );

    if (
      expectedActualMonth !== (form.actualsThroughMonth || "") &&
      !window.confirm(
        `${form.forecastTemplate} usually uses ${
          expectedActualMonth
            ? `actuals through ${dateToDisplayMonth(expectedActualMonth)}`
            : "no actualized months"
        }. Continue with the selected actualization month?`,
      )
    ) {
      return;
    }

    if (
      form.includeNextYear &&
      !window.confirm(
        "Include next-year forecast impact? This will add all-forecast months for the following fiscal year to this version.",
      )
    ) {
      return;
    }

    setIsSaving(true);

    try {
      const payload: CreateForecastVersionInput = {
        name: form.name,
        fiscalYear: form.fiscalYear,
        versionType: form.versionType,
        sourceVersionId: form.sourceVersionId || undefined,
        actualsThroughMonth: form.actualsThroughMonth || undefined,
        includeNextYear: form.includeNextYear,
        notes: form.notes || undefined,
      };
      const version = await createForecastVersion(payload);

      notify(
        "success",
        "Forecast version created.",
        form.actualsThroughMonth
          ? "Approved Data Room actuals were used where available. Expected actual months without approved data are labeled Preliminary and use run-rate, budget, or prior forecast placeholders."
          : form.includeNextYear
            ? "Current and next-year future months use the selected source or placeholder assumptions."
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

  const handleForecastSaved = useCallback(
    async (title: string, detail?: string) => {
      notify("success", title, detail);
      await loadVersions();
    },
    [loadVersions, notify],
  );

  const handleForecastError = useCallback(
    (title: string, error: unknown) => {
      notify(
        "error",
        title,
        error instanceof Error ? error.message : "Try again.",
      );
    },
    [notify],
  );

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
                onChange={(event) => {
                  const fiscalYear = Number(event.target.value);
                  updateForm({
                    fiscalYear,
                    actualsThroughMonth: actualsThroughMonthForTemplate(
                      fiscalYear,
                      form.forecastTemplate,
                    ),
                  });
                }}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
              />
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Forecast type
              <select
                value={form.forecastTemplate}
                onChange={(event) =>
                  applyTemplate(event.target.value as StandardForecastTemplate)
                }
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950"
              >
                {standardForecastTemplates.map((template) => (
                  <option key={template} value={template}>
                    {template}
                  </option>
                ))}
              </select>
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
            <label className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 lg:col-span-3">
              <input
                type="checkbox"
                checked={form.includeNextYear}
                onChange={(event) =>
                  updateForm({ includeNextYear: event.target.checked })
                }
              />
              Include next-year forecast impact
            </label>
          </div>

          {actualsThroughMonthForTemplate(form.fiscalYear, form.forecastTemplate) !==
          (form.actualsThroughMonth || "") ? (
            <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
              {form.forecastTemplate} usually uses{" "}
              {actualsThroughMonthForTemplate(form.fiscalYear, form.forecastTemplate)
                ? `actuals through ${dateToDisplayMonth(
                    actualsThroughMonthForTemplate(
                      form.fiscalYear,
                      form.forecastTemplate,
                    ),
                  )}`
                : "no actualized months"}
              . You can still proceed with the selected setup.
            </div>
          ) : null}

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
        <>
          <ForecastDriversSection
            version={selectedVersion}
            onSaved={handleForecastSaved}
            onError={handleForecastError}
          />
          <ForecastGridWorkspace
            version={selectedVersion}
            onSaved={handleForecastSaved}
            onError={handleForecastError}
          />
        </>
      ) : null}
    </section>
  );
}

function ForecastDriversSection({
  version,
  onSaved,
  onError,
}: {
  version: ForecastVersionWithRows;
  onSaved: (title: string, detail?: string) => Promise<void>;
  onError: (title: string, error: unknown) => void;
}) {
  const [assumptions, setAssumptions] =
    useState<ForecastDriverAssumptions>(defaultDriverAssumptions);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const preview = useMemo(
    () => buildForecastDriverPreview(version, assumptions),
    [assumptions, version],
  );
  const editableMonths = preview.filter((month) => !month.isLocked).length;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      async function loadAssumptions() {
        setIsLoading(true);

        try {
          setAssumptions(await loadForecastDriverAssumptions(version.id));
        } catch (error) {
          console.error("Forecast driver assumptions load failed", error);
          onError("Forecast drivers could not be loaded.", error);
        } finally {
          setIsLoading(false);
        }
      }

      void loadAssumptions();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [onError, version.id]);

  function updateAssumption(
    key: keyof ForecastDriverAssumptions,
    value: string,
  ) {
    setAssumptions((current) => ({
      ...current,
      [key]: key === "notes" || key === "oneTimeProfessionalFeeMonth" ? value : Number(value),
    }));
  }

  async function handleSave() {
    setIsSaving(true);

    try {
      await saveForecastDriverAssumptions({
        forecastVersionId: version.id,
        assumptions,
      });
      await onSaved(
        "Forecast driver assumptions saved.",
        summarizeForecastDriverAssumptions(assumptions),
      );
    } catch (error) {
      console.error("Forecast driver assumptions save failed", error);
      onError("Forecast drivers could not be saved.", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleApply() {
    if (editableMonths === 0) {
      onError(
        "Drivers were not applied.",
        new Error("This version has no unlocked future forecast months."),
      );
      return;
    }

    const confirmed = window.confirm(
      `Apply drivers to ${editableMonths} unlocked forecast month${editableMonths === 1 ? "" : "s"}? This will overwrite current unlocked forecast rows, but locked actualized months will not change.`,
    );

    if (!confirmed) {
      return;
    }

    setIsApplying(true);

    try {
      await saveForecastDriverAssumptions({
        forecastVersionId: version.id,
        assumptions,
      });
      await applyForecastDriversToVersion({ version, assumptions });
      await onSaved(
        "Drivers applied to forecast.",
        "Unlocked future months were updated. Actualized months were preserved.",
      );
    } catch (error) {
      console.error("Forecast driver apply failed", error);
      onError("Forecast drivers could not be applied.", error);
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">Forecast Drivers</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500">
            Build future forecast months from simple business drivers. Locked
            actualized months are preserved.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSaving || isLoading}
            onClick={() => void handleSave()}
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            {isSaving ? "Saving..." : "Save assumptions"}
          </button>
          <button
            type="button"
            disabled={isApplying || isLoading}
            onClick={() => void handleApply()}
            className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {isApplying ? "Applying..." : "Apply Drivers to Forecast"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-5 text-sm text-neutral-500">Loading forecast drivers...</p>
      ) : (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <DriverCard title="Revenue Drivers">
              <DriverInput label="Starting MRR" value={assumptions.startingMrr} onChange={(value) => updateAssumption("startingMrr", value)} />
              <DriverInput label="Monthly growth rate %" value={assumptions.monthlyGrowthRate} onChange={(value) => updateAssumption("monthlyGrowthRate", value)} />
              <DriverInput label="Churn rate %" value={assumptions.churnRate} onChange={(value) => updateAssumption("churnRate", value)} />
              <DriverInput label="Expansion revenue %" value={assumptions.expansionRevenueRate} onChange={(value) => updateAssumption("expansionRevenueRate", value)} />
              <DriverInput label="New customer revenue" value={assumptions.newCustomerRevenue} onChange={(value) => updateAssumption("newCustomerRevenue", value)} />
            </DriverCard>
            <DriverCard title="Payroll Drivers">
              <DriverInput label="Current headcount" value={assumptions.currentHeadcount} onChange={(value) => updateAssumption("currentHeadcount", value)} />
              <DriverInput label="Planned hires" value={assumptions.plannedHires} onChange={(value) => updateAssumption("plannedHires", value)} />
              <DriverInput label="Average salary" value={assumptions.averageSalary} onChange={(value) => updateAssumption("averageSalary", value)} />
              <DriverInput label="Benefits/payroll tax load %" value={assumptions.benefitsLoadRate} onChange={(value) => updateAssumption("benefitsLoadRate", value)} />
            </DriverCard>
            <DriverCard title="Hosting / Infrastructure">
              <DriverInput label="Hosting cost as % of revenue" value={assumptions.hostingRevenueRate} onChange={(value) => updateAssumption("hostingRevenueRate", value)} />
              <DriverInput label="Fixed monthly hosting cost" value={assumptions.fixedHostingCost} onChange={(value) => updateAssumption("fixedHostingCost", value)} />
            </DriverCard>
            <DriverCard title="Software">
              <DriverInput label="Fixed monthly software cost" value={assumptions.fixedSoftwareCost} onChange={(value) => updateAssumption("fixedSoftwareCost", value)} />
              <DriverInput label="Software cost per employee" value={assumptions.softwareCostPerEmployee} onChange={(value) => updateAssumption("softwareCostPerEmployee", value)} />
            </DriverCard>
            <DriverCard title="Professional Services / Legal">
              <DriverInput label="Fixed monthly amount" value={assumptions.fixedProfessionalServices} onChange={(value) => updateAssumption("fixedProfessionalServices", value)} />
              <DriverInput label="One-time legal/professional fee" value={assumptions.oneTimeProfessionalFee} onChange={(value) => updateAssumption("oneTimeProfessionalFee", value)} />
              <label className="text-sm font-medium text-neutral-700">
                One-time fee month
                <input
                  type="month"
                  value={assumptions.oneTimeProfessionalFeeMonth.slice(0, 7)}
                  onChange={(event) =>
                    updateAssumption(
                      "oneTimeProfessionalFeeMonth",
                      event.target.value ? `${event.target.value}-01` : "",
                    )
                  }
                  className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
                />
              </label>
            </DriverCard>
            <DriverCard title="Other Operating Expenses">
              <DriverInput label="Fixed monthly amount" value={assumptions.fixedOtherOpex} onChange={(value) => updateAssumption("fixedOtherOpex", value)} />
              <DriverInput label="Growth rate %" value={assumptions.otherOpexGrowthRate} onChange={(value) => updateAssumption("otherOpexGrowthRate", value)} />
              <label className="text-sm font-medium text-neutral-700">
                Notes
                <input
                  value={assumptions.notes}
                  onChange={(event) => updateAssumption("notes", event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
                />
              </label>
            </DriverCard>
          </div>

          <DriverPreviewTable rows={preview} />
        </>
      )}
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
              <th className="px-4 py-3 font-medium">Preliminary months</th>
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
                <td className="px-4 py-4">{version.preliminaryMonths}</td>
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

function DriverCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-md border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </article>
  );
}

function DriverInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium text-neutral-700">
      {label}
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
      />
    </label>
  );
}

function DriverPreviewTable({
  rows,
}: {
  rows: ReturnType<typeof buildForecastDriverPreview>;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-md border border-neutral-200">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h3 className="text-sm font-semibold">Driver Preview</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Previewed driver impact before applying to unlocked future forecast months.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-right text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Month</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Revenue</th>
              <th className="px-4 py-3 font-medium">Hosting</th>
              <th className="px-4 py-3 font-medium">Payroll</th>
              <th className="px-4 py-3 font-medium">Software</th>
              <th className="px-4 py-3 font-medium">Professional</th>
              <th className="px-4 py-3 font-medium">Other OpEx</th>
              <th className="px-4 py-3 font-medium">EBITDA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month} className="border-b border-neutral-100">
                <td className="px-4 py-3 text-left font-medium">{row.month}</td>
                <td className="px-4 py-3">
                  <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
                    {row.isLocked ? "Locked actual" : row.rowType}
                  </span>
                </td>
                <td className="px-4 py-3">{formatCurrency(row.revenue)}</td>
                <td className="px-4 py-3">{formatCurrency(row.hosting)}</td>
                <td className="px-4 py-3">{formatCurrency(row.payroll)}</td>
                <td className="px-4 py-3">{formatCurrency(row.software)}</td>
                <td className="px-4 py-3">
                  {formatCurrency(row.professionalServices)}
                </td>
                <td className="px-4 py-3">
                  {formatCurrency(row.otherOperatingExpenses)}
                </td>
                <td className="px-4 py-3">{formatCurrency(row.ebitda)}</td>
              </tr>
            ))}
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

function actualsThroughMonthForTemplate(
  fiscalYear: number,
  template: StandardForecastTemplate,
) {
  const monthNumberByTemplate: Record<StandardForecastTemplate, number> = {
    Budget: 0,
    "2+10 Forecast": 2,
    "5+7 Forecast": 5,
    "8+4 Forecast": 8,
    "10+2 Forecast": 10,
  };
  const monthNumber = monthNumberByTemplate[template];

  if (monthNumber === 0) {
    return "";
  }

  return `${fiscalYear}-${String(monthNumber).padStart(2, "0")}-01`;
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
