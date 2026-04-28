"use client";

import type { CfoBriefDeckContent } from "@/lib/powerpoint";
import {
  calculateVarianceDollars,
  calculateVariancePercent,
  getVarianceStatus,
} from "@/lib/calculations";
import { generateFinanceInsights } from "@/lib/financeInsights";
import {
  formatCurrency,
  formatPercentVarianceLabel,
  formatRunwayMonths,
  formatVarianceLabel,
} from "@/lib/formatting";
import {
  getActiveBudgetData,
  getActiveCashData,
  getActiveFinancialData,
  getActualsSourceLabel,
  getBudgetForMonth,
  getBudgetSourceLabel,
  getCashMetricsForMonth,
  getCashSourceLabel,
} from "@/lib/localDataStore";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { getCurrentCompany } from "@/lib/supabase/data";

export type MonthlyReportType =
  | "Monthly Performance Review"
  | "Board Pack"
  | "Forecast Update"
  | "Decision Memo";

export type MonthlyReportStatus = "Draft" | "Ready" | "Exported" | "Archived";

export type MonthlyReportSections = {
  cfoBrief: boolean;
  budgetVsActuals: boolean;
  forecastUpdate: boolean;
  cashRunway: boolean;
  kpiSummary: boolean;
  risksRecommendations: boolean;
};

export type MonthlyReportCommentary = {
  executiveSummary: string;
  revenueCommentary: string;
  expenseCommentary: string;
  cashCommentary: string;
  forecastCommentary: string;
  risks: string;
  recommendations: string;
};

export type MonthlyReportRecord = {
  id: string;
  user_id: string | null;
  company_id: string;
  reporting_month: string;
  report_type: MonthlyReportType;
  title: string | null;
  status: MonthlyReportStatus;
  forecast_version_id: string | null;
  data_source: Record<string, unknown> | null;
  commentary: MonthlyReportCommentary | null;
  sections: MonthlyReportSections | null;
  generated_file_path: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export const reportTypes: MonthlyReportType[] = [
  "Monthly Performance Review",
  "Board Pack",
  "Forecast Update",
  "Decision Memo",
];

export const defaultReportSections: MonthlyReportSections = {
  cfoBrief: true,
  budgetVsActuals: true,
  forecastUpdate: true,
  cashRunway: true,
  kpiSummary: true,
  risksRecommendations: true,
};

export function buildDefaultReportCommentary(
  reportingMonth: string,
  forecastVersionName?: string,
): MonthlyReportCommentary {
  const monthLabel = dateToDisplayMonth(reportingMonth);
  const activeData = getActiveFinancialData();
  const periods = activeData.periods;
  const index = periods.findIndex((period) => period.month === monthLabel);
  const safeIndex = index >= 0 ? index : periods.length - 1;
  const actual = periods[safeIndex];
  const budget = getBudgetForMonth(actual.month, safeIndex);
  const priorActual = safeIndex > 0 ? periods[safeIndex - 1] : null;
  const cashMetrics = getCashMetricsForMonth(actual.month);
  const insights = generateFinanceInsights({ reportingMonth: actual.month });
  const revenueVariance = calculateVarianceDollars(actual.revenue, budget.revenue);
  const opexVariance = calculateVarianceDollars(
    actual.operatingExpenses,
    budget.operatingExpenses,
  );
  const ebitdaVariance = calculateVarianceDollars(actual.ebitda, budget.ebitda);
  const revenueStatus = getVarianceStatus(actual.revenue, budget.revenue, "higher");
  const opexStatus = getVarianceStatus(
    actual.operatingExpenses,
    budget.operatingExpenses,
    "lower",
  );
  const cashChange =
    cashMetrics?.monthlyCashChange ??
    (priorActual ? actual.cashBalance - priorActual.cashBalance : 0);

  return {
    executiveSummary:
      insights.founderSummary ||
      `${monthLabel} performance reflects ${formatCurrency(actual.revenue)} of revenue and ${formatCurrency(actual.ebitda)} of EBITDA.`,
    revenueCommentary: `Revenue was ${formatCurrency(actual.revenue)}, ${revenueStatus.toLowerCase()} to budget by ${formatVarianceLabel(revenueVariance)} (${formatPercentVarianceLabel(calculateVariancePercent(actual.revenue, budget.revenue))}).`,
    expenseCommentary: `Operating expenses were ${formatCurrency(actual.operatingExpenses)}, ${opexStatus.toLowerCase()} to budget by ${formatVarianceLabel(opexVariance)}.`,
    cashCommentary: `Cash ended at ${formatCurrency(actual.cashBalance)} with ${formatRunwayMonths(actual.runwayMonths)} of runway. Month-over-month cash movement was ${formatVarianceLabel(cashChange)}.`,
    forecastCommentary: forecastVersionName
      ? `${forecastVersionName} is the selected forecast context for forward-looking reporting.`
      : "No saved forecast version is selected; forecast commentary uses the active forecast/sample assumptions.",
    risks: insights.priorityAlerts
      .map((item) => item.summary)
      .slice(0, 4)
      .join("\n"),
    recommendations: [
      `EBITDA variance was ${formatVarianceLabel(ebitdaVariance)} versus budget.`,
      ...insights.recommendedActions.slice(0, 4),
    ].join("\n"),
  };
}

export function buildReportDeckContent(
  commentary: MonthlyReportCommentary,
): CfoBriefDeckContent {
  return {
    executiveSummary: splitLines(commentary.executiveSummary),
    revenueCommentary: splitLines(commentary.revenueCommentary),
    expenseCommentary: splitLines(commentary.expenseCommentary),
    cashRunwayCommentary: splitLines(commentary.cashCommentary),
    budgetCommentary: splitLines(commentary.forecastCommentary),
    risks: splitLines(commentary.risks),
    actions: splitLines(commentary.recommendations),
    investorBullets: splitLines(commentary.executiveSummary).slice(0, 3),
  };
}

export function buildReportDataSource({
  reportingMonth,
  reportType,
  forecastVersionId,
  forecastVersionName,
  closeStatus,
  mappingWarning,
  forecastDriverSummary,
}: {
  reportingMonth: string;
  reportType: MonthlyReportType;
  forecastVersionId: string | null;
  forecastVersionName: string | null;
  closeStatus: string;
  mappingWarning: string | null;
  forecastDriverSummary: string | null;
}) {
  const activeData = getActiveFinancialData();
  const activeBudget = getActiveBudgetData();
  const activeCash = getActiveCashData();

  return {
    reportingMonth,
    reportType,
    actuals: getActualsSourceLabel(activeData.dataSource),
    budget: getBudgetSourceLabel(activeBudget.dataSource),
    cash: getCashSourceLabel(activeCash.dataSource),
    closeStatus,
    mappingWarning,
    forecastVersionId,
    forecastVersionName,
    forecastDriverSummary,
  };
}

export async function saveMonthlyReportDraft({
  reportId,
  reportingMonth,
  reportType,
  title,
  forecastVersionId,
  dataSource,
  commentary,
  sections,
  status = "Draft",
}: {
  reportId?: string | null;
  reportingMonth: string;
  reportType: MonthlyReportType;
  title: string;
  forecastVersionId: string | null;
  dataSource: Record<string, unknown>;
  commentary: MonthlyReportCommentary;
  sections: MonthlyReportSections;
  status?: MonthlyReportStatus;
}) {
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete a company profile before saving reports.");
  }

  const supabase = ensureSupabase();
  const payload = {
    user_id: user.id,
    company_id: company.id,
    reporting_month: reportingMonth,
    report_type: reportType,
    title,
    status,
    forecast_version_id: forecastVersionId,
    data_source: dataSource,
    commentary,
    sections,
    updated_at: new Date().toISOString(),
  };

  if (reportId) {
    const { data, error } = await supabase
      .from("monthly_reports")
      .update(payload)
      .eq("company_id", company.id)
      .eq("id", reportId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Monthly report update failed: ${error.message}`);
    }

    return data as MonthlyReportRecord;
  }

  const { data, error } = await supabase
    .from("monthly_reports")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Monthly report save failed: ${error.message}`);
  }

  return data as MonthlyReportRecord;
}

export async function markMonthlyReportExported({
  reportId,
  generatedFilePath,
  dataSource,
}: {
  reportId: string;
  generatedFilePath: string | null;
  dataSource: Record<string, unknown>;
}) {
  const { company } = await getCurrentCompany();

  if (!company) {
    throw new Error("Complete a company profile before updating reports.");
  }

  const supabase = ensureSupabase();
  const { error } = await supabase
    .from("monthly_reports")
    .update({
      status: "Exported",
      generated_file_path: generatedFilePath,
      data_source: dataSource,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", company.id)
    .eq("id", reportId);

  if (error) {
    throw new Error(`Monthly report export update failed: ${error.message}`);
  }
}

export async function loadMonthlyReportHistory(limit = 10) {
  const { company } = await getCurrentCompany();

  if (!company || !hasSupabaseBrowserEnv()) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("monthly_reports")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Monthly report history failed: ${error.message}`);
  }

  return (data ?? []) as MonthlyReportRecord[];
}

export async function downloadMonthlyReportFile(report: MonthlyReportRecord) {
  if (!report.generated_file_path) {
    return null;
  }

  const supabase = ensureSupabase();
  const { data, error } = await supabase.storage
    .from("finance-uploads")
    .createSignedUrl(report.generated_file_path, 60);

  if (error) {
    throw new Error(`Report download link failed: ${error.message}`);
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");

  return data.signedUrl;
}

export function dateToDisplayMonth(monthDate: string) {
  const date = new Date(`${monthDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return monthDate;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function splitLines(value: string) {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensureSupabase() {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error("Supabase is not configured for this local environment.");
  }

  return createClient();
}
