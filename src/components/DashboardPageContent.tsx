"use client";

import { useEffect, useState } from "react";
import { DashboardChart } from "@/components/DashboardChart";
import { DemoCompanyLoader } from "@/components/DemoCompanyLoader";
import { SmartUploadAssistant } from "@/components/SmartUploadAssistant";
import { FinanceCopilotPanel } from "@/components/FinanceCopilotPanel";
import { ForecastVersionNotice } from "@/components/ForecastVersionNotice";
import { MetricCard } from "@/components/MetricCard";
import { AccountMappingNotice } from "@/components/AccountMappingNotice";
import { ReportingSourceNotice } from "@/components/ReportingSourceNotice";
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
  isApprovedDataSource,
  isCompanyDataSource,
  isUnapprovedDataSource,
  type ActiveFinancialData,
  type ActiveBudgetData,
  type ActiveCashData,
  type DataSourceMode,
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
  const [activeData, setActiveData] = useState<ActiveFinancialData>(() =>
    getActiveFinancialData(),
  );
  const [activeBudget, setActiveBudget] = useState<ActiveBudgetData>(() => getActiveBudgetData());
  const [activeCash, setActiveCash] = useState<ActiveCashData>(() => getActiveCashData());

  useEffect(() => {
    function refreshData() {
      setActiveCash(getActiveCashData());
      setActiveBudget(getActiveBudgetData());
      setActiveData(getActiveFinancialData());
    }

    window.addEventListener("founder-finance-data-hydrated", refreshData);

    return () => window.removeEventListener("founder-finance-data-hydrated", refreshData);
  }, []);

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
  const isDemoEmptyState =
    activeData.dataSource === "sample" &&
    activeBudget.dataSource === "sample" &&
    activeCash.dataSource === "sample";
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
        isCompanyDataSource(activeCash.dataSource)
          ? "Calculated from cash movement"
          : "Calculated from demo sample cash data",
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
      <div className="premium-card overflow-hidden rounded-3xl">
        <div className="relative p-6 sm:p-8">
          <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 rounded-full bg-sky-300/10 blur-3xl" />
          <div className="relative grid gap-8 xl:grid-cols-[1.4fr_0.8fr] xl:items-end">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200/70">
                Dashboard
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
                CFO Dashboard
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
                Executive view of performance, liquidity, runway, budget discipline,
                and the trusted data feeding each operating decision.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <DataSourceBadge label={actualsSourceLabel} />
                <DataSourceBadge label={budgetSourceLabel} />
                <DataSourceBadge label={cashSourceLabel} />
                <ForecastVersionNotice compact />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Operating source
              </p>
              <p className="mt-3 text-lg font-semibold text-slate-50">
                {sourceSummary([
                  activeData.dataSource,
                  activeBudget.dataSource,
                  activeCash.dataSource,
                ])}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {isCompanyDataSource(activeData.dataSource) ||
                isCompanyDataSource(activeBudget.dataSource) ||
                isCompanyDataSource(activeCash.dataSource)
                  ? "Company data is active for at least one reporting stream."
                  : "Demo sample data is clearly labeled until approved company data is available."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <ReportingSourceNotice
        reportingMonth={latestActual.month}
        sources={[activeData.dataSource, activeBudget.dataSource, activeCash.dataSource]}
      />

      {isDemoEmptyState ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <DemoCompanyLoader
            compact
            onLoaded={() => {
              setActiveCash(getActiveCashData());
              setActiveBudget(getActiveBudgetData());
              setActiveData(getActiveFinancialData());
            }}
          />
          <SmartUploadAssistant
            reportingMonth={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`}
            onComplete={() => {
              setActiveCash(getActiveCashData());
              setActiveBudget(getActiveBudgetData());
              setActiveData(getActiveFinancialData());
            }}
          />
        </div>
      ) : null}

      <AccountMappingNotice />

      <ForecastVersionNotice />

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
        <section className="premium-card rounded-2xl p-5">
          <h2 className="text-base font-semibold text-slate-50">Data Assumptions</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
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
            { dataKey: "actualRevenue", label: "Actual", fill: "#7dd3fc" },
            { dataKey: "budgetRevenue", label: "Budget", fill: "#64748b" },
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
              fill: "#7dd3fc",
            },
            {
              dataKey: "budgetOperatingExpenses",
              label: "Budget",
              fill: "#64748b",
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
    <span className="premium-pill rounded-xl px-2.5 py-1 text-xs font-medium">
      {label}
    </span>
  );
}

function sourceSummary(sources: DataSourceMode[]) {
  if (sources.includes("demoData")) return "Demo Data";
  if (sources.some(isApprovedDataSource)) return "Approved Data Room";
  if (sources.some(isUnapprovedDataSource)) return "Unapproved upload - review pending";
  if (sources.includes("saved")) return "Saved company uploads";
  if (sources.includes("uploaded")) return "Uploaded CSV data";
  return "Demo sample data";
}
