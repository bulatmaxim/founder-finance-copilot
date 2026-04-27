import { sampleCompany } from "@/data/sampleCompany";
import { sampleFinancials } from "@/data/sampleFinancials";
import { sampleForecast, type ForecastVersion } from "@/data/sampleForecast";
import {
  calculateVarianceDollars,
  calculateVariancePercent,
} from "@/lib/calculations";
import {
  formatCurrency,
  formatPercentVarianceLabel,
  formatRunwayMonths,
  formatVarianceLabel,
} from "@/lib/formatting";
import {
  getActiveBudgetData,
  getActiveFinancialData,
  getActualsSourceLabel,
  getBudgetSourceLabel,
  getBudgetForMonth,
} from "@/lib/localDataStore";
import type { UploadedFinancialRow } from "@/types/financial";

export type FinanceInsightCategory =
  | "Revenue"
  | "Expenses"
  | "Cash"
  | "Runway"
  | "Forecast"
  | "Budget"
  | "Data Quality"
  | "Investor Update";

export type FinanceInsightSeverity = "Low" | "Medium" | "High";

export type FinanceInsight = {
  id: string;
  title: string;
  category: FinanceInsightCategory;
  severity: FinanceInsightSeverity;
  summary: string;
  whyItMatters: string;
  recommendedAction: string;
  sourceMetrics: string[];
};

export type ForecastRecommendation = {
  shouldUpdate: boolean;
  severity: FinanceInsightSeverity;
  summary: string;
  reasons: string[];
  drivers: string[];
};

export type FinanceInsightResult = {
  companyName: string;
  reportingMonth: string;
  founderSummary: string;
  insights: FinanceInsight[];
  priorityAlerts: FinanceInsight[];
  runwayWarnings: FinanceInsight[];
  varianceInsights: FinanceInsight[];
  forecastRecommendation: ForecastRecommendation;
  investorUpdateBullets: string[];
  managementQuestions: string[];
  recommendedActions: string[];
  dataQualityInsights: FinanceInsight[];
  actualsSource: string;
  budgetSource: string;
  dataWarnings: string[];
};

type FinanceInsightOptions = {
  reportingMonth?: string;
  uploadedRows?: UploadedFinancialRow[];
};

const severityRank: Record<FinanceInsightSeverity, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

export function generateFinanceInsights(
  options: FinanceInsightOptions = {},
): FinanceInsightResult {
  const context = getInsightContext(options.reportingMonth);
  const varianceInsights = generateVarianceInsights(options);
  const runwayWarnings = generateRunwayWarnings(options);
  const forecastRecommendation = generateForecastRecommendations(options);
  const forecastInsights = buildForecastInsights(forecastRecommendation);
  const dataQualityInsights = generateDataQualityInsights(options);
  const insights = sortInsights([
    ...varianceInsights,
    ...runwayWarnings,
    ...forecastInsights,
    ...dataQualityInsights,
  ]);

  return {
    companyName: sampleCompany.name,
    reportingMonth: context.actual.month,
    founderSummary: generateFounderSummary(options),
    insights,
    priorityAlerts: insights.slice(0, 3),
    runwayWarnings,
    varianceInsights,
    forecastRecommendation,
    investorUpdateBullets: generateInvestorUpdateBullets(options),
    managementQuestions: generateManagementQuestions(options),
    recommendedActions: generateRecommendedActions(options),
    dataQualityInsights,
    actualsSource: getActualsSourceLabel(context.activeData.dataSource),
    budgetSource: getBudgetSourceLabel(context.activeBudget.dataSource),
    dataWarnings: [...context.activeData.warnings, ...context.activeBudget.warnings],
  };
}

export function generateRunwayWarnings(
  options: FinanceInsightOptions = {},
): FinanceInsight[] {
  const { actual, budget, activeData } = getInsightContext(options.reportingMonth);
  const insights: FinanceInsight[] = [];

  if (actual.runwayMonths < 12) {
    const severity = actual.runwayMonths < 9 ? "High" : "Medium";

    insights.push({
      id: "runway-below-target",
      title: "Runway is below target",
      category: "Runway",
      severity,
      summary: `${sampleCompany.name} has ${formatRunwayMonths(actual.runwayMonths)} of runway versus the 12-month operating target.`,
      whyItMatters:
        "Runway below target reduces the amount of time management has to improve growth, reduce burn, or prepare financing options.",
      recommendedAction:
        "Review hiring, vendor commitments, discretionary spend, and the fundraising timeline before adding fixed costs.",
      sourceMetrics: [
        `Runway: ${formatRunwayMonths(actual.runwayMonths)}`,
        `Budget runway: ${formatRunwayMonths(budget.runwayMonths)}`,
        `Cash: ${formatCurrency(actual.cashBalance)}`,
        `Net burn: ${formatCurrency(actual.netBurn)}`,
        getActualsSourceLabel(activeData.dataSource),
      ],
    });
  } else if (actual.runwayMonths < budget.runwayMonths) {
    insights.push({
      id: "runway-below-budget",
      title: "Runway is behind budget",
      category: "Runway",
      severity: "Low",
      summary: `Runway is ${formatRunwayMonths(actual.runwayMonths)}, below the budget plan of ${formatRunwayMonths(budget.runwayMonths)}.`,
      whyItMatters:
        "A runway variance can compound quickly if burn stays above plan or revenue conversion slows.",
      recommendedAction:
        "Monitor burn and revisit the forecast before approving incremental hiring or vendor spend.",
      sourceMetrics: [
        `Runway variance: ${formatMonthVariance(actual.runwayMonths - budget.runwayMonths)}`,
      ],
    });
  }

  return insights;
}

export function generateVarianceInsights(
  options: FinanceInsightOptions = {},
): FinanceInsight[] {
  const { actual, budget, priorActual, activeData, activeBudget } = getInsightContext(
    options.reportingMonth,
  );
  const insights: FinanceInsight[] = [];
  const revenueVariance = calculateVarianceDollars(actual.revenue, budget.revenue);
  const revenueVariancePercent = calculateVariancePercent(
    actual.revenue,
    budget.revenue,
  );
  const opexVariance = calculateVarianceDollars(
    actual.operatingExpenses,
    budget.operatingExpenses,
  );
  const opexVariancePercent = calculateVariancePercent(
    actual.operatingExpenses,
    budget.operatingExpenses,
  );
  const ebitdaVariance = calculateVarianceDollars(actual.ebitda, budget.ebitda);
  const netBurnVariance = calculateVarianceDollars(actual.netBurn, budget.netBurn);

  if (revenueVariancePercent < -0.05) {
    insights.push({
      id: "revenue-below-budget",
      title: "Revenue is below budget",
      category: "Revenue",
      severity: revenueVariancePercent < -0.1 ? "High" : "Medium",
      summary: `Revenue was below budget by ${formatVarianceLabel(revenueVariance)} (${formatPercentVarianceLabel(revenueVariancePercent)}).`,
      whyItMatters:
        "Revenue underperformance pressures EBITDA, cash efficiency, forecast confidence, and investor narrative.",
      recommendedAction:
        "Review sales pipeline, conversion, pricing, churn, expansion, and forecast assumptions before the next operating review.",
      sourceMetrics: [
        `Actual revenue: ${formatCurrency(actual.revenue)}`,
        `Budget revenue: ${formatCurrency(budget.revenue)}`,
        `Variance: ${formatVarianceLabel(revenueVariance)}`,
        getActualsSourceLabel(activeData.dataSource),
      ],
    });
  } else if (revenueVariance > 0) {
    insights.push({
      id: "revenue-above-budget",
      title: "Revenue outperformed budget",
      category: "Revenue",
      severity: "Low",
      summary: `Revenue was ahead of budget by ${formatVarianceLabel(revenueVariance)} (${formatPercentVarianceLabel(revenueVariancePercent)}).`,
      whyItMatters:
        "Revenue upside may improve cash efficiency if it is durable rather than timing-related.",
      recommendedAction:
        "Confirm whether the outperformance is recurring, one-time, or timing-driven before changing the forecast.",
      sourceMetrics: [
        `Actual revenue: ${formatCurrency(actual.revenue)}`,
        `Budget revenue: ${formatCurrency(budget.revenue)}`,
        getActualsSourceLabel(activeData.dataSource),
      ],
    });
  }

  if (opexVariancePercent > 0.05) {
    insights.push({
      id: "opex-above-budget",
      title: "Operating expenses are above budget",
      category: "Expenses",
      severity: opexVariancePercent > 0.1 ? "High" : "Medium",
      summary: `Operating expenses exceeded budget by ${formatVarianceLabel(opexVariance)} (${formatPercentVarianceLabel(opexVariancePercent)}).`,
      whyItMatters:
        "Expense pressure can reduce runway and offset revenue progress, especially when payroll and go-to-market spend are fixed.",
      recommendedAction:
        "Review expense categories, hiring plans, vendor commitments, and discretionary spend before approving new operating costs.",
      sourceMetrics: [
        `Actual OpEx: ${formatCurrency(actual.operatingExpenses)}`,
        `Budget OpEx: ${formatCurrency(budget.operatingExpenses)}`,
        getActualsSourceLabel(activeData.dataSource),
        getBudgetSourceLabel(activeBudget.dataSource),
      ],
    });
  }

  if (ebitdaVariance < 0) {
    const revenueMiss = revenueVariance < 0;
    const expensePressure = opexVariance > 0;
    const driver =
      revenueMiss && expensePressure
        ? "both revenue shortfall and expense pressure"
        : revenueMiss
          ? "revenue shortfall"
          : expensePressure
            ? "expense pressure"
            : "gross margin and operating mix";

    insights.push({
      id: "ebitda-below-budget",
      title: "EBITDA is below budget",
      category: "Budget",
      severity: Math.abs(ebitdaVariance) > 25000 ? "Medium" : "Low",
      summary: `EBITDA was below budget by ${formatVarianceLabel(ebitdaVariance)} due to ${driver}.`,
      whyItMatters:
        "EBITDA underperformance usually flows directly into burn, runway, and investor reporting.",
      recommendedAction:
        "Update investor reporting language and test whether the latest forecast still reflects current revenue and spend trends.",
      sourceMetrics: [
        `Actual EBITDA: ${formatCurrency(actual.ebitda)}`,
        `Budget EBITDA: ${formatCurrency(budget.ebitda)}`,
        getActualsSourceLabel(activeData.dataSource),
        getBudgetSourceLabel(activeBudget.dataSource),
      ],
    });
  }

  if (priorActual && actual.cashBalance < priorActual.cashBalance) {
    const cashChange = actual.cashBalance - priorActual.cashBalance;

    insights.push({
      id: "cash-balance-declining",
      title: "Cash balance declined month over month",
      category: "Cash",
      severity: "Low",
      summary: `Cash declined by ${formatCurrency(Math.abs(cashChange))} from ${priorActual.month} to ${actual.month}.`,
      whyItMatters:
        "A declining cash balance is expected while the business is burning cash, but the pace should be checked against plan.",
      recommendedAction:
        "Compare cash movement to net burn, working capital timing, and forecasted ending cash.",
      sourceMetrics: [
        `${priorActual.month} cash: ${formatCurrency(priorActual.cashBalance)}`,
        `${actual.month} cash: ${formatCurrency(actual.cashBalance)}`,
        activeData.dataSource === "uploaded"
          ? "Cash uses sample assumption"
          : getActualsSourceLabel(activeData.dataSource),
      ],
    });
  }

  if (netBurnVariance > 0) {
    insights.push({
      id: "net-burn-above-budget",
      title: "Net burn is above budget",
      category: "Cash",
      severity: netBurnVariance / Math.max(1, budget.netBurn) > 0.05 ? "Medium" : "Low",
      summary: `Net burn was higher than budget by ${formatVarianceLabel(netBurnVariance)}.`,
      whyItMatters:
        "Higher burn reduces cash runway unless offset by improved revenue, margin, or working capital timing.",
      recommendedAction:
        "Identify whether the burn variance is temporary timing or a structural increase in monthly cash usage.",
      sourceMetrics: [
        `Actual net burn: ${formatCurrency(actual.netBurn)}`,
        `Budget net burn: ${formatCurrency(budget.netBurn)}`,
        getActualsSourceLabel(activeData.dataSource),
        getBudgetSourceLabel(activeBudget.dataSource),
      ],
    });
  }

  return insights;
}

export function generateForecastRecommendations(
  options: FinanceInsightOptions = {},
): ForecastRecommendation {
  const { actual, budget, latestForecastMonth } = getInsightContext(
    options.reportingMonth,
  );
  const reasons: string[] = [];
  const drivers: string[] = [];
  const revenueVsBudget = calculateVariancePercent(actual.revenue, budget.revenue);
  const revenueVsForecast = latestForecastMonth
    ? calculateVariancePercent(actual.revenue, latestForecastMonth.revenue)
    : 0;
  const opexVsBudget = calculateVariancePercent(
    actual.operatingExpenses,
    budget.operatingExpenses,
  );
  const ebitdaVariance = actual.ebitda - budget.ebitda;

  if (revenueVsBudget < -0.05 || revenueVsForecast < -0.05) {
    reasons.push("Actual revenue is more than 5% below the operating plan or latest forecast.");
    drivers.push("revenue miss");
  }

  if (opexVsBudget > 0.05) {
    reasons.push("Operating expenses are more than 5% above budget.");
    drivers.push("expense pressure");
  }

  if (actual.runwayMonths < 12) {
    reasons.push("Runway is below the 12-month target.");
    drivers.push("runway below target");
  }

  if (ebitdaVariance < 0) {
    reasons.push(`EBITDA is below budget by ${formatVarianceLabel(ebitdaVariance)}.`);
    drivers.push("EBITDA below budget");
  }

  const shouldUpdate = reasons.length > 0;

  return {
    shouldUpdate,
    severity: reasons.length >= 3 ? "High" : shouldUpdate ? "Medium" : "Low",
    summary: shouldUpdate
      ? "Update the latest forecast before the next management or investor update."
      : "The latest forecast does not require an immediate update based on current local sample thresholds.",
    reasons: shouldUpdate
      ? reasons
      : ["Latest actuals are within the local rule thresholds for revenue, expense, runway, and EBITDA."],
    drivers: drivers.length > 0 ? [...new Set(drivers)] : ["no material threshold breach"],
  };
}

export function generateInvestorUpdateBullets(
  options: FinanceInsightOptions = {},
) {
  const { actual, budget } = getInsightContext(options.reportingMonth);
  const revenueVariance = actual.revenue - budget.revenue;
  const opexVariance = actual.operatingExpenses - budget.operatingExpenses;
  const ebitdaVariance = actual.ebitda - budget.ebitda;

  return [
    `${actual.month} revenue was ${formatCurrency(actual.revenue)}, ${revenueVariance >= 0 ? "ahead of" : "below"} budget by ${formatVarianceLabel(revenueVariance)}.`,
    `Operating expenses were ${formatCurrency(actual.operatingExpenses)}, ${opexVariance <= 0 ? "below" : "above"} budget by ${formatVarianceLabel(opexVariance)}.`,
    `EBITDA was ${formatCurrency(actual.ebitda)}, ${ebitdaVariance >= 0 ? "ahead of" : "below"} plan by ${formatVarianceLabel(ebitdaVariance)}.`,
    `Ending cash was ${formatCurrency(actual.cashBalance)} with ${formatRunwayMonths(actual.runwayMonths)} of runway.`,
    `Management focus is on forecast accuracy, burn discipline, and investor-ready commentary for the current operating plan.`,
  ];
}

export function generateManagementQuestions(
  options: FinanceInsightOptions = {},
) {
  const { actual, budget } = getInsightContext(options.reportingMonth);
  const questions = [
    "Are revenue variances timing-related, demand-related, or caused by conversion assumptions?",
    "Which expense categories are driving the unfavorable variance versus budget?",
    "Should the hiring plan be adjusted based on current burn and runway?",
    "Is the current forecast still realistic given the latest actuals?",
    "Does the company need to prepare fundraising materials earlier than planned?",
  ];

  if (actual.revenue >= budget.revenue) {
    questions[0] =
      "Is revenue outperformance recurring, one-time, or pulled forward from future periods?";
  }

  if (actual.runwayMonths >= 12) {
    questions[4] =
      "What runway threshold should trigger fundraising preparation or deeper cost controls?";
  }

  return questions;
}

export function generateRecommendedActions(
  options: FinanceInsightOptions = {},
) {
  const result = generateForecastRecommendations(options);
  const { actual, budget } = getInsightContext(options.reportingMonth);
  const actions: string[] = [];

  if (result.shouldUpdate) {
    actions.push("Update the latest forecast with current actuals and revised spend assumptions.");
  }

  if (actual.operatingExpenses > budget.operatingExpenses) {
    actions.push("Review operating expense categories and identify timing versus structural spend.");
  }

  if (actual.runwayMonths < 12) {
    actions.push("Review hiring plan, vendor spend, and fundraising timeline against runway targets.");
  } else {
    actions.push("Keep hiring approvals tied to forecasted runway and revenue conversion.");
  }

  actions.push("Prepare investor update language that explains revenue, EBITDA, cash, and runway.");
  actions.push("Confirm whether revenue and expense variances should change next month operating targets.");

  return [...new Set(actions)].slice(0, 5);
}

export function generateFounderSummary(options: FinanceInsightOptions = {}) {
  const { actual, budget, priorActual, activeData, activeBudget } = getInsightContext(
    options.reportingMonth,
  );
  const revenueVariance = actual.revenue - budget.revenue;
  const opexVariance = actual.operatingExpenses - budget.operatingExpenses;
  const ebitdaVariance = actual.ebitda - budget.ebitda;
  const cashChange = priorActual
    ? actual.cashBalance - priorActual.cashBalance
    : 0;
  const forecastRecommendation = generateForecastRecommendations(options);
  const revenuePhrase =
    revenueVariance >= 0
      ? `revenue was ahead of budget by ${formatVarianceLabel(revenueVariance)}`
      : `revenue was below budget by ${formatVarianceLabel(revenueVariance)}`;
  const spendPhrase =
    opexVariance <= 0
      ? `OpEx was favorable by ${formatVarianceLabel(opexVariance)}`
      : `OpEx was above budget by ${formatVarianceLabel(opexVariance)}`;
  const cashPhrase = priorActual
    ? `cash ${cashChange >= 0 ? "increased" : "declined"} by ${formatCurrency(Math.abs(cashChange))} month over month`
    : `cash ended at ${formatCurrency(actual.cashBalance)}`;

  const sourcePhrase =
    activeData.dataSource === "uploaded" || activeBudget.dataSource === "uploaded"
      ? `This analysis uses ${getActualsSourceLabel(activeData.dataSource).replace("Actuals Source: ", "").toLowerCase()} and ${getBudgetSourceLabel(activeBudget.dataSource).replace("Budget Source: ", "").toLowerCase()}; cash and runway remain sample assumptions until cash upload is built.`
      : "This analysis uses local sample financial data and sample budget data.";

  return `${sampleCompany.name} closed ${actual.month} with ${revenuePhrase}, ${spendPhrase}, and EBITDA ${ebitdaVariance >= 0 ? "ahead of" : "below"} plan by ${formatVarianceLabel(ebitdaVariance)}. ${cashPhrase}, ending with ${formatRunwayMonths(actual.runwayMonths)} of runway. ${forecastRecommendation.shouldUpdate ? "Management should refresh the latest forecast and tighten the investor narrative around the main variance drivers." : "Management can maintain the current forecast posture while continuing to monitor burn and pipeline quality."} ${sourcePhrase}`;
}

export function generateDataQualityInsights(
  options: FinanceInsightOptions = {},
): FinanceInsight[] {
  const insights: FinanceInsight[] = [];
  const activeData = getActiveFinancialData();
  const activeBudget = getActiveBudgetData();

  if (activeData.dataSource === "uploaded" || activeBudget.dataSource === "uploaded") {
    insights.push({
      id: "uploaded-data-active",
      title: "Uploaded CSV data is active",
      category: "Data Quality",
      severity: "Low",
      summary: `The finance copilot is using ${getActualsSourceLabel(activeData.dataSource).replace("Actuals Source: ", "").toLowerCase()} and ${getBudgetSourceLabel(activeBudget.dataSource).replace("Budget Source: ", "").toLowerCase()}.`,
      whyItMatters:
        "This proves the local prototype can analyze user-provided actuals without a database or external integrations.",
      recommendedAction:
        "Add persistent database storage and formal account mapping before production use.",
      sourceMetrics: [
        `Uploaded rows: ${activeData.uploadedRows.length}`,
        `Uploaded budget rows: ${activeBudget.uploadedRows.length}`,
        "Cash and runway use sample assumptions",
      ],
    });
  } else if (!options.uploadedRows || options.uploadedRows.length === 0) {
    insights.push({
      id: "uploaded-data-not-linked",
      title: "Uploaded data is not yet connected",
      category: "Data Quality",
      severity: "Low",
      summary:
        "The finance copilot is using local sample data because no uploaded CSV data is active.",
      whyItMatters:
        "The rule engine can prove the analyst workflow now, but production use will need a governed source of truth.",
      recommendedAction:
        "Keep uploaded data session-only until mapping, review, and persistence are added.",
      sourceMetrics: ["Source: local sample financials, budget, and forecast"],
    });
  } else {
    const errorRows = options.uploadedRows.filter((row) => row.status === "Error");

    if (errorRows.length > 0) {
      insights.push({
        id: "uploaded-data-validation-errors",
        title: "Uploaded data has validation errors",
        category: "Data Quality",
        severity: "Medium",
        summary: `${errorRows.length} uploaded row(s) contain validation errors.`,
        whyItMatters:
          "Invalid source data can create misleading variance analysis and investor commentary.",
        recommendedAction:
          "Resolve upload validation errors before replacing sample data in dashboards or reports.",
        sourceMetrics: [`Uploaded rows: ${options.uploadedRows.length}`],
      });
    }
  }

  return insights;
}

export function answerFinanceCopilotQuestion(
  question: string,
  options: FinanceInsightOptions = {},
) {
  const result = generateFinanceInsights(options);
  const { actual, budget, priorActual } = getInsightContext(options.reportingMonth);
  const revenueVariance = actual.revenue - budget.revenue;
  const opexVariance = actual.operatingExpenses - budget.operatingExpenses;
  const cashChange = priorActual
    ? actual.cashBalance - priorActual.cashBalance
    : 0;

  switch (question) {
    case "What changed this month?":
      return result.founderSummary;
    case "Why did runway change?":
      return `Runway is ${formatRunwayMonths(actual.runwayMonths)}. The main drivers are ending cash of ${formatCurrency(actual.cashBalance)}, net burn of ${formatCurrency(actual.netBurn)}, and cash movement of ${formatVarianceLabel(cashChange)} versus the prior month.`;
    case "Are we off budget?":
      return `Revenue is ${formatVarianceLabel(revenueVariance)} versus budget, OpEx is ${formatVarianceLabel(opexVariance)} versus budget, and EBITDA is ${formatVarianceLabel(actual.ebitda - budget.ebitda)} versus plan.`;
    case "Should we update the forecast?":
      return `${result.forecastRecommendation.summary} Drivers: ${result.forecastRecommendation.drivers.join(", ")}.`;
    case "What should we tell investors?":
      return result.investorUpdateBullets.slice(0, 3).join(" ");
    case "What actions should management take?":
      return result.recommendedActions.slice(0, 3).join(" ");
    default:
      return result.founderSummary;
  }
}

function buildForecastInsights(
  forecastRecommendation: ForecastRecommendation,
): FinanceInsight[] {
  if (!forecastRecommendation.shouldUpdate) {
    return [
      {
        id: "forecast-current",
        title: "Forecast can remain unchanged",
        category: "Forecast",
        severity: "Low",
        summary: forecastRecommendation.summary,
        whyItMatters:
          "A stable forecast process helps management avoid unnecessary replanning noise.",
        recommendedAction:
          "Continue monitoring the next closed month and update only if threshold drivers emerge.",
        sourceMetrics: forecastRecommendation.reasons,
      },
    ];
  }

  return [
    {
      id: "forecast-update-needed",
      title: "Forecast update is recommended",
      category: "Forecast",
      severity: forecastRecommendation.severity,
      summary: forecastRecommendation.summary,
      whyItMatters:
        "Forecasts should reflect material changes in revenue, expense pressure, EBITDA, and runway so management decisions stay grounded.",
      recommendedAction:
        "Refresh the latest forecast and include clear commentary on the driver changes.",
      sourceMetrics: forecastRecommendation.reasons,
    },
  ];
}

function getInsightContext(reportingMonth?: string) {
  const activeData = getActiveFinancialData();
  const activeBudget = getActiveBudgetData();
  const periods = activeData.periods.length > 0 ? activeData.periods : sampleFinancials;
  const month = reportingMonth ?? periods[periods.length - 1].month;
  const index = periods.findIndex((period) => period.month === month);
  const safeIndex = index >= 0 ? index : periods.length - 1;
  const actual = periods[safeIndex];
  const budget = getBudgetForMonth(actual.month, safeIndex);
  const priorActual = safeIndex > 0 ? periods[safeIndex - 1] : null;
  const latestForecast = getForecastVersion("latest");
  const latestForecastMonth = latestForecast.months.find(
    (period) => period.month === actual.month,
  );

  return {
    actual,
    budget,
    priorActual,
    latestForecast,
    latestForecastMonth,
    activeData,
    activeBudget,
  };
}

function getForecastVersion(id: "budget" | "latest") {
  const version = sampleForecast.find((item) => item.id === id);

  if (!version) {
    throw new Error(`Missing forecast version: ${id}`);
  }

  return version as ForecastVersion;
}

function sortInsights(insights: FinanceInsight[]) {
  return [...insights].sort((first, second) => {
    const severityDelta =
      severityRank[second.severity] - severityRank[first.severity];

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return first.title.localeCompare(second.title);
  });
}

function formatMonthVariance(value: number) {
  const prefix = value >= 0 ? "+" : "-";

  return `${prefix}${Math.abs(value).toFixed(1)} months`;
}
