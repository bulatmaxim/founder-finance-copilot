"use client";

import { useEffect, useMemo, useState } from "react";
import { AccountMappingNotice } from "@/components/AccountMappingNotice";
import { ReportingSourceNotice } from "@/components/ReportingSourceNotice";
import {
  aggregateFinancialPeriods,
  calculateVarianceDollars,
  calculateVariancePercent,
  getVarianceStatus,
  type FavorableDirection,
  type FinancialPeriod,
} from "@/lib/calculations";
import {
  formatCurrency,
  formatPercent,
  formatPercentVarianceLabel,
  formatRunwayMonths,
  formatVarianceLabel,
} from "@/lib/formatting";
import {
  getActiveBudgetData,
  getActiveCashData,
  getActiveFinancialData,
  getActualsSourceLabel,
  getBudgetSourceLabel,
  getCashSourceLabel,
  type DataSourceMode,
} from "@/lib/localDataStore";
import {
  loadForecastVersionsForDisplay,
  type ForecastVersionWithRows,
} from "@/lib/forecastVersions";

type ComparisonType =
  | "Actuals vs Budget"
  | "Actuals vs Forecast"
  | "Forecast vs Forecast"
  | "Budget vs Forecast";
type PeriodMode = "Month" | "Quarter" | "YTD" | "Full Year";
type ViewMode =
  | "Summary"
  | "Revenue"
  | "Cost of Revenue"
  | "Operating Expenses"
  | "Cash / Runway"
  | "Line Items";
type MetricFormat = "currency" | "percent" | "months";

type DatasetOption = {
  id: string;
  label: string;
  sourceLabel: string;
  sourceMode: DataSourceMode | "forecastVersion" | "budget";
  periods: FinancialPeriod[];
  status?: string;
  preliminaryMonths?: number;
  latestActualMonth?: string;
};

type MetricDefinition = {
  label: string;
  key:
    | "revenue"
    | "costOfRevenue"
    | "grossProfit"
    | "grossMargin"
    | "salesAndMarketing"
    | "researchAndDevelopment"
    | "generalAndAdministrative"
    | "operatingExpenses"
    | "ebitda"
    | "cashBalance"
    | "netBurn"
    | "runwayMonths";
  format: MetricFormat;
  favorableDirection: FavorableDirection;
  section: ViewMode;
};

const comparisonTypes: ComparisonType[] = [
  "Actuals vs Budget",
  "Actuals vs Forecast",
  "Forecast vs Forecast",
  "Budget vs Forecast",
];
const periodModes: PeriodMode[] = ["Month", "Quarter", "YTD", "Full Year"];
const viewModes: ViewMode[] = [
  "Summary",
  "Revenue",
  "Cost of Revenue",
  "Operating Expenses",
  "Cash / Runway",
  "Line Items",
];

const metrics: MetricDefinition[] = [
  { label: "Revenue", key: "revenue", format: "currency", favorableDirection: "higher", section: "Revenue" },
  { label: "Cost of Revenue", key: "costOfRevenue", format: "currency", favorableDirection: "lower", section: "Cost of Revenue" },
  { label: "Gross Profit", key: "grossProfit", format: "currency", favorableDirection: "higher", section: "Summary" },
  { label: "Gross Margin", key: "grossMargin", format: "percent", favorableDirection: "higher", section: "Summary" },
  { label: "Sales & Marketing", key: "salesAndMarketing", format: "currency", favorableDirection: "lower", section: "Operating Expenses" },
  { label: "Research & Development", key: "researchAndDevelopment", format: "currency", favorableDirection: "lower", section: "Operating Expenses" },
  { label: "General & Administrative", key: "generalAndAdministrative", format: "currency", favorableDirection: "lower", section: "Operating Expenses" },
  { label: "Operating Expenses", key: "operatingExpenses", format: "currency", favorableDirection: "lower", section: "Operating Expenses" },
  { label: "EBITDA", key: "ebitda", format: "currency", favorableDirection: "higher", section: "Summary" },
  { label: "Cash Balance", key: "cashBalance", format: "currency", favorableDirection: "higher", section: "Cash / Runway" },
  { label: "Net Burn", key: "netBurn", format: "currency", favorableDirection: "lower", section: "Cash / Runway" },
  { label: "Runway", key: "runwayMonths", format: "months", favorableDirection: "higher", section: "Cash / Runway" },
];

export default function ComparisonPage() {
  const [activeData, setActiveData] = useState(() => getActiveFinancialData());
  const [activeBudget, setActiveBudget] = useState(() => getActiveBudgetData());
  const [activeCash, setActiveCash] = useState(() => getActiveCashData());
  const [forecastVersions, setForecastVersions] = useState<ForecastVersionWithRows[]>([]);
  const [isLoadingForecastVersions, setIsLoadingForecastVersions] = useState(true);
  const [comparisonType, setComparisonType] =
    useState<ComparisonType>("Actuals vs Budget");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("Month");
  const [viewMode, setViewMode] = useState<ViewMode>("Summary");
  const [selectedMonth, setSelectedMonth] = useState(
    activeData.periods.at(-1)?.month ?? "",
  );
  const [leftDatasetId, setLeftDatasetId] = useState("actuals");
  const [rightDatasetId, setRightDatasetId] = useState("budget");
  const [hasInitializedDefaults, setHasInitializedDefaults] = useState(false);

  useEffect(() => {
    function refreshData() {
      const refreshed = getActiveFinancialData();
      setActiveData(refreshed);
      setActiveBudget(getActiveBudgetData());
      setActiveCash(getActiveCashData());
      setSelectedMonth(refreshed.periods.at(-1)?.month ?? "");
    }

    window.addEventListener("founder-finance-data-hydrated", refreshData);
    return () => window.removeEventListener("founder-finance-data-hydrated", refreshData);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadVersions() {
      try {
        const loaded = await loadForecastVersionsForDisplay();
        if (!cancelled) setForecastVersions(loaded);
      } catch (error) {
        console.error("Forecast versions could not be loaded for comparison", error);
      } finally {
        if (!cancelled) setIsLoadingForecastVersions(false);
      }
    }

    void loadVersions();
    return () => {
      cancelled = true;
    };
  }, []);

  const datasets = useMemo(
    () => buildDatasets({ activeData, activeBudget, forecastVersions }),
    [activeBudget, activeData, forecastVersions],
  );
  const months = useMemo(() => uniqueMonthsForDatasets(datasets), [datasets]);
  const leftDataset = datasets.find((dataset) => dataset.id === leftDatasetId) ?? datasets[0];
  const rightDataset = datasets.find((dataset) => dataset.id === rightDatasetId) ?? datasets[1] ?? datasets[0];
  const leftAggregate = aggregateFinancialPeriods(
    selectPeriods(leftDataset.periods, periodMode, selectedMonth),
  );
  const rightAggregate = aggregateFinancialPeriods(
    selectPeriods(rightDataset.periods, periodMode, selectedMonth),
  );
  const visibleMetrics =
    viewMode === "Line Items"
      ? metrics
      : viewMode === "Summary"
        ? metrics.filter((metric) => ["Summary", "Revenue", "Cash / Runway"].includes(metric.section))
        : metrics.filter((metric) => metric.section === viewMode);
  const rows = visibleMetrics.map((metric) => {
    const left = leftAggregate[metric.key];
    const right = rightAggregate[metric.key];
    const varianceDollars = calculateVarianceDollars(left, right);
    const variancePercent = calculateVariancePercent(left, right);

    return {
      metric: metric.label,
      left,
      right,
      varianceDollars,
      variancePercent,
      status: getVarianceStatus(left, right, metric.favorableDirection),
      format: metric.format,
    };
  });

  useEffect(() => {
    if (months.length > 0 && !months.includes(selectedMonth)) {
      const timeout = window.setTimeout(() => {
        setSelectedMonth(months.at(-1) ?? "");
      }, 0);

      return () => window.clearTimeout(timeout);
    }
  }, [months, selectedMonth]);

  useEffect(() => {
    if (hasInitializedDefaults || isLoadingForecastVersions || datasets.length === 0) {
      return;
    }

    const defaults = chooseSmartDefaultComparison({
      datasets,
      activeDataSource: activeData.dataSource,
      activeBudgetSource: activeBudget.dataSource,
    });

    const timeout = window.setTimeout(() => {
      setComparisonType(defaults.comparisonType);
      setLeftDatasetId(defaults.leftDatasetId);
      setRightDatasetId(defaults.rightDatasetId);
      setHasInitializedDefaults(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [
    activeBudget.dataSource,
    activeData.dataSource,
    datasets,
    hasInitializedDefaults,
    isLoadingForecastVersions,
  ]);

  function setComparison(nextType: ComparisonType) {
    setComparisonType(nextType);
    setHasInitializedDefaults(true);

    if (nextType === "Actuals vs Budget") {
      setLeftDatasetId("actuals");
      setRightDatasetId("budget");
    } else if (nextType === "Actuals vs Forecast") {
      setLeftDatasetId("actuals");
      setRightDatasetId(firstForecastId(datasets));
    } else if (nextType === "Forecast vs Forecast") {
      setLeftDatasetId(firstForecastId(datasets));
      setRightDatasetId(secondForecastId(datasets));
    } else {
      setLeftDatasetId("budget");
      setRightDatasetId(firstForecastId(datasets));
    }
  }

  return (
    <section className="space-y-8">
      <div className="premium-card overflow-hidden rounded-3xl p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200/70">
              Comparison
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-50">
              Forecast & Actuals Comparison
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Choose actuals, budgets, and forecast versions to compare by
              month, quarter, year-to-date, or full year.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[620px]">
            <Select label="Comparison Type" value={comparisonType} options={comparisonTypes} onChange={(value) => setComparison(value as ComparisonType)} />
            <Select label="Period" value={periodMode} options={periodModes} onChange={(value) => setPeriodMode(value as PeriodMode)} />
            <Select label="View" value={viewMode} options={viewModes} onChange={(value) => setViewMode(value as ViewMode)} />
            <label className="text-sm font-medium text-slate-300">
              Reporting Month
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
              >
                {months.map((month) => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <section className="premium-card rounded-2xl p-5">
        <div className="mb-4 rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] p-4">
          <p className="text-sm font-semibold">
            Comparing: {leftDataset.label} vs {rightDataset.label}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {comparisonContextLabel(leftDataset, rightDataset, selectedMonth)}
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <DatasetPicker
            label="Left dataset"
            value={leftDatasetId}
            datasets={datasets}
            onChange={setLeftDatasetId}
          />
          <DatasetPicker
            label="Right dataset"
            value={rightDatasetId}
            datasets={datasets}
            onChange={setRightDatasetId}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <SourceBadge label={leftDataset.sourceLabel} />
          <SourceBadge label={rightDataset.sourceLabel} />
          <SourceBadge label={`Cash: ${getCashSourceLabel(activeCash.dataSource)}`} />
          {leftDataset.preliminaryMonths ? (
            <SourceBadge label={`${leftDataset.label}: ${leftDataset.preliminaryMonths} preliminary month${leftDataset.preliminaryMonths === 1 ? "" : "s"}`} />
          ) : null}
          {rightDataset.preliminaryMonths ? (
            <SourceBadge label={`${rightDataset.label}: ${rightDataset.preliminaryMonths} preliminary month${rightDataset.preliminaryMonths === 1 ? "" : "s"}`} />
          ) : null}
        </div>
      </section>

      <ReportingSourceNotice
        reportingMonth={selectedMonth}
        sources={[activeData.dataSource, activeBudget.dataSource, activeCash.dataSource]}
      />
      <AccountMappingNotice />

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Left revenue" value={formatCurrency(leftAggregate.revenue)} />
        <SummaryCard label="Right revenue" value={formatCurrency(rightAggregate.revenue)} />
        <SummaryCard
          label="EBITDA variance"
          value={formatMetricVariance(leftAggregate.ebitda - rightAggregate.ebitda, "currency")}
        />
      </div>

      <ComparisonTable
        rows={rows}
        leftLabel={leftDataset.label}
        rightLabel={rightDataset.label}
      />

      {[...activeData.warnings, ...activeBudget.warnings].length > 0 ? (
        <section className="premium-card rounded-2xl p-5">
          <h2 className="text-base font-semibold text-slate-50">Data Assumptions</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
            {[...activeData.warnings, ...activeBudget.warnings].map((warning) => (
              <li key={warning} className="ml-4 list-disc">{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function ComparisonTable({
  rows,
  leftLabel,
  rightLabel,
}: {
  rows: {
    metric: string;
    left: number;
    right: number;
    varianceDollars: number;
    variancePercent: number;
    status: string;
    format: MetricFormat;
  }[];
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <section className="premium-card overflow-hidden rounded-2xl">
      <div className="premium-panel-header px-5 py-4">
        <h2 className="text-base font-semibold text-slate-50">Comparison Table</h2>
        <p className="mt-1 text-sm text-slate-400">
          Variance is calculated as left dataset less right dataset.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3 font-medium">Line Item</th>
              <th className="px-4 py-3 font-medium">{leftLabel}</th>
              <th className="px-4 py-3 font-medium">{rightLabel}</th>
              <th className="px-4 py-3 font-medium">Variance $</th>
              <th className="px-4 py-3 font-medium">Variance %</th>
              <th className="px-4 py-3 font-medium">Favorable / Unfavorable</th>
              <th className="px-4 py-3 font-medium">Commentary</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.metric} className="border-b border-neutral-100">
                <td className="px-4 py-3 font-medium">{row.metric}</td>
                <td className="px-4 py-3">{formatMetricValue(row.left, row.format)}</td>
                <td className="px-4 py-3">{formatMetricValue(row.right, row.format)}</td>
                <td className="px-4 py-3">{formatMetricVariance(row.varianceDollars, row.format)}</td>
                <td className="px-4 py-3">{formatPercentVarianceLabel(row.variancePercent)}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                <td className="px-4 py-3 text-neutral-500">
                  {commentaryForVariance(row.metric, row.variancePercent, row.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildDatasets({
  activeData,
  activeBudget,
  forecastVersions,
}: {
  activeData: ReturnType<typeof getActiveFinancialData>;
  activeBudget: ReturnType<typeof getActiveBudgetData>;
  forecastVersions: ForecastVersionWithRows[];
}): DatasetOption[] {
  return [
    {
      id: "actuals",
      label: "Actuals",
      sourceLabel: getActualsSourceLabel(activeData.dataSource),
      sourceMode: activeData.dataSource,
      periods: activeData.periods,
    },
    {
      id: "budget",
      label: "Budget",
      sourceLabel: getBudgetSourceLabel(activeBudget.dataSource),
      sourceMode: activeBudget.dataSource,
      periods: activeBudget.periods,
    },
    ...forecastVersions.map((version) => ({
      id: version.id,
      label: version.name,
      sourceLabel: `Forecast Source: ${version.name} - ${version.status}`,
      sourceMode: "forecastVersion" as const,
      periods: version.periods as FinancialPeriod[],
      status: version.status,
      preliminaryMonths: version.preliminaryMonths,
      latestActualMonth:
        version.periods
          .filter((period) => period.periodType === "Actual")
          .map((period) => period.month)
          .at(-1) ?? undefined,
    })),
  ];
}

function selectPeriods(
  periods: FinancialPeriod[],
  periodMode: PeriodMode,
  selectedMonth: string,
) {
  const selectedIndex = periods.findIndex((period) => period.month === selectedMonth);
  const safeIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, periods.length - 1);

  if (periodMode === "Month") return [periods[safeIndex] ?? periods.at(-1)].filter(Boolean);
  if (periodMode === "Quarter") {
    const quarterStart = Math.floor(safeIndex / 3) * 3;
    return periods.slice(quarterStart, quarterStart + 3);
  }
  if (periodMode === "YTD") return periods.slice(0, safeIndex + 1);
  return periods;
}

function uniqueMonthsForDatasets(datasets: DatasetOption[]) {
  return [
    ...new Set(
      datasets
        .flatMap((dataset) => dataset.periods.map((period) => period.month))
        .filter(Boolean),
    ),
  ].sort((first, second) => displayMonthToTimestamp(first) - displayMonthToTimestamp(second));
}

function displayMonthToTimestamp(month: string) {
  const parsed = new Date(`${month} 1`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function chooseSmartDefaultComparison({
  datasets,
  activeDataSource,
  activeBudgetSource,
}: {
  datasets: DatasetOption[];
  activeDataSource: DataSourceMode;
  activeBudgetSource: DataSourceMode;
}) {
  const forecastDatasets = datasets.filter((dataset) => dataset.sourceMode === "forecastVersion");
  const hasActuals = datasetHasData(datasets.find((dataset) => dataset.id === "actuals"));
  const hasRealOrDemoActuals = hasActuals && activeDataSource !== "sample";
  const hasBudget =
    datasetHasData(datasets.find((dataset) => dataset.id === "budget")) &&
    activeBudgetSource !== "sample";

  if (hasRealOrDemoActuals && forecastDatasets[0]) {
    return {
      comparisonType: "Actuals vs Forecast" as ComparisonType,
      leftDatasetId: "actuals",
      rightDatasetId: forecastDatasets[0].id,
    };
  }

  if (hasRealOrDemoActuals && hasBudget) {
    return {
      comparisonType: "Actuals vs Budget" as ComparisonType,
      leftDatasetId: "actuals",
      rightDatasetId: "budget",
    };
  }

  if (!hasRealOrDemoActuals && forecastDatasets.length >= 2) {
    return {
      comparisonType: "Forecast vs Forecast" as ComparisonType,
      leftDatasetId: forecastDatasets[0].id,
      rightDatasetId: forecastDatasets[1].id,
    };
  }

  if (forecastDatasets[0]) {
    return {
      comparisonType: "Budget vs Forecast" as ComparisonType,
      leftDatasetId: "budget",
      rightDatasetId: forecastDatasets[0].id,
    };
  }

  return {
    comparisonType: "Actuals vs Budget" as ComparisonType,
    leftDatasetId: "actuals",
    rightDatasetId: "budget",
  };
}

function datasetHasData(dataset: DatasetOption | undefined) {
  return Boolean(dataset?.periods.length);
}

function comparisonContextLabel(
  leftDataset: DatasetOption,
  rightDataset: DatasetOption,
  selectedMonth: string,
) {
  const leftActuals = leftDataset.latestActualMonth
    ? ` actuals through ${leftDataset.latestActualMonth}`
    : "";
  const rightActuals = rightDataset.latestActualMonth
    ? ` actuals through ${rightDataset.latestActualMonth}`
    : "";
  const preliminary =
    (leftDataset.preliminaryMonths ?? 0) + (rightDataset.preliminaryMonths ?? 0);

  return [
    selectedMonth ? `Reporting period: ${selectedMonth}.` : "Reporting period not selected.",
    `${leftDataset.sourceLabel}${leftActuals}.`,
    `${rightDataset.sourceLabel}${rightActuals}.`,
    preliminary > 0
      ? `${preliminary} preliminary forecast month${preliminary === 1 ? "" : "s"} use run-rate, budget, or prior forecast placeholders.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function DatasetPicker({
  label,
  value,
  datasets,
  onChange,
}: {
  label: string;
  value: string;
  datasets: DatasetOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium text-slate-300">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
      >
        {datasets.map((dataset) => (
          <option key={dataset.id} value={dataset.id}>
            {dataset.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium text-slate-300">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="premium-card rounded-2xl p-5">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}

function SourceBadge({ label }: { label: string }) {
  return (
    <span className="premium-pill rounded-xl px-3 py-2 text-xs font-medium">
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
      {status}
    </span>
  );
}

function firstForecastId(datasets: DatasetOption[]) {
  return datasets.find((dataset) => dataset.sourceMode === "forecastVersion")?.id ?? "budget";
}

function secondForecastId(datasets: DatasetOption[]) {
  return datasets.filter((dataset) => dataset.sourceMode === "forecastVersion")[1]?.id ?? firstForecastId(datasets);
}

function commentaryForVariance(metric: string, variancePercent: number, status: string) {
  const absolute = Math.abs(variancePercent);
  if (absolute < 0.05) return `${metric} is broadly in line with the comparison baseline.`;
  return `${metric} is ${status.toLowerCase()} by ${formatPercentVarianceLabel(variancePercent)}. Review source timing, mapping, and forecast assumptions.`;
}

function formatMetricValue(value: number, format: MetricFormat) {
  if (format === "percent") return formatPercent(value);
  if (format === "months") return formatRunwayMonths(value);
  return formatCurrency(value);
}

function formatMetricVariance(value: number, format: MetricFormat) {
  if (format === "percent") return `${value >= 0 ? "+" : "-"}${Math.abs(value * 100).toFixed(1)} pts`;
  if (format === "months") return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(1)} months`;
  return formatVarianceLabel(value);
}
