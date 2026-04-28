import { sampleCompany } from "@/data/sampleCompany";
import {
  calculateVarianceDollars,
  calculateVariancePercent,
} from "@/lib/calculations";
import { generateFinanceInsights } from "@/lib/financeInsights";
import {
  getActiveBudgetData,
  getActiveCashData,
  getActiveFinancialData,
  getActualsSourceLabel,
  getBudgetForMonth,
  getBudgetSourceLabel,
  getCashMetricsForMonth,
  getCashSourceLabel,
  getActiveForecastData,
  getForecastSourceLabel,
  getUploadedBankTransactions,
  getUploadedPayroll,
  getUploadedPipeline,
  getUploadedRevenueDetail,
} from "@/lib/localDataStore";

export type FinanceSummary = ReturnType<typeof buildFinanceSummary>;

export function buildFinanceSummary(reportingMonth?: string) {
  const activeData = getActiveFinancialData();
  const activeBudget = getActiveBudgetData();
  const activeCash = getActiveCashData();
  const activeForecast = getActiveForecastData();
  const periods = activeData.periods;
  const selectedMonth = reportingMonth ?? periods[periods.length - 1]?.month ?? "";
  const selectedIndex = periods.findIndex((period) => period.month === selectedMonth);
  const safeIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, periods.length - 1);
  const actual = periods[safeIndex];
  const budget = getBudgetForMonth(actual.month, safeIndex);
  const cashMetrics = getCashMetricsForMonth(actual.month);
  const payrollRows = getUploadedPayroll().filter((row) => row.status !== "Error");
  const revenueRows = getUploadedRevenueDetail().filter((row) => row.status !== "Error");
  const pipelineRows = getUploadedPipeline().filter((row) => row.status !== "Error");
  const bankRows = getUploadedBankTransactions().filter((row) => row.status !== "Error");
  const latestPayrollMonth = [...new Set(payrollRows.map((row) => row.month))]
    .sort()
    .at(-1);
  const latestPayrollRows = payrollRows.filter(
    (row) => row.month === latestPayrollMonth,
  );
  const payrollCost = latestPayrollRows.reduce(
    (total, row) => total + (row.totalMonthlyPayrollCost ?? 0),
    0,
  );
  const weightedPipeline = pipelineRows.reduce(
    (total, row) => total + (row.weightedPipeline ?? 0),
    0,
  );
  const ruleBasedInsights = generateFinanceInsights({
    reportingMonth: actual.month,
  }).insights.map((insight) => ({
    title: insight.title,
    severity: insight.severity,
    category: insight.category,
    summary: insight.summary,
    whyItMatters: insight.whyItMatters,
    recommendedAction: insight.recommendedAction,
    sourceMetrics: insight.sourceMetrics,
  }));

  return {
    company: {
      name: sampleCompany.name,
      industry: sampleCompany.industry,
      stage: sampleCompany.stage,
      currency: sampleCompany.currency,
    },
    period: displayMonthToIsoMonth(actual.month),
    displayPeriod: actual.month,
    dataSources: {
      actuals: sourceValue(getActualsSourceLabel(activeData.dataSource)),
      budget: sourceValue(getBudgetSourceLabel(activeBudget.dataSource)),
      cash: sourceValue(getCashSourceLabel(activeCash.dataSource)),
      payroll: payrollRows.length > 0 ? "Uploaded Payroll CSV" : "Not Uploaded",
      revenueDetail:
        revenueRows.length > 0 ? "Uploaded Revenue Detail CSV" : "Not Uploaded",
      pipeline: pipelineRows.length > 0 ? "Uploaded Pipeline CSV" : "Not Uploaded",
      bankTransactions:
        bankRows.length > 0 ? "Uploaded Bank Transactions CSV" : "Not Uploaded",
      forecast: sourceValue(getForecastSourceLabel(activeForecast.dataSource)),
    },
    dataSourceStatus: {
      actualsMode: activeData.dataSource,
      budgetMode: activeBudget.dataSource,
      cashMode: activeCash.dataSource,
      isUsingSample:
        activeData.dataSource === "sample" ||
        activeBudget.dataSource === "sample" ||
        activeCash.dataSource === "sample",
      isUsingUnapproved:
        activeData.dataSource === "unapproved" ||
        activeBudget.dataSource === "unapproved" ||
        activeCash.dataSource === "unapproved",
      monthlyCloseComplete:
        activeData.dataSource === "approved" &&
        activeBudget.dataSource === "approved" &&
        activeCash.dataSource === "approved",
    },
    metrics: {
      revenueActual: actual.revenue,
      revenueBudget: budget.revenue,
      revenueVariance: calculateVarianceDollars(actual.revenue, budget.revenue),
      revenueVariancePct: calculateVariancePercent(actual.revenue, budget.revenue),
      operatingExpensesActual: actual.operatingExpenses,
      operatingExpensesBudget: budget.operatingExpenses,
      operatingExpenseVariance: calculateVarianceDollars(
        actual.operatingExpenses,
        budget.operatingExpenses,
      ),
      operatingExpenseVariancePct: calculateVariancePercent(
        actual.operatingExpenses,
        budget.operatingExpenses,
      ),
      ebitdaActual: actual.ebitda,
      ebitdaBudget: budget.ebitda,
      ebitdaVariance: calculateVarianceDollars(actual.ebitda, budget.ebitda),
      cashBalance: actual.cashBalance,
      priorCashBalance: cashMetrics?.priorCashBalance ?? null,
      monthlyCashChange: cashMetrics?.monthlyCashChange ?? null,
      netBurn: actual.netBurn,
      threeMonthAverageBurn: cashMetrics?.threeMonthAverageNetBurn ?? actual.netBurn,
      runwayMonths: cashMetrics?.runwayMonths ?? actual.runwayMonths,
      estimatedCashOutDate: cashMetrics?.estimatedCashOutDate ?? null,
      grossMarginActual: actual.grossMargin,
      grossMarginBudget: budget.grossMargin,
      headcount: latestPayrollRows.length,
      payrollCost,
      weightedPipeline,
      topCustomers: getTopCustomers(revenueRows),
      revenueByProduct: getRevenueByProduct(revenueRows),
      largestCashOutflows: getLargestCashOutflows(bankRows),
      uploadedForecastVersion: activeForecast.forecastVersion,
      uploadedForecastRevenue: activeForecast.periods.reduce(
        (total, period) => total + period.revenue,
        0,
      ),
      uploadedForecastOperatingExpenses: activeForecast.periods.reduce(
        (total, period) => total + period.operatingExpenses,
        0,
      ),
    },
    ruleBasedInsights,
  };
}

function getTopCustomers(
  rows: { customer: string; amount: number | null }[],
) {
  const totals = new Map<string, number>();

  rows.forEach((row) => {
    totals.set(row.customer, (totals.get(row.customer) ?? 0) + (row.amount ?? 0));
  });

  const totalRevenue = [...totals.values()].reduce((total, value) => total + value, 0);

  return [...totals.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 5)
    .map(([customer, revenue]) => ({
      customer,
      revenue,
      percentOfRevenue: totalRevenue > 0 ? revenue / totalRevenue : 0,
    }));
}

function getRevenueByProduct(
  rows: { product: string; amount: number | null }[],
) {
  const totals = new Map<string, number>();

  rows.forEach((row) => {
    totals.set(row.product, (totals.get(row.product) ?? 0) + (row.amount ?? 0));
  });

  return [...totals.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 5)
    .map(([product, revenue]) => ({ product, revenue }));
}

function getLargestCashOutflows(
  rows: { date: string; description: string; category: string; amount: number | null }[],
) {
  return rows
    .filter((row) => (row.amount ?? 0) < 0)
    .sort((first, second) => Math.abs(second.amount ?? 0) - Math.abs(first.amount ?? 0))
    .slice(0, 5)
    .map((row) => ({
      date: row.date,
      description: row.description,
      category: row.category,
      amount: row.amount ?? 0,
    }));
}

function sourceValue(label: string) {
  return label.split(": ")[1] ?? label;
}

function displayMonthToIsoMonth(month: string) {
  const date = new Date(`${month} 1`);

  if (Number.isNaN(date.getTime())) {
    return month;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
