"use client";

import { useMemo, useState } from "react";
import { DashboardChart } from "@/components/DashboardChart";
import { FinanceCopilotPanel } from "@/components/FinanceCopilotPanel";
import {
  forecastVersionOptions,
  sampleForecast,
  type ForecastMonth,
  type ForecastVersion,
  type ForecastVersionId,
} from "@/data/sampleForecast";
import {
  calculateVarianceDollars,
  calculateVariancePercent,
} from "@/lib/calculations";
import {
  formatCurrency,
  formatCurrencyThousands,
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
  type ActiveBudgetData,
  type ActiveCashData,
  type ActiveFinancialData,
} from "@/lib/localDataStore";

type ForecastMetricKey =
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

type MetricFormat = "currency" | "percent" | "months";

const forecastLogic = [
  "Budget = 0 months actuals + 12 months forecast",
  "2+10 = 2 months actuals + 10 months forecast",
  "5+7 = 5 months actuals + 7 months forecast",
  "8+4 = 8 months actuals + 4 months forecast",
  "10+2 = 10 months actuals + 2 months forecast",
];

const forecastRows: {
  label: string;
  key: ForecastMetricKey;
  format: MetricFormat;
  isEndingMetric?: boolean;
}[] = [
  { label: "Revenue", key: "revenue", format: "currency" },
  { label: "Cost of Revenue", key: "costOfRevenue", format: "currency" },
  { label: "Gross Profit", key: "grossProfit", format: "currency" },
  { label: "Gross Margin", key: "grossMargin", format: "percent" },
  { label: "Sales & Marketing", key: "salesAndMarketing", format: "currency" },
  {
    label: "Research & Development",
    key: "researchAndDevelopment",
    format: "currency",
  },
  {
    label: "General & Administrative",
    key: "generalAndAdministrative",
    format: "currency",
  },
  { label: "Operating Expenses", key: "operatingExpenses", format: "currency" },
  { label: "EBITDA", key: "ebitda", format: "currency" },
  {
    label: "Cash Balance",
    key: "cashBalance",
    format: "currency",
    isEndingMetric: true,
  },
  { label: "Net Burn", key: "netBurn", format: "currency" },
  {
    label: "Runway",
    key: "runwayMonths",
    format: "months",
    isEndingMetric: true,
  },
];

export default function ForecastsPage() {
  const [selectedVersionId, setSelectedVersionId] =
    useState<ForecastVersionId>("latest");
  const [notice, setNotice] = useState("");
  const [activeData] = useState<ActiveFinancialData>(() =>
    getActiveFinancialData(),
  );
  const [activeBudget] = useState<ActiveBudgetData>(() => getActiveBudgetData());
  const [activeCash] = useState<ActiveCashData>(() => getActiveCashData());

  const selectedVersion = useMemo(
    () =>
      sampleForecast.find((version) => version.id === selectedVersionId) ??
      sampleForecast[0],
    [selectedVersionId],
  );
  const budget = getVersion("budget");
  const latest = getVersion("latest");
  const downside = getVersion("downside");
  const upside = getVersion("upside");
  const selectedSummary = summarizeForecast(selectedVersion);
  const budgetSummary = summarizeForecast(budget);
  const latestSummary = summarizeForecast(latest);
  const bridge = buildForecastBridge(budget, latest);
  const commentary = buildForecastCommentary(budgetSummary, latestSummary);

  const monthlyChartData = budget.months.map((budgetMonth, index) => {
    const latestMonth = latest.months[index];

    return {
      month: shortMonth(budgetMonth.month),
      budgetRevenue: budgetMonth.revenue,
      latestRevenue: latestMonth.revenue,
      budgetEbitda: budgetMonth.ebitda,
      latestEbitda: latestMonth.ebitda,
    };
  });

  const versionChartData = sampleForecast.map((version) => {
    const summary = summarizeForecast(version);

    return {
      month: version.name.replace("FY2026 ", ""),
      endingCash: summary.endingCash,
      runwayMonths: summary.endingRunway,
    };
  });

  const scenarioRows = [budget, latest, downside, upside].map((version) => {
    const summary = summarizeForecast(version);

    return {
      name: version.name,
      ...summary,
      recommendation: getScenarioRecommendation(summary.endingRunway),
    };
  });

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
            Forecasts
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Rolling Forecasts
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
            Compare Acme AI budget, latest forecast, rolling forecast versions,
            and planning cases using local sample data.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <DataSourceBadge label={getActualsSourceLabel(activeData.dataSource)} />
            <DataSourceBadge label={getBudgetSourceLabel(activeBudget.dataSource)} />
            <DataSourceBadge label={getCashSourceLabel(activeCash.dataSource)} />
            {activeBudget.dataSource === "uploaded" ||
            activeCash.dataSource === "uploaded" ? (
              <p className="text-sm text-neutral-500">
                Uploaded budget or cash data is active for local comparisons.
                Forecast versions still use sample forecast data for now.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 sm:min-w-64">
            Forecast version
            <select
              value={selectedVersionId}
              onChange={(event) =>
                setSelectedVersionId(event.target.value as ForecastVersionId)
              }
              className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none focus:border-neutral-950"
            >
              {forecastVersionOptions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() =>
              setNotice(
                "Future versions will actualize closed months and update future forecast months. This prototype does not save new forecast versions yet.",
              )
            }
            className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Create Next Rolling Forecast
          </button>
        </div>
      </div>

      {notice ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          {notice}
        </div>
      ) : null}

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">Rolling Forecast Logic</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {forecastLogic.map((item) => (
            <div key={item} className="rounded-md border border-neutral-200 p-4">
              <p className="text-sm leading-6 text-neutral-700">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          label="Full-year revenue forecast"
          value={formatCurrency(selectedSummary.revenue)}
        />
        <SummaryCard
          label="Full-year EBITDA forecast"
          value={formatCurrency(selectedSummary.ebitda)}
        />
        <SummaryCard
          label="Ending cash balance"
          value={formatCurrency(selectedSummary.endingCash)}
        />
        <SummaryCard
          label="Ending runway"
          value={formatRunwayMonths(selectedSummary.endingRunway)}
        />
        <SummaryCard
          label="Forecast variance vs budget"
          value={formatVarianceLabel(
            calculateVarianceDollars(selectedSummary.revenue, budgetSummary.revenue),
          )}
        />
        <SummaryCard
          label="Cash runway change vs budget"
          value={formatMonthVariance(
            selectedSummary.endingRunway - budgetSummary.endingRunway,
          )}
        />
      </div>

      <FinanceCopilotPanel mode="forecast" />

      <ForecastTable version={selectedVersion} />

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardChart
          title="Budget vs Latest Forecast Revenue"
          description="Monthly revenue comparison."
          data={monthlyChartData}
          series={[
            { dataKey: "budgetRevenue", label: "Budget", fill: "#a3a3a3" },
            { dataKey: "latestRevenue", label: "Latest", fill: "#111111" },
          ]}
          variant="bar"
        />
        <DashboardChart
          title="Budget vs Latest Forecast EBITDA"
          description="Monthly EBITDA comparison."
          data={monthlyChartData}
          series={[
            { dataKey: "budgetEbitda", label: "Budget", stroke: "#a3a3a3" },
            { dataKey: "latestEbitda", label: "Latest", stroke: "#111111" },
          ]}
        />
        <DashboardChart
          title="Ending Cash by Forecast Version"
          description="Ending cash balance across forecast cases."
          data={versionChartData}
          series={[{ dataKey: "endingCash", label: "Ending Cash" }]}
        />
        <DashboardChart
          title="Runway by Forecast Version"
          description="Ending runway across forecast cases."
          data={versionChartData}
          series={[{ dataKey: "runwayMonths", label: "Runway" }]}
          valueType="months"
        />
      </div>

      <ForecastBridge bridge={bridge} />
      <ForecastCommentary items={commentary} />
      <ScenarioComparison rows={scenarioRows} />
    </section>
  );
}

function ForecastTable({ version }: { version: ForecastVersion }) {
  return (
    <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base font-semibold">{version.name}</h2>
        <p className="mt-1 text-sm text-neutral-500">{version.description}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="sticky left-0 z-[1] bg-neutral-50 px-4 py-3 font-medium">
                Metric
              </th>
              {version.months.map((month) => (
                <th key={month.month} className="px-3 py-3 text-center font-medium">
                  {shortMonth(month.month)}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-[1] bg-neutral-50 px-4 py-2 text-xs font-medium text-neutral-500">
                Type
              </th>
              {version.months.map((month) => (
                <th
                  key={`${month.month}-${month.periodType}`}
                  className={`px-3 py-2 text-center text-xs font-medium ${
                    month.periodType === "Actual"
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-neutral-500"
                  }`}
                >
                  {month.periodType}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {forecastRows.map((row) => (
              <tr key={row.key} className="border-b border-neutral-100">
                <td className="sticky left-0 bg-white px-4 py-3 font-medium">
                  {row.label}
                </td>
                {version.months.map((month) => (
                  <td
                    key={`${row.key}-${month.month}`}
                    className={`px-3 py-3 text-right ${
                      month.periodType === "Actual" ? "bg-neutral-50" : ""
                    }`}
                  >
                    {formatMetricValue(month[row.key], row.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ForecastBridge({
  bridge,
}: {
  bridge: { label: string; value: string; context: string }[];
}) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <h2 className="text-base font-semibold">Forecast Bridge</h2>
      <p className="mt-1 text-sm text-neutral-500">
        What changed from Budget to Latest Forecast.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {bridge.map((item) => (
          <article key={item.label} className="rounded-md border border-neutral-200 p-4">
            <p className="text-sm font-medium text-neutral-500">{item.label}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight">
              {item.value}
            </p>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              {item.context}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ForecastCommentary({ items }: { items: string[] }) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <h2 className="text-base font-semibold">Forecast Commentary</h2>
      <ul className="mt-4 space-y-3 text-sm leading-6 text-neutral-700">
        {items.map((item) => (
          <li key={item} className="ml-4 list-disc">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScenarioComparison({
  rows,
}: {
  rows: (ForecastSummary & { name: string; recommendation: string })[];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base font-semibold">Scenario Comparison</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Budget, latest forecast, downside, and upside cases.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">Scenario</th>
              <th className="px-4 py-3 font-medium">Revenue</th>
              <th className="px-4 py-3 font-medium">EBITDA</th>
              <th className="px-4 py-3 font-medium">Ending Cash</th>
              <th className="px-4 py-3 font-medium">Runway</th>
              <th className="px-4 py-3 font-medium">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-neutral-100">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">{formatCurrency(row.revenue)}</td>
                <td className="px-4 py-3">{formatCurrency(row.ebitda)}</td>
                <td className="px-4 py-3">{formatCurrency(row.endingCash)}</td>
                <td className="px-4 py-3">
                  {formatRunwayMonths(row.endingRunway)}
                </td>
                <td className="px-4 py-3">{row.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type ForecastSummary = {
  revenue: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  ebitda: number;
  endingCash: number;
  netBurn: number;
  endingRunway: number;
};

function summarizeForecast(version: ForecastVersion): ForecastSummary {
  const endingMonth = version.months[version.months.length - 1];
  const revenue = sum(version.months, "revenue");
  const grossProfit = sum(version.months, "grossProfit");

  return {
    revenue,
    grossProfit,
    grossMargin: revenue > 0 ? grossProfit / revenue : 0,
    operatingExpenses: sum(version.months, "operatingExpenses"),
    ebitda: sum(version.months, "ebitda"),
    endingCash: endingMonth.cashBalance,
    netBurn: sum(version.months, "netBurn"),
    endingRunway: endingMonth.runwayMonths,
  };
}

function buildForecastBridge(budget: ForecastVersion, latest: ForecastVersion) {
  const budgetSummary = summarizeForecast(budget);
  const latestSummary = summarizeForecast(latest);

  return [
    bridgeItem(
      "Revenue impact",
      latestSummary.revenue - budgetSummary.revenue,
      "Full-year revenue variance",
      "currency",
    ),
    bridgeItem(
      "Gross margin impact",
      latestSummary.grossMargin - budgetSummary.grossMargin,
      "Full-year gross margin variance",
      "percent",
    ),
    bridgeItem(
      "Payroll / OpEx impact",
      latestSummary.operatingExpenses - budgetSummary.operatingExpenses,
      "Operating expense variance",
      "currency",
    ),
    bridgeItem(
      "EBITDA impact",
      latestSummary.ebitda - budgetSummary.ebitda,
      "Full-year EBITDA variance",
      "currency",
    ),
    bridgeItem(
      "Cash impact",
      latestSummary.endingCash - budgetSummary.endingCash,
      "Ending cash variance",
      "currency",
    ),
    bridgeItem(
      "Runway impact",
      latestSummary.endingRunway - budgetSummary.endingRunway,
      "Ending runway variance",
      "months",
    ),
  ];
}

function buildForecastCommentary(
  budgetSummary: ForecastSummary,
  latestSummary: ForecastSummary,
) {
  const revenueVariance = latestSummary.revenue - budgetSummary.revenue;
  const opexVariance =
    latestSummary.operatingExpenses - budgetSummary.operatingExpenses;
  const cashVariance = latestSummary.endingCash - budgetSummary.endingCash;
  const ebitdaVariance = latestSummary.ebitda - budgetSummary.ebitda;
  const commentary: string[] = [];

  if (revenueVariance < 0) {
    commentary.push(
      `Latest forecast revenue is below budget by ${formatVarianceLabel(revenueVariance)} (${formatPercentVarianceLabel(calculateVariancePercent(latestSummary.revenue, budgetSummary.revenue))}), reflecting slower conversion versus the original plan.`,
    );
  } else {
    commentary.push(
      `Latest forecast revenue is above budget by ${formatVarianceLabel(revenueVariance)}, creating upside to the operating plan.`,
    );
  }

  if (opexVariance > 0) {
    commentary.push(
      `Operating expenses are above budget by ${formatVarianceLabel(opexVariance)}, indicating payroll and operating expense pressure.`,
    );
  } else {
    commentary.push(
      `Operating expenses are below budget by ${formatVarianceLabel(opexVariance)}, preserving cash versus plan.`,
    );
  }

  if (cashVariance < 0) {
    commentary.push(
      `Ending cash is below budget by ${formatVarianceLabel(cashVariance)}, so management should monitor cash pressure closely.`,
    );
  }

  if (latestSummary.endingRunway < 12) {
    commentary.push(
      "Ending runway is below 12 months; review hiring, vendor commitments, and discretionary spend before approving new fixed costs.",
    );
  }

  if (ebitdaVariance < 0) {
    commentary.push(
      `EBITDA is below budget by ${formatVarianceLabel(ebitdaVariance)}; update investor reporting language to explain the forecast change.`,
    );
  }

  return commentary;
}

function bridgeItem(
  label: string,
  value: number,
  context: string,
  format: MetricFormat,
) {
  return {
    label,
    value:
      format === "currency"
        ? formatVarianceLabel(value)
        : format === "percent"
          ? formatPointVariance(value)
          : formatMonthVariance(value),
    context,
  };
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-md border border-neutral-200 bg-white p-5">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}

function DataSourceBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700">
      {label}
    </span>
  );
}

function getVersion(id: ForecastVersionId) {
  const version = sampleForecast.find((item) => item.id === id);

  if (!version) {
    throw new Error(`Missing forecast version: ${id}`);
  }

  return version;
}

function getScenarioRecommendation(runwayMonths: number) {
  if (runwayMonths >= 15) {
    return "Maintain plan";
  }

  if (runwayMonths >= 12) {
    return "Monitor burn";
  }

  if (runwayMonths >= 9) {
    return "Review hiring and spend";
  }

  return "Prioritize cash preservation";
}

function formatMetricValue(value: number, format: MetricFormat) {
  if (format === "percent") {
    return formatPercent(value);
  }

  if (format === "months") {
    return formatRunwayMonths(value);
  }

  return formatCurrencyThousands(value);
}

function formatPointVariance(value: number) {
  const prefix = value >= 0 ? "+" : "-";

  return `${prefix}${Math.abs(value * 100).toFixed(1)} pts`;
}

function formatMonthVariance(value: number) {
  const prefix = value >= 0 ? "+" : "-";

  return `${prefix}${Math.abs(value).toFixed(1)} months`;
}

function shortMonth(month: string) {
  return month.split(" ")[0];
}

function sum(months: ForecastMonth[], key: ForecastMetricKey) {
  return months.reduce((total, month) => total + month[key], 0);
}
