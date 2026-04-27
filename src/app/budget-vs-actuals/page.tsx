"use client";

import { useMemo, useState } from "react";
import { DashboardChart } from "@/components/DashboardChart";
import {
  aggregateFinancialPeriods,
  calculateMonthlyVariance,
  calculateQuarterlyVariance,
  calculateYtdVariance,
  type FavorableDirection,
  getTopUnfavorableVariances,
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
  getBudgetForMonth,
  type ActiveBudgetData,
  type ActiveCashData,
  type ActiveFinancialData,
} from "@/lib/localDataStore";

type ViewMode = "monthly" | "quarterly" | "ytd";
type MetricFormat = "currency" | "percent" | "months";

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
};

type BudgetVsActualsRow = {
  metric: string;
  actual: number;
  budget: number;
  varianceDollars: number;
  variancePercent: number;
  status: string;
  format: MetricFormat;
};

const viewModes: { label: string; value: ViewMode }[] = [
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "YTD", value: "ytd" },
];

const metrics: MetricDefinition[] = [
  {
    label: "Revenue",
    key: "revenue",
    format: "currency",
    favorableDirection: "higher",
  },
  {
    label: "Cost of Revenue",
    key: "costOfRevenue",
    format: "currency",
    favorableDirection: "lower",
  },
  {
    label: "Gross Profit",
    key: "grossProfit",
    format: "currency",
    favorableDirection: "higher",
  },
  {
    label: "Gross Margin",
    key: "grossMargin",
    format: "percent",
    favorableDirection: "higher",
  },
  {
    label: "Sales & Marketing",
    key: "salesAndMarketing",
    format: "currency",
    favorableDirection: "lower",
  },
  {
    label: "Research & Development",
    key: "researchAndDevelopment",
    format: "currency",
    favorableDirection: "lower",
  },
  {
    label: "General & Administrative",
    key: "generalAndAdministrative",
    format: "currency",
    favorableDirection: "lower",
  },
  {
    label: "Operating Expenses",
    key: "operatingExpenses",
    format: "currency",
    favorableDirection: "lower",
  },
  {
    label: "EBITDA",
    key: "ebitda",
    format: "currency",
    favorableDirection: "higher",
  },
  {
    label: "Cash Balance",
    key: "cashBalance",
    format: "currency",
    favorableDirection: "higher",
  },
  {
    label: "Net Burn",
    key: "netBurn",
    format: "currency",
    favorableDirection: "lower",
  },
  {
    label: "Runway",
    key: "runwayMonths",
    format: "months",
    favorableDirection: "higher",
  },
];

export default function BudgetVsActualsPage() {
  const [activeData] = useState<ActiveFinancialData>(() =>
    getActiveFinancialData(),
  );
  const [activeBudget] = useState<ActiveBudgetData>(() => getActiveBudgetData());
  const [activeCash] = useState<ActiveCashData>(() => getActiveCashData());
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [selectedMonth, setSelectedMonth] = useState(
    activeData.periods[activeData.periods.length - 1].month,
  );

  const activeFinancials = activeData.periods;
  const selectedIndex = activeFinancials.findIndex(
    (period) => period.month === selectedMonth,
  );

  const actualPeriods = useMemo(
    () => selectPeriods(viewMode, selectedIndex, activeFinancials),
    [activeFinancials, selectedIndex, viewMode],
  );
  const budgetPeriods = useMemo(
    () =>
      actualPeriods.map((period, index) =>
        getBudgetForMonth(period.month, Math.max(0, selectedIndex - actualPeriods.length + index + 1)),
      ),
    [actualPeriods, selectedIndex],
  );

  const actual = aggregateFinancialPeriods(actualPeriods);
  const budget = aggregateFinancialPeriods(budgetPeriods);

  const rows = metrics.map((metric) => {
    const variance =
      viewMode === "monthly"
        ? calculateMonthlyVariance(
            actual[metric.key],
            budget[metric.key],
            metric.favorableDirection,
          )
        : viewMode === "quarterly"
          ? calculateQuarterlyVariance(
              actual[metric.key],
              budget[metric.key],
              metric.favorableDirection,
            )
          : calculateYtdVariance(
              actual[metric.key],
              budget[metric.key],
              metric.favorableDirection,
            );

    return {
      metric: metric.label,
      actual: actual[metric.key],
      budget: budget[metric.key],
      varianceDollars: variance.varianceDollars,
      variancePercent: variance.variancePercent,
      status: variance.status,
      format: metric.format,
    };
  });

  const topUnfavorable = getTopUnfavorableVariances(rows, 5);
  const chartData = activeFinancials.map((actualMonth, index) => {
    const budgetMonth = getBudgetForMonth(actualMonth.month, index);

    return {
      month: shortMonth(actualMonth.month),
      actualRevenue: actualMonth.revenue,
      budgetRevenue: budgetMonth.revenue,
      actualOperatingExpenses: actualMonth.operatingExpenses,
      budgetOperatingExpenses: budgetMonth.operatingExpenses,
      actualEbitda: actualMonth.ebitda,
      budgetEbitda: budgetMonth.ebitda,
      actualCashBalance: actualMonth.cashBalance,
      budgetCashBalance: budgetMonth.cashBalance,
    };
  });

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
            Budget vs Actuals
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Financial Variance Review
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
            Compare active actuals against budget by month, quarter, and
            year-to-date.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <DataSourceBadge label={getActualsSourceLabel(activeData.dataSource)} />
            <DataSourceBadge label={getBudgetSourceLabel(activeBudget.dataSource)} />
            <DataSourceBadge label={getCashSourceLabel(activeCash.dataSource)} />
            {activeData.dataSource === "uploaded" ||
            activeBudget.dataSource === "uploaded" ||
            activeCash.dataSource === "uploaded" ? (
              <p className="text-sm text-neutral-500">
                Uploaded actuals, budget, and cash data are stored locally in your
                browser for prototype testing only. They are not saved to a database
                yet.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex rounded-md border border-neutral-200 bg-white p-1">
            {viewModes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setViewMode(mode.value)}
                className={`rounded px-3 py-2 text-sm font-medium ${
                  viewMode === mode.value
                    ? "bg-neutral-950 text-white"
                    : "text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 sm:min-w-48">
            Reporting period
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none focus:border-neutral-950"
            >
              {activeFinancials.map((period) => (
                <option key={period.month} value={period.month}>
                  {period.month}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Actual revenue" value={formatCurrency(actual.revenue)} />
        <SummaryCard
          label="Budget revenue"
          value={formatCurrency(budget.revenue)}
        />
        <SummaryCard
          label="EBITDA variance"
          value={formatMetricVariance(
            actual.ebitda - budget.ebitda,
            "currency",
          )}
        />
      </div>

      {[...activeData.warnings, ...activeBudget.warnings].length > 0 ? (
        <section className="rounded-md border border-neutral-200 bg-white p-5">
          <h2 className="text-base font-semibold">Data Assumptions</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-700">
            {[...activeData.warnings, ...activeBudget.warnings].map((warning) => (
              <li key={warning} className="ml-4 list-disc">
                {warning}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <BudgetVsActualsTable rows={rows} />

      <TopUnfavorableVariances rows={topUnfavorable} />

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardChart
          title="Actual vs Budget Revenue"
          description="Monthly revenue performance against plan."
          data={chartData}
          series={[
            { dataKey: "actualRevenue", label: "Actual", fill: "#111111" },
            { dataKey: "budgetRevenue", label: "Budget", fill: "#a3a3a3" },
          ]}
          variant="bar"
        />
        <DashboardChart
          title="Actual vs Budget Operating Expenses"
          description="Monthly operating expense discipline."
          data={chartData}
          series={[
            {
              dataKey: "actualOperatingExpenses",
              label: "Actual",
              fill: "#111111",
            },
            {
              dataKey: "budgetOperatingExpenses",
              label: "Budget",
              fill: "#a3a3a3",
            },
          ]}
          variant="bar"
        />
        <DashboardChart
          title="Actual vs Budget EBITDA"
          description="Monthly EBITDA compared with budget."
          data={chartData}
          series={[
            { dataKey: "actualEbitda", label: "Actual", stroke: "#111111" },
            { dataKey: "budgetEbitda", label: "Budget", stroke: "#a3a3a3" },
          ]}
        />
        <DashboardChart
          title="Actual vs Budget Cash Balance"
          description="Ending cash balance against plan."
          data={chartData}
          series={[
            {
              dataKey: "actualCashBalance",
              label: "Actual",
              stroke: "#111111",
            },
            {
              dataKey: "budgetCashBalance",
              label: "Budget",
              stroke: "#a3a3a3",
            },
          ]}
        />
      </div>
    </section>
  );
}

function BudgetVsActualsTable({ rows }: { rows: BudgetVsActualsRow[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base font-semibold">Budget vs Actuals</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Positive variance means actual is above budget; status determines
          whether that movement is good for the business.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">Metric</th>
              <th className="px-4 py-3 font-medium">Actual</th>
              <th className="px-4 py-3 font-medium">Budget</th>
              <th className="px-4 py-3 font-medium">Variance $</th>
              <th className="px-4 py-3 font-medium">Variance %</th>
              <th className="px-4 py-3 font-medium">Favorable / Unfavorable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.metric} className="border-b border-neutral-100">
                <td className="px-4 py-3 font-medium">{row.metric}</td>
                <td className="px-4 py-3">
                  {formatMetricValue(row.actual, row.format)}
                </td>
                <td className="px-4 py-3">
                  {formatMetricValue(row.budget, row.format)}
                </td>
                <td className="px-4 py-3">
                  {formatMetricVariance(row.varianceDollars, row.format)}
                </td>
                <td className="px-4 py-3">
                  {formatPercentVarianceLabel(row.variancePercent)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TopUnfavorableVariances({ rows }: { rows: BudgetVsActualsRow[] }) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Top Unfavorable Variances</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Largest unfavorable movements in the selected view.
          </p>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-5">
          {rows.map((row) => (
            <article
              key={row.metric}
              className="rounded-md border border-neutral-200 p-4"
            >
              <p className="text-sm font-medium text-neutral-600">
                {row.metric}
              </p>
              <p className="mt-2 text-xl font-semibold tracking-tight">
                {formatMetricVariance(row.varianceDollars, row.format)}
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                {formatPercentVarianceLabel(row.variancePercent)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-neutral-600">
          No unfavorable variances for this selection.
        </p>
      )}
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
      {status}
    </span>
  );
}

function DataSourceBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700">
      {label}
    </span>
  );
}

function selectPeriods<T>(
  viewMode: ViewMode,
  selectedIndex: number,
  periods: T[],
) {
  const safeIndex = selectedIndex >= 0 ? selectedIndex : periods.length - 1;

  if (viewMode === "monthly") {
    return [periods[safeIndex]];
  }

  if (viewMode === "quarterly") {
    const quarterStart = Math.floor(safeIndex / 3) * 3;

    return periods.slice(quarterStart, quarterStart + 3);
  }

  return periods.slice(0, safeIndex + 1);
}

function shortMonth(month: string) {
  return month.split(" ")[0];
}

function formatMetricValue(value: number, format: MetricFormat) {
  if (format === "percent") {
    return formatPercent(value);
  }

  if (format === "months") {
    return formatRunwayMonths(value);
  }

  return formatCurrency(value);
}

function formatMetricVariance(value: number, format: MetricFormat) {
  if (format === "percent") {
    return `${value >= 0 ? "+" : "-"}${Math.abs(value * 100).toFixed(1)} pts`;
  }

  if (format === "months") {
    return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(1)} months`;
  }

  return formatVarianceLabel(value);
}
