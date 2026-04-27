"use client";

import { useState } from "react";
import { DashboardChart } from "@/components/DashboardChart";
import { FinanceCopilotPanel } from "@/components/FinanceCopilotPanel";
import { MetricCard } from "@/components/MetricCard";
import { VarianceTable, type VarianceRow } from "@/components/VarianceTable";
import { sampleBudget } from "@/data/sampleBudget";
import {
  calculateEbitda,
  calculateGrossMargin,
  calculateGrossProfit,
  calculateNetBurn,
  calculateOperatingExpenses,
  calculateRunwayMonths,
  calculateVarianceDollars,
  calculateVariancePercent,
  getVarianceStatus,
} from "@/lib/calculations";
import {
  formatCurrency,
  formatPercent,
  formatRunwayMonths,
} from "@/lib/formatting";
import {
  getActiveFinancialData,
  getActiveBudgetData,
  getActiveCashData,
  getActualsSourceLabel,
  getBudgetSourceLabel,
  getBudgetForMonth,
  getCashMetricsForMonth,
  getCashSourceLabel,
  getUploadedPayroll,
  type ActiveFinancialData,
  type ActiveBudgetData,
  type ActiveCashData,
} from "@/lib/localDataStore";

function shortMonth(month: string) {
  return month.split(" ")[0];
}

function buildVarianceRow(
  metric: string,
  actual: number,
  budget: number,
  favorableDirection: "higher" | "lower",
): VarianceRow {
  return {
    metric,
    actual,
    budget,
    varianceDollars: calculateVarianceDollars(actual, budget),
    variancePercent: calculateVariancePercent(actual, budget),
    status: getVarianceStatus(actual, budget, favorableDirection),
  };
}

export function DashboardPageContent() {
  const [activeData] = useState<ActiveFinancialData>(() =>
    getActiveFinancialData(),
  );
  const [activeBudget] = useState<ActiveBudgetData>(() => getActiveBudgetData());
  const [activeCash] = useState<ActiveCashData>(() => getActiveCashData());

  const activeFinancials = activeData.periods;
  const latestActual = activeFinancials[activeFinancials.length - 1];
  const latestBudget = getBudgetForMonth(
    latestActual.month,
    sampleBudget.length - 1,
  );
  const grossProfit = calculateGrossProfit(
    latestActual.revenue,
    latestActual.costOfRevenue,
  );
  const grossMargin = calculateGrossMargin(latestActual.revenue, grossProfit);
  const operatingExpenses = calculateOperatingExpenses(
    latestActual.salesAndMarketing,
    latestActual.researchAndDevelopment,
    latestActual.generalAndAdministrative,
  );
  const ebitda = calculateEbitda(grossProfit, operatingExpenses);
  const latestCashMetrics = getCashMetricsForMonth(latestActual.month);
  const netBurn = latestCashMetrics?.netBurn ?? calculateNetBurn(ebitda);
  const calculatedRunwayMonths =
    latestCashMetrics?.runwayMonths ??
    calculateRunwayMonths(latestActual.cashBalance, netBurn);
  const runwayMonths = calculatedRunwayMonths;
  const actualsSourceLabel = getActualsSourceLabel(activeData.dataSource);
  const budgetSourceLabel = getBudgetSourceLabel(activeBudget.dataSource);
  const cashSourceLabel = getCashSourceLabel(activeCash.dataSource);
  const uploadedPayroll = getUploadedPayroll();
  const latestPayrollMonth = [...new Set(uploadedPayroll.map((row) => row.month))]
    .sort()
    .at(-1);
  const latestPayrollRows = uploadedPayroll.filter(
    (row) => row.month === latestPayrollMonth && row.status !== "Error",
  );
  const monthlyPayrollCost = latestPayrollRows.reduce(
    (total, row) => total + (row.totalMonthlyPayrollCost ?? 0),
    0,
  );

  const metrics = [
    {
      label: "Revenue",
      value: formatCurrency(latestActual.revenue),
      context: `${latestActual.month} actuals`,
    },
    {
      label: "Gross Margin",
      value: formatPercent(grossMargin),
      context: `${formatCurrency(grossProfit)} gross profit`,
    },
    {
      label: "Operating Expenses",
      value: formatCurrency(operatingExpenses),
      context: "S&M, R&D, and G&A",
    },
    {
      label: "EBITDA",
      value: formatCurrency(ebitda),
      context: "Gross profit less operating expenses",
    },
    {
      label: "Cash Balance",
      value: formatCurrency(latestActual.cashBalance),
      context: "Ending cash balance",
    },
    {
      label: "Net Burn",
      value: formatCurrency(netBurn),
      context:
        activeCash.dataSource === "uploaded"
          ? "Calculated from cash movement"
          : "Calculated from sample cash data",
    },
    {
      label: "Runway",
      value: formatRunwayMonths(runwayMonths),
      context: "Cash divided by 3-month average burn where available",
    },
    ...(latestPayrollRows.length > 0
      ? [
          {
            label: "Headcount",
            value: String(latestPayrollRows.length),
            context: `${latestPayrollMonth} uploaded payroll`,
          },
          {
            label: "Payroll Cost",
            value: formatCurrency(monthlyPayrollCost),
            context: "Monthly payroll from uploaded payroll",
          },
        ]
      : []),
  ];

  const trendData = activeFinancials.map((month) => ({
    month: shortMonth(month.month),
    revenue: month.revenue,
    operatingExpenses: month.operatingExpenses,
    cashBalance: month.cashBalance,
    runwayMonths: month.runwayMonths,
  }));

  const actualVsBudgetData = activeFinancials.map((actual, index) => {
    const budget = getBudgetForMonth(actual.month, index);

    return {
      month: shortMonth(actual.month),
      actualRevenue: actual.revenue,
      budgetRevenue: budget.revenue,
      actualOperatingExpenses: actual.operatingExpenses,
      budgetOperatingExpenses: budget.operatingExpenses,
    };
  });

  const varianceRows = [
    buildVarianceRow(
      "Revenue",
      latestActual.revenue,
      latestBudget.revenue,
      "higher",
    ),
    buildVarianceRow(
      "Cost of Revenue",
      latestActual.costOfRevenue,
      latestBudget.costOfRevenue,
      "lower",
    ),
    buildVarianceRow(
      "Gross Profit",
      grossProfit,
      latestBudget.grossProfit,
      "higher",
    ),
    buildVarianceRow(
      "Operating Expenses",
      operatingExpenses,
      latestBudget.operatingExpenses,
      "lower",
    ),
    buildVarianceRow("EBITDA", ebitda, latestBudget.ebitda, "higher"),
    buildVarianceRow(
      "Cash Balance",
      latestActual.cashBalance,
      latestBudget.cashBalance,
      "higher",
    ),
    buildVarianceRow("Net Burn", netBurn, latestBudget.netBurn, "lower"),
  ]
    .sort(
      (first, second) =>
        Math.abs(second.varianceDollars) - Math.abs(first.varianceDollars),
    )
    .slice(0, 6);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          CFO Dashboard
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
          Twelve-month local sample view of financial performance, liquidity,
          runway, and budget discipline.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <DataSourceBadge label={actualsSourceLabel} />
          <DataSourceBadge label={budgetSourceLabel} />
          <DataSourceBadge label={cashSourceLabel} />
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <FinanceCopilotPanel
        reportingMonth={latestActual.month}
        mode="dashboard"
        showAsk={false}
      />

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

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardChart
          title="Revenue Trend"
          description="Monthly actual revenue."
          data={trendData}
          series={[{ dataKey: "revenue", label: "Revenue" }]}
        />
        <DashboardChart
          title="Operating Expense Trend"
          description="Monthly actual operating expenses."
          data={trendData}
          series={[{ dataKey: "operatingExpenses", label: "OpEx" }]}
        />
        <DashboardChart
          title="Cash Balance Trend"
          description="Ending monthly cash balance."
          data={trendData}
          series={[{ dataKey: "cashBalance", label: "Cash Balance" }]}
        />
        <DashboardChart
          title="Runway Trend"
          description="Months of runway based on monthly burn."
          data={trendData}
          series={[{ dataKey: "runwayMonths", label: "Runway" }]}
          valueType="months"
        />
        <DashboardChart
          title="Actual vs Budget Revenue"
          description="Revenue performance against plan."
          data={actualVsBudgetData}
          series={[
            { dataKey: "actualRevenue", label: "Actual", fill: "#111111" },
            { dataKey: "budgetRevenue", label: "Budget", fill: "#a3a3a3" },
          ]}
          variant="bar"
        />
        <DashboardChart
          title="Actual vs Budget Operating Expenses"
          description="Operating expense discipline against plan."
          data={actualVsBudgetData}
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
      </div>

      <VarianceTable rows={varianceRows} />
    </section>
  );
}

function DataSourceBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700">
      {label}
    </span>
  );
}
