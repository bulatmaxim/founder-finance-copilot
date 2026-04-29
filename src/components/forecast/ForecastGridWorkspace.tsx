"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyAcceptedForecastRecommendations,
  bulkUpdateRecommendationRows,
  dismissForecastNotification,
  generateForecastRecommendationDraft,
  loadForecastNotifications,
  loadLatestForecastRecommendation,
  saveForecastVersionCheckpoint,
  updateForecastRecommendationAssumptions,
  updateForecastRecommendationRow,
  updateForecastVersionCell,
  type ForecastDetailLevel,
  type ForecastDriverRecommendation,
  type ForecastNotificationRecord,
  type ForecastRecommendationRowRecord,
  type ForecastRecommendationWithRows,
} from "@/lib/forecastRecommendations";
import {
  dateToDisplayMonth,
  getFiscalMonthOptions,
  rowsToForecastMonths,
  type ForecastVersionRowRecord,
  type ForecastVersionWithRows,
} from "@/lib/forecastVersions";
import { formatCurrency, formatPercent } from "@/lib/formatting";

const sectionConfigs = [
  {
    key: "summary",
    label: "Summary",
    lineItems: ["Revenue", "Gross Profit", "Operating Expenses", "EBITDA", "Cash Balance"],
  },
  {
    key: "revenue",
    label: "Revenue",
    lineItems: ["Subscription Revenue", "Usage Revenue", "Services Revenue", "Other Revenue", "Revenue"],
  },
  {
    key: "cost",
    label: "Cost of Revenue",
    lineItems: ["AWS Hosting", "Stripe Fees", "Customer Support", "Third-Party Data", "Cost of Revenue"],
  },
  {
    key: "payroll",
    label: "Payroll / Headcount",
    lineItems: ["Engineering Payroll", "Sales & Marketing Payroll", "G&A Payroll", "Payroll"],
  },
  {
    key: "opex",
    label: "Operating Expenses",
    lineItems: [
      "Sales & Marketing",
      "Research & Development",
      "General & Administrative",
      "HubSpot",
      "Salesforce",
      "Legal Fees",
      "Insurance",
      "Rent & Office",
      "Software Subscriptions",
      "Contractor Expense",
      "Travel & Entertainment",
    ],
  },
  {
    key: "cash",
    label: "Cash / Runway",
    lineItems: ["Cash Balance", "Net Burn", "Runway Months"],
  },
  {
    key: "assumptions",
    label: "Assumptions",
    lineItems: ["MRR Growth", "Churn", "Expansion Revenue", "Planned Hires", "Hosting % of Revenue"],
  },
] as const;

type SectionKey = (typeof sectionConfigs)[number]["key"];

type PendingActualEdit = {
  month: string;
  lineItem: string;
  amount: number;
};

type Props = {
  version: ForecastVersionWithRows;
  onSaved: (title: string, detail?: string) => Promise<void>;
  onError: (title: string, error: unknown) => void;
};

export function ForecastGridWorkspace({ version, onSaved, onError }: Props) {
  const [activeSection, setActiveSection] = useState<SectionKey>("summary");
  const [draftRows, setDraftRows] = useState<ForecastVersionRowRecord[]>(version.rows);
  const [recommendation, setRecommendation] =
    useState<ForecastRecommendationWithRows | null>(null);
  const [notifications, setNotifications] = useState<ForecastNotificationRecord[]>([]);
  const [forecastDetailLevel, setForecastDetailLevel] =
    useState<ForecastDetailLevel>("Detailed");
  const [includeNextYear, setIncludeNextYear] = useState(false);
  const [isLoadingRecommendation, setIsLoadingRecommendation] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [savingCell, setSavingCell] = useState("");
  const [pendingActualEdit, setPendingActualEdit] =
    useState<PendingActualEdit | null>(null);

  const currentSection = sectionConfigs.find((section) => section.key === activeSection) ?? sectionConfigs[0];
  const monthOptions = useMemo(
    () => getFiscalMonthOptions(version.fiscal_year),
    [version.fiscal_year],
  );
  const periodLookup = useMemo(() => {
    const periods = rowsToForecastMonths(draftRows);
    return new Map(periods.map((period) => [displayMonthToDate(period.month), period]));
  }, [draftRows]);
  const recommendationLookup = useMemo(() => {
    const map = new Map<string, ForecastRecommendationRowRecord>();

    recommendation?.rows
      .filter((row) => row.status !== "Rejected" && row.status !== "Applied")
      .forEach((row) => {
        if (row.month && row.line_item) {
          map.set(cellKey(row.month, row.line_item), row);
        }
      });

    return map;
  }, [recommendation]);
  const computedNotices = useMemo(() => buildComputedNotices(version, recommendation), [version, recommendation]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDraftRows(version.rows);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [version.rows]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecommendation() {
      setIsLoadingRecommendation(true);

      try {
        const [loadedRecommendation, loadedNotifications] = await Promise.all([
          loadLatestForecastRecommendation(version.id),
          loadForecastNotifications(version.id),
        ]);

        if (!cancelled) {
          setRecommendation(loadedRecommendation);
          setNotifications(loadedNotifications);
        }
      } catch (error) {
        console.error("Forecast recommendation load failed", error);
        onError("Forecast recommendations could not be loaded.", error);
      } finally {
        if (!cancelled) {
          setIsLoadingRecommendation(false);
        }
      }
    }

    void loadRecommendation();

    return () => {
      cancelled = true;
    };
  }, [onError, version.id]);

  async function reloadRecommendation() {
    const [loadedRecommendation, loadedNotifications] = await Promise.all([
      loadLatestForecastRecommendation(version.id),
      loadForecastNotifications(version.id),
    ]);
    setRecommendation(loadedRecommendation);
    setNotifications(loadedNotifications);
  }

  async function saveCell({
    month,
    lineItem,
    amount,
    allowActualOverride = false,
  }: PendingActualEdit & { allowActualOverride?: boolean }) {
    const key = cellKey(month, lineItem);
    setSavingCell(key);

    try {
      await updateForecastVersionCell({
        forecastVersionId: version.id,
        month,
        lineItem,
        amount,
        allowActualOverride,
      });
      await onSaved(
        allowActualOverride ? "Actual override saved." : "Forecast cell saved.",
        allowActualOverride
          ? "The change was kept inside this forecast version and did not overwrite Data Room source data."
          : undefined,
      );
    } catch (error) {
      console.error("Forecast cell update failed", error);
      onError("Forecast cell could not be saved.", error);
    } finally {
      setSavingCell("");
      setPendingActualEdit(null);
    }
  }

  function updateDraftCell(month: string, lineItem: string, amount: number) {
    setDraftRows((current) => {
      const existing = current.find((row) => row.month === month && row.category === lineItem);

      if (existing) {
        return current.map((row) =>
          row.id === existing.id ? { ...row, amount } : row,
        );
      }

      return [
        ...current,
        {
          id: `draft-${month}-${lineItem}`,
          user_id: null,
          company_id: version.company_id,
          forecast_version_id: version.id,
          month,
          category: lineItem,
          amount,
          row_type: "Forecast",
          source: "Manual Override",
          is_locked: false,
          created_at: null,
          updated_at: null,
        },
      ];
    });
  }

  async function handleGenerateRecommendation(allowUnapprovedData = false) {
    if (
      !allowUnapprovedData &&
      version.actuals_through_month &&
      (version.actualMonths === 0 || version.preliminaryMonths > 0)
    ) {
      const confirmed = window.confirm(
        "Some monthly close data is not approved. Forecast recommendations may be incomplete or unreliable. Would you like to proceed anyway?",
      );

      if (!confirmed) {
        return;
      }
      await handleGenerateRecommendation(true);
      return;
    }

    setIsGenerating(true);

    try {
      const draft = await generateForecastRecommendationDraft({
        forecastVersionId: version.id,
        includeNextYear,
        forecastDetailLevel,
        allowUnapprovedData,
      });
      setRecommendation(draft);
      await reloadRecommendation();
      await onSaved(
        "AI forecast recommendation created.",
        "Review and accept recommendations before applying them to the official forecast.",
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("not approved") &&
        !allowUnapprovedData
      ) {
        const confirmed = window.confirm(
          "Some monthly close data is not approved. Forecast recommendations may be incomplete or unreliable. Would you like to proceed anyway?",
        );

        if (confirmed) {
          await handleGenerateRecommendation(true);
        }
      } else {
        console.error("AI forecast recommendation failed", error);
        onError("AI forecast recommendation failed.", error);
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function updateRow(row: ForecastRecommendationRowRecord, action: "Accepted" | "Rejected" | "Edited" | "Pending") {
    try {
      await updateForecastRecommendationRow({ row, status: action });
      await reloadRecommendation();
    } catch (error) {
      onError("Recommendation update failed.", error);
    }
  }

  async function editRecommendationAmount(row: ForecastRecommendationRowRecord) {
    const value = window.prompt(
      "Enter revised suggested forecast amount.",
      String(Math.round(Number(row.suggested_amount ?? 0))),
    );

    if (value === null) {
      return;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      onError("Recommendation was not edited.", new Error("Enter a valid number."));
      return;
    }

    try {
      await updateForecastRecommendationRow({ row, suggestedAmount: parsed, status: "Edited" });
      await reloadRecommendation();
    } catch (error) {
      onError("Recommendation edit failed.", error);
    }
  }

  async function addRecommendationNote(row: ForecastRecommendationRowRecord) {
    const note = window.prompt("Add a note for this recommendation.", row.note ?? "");

    if (note === null) {
      return;
    }

    try {
      await updateForecastRecommendationRow({ row, note });
      await reloadRecommendation();
    } catch (error) {
      onError("Recommendation note could not be saved.", error);
    }
  }

  async function bulkRows(status: "Accepted" | "Rejected", highConfidenceOnly = false) {
    if (!recommendation) {
      return;
    }

    try {
      await bulkUpdateRecommendationRows({
        recommendation,
        status,
        confidence: highConfidenceOnly ? "High" : undefined,
      });
      await reloadRecommendation();
    } catch (error) {
      onError("Bulk recommendation action failed.", error);
    }
  }

  async function applyAccepted() {
    if (!recommendation) {
      return;
    }

    const acceptedCount = recommendation.rows.filter(
      (row) => row.status === "Accepted" || row.status === "Edited",
    ).length;

    if (acceptedCount === 0) {
      onError("No recommendations applied.", new Error("Accept at least one recommendation first."));
      return;
    }

    const confirmed = window.confirm(
      `Apply ${acceptedCount} accepted recommendation${acceptedCount === 1 ? "" : "s"} to unlocked forecast rows? Locked actualized months will be preserved.`,
    );

    if (!confirmed) {
      return;
    }

    setIsApplying(true);

    try {
      await applyAcceptedForecastRecommendations(recommendation);
      await reloadRecommendation();
      await onSaved(
        "Accepted AI recommendations applied.",
        "Forecast rows were updated and accepted suggestion styling has returned to neutral.",
      );
    } catch (error) {
      console.error("Forecast recommendation apply failed", error);
      onError("Accepted recommendations could not be applied.", error);
    } finally {
      setIsApplying(false);
    }
  }

  async function saveForecast() {
    try {
      await saveForecastVersionCheckpoint(version.id);
      await onSaved(
        "Forecast saved.",
        "Current forecast rows, accepted AI changes, and driver assumptions are saved for this version.",
      );
    } catch (error) {
      onError("Forecast could not be saved.", error);
    }
  }

  async function updateDriverChange(
    change: ForecastDriverRecommendation,
    patch: Partial<ForecastDriverRecommendation>,
  ) {
    if (!recommendation) {
      return;
    }

    const changes = recommendation.assumptions?.driver_changes ?? [];
    const next = changes.map((item) =>
      item.driver_type === change.driver_type &&
      item.assumption_name === change.assumption_name
        ? { ...item, ...patch }
        : item,
    );

    try {
      await updateForecastRecommendationAssumptions({
        recommendation,
        driverChanges: next,
      });
      await reloadRecommendation();
    } catch (error) {
      onError("Driver recommendation could not be updated.", error);
    }
  }

  async function dismissNotification(id: string) {
    try {
      await dismissForecastNotification(id);
      setNotifications((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      onError("Forecast notification could not be dismissed.", error);
    }
  }

  return (
    <section className="premium-card overflow-hidden">
      <div className="premium-panel-header flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="premium-pill inline-flex">Forecast Grid</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">{version.name}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
            Sectioned forecast workspace with locked actual months, editable forecast
            months, AI recommendation drafts, and driver assumption changes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs font-medium text-[var(--text-muted)]">
            Forecast Detail Level
            <select
              value={forecastDetailLevel}
              onChange={(event) => setForecastDetailLevel(event.target.value as ForecastDetailLevel)}
              className="mt-1 h-10 rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--foreground)] outline-none"
            >
              <option value="Detailed">Detailed line-item forecast</option>
              <option value="Category">Category-level forecast</option>
            </select>
          </label>
          <label className="flex h-10 items-center gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] px-3 text-sm font-medium text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={includeNextYear}
              onChange={(event) => setIncludeNextYear(event.target.checked)}
            />
            Include next-year impact
          </label>
          <button
            type="button"
            onClick={() => void saveForecast()}
            className="h-10 rounded-md border border-[var(--line-soft)] px-4 text-sm font-medium text-[var(--foreground)]"
          >
            Save Forecast
          </button>
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => void handleGenerateRecommendation(false)}
            className="h-10 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Forecast with AI"}
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <ForecastNotificationStrip
          computedNotices={computedNotices}
          notifications={notifications}
          onDismiss={(id) => void dismissNotification(id)}
        />

        <ForecastContextPanel version={version} />

        <div className="flex flex-wrap gap-2">
          {sectionConfigs.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => setActiveSection(section.key)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                activeSection === section.key
                  ? "border-[var(--accent)] bg-[rgba(56,189,248,0.12)] text-[var(--foreground)]"
                  : "border-[var(--line-soft)] bg-[var(--surface-soft)] text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {activeSection === "assumptions" ? (
          <AssumptionsSection recommendation={recommendation} onUpdate={updateDriverChange} />
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--line-soft)]">
            <table className="w-full min-w-[1380px] text-right text-sm">
              <thead className="sticky top-0 border-b border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)]">
                <tr>
                  <th className="w-48 px-4 py-3 text-left font-medium">Line Item</th>
                  {monthOptions.map((month) => (
                    <th key={month.value} className="px-3 py-3 font-medium">
                      {month.label.split(" ")[0]}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {currentSection.lineItems.map((lineItem) => {
                  const total = monthOptions.reduce(
                    (sum, month) => sum + valueForLineItem(draftRows, periodLookup, month.value, lineItem),
                    0,
                  );

                  return (
                    <tr key={lineItem} className="border-b border-[var(--line-soft)]/70 hover:bg-[var(--surface-tint)]">
                      <td className="sticky left-0 bg-[var(--surface-soft)] px-4 py-3 text-left font-medium text-[var(--foreground)]">
                        {lineItem}
                      </td>
                      {monthOptions.map((month) => {
                        const row = rowForLineItem(draftRows, month.value, lineItem);
                        const value = valueForLineItem(draftRows, periodLookup, month.value, lineItem);
                        const recommendationRow = recommendationLookup.get(cellKey(month.value, lineItem));
                        const status = statusForCell(row, recommendationRow, version.status);
                        const isDerived = isDerivedLineItem(lineItem);
                        const isActual = row?.row_type === "Actual" || status === "Actual";
                        const key = cellKey(month.value, lineItem);

                        return (
                          <td key={month.value} className="px-3 py-3 align-top">
                            <ForecastAmountInput
                              value={recommendationRow ? Number(recommendationRow.suggested_amount ?? value) : value}
                              status={status}
                              sourceNote={row?.source ?? null}
                              disabled={isDerived || savingCell === key}
                              isSaving={savingCell === key}
                              onDraftChange={(amount) => updateDraftCell(month.value, lineItem, amount)}
                              onCommit={(amount) => {
                                if (isDerived) return;
                                if (isActual) {
                                  setPendingActualEdit({ month: month.value, lineItem, amount });
                                  return;
                                }
                                void saveCell({ month: month.value, lineItem, amount });
                              }}
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 font-semibold text-[var(--foreground)]">
                        {lineItem === "Runway Months"
                          ? `${total.toFixed(1)} mo`
                          : formatCurrency(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {isLoadingRecommendation ? (
          <div className="premium-skeleton h-24 rounded-md" />
        ) : recommendation ? (
          <RecommendationPanel
            recommendation={recommendation}
            isApplying={isApplying}
            onRowStatus={(row, status) => void updateRow(row, status)}
            onEditAmount={(row) => void editRecommendationAmount(row)}
            onAddNote={(row) => void addRecommendationNote(row)}
            onAcceptHighConfidence={() => void bulkRows("Accepted", true)}
            onRejectAll={() => void bulkRows("Rejected")}
            onApply={() => void applyAccepted()}
            onDriverChange={updateDriverChange}
          />
        ) : (
          <div className="premium-notice">
            No AI forecast recommendation has been generated for this version yet.
            Generate a draft, then accept or reject changes before applying them.
          </div>
        )}
      </div>

      {pendingActualEdit ? (
        <ActualEditModal
          pending={pendingActualEdit}
          onCancel={() => setPendingActualEdit(null)}
          onConfirm={() => void saveCell({ ...pendingActualEdit, allowActualOverride: true })}
        />
      ) : null}
    </section>
  );
}

function ForecastAmountInput({
  value,
  status,
  sourceNote,
  disabled,
  isSaving,
  onDraftChange,
  onCommit,
}: {
  value: number;
  status: string;
  sourceNote: string | null;
  disabled: boolean;
  isSaving: boolean;
  onDraftChange: (amount: number) => void;
  onCommit: (amount: number) => void;
}) {
  const [localValue, setLocalValue] = useState(String(Math.round(value || 0)));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLocalValue(String(Math.round(value || 0)));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [value]);

  const className = `h-9 w-28 rounded-md border px-2 text-right text-sm outline-none transition ${
    status === "AI Suggested"
      ? "border-[var(--accent)] bg-[rgba(56,189,248,0.12)] text-[var(--foreground)]"
      : status === "Actual"
        ? "border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)]"
        : status === "Preliminary"
          ? "border-[rgba(232,210,138,0.42)] bg-[rgba(232,210,138,0.12)] text-[var(--foreground)]"
        : status === "Manual Override"
          ? "border-[rgba(232,210,138,0.32)] bg-[rgba(113,63,18,0.16)] text-[var(--foreground)]"
          : "border-[var(--line-soft)] bg-[var(--surface-soft)] text-[var(--foreground)]"
  }`;

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        type="number"
        value={localValue}
        disabled={disabled || isSaving}
        onChange={(event) => {
          setLocalValue(event.target.value);
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) {
            onDraftChange(parsed);
          }
        }}
        onBlur={() => {
          const parsed = Number(localValue);
          if (Number.isFinite(parsed) && parsed !== Math.round(value || 0)) {
            onCommit(parsed);
          }
        }}
        className={className}
        title={sourceNote ?? status}
      />
      <span className="rounded border border-[var(--line-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {isSaving ? "Saving" : status}
      </span>
    </div>
  );
}

function ForecastContextPanel({ version }: { version: ForecastVersionWithRows }) {
  const actualMonths = uniqueMonthsByType(version.rows, "Actual");
  const preliminaryMonths = uniqueMonthsByType(version.rows, "Preliminary");
  const forecastMonths = uniqueMonthsByType(version.rows, "Forecast");
  const budgetMonths = uniqueMonthsByType(version.rows, "Budget");
  const latestActualMonth = actualMonths.at(-1) ?? null;
  const latestSource =
    version.rows.find((row) => row.row_type === "Preliminary")?.source ??
    version.rows.find((row) => row.row_type === "Forecast")?.source ??
    version.rows.find((row) => row.row_type === "Budget")?.source ??
    version.rows.find((row) => row.row_type === "Actual")?.source ??
    "Not available";
  const nextYearIncluded = version.rows.some(
    (row) => Number(row.month.slice(0, 4)) > version.fiscal_year,
  );

  return (
    <section className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] p-4">
      <div className="grid gap-3 lg:grid-cols-4">
        <MiniPanel title="Forecast type" value={`${version.version_type} - FY${version.fiscal_year}`} />
        <MiniPanel
          title="Expected actuals"
          value={
            version.actuals_through_month
              ? `Through ${dateToDisplayMonth(version.actuals_through_month)}`
              : "None; all months are planned"
          }
        />
        <MiniPanel
          title="Approved actuals available"
          value={latestActualMonth ? `Through ${dateToDisplayMonth(latestActualMonth)}` : "None found"}
        />
        <MiniPanel title="Latest data source" value={latestSource} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <StatusLegend label="Actual" className="bg-[var(--surface-2)] text-[var(--text-muted)]" />
        <StatusLegend label="Preliminary" className="bg-[rgba(232,210,138,0.12)] text-[var(--foreground)]" />
        <StatusLegend label="Forecast" className="bg-[var(--surface-soft)] text-[var(--foreground)]" />
        <StatusLegend label="AI Suggested" className="bg-[rgba(56,189,248,0.12)] text-[var(--foreground)]" />
        <StatusLegend label="Manual Override" className="bg-[rgba(113,63,18,0.16)] text-[var(--foreground)]" />
        <span className="rounded border border-[var(--line-soft)] px-2 py-1 text-[var(--text-muted)]">
          {actualMonths.length} actual | {preliminaryMonths.length} preliminary |{" "}
          {forecastMonths.length + budgetMonths.length} forecast/budget
        </span>
        {nextYearIncluded ? (
          <span className="rounded border border-[var(--line-soft)] px-2 py-1 text-[var(--text-muted)]">
            Next-year forecast impact included
          </span>
        ) : null}
      </div>
      {preliminaryMonths.length > 0 ? (
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
          {preliminaryMonths.map(dateToDisplayMonth).join(", ")} use placeholder
          values such as latest approved run-rate, budget baseline, or prior
          forecast until those monthly closes are approved.
        </p>
      ) : null}
    </section>
  );
}

function StatusLegend({ label, className }: { label: string; className: string }) {
  return (
    <span className={`rounded border border-[var(--line-soft)] px-2 py-1 font-medium ${className}`}>
      {label}
    </span>
  );
}

function RecommendationPanel({
  recommendation,
  isApplying,
  onRowStatus,
  onEditAmount,
  onAddNote,
  onAcceptHighConfidence,
  onRejectAll,
  onApply,
  onDriverChange,
}: {
  recommendation: ForecastRecommendationWithRows;
  isApplying: boolean;
  onRowStatus: (
    row: ForecastRecommendationRowRecord,
    status: "Accepted" | "Rejected" | "Edited" | "Pending",
  ) => void;
  onEditAmount: (row: ForecastRecommendationRowRecord) => void;
  onAddNote: (row: ForecastRecommendationRowRecord) => void;
  onAcceptHighConfidence: () => void;
  onRejectAll: () => void;
  onApply: () => void;
  onDriverChange: (
    change: ForecastDriverRecommendation,
    patch: Partial<ForecastDriverRecommendation>,
  ) => Promise<void>;
}) {
  const summary = recommendation.summary ?? {};
  const risks = Array.isArray(recommendation.risks)
    ? (recommendation.risks as { title?: string; severity?: string; detail?: string }[])
    : [];
  const driverChanges = recommendation.assumptions?.driver_changes ?? [];

  return (
    <section className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)]">
      <div className="border-b border-[var(--line-soft)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="premium-pill inline-flex">Draft Recommendation</p>
            <h3 className="mt-3 text-base font-semibold">AI Forecast Recommendation</h3>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--text-muted)]">
              {summary.executive_summary ?? "Review recommended forecast changes before applying."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onAcceptHighConfidence} className="rounded-md border border-[var(--line-soft)] px-3 py-2 text-xs font-medium">
              Accept high confidence
            </button>
            <button type="button" onClick={onRejectAll} className="rounded-md border border-[var(--line-soft)] px-3 py-2 text-xs font-medium">
              Reject all
            </button>
            <button
              type="button"
              disabled={isApplying}
              onClick={onApply}
              className="rounded-md bg-[var(--foreground)] px-3 py-2 text-xs font-medium text-[var(--background)] disabled:opacity-50"
            >
              {isApplying ? "Applying..." : "Apply approved recommendations"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <MiniPanel title="Forecast impact" value={summary.forecast_impact ?? "No impact summary yet."} />
          <MiniPanel title="Cash / runway impact" value={summary.cash_runway_impact ?? "No runway summary yet."} />
          <MiniPanel title="Confidence" value={summary.confidence_level ?? "Medium"} />
        </div>
        {summary.reasoning ? (
              <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">{summary.reasoning}</p>
        ) : null}
      </div>

      {driverChanges.length > 0 ? (
        <div className="border-b border-[var(--line-soft)] p-4">
          <h4 className="text-sm font-semibold">Suggested Driver Assumption Changes</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {driverChanges.map((change) => (
              <article key={`${change.driver_type}-${change.assumption_name}`} className="rounded-md border border-[var(--line-soft)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{change.assumption_name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{change.driver_type}</p>
                  </div>
                  <ConfidenceBadge confidence={change.confidence} />
                </div>
                <p className="mt-2 text-sm text-[var(--foreground)]">
                  {formatDriverValue(change.current_value, change.assumption_unit)} {" -> "}
                  {formatDriverValue(change.suggested_value, change.assumption_unit)}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{change.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <SmallAction onClick={() => void onDriverChange(change, { status: "Accepted" })}>Accept</SmallAction>
                  <SmallAction onClick={() => void onDriverChange(change, { status: "Rejected" })}>Reject</SmallAction>
                  <SmallAction
                    onClick={() => {
                      const next = window.prompt(
                        "Edit suggested assumption value.",
                        String(change.suggested_value ?? ""),
                      );
                      if (next === null) return;
                      const parsed = Number(next);
                      if (Number.isFinite(parsed)) {
                        void onDriverChange(change, {
                          suggested_value: parsed,
                          status: "Edited",
                        });
                      }
                    }}
                  >
                    Edit
                  </SmallAction>
                  <span className="rounded border border-[var(--line-soft)] px-2 py-1 text-xs text-[var(--text-muted)]">
                    {change.status}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Section</th>
              <th className="px-4 py-3 font-medium">Line Item</th>
              <th className="px-4 py-3 font-medium">Month</th>
              <th className="px-4 py-3 text-right font-medium">Current</th>
              <th className="px-4 py-3 text-right font-medium">AI Suggested</th>
              <th className="px-4 py-3 text-right font-medium">Change</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Confidence</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {recommendation.rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--line-soft)]/70">
                <td className="px-4 py-3">{row.section ?? "Forecast"}</td>
                <td className="px-4 py-3 font-medium">{row.line_item ?? "Line item"}</td>
                <td className="px-4 py-3">{dateToDisplayMonth(row.month)}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(Number(row.current_amount ?? 0))}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(Number(row.suggested_amount ?? 0))}</td>
                <td className="px-4 py-3 text-right">
                  <div>{formatCurrency(Number(row.change_amount ?? 0))}</div>
                  <div className="text-xs text-[var(--text-muted)]">{formatPercent(Number(row.change_percent ?? 0))}</div>
                </td>
                <td className="max-w-xs px-4 py-3 text-[var(--text-muted)]">{row.reason}</td>
                <td className="px-4 py-3"><ConfidenceBadge confidence={row.confidence ?? "Medium"} /></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <SmallAction onClick={() => onRowStatus(row, "Accepted")}>Accept</SmallAction>
                    <SmallAction onClick={() => onRowStatus(row, "Rejected")}>Reject</SmallAction>
                    <SmallAction onClick={() => onEditAmount(row)}>Edit</SmallAction>
                    <SmallAction onClick={() => onAddNote(row)}>Note</SmallAction>
                    <span className="rounded border border-[var(--line-soft)] px-2 py-1 text-xs text-[var(--text-muted)]">
                      {row.status}
                    </span>
                  </div>
                  {row.note ? <p className="mt-2 text-xs text-[var(--text-muted)]">Note: {row.note}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {risks.length > 0 ? (
        <div className="border-t border-[var(--line-soft)] p-4">
          <h4 className="text-sm font-semibold">Risks</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {risks.map((risk) => (
              <MiniPanel
                key={`${risk.title}-${risk.detail}`}
                title={`${risk.severity ?? "Medium"} risk`}
                value={`${risk.title ?? "Risk"}: ${risk.detail ?? ""}`}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AssumptionsSection({
  recommendation,
  onUpdate,
}: {
  recommendation: ForecastRecommendationWithRows | null;
  onUpdate: (
    change: ForecastDriverRecommendation,
    patch: Partial<ForecastDriverRecommendation>,
  ) => Promise<void>;
}) {
  const changes = recommendation?.assumptions?.driver_changes ?? [];

  if (changes.length === 0) {
    return (
      <div className="premium-notice">
        Generate an AI recommendation to review suggested driver assumption changes.
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {changes.map((change) => (
        <article key={`${change.driver_type}-${change.assumption_name}`} className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{change.assumption_name}</h3>
              <p className="text-xs text-[var(--text-muted)]">{change.driver_type}</p>
            </div>
            <ConfidenceBadge confidence={change.confidence} />
          </div>
          <p className="mt-3 text-sm">
            {formatDriverValue(change.current_value, change.assumption_unit)} {" -> "}
            <strong>{formatDriverValue(change.suggested_value, change.assumption_unit)}</strong>
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{change.reason}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SmallAction onClick={() => void onUpdate(change, { status: "Accepted" })}>Accept</SmallAction>
            <SmallAction onClick={() => void onUpdate(change, { status: "Rejected" })}>Reject</SmallAction>
            <SmallAction
              onClick={() => {
                const value = window.prompt("Edit suggested value.", String(change.suggested_value ?? ""));
                if (value === null) return;
                const parsed = Number(value);
                if (Number.isFinite(parsed)) {
                  void onUpdate(change, { suggested_value: parsed, status: "Edited" });
                }
              }}
            >
              Edit
            </SmallAction>
            <span className="rounded border border-[var(--line-soft)] px-2 py-1 text-xs text-[var(--text-muted)]">
              {change.status}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function ForecastNotificationStrip({
  computedNotices,
  notifications,
  onDismiss,
}: {
  computedNotices: { title: string; message: string }[];
  notifications: ForecastNotificationRecord[];
  onDismiss: (id: string) => void;
}) {
  const items = [
    ...computedNotices.map((item, index) => ({ id: `computed-${index}`, ...item, dismissible: false })),
    ...notifications.map((item) => ({
      id: item.id,
      title: item.title ?? "Forecast notification",
      message: item.message ?? "",
      dismissible: true,
    })),
  ];

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div key={item.id} className="premium-notice flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{item.title}</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{item.message}</p>
          </div>
          {item.dismissible ? (
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="rounded-md border border-[var(--line-soft)] px-2 py-1 text-xs font-medium"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ActualEditModal({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingActualEdit;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <section className="premium-card max-w-lg p-6">
        <h3 className="text-lg font-semibold">Edit Actuals?</h3>
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
          You are about to change actual financial data inside this forecast
          version. Actuals should normally be updated through Data Room or Data
          Entry. This edit will be treated as a forecast override and will not
          rewrite the approved Data Room source data.
        </p>
        <div className="mt-4 rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] p-3 text-sm">
          <p><strong>Line item:</strong> {pending.lineItem}</p>
          <p><strong>Month:</strong> {dateToDisplayMonth(pending.month)}</p>
          <p><strong>Override amount:</strong> {formatCurrency(pending.amount)}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-[var(--line-soft)] px-4 py-2 text-sm font-medium">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)]">
            Confirm Edit
          </button>
        </div>
      </section>
    </div>
  );
}

function MiniPanel({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] p-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{value}</p>
    </article>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const label = `${confidence} confidence`;
  return (
    <span className="rounded border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 py-1 text-xs font-medium text-[var(--foreground)]">
      {label}
    </span>
  );
}

function SmallAction({
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
      className="rounded-md border border-[var(--line-soft)] px-2 py-1 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-tint)]"
    >
      {children}
    </button>
  );
}

function statusForCell(
  row: ForecastVersionRowRecord | undefined,
  recommendationRow: ForecastRecommendationRowRecord | undefined,
  versionStatus: string,
) {
  if (recommendationRow) return "AI Suggested";
  if (row?.source?.toLowerCase().includes("manual override")) return "Manual Override";
  if (row?.row_type === "Actual" || row?.is_locked) return "Actual";
  if (row?.row_type === "Preliminary") return "Preliminary";
  if (versionStatus === "Approved" || versionStatus === "Published") return "Approved";
  return row?.row_type ?? "Forecast";
}

function rowForLineItem(
  rows: ForecastVersionRowRecord[],
  month: string,
  lineItem: string,
) {
  return rows.find((row) => row.month === month && row.category === lineItem);
}

function valueForLineItem(
  rows: ForecastVersionRowRecord[],
  periodLookup: Map<string, ReturnType<typeof rowsToForecastMonths>[number]>,
  month: string,
  lineItem: string,
) {
  const direct = rowForLineItem(rows, month, lineItem);

  if (direct) {
    return Number(direct.amount ?? 0);
  }

  const period = periodLookup.get(month);

  if (!period) {
    return 0;
  }

  if (lineItem === "Gross Profit") return period.grossProfit;
  if (lineItem === "Operating Expenses") return period.operatingExpenses;
  if (lineItem === "EBITDA") return period.ebitda;
  if (lineItem === "Net Burn") return period.netBurn;
  if (lineItem === "Runway Months") return period.runwayMonths;
  if (lineItem === "Payroll") {
    return period.researchAndDevelopment + period.salesAndMarketing + period.generalAndAdministrative;
  }

  return 0;
}

function isDerivedLineItem(lineItem: string) {
  return [
    "Gross Profit",
    "Operating Expenses",
    "EBITDA",
    "Net Burn",
    "Runway Months",
    "MRR Growth",
    "Churn",
    "Expansion Revenue",
    "Planned Hires",
    "Hosting % of Revenue",
  ].includes(lineItem);
}

function buildComputedNotices(
  version: ForecastVersionWithRows,
  recommendation: ForecastRecommendationWithRows | null,
) {
  const notices: { title: string; message: string }[] = [];
  const name = version.name.toLowerCase();

  if (name.includes("5+7") || version.actualMonths >= 5) {
    notices.push({
      title: `${version.name} is ready for forecast review`,
      message:
        "Actualized months are available. Review AI recommendations before publishing the rolling forecast.",
    });
  }

  if (version.actuals_through_month && version.actualMonths === 0) {
    notices.push({
      title: "Approved actuals not found",
      message:
        "This version requests actualized months, but no approved Data Room actual rows were found for the period.",
    });
  }

  if (version.preliminaryMonths > 0) {
    notices.push({
      title: "Preliminary months included",
      message:
        "Some expected actual months are not approved yet. Those cells use run-rate, budget, or prior forecast placeholders and are not treated as approved actuals.",
    });
  }

  if (!recommendation || recommendation.status === "Draft") {
    notices.push({
      title: "Forecast recommendation pending",
      message:
        "Workflow: review actuals, edit forecast months, forecast with AI, apply accepted recommendations, then save the final forecast.",
    });
  }

  return notices;
}

function uniqueMonthsByType(rows: ForecastVersionRowRecord[], rowType: string) {
  return [...new Set(rows.filter((row) => row.row_type === rowType).map((row) => row.month))].sort();
}

function cellKey(month: string, lineItem: string) {
  return `${month}::${lineItem}`;
}

function displayMonthToDate(month: string) {
  const date = new Date(`${month} 1`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDriverValue(value: number | null, unit: string | null) {
  if (value === null || value === undefined) {
    return "Not set";
  }

  if (unit === "currency") {
    return formatCurrency(value);
  }

  if (unit === "percent") {
    return `${value}%`;
  }

  return `${value}`;
}
