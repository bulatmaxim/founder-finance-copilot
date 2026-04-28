"use client";

import { sampleForecast, type ForecastMonth, type ForecastVersion } from "@/data/sampleForecast";
import {
  calculateEbitda,
  calculateGrossMargin,
  calculateGrossProfit,
  calculateNetBurn,
  type FinancialPeriod,
} from "@/lib/calculations";
import {
  loadAccountMappingLookup,
  normalizeAccountName,
} from "@/lib/accountMapping";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import {
  getCurrentCompany,
  getReportingRowsForMonthlyClose,
} from "@/lib/supabase/data";

export type ForecastVersionType =
  | "Budget"
  | "Rolling Forecast"
  | "Scenario"
  | "Board Case"
  | "Downside Case"
  | "Upside Case";

export type ForecastVersionStatus =
  | "Draft"
  | "Under Review"
  | "Approved"
  | "Published"
  | "Archived";

export type ForecastRowType = "Actual" | "Forecast" | "Budget";

export type ForecastVersionRecord = {
  id: string;
  user_id: string | null;
  company_id: string;
  name: string;
  fiscal_year: number;
  version_type: ForecastVersionType;
  status: ForecastVersionStatus;
  actuals_through_month: string | null;
  source_version_id: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ForecastVersionRowRecord = {
  id: string;
  user_id: string | null;
  company_id: string;
  forecast_version_id: string;
  month: string;
  category: string;
  amount: number;
  row_type: ForecastRowType;
  source: string | null;
  is_locked: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ForecastVersionWithRows = ForecastVersionRecord & {
  rows: ForecastVersionRowRecord[];
  periods: ForecastMonth[];
  actualMonths: number;
  forecastMonths: number;
};

export type ForecastVersionContext = {
  id: string;
  name: string;
  status: ForecastVersionStatus;
  versionType: ForecastVersionType;
  actualsThroughMonth: string | null;
};

export type CreateForecastVersionInput = {
  name: string;
  fiscalYear: number;
  versionType: ForecastVersionType;
  status?: ForecastVersionStatus;
  sourceVersionId?: string;
  actualsThroughMonth?: string;
  notes?: string;
};

export const forecastVersionTypes: ForecastVersionType[] = [
  "Budget",
  "Rolling Forecast",
  "Scenario",
  "Board Case",
  "Downside Case",
  "Upside Case",
];

export const forecastVersionStatuses: ForecastVersionStatus[] = [
  "Draft",
  "Under Review",
  "Approved",
  "Published",
  "Archived",
];

export const selectedForecastVersionStorageKey =
  "founder-finance-copilot:selected-forecast-version";

const metricCategories = [
  "Revenue",
  "Cost of Revenue",
  "Sales & Marketing",
  "Research & Development",
  "General & Administrative",
  "Cash Balance",
];

export function getSelectedForecastVersionId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(selectedForecastVersionStorageKey);
}

export function setSelectedForecastVersionId(id: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(selectedForecastVersionStorageKey, id);
}

export async function loadForecastVersions(): Promise<ForecastVersionRecord[]> {
  const { company } = await getCurrentCompany();

  if (!company || !hasSupabaseBrowserEnv()) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("forecast_versions")
    .select("*")
    .eq("company_id", company.id)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Forecast versions could not be loaded: ${error.message}`);
  }

  return (data ?? []) as ForecastVersionRecord[];
}

export async function loadForecastVersionDetails(id: string): Promise<ForecastVersionWithRows | null> {
  const { company } = await getCurrentCompany();

  if (!company || !hasSupabaseBrowserEnv()) {
    return null;
  }

  const supabase = createClient();
  const [{ data: version, error: versionError }, { data: rows, error: rowsError }] =
    await Promise.all([
      supabase
        .from("forecast_versions")
        .select("*")
        .eq("company_id", company.id)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("forecast_version_rows")
        .select("*")
        .eq("company_id", company.id)
        .eq("forecast_version_id", id)
        .order("month", { ascending: true })
        .order("category", { ascending: true }),
    ]);

  if (versionError) {
    throw new Error(`Forecast version could not be loaded: ${versionError.message}`);
  }

  if (rowsError) {
    throw new Error(`Forecast version rows could not be loaded: ${rowsError.message}`);
  }

  if (!version) {
    return null;
  }

  const normalizedRows = (rows ?? []) as ForecastVersionRowRecord[];
  const periods = rowsToForecastMonths(normalizedRows);

  return {
    ...(version as ForecastVersionRecord),
    rows: normalizedRows,
    periods,
    actualMonths: countMonthsByType(normalizedRows, "Actual"),
    forecastMonths: countMonthsByType(normalizedRows, "Forecast"),
  };
}

export async function loadForecastVersionsForDisplay(): Promise<ForecastVersionWithRows[]> {
  const versions = await loadForecastVersions();

  return (
    await Promise.all(versions.map((version) => loadForecastVersionDetails(version.id)))
  ).filter((version): version is ForecastVersionWithRows => Boolean(version));
}

export async function createForecastVersion(input: CreateForecastVersionInput) {
  const supabase = ensureSupabase();
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete a company profile before creating forecasts.");
  }

  const actualsThroughMonth = input.actualsThroughMonth || null;
  const { data: version, error: versionError } = await supabase
    .from("forecast_versions")
    .insert({
      user_id: user.id,
      company_id: company.id,
      name: input.name,
      fiscal_year: input.fiscalYear,
      version_type: input.versionType,
      status: input.status ?? "Draft",
      actuals_through_month: actualsThroughMonth || null,
      source_version_id: input.sourceVersionId || null,
      notes: input.notes || null,
    })
    .select("*")
    .single();

  if (versionError || !version) {
    throw new Error(`Forecast version save failed: ${versionError?.message ?? "No version returned."}`);
  }

  const rows = await buildForecastRows({
    userId: user.id,
    companyId: company.id,
    forecastVersionId: version.id as string,
    fiscalYear: input.fiscalYear,
    versionType: input.versionType,
    sourceVersionId: input.sourceVersionId,
    actualsThroughMonth,
  });

  if (rows.length > 0) {
    const { error: rowsError } = await supabase
      .from("forecast_version_rows")
      .insert(rows);

    if (rowsError) {
      throw new Error(`Forecast version rows save failed: ${rowsError.message}`);
    }
  }

  setSelectedForecastVersionId(version.id as string);

  return version as ForecastVersionRecord;
}

export async function updateForecastVersionStatus(
  id: string,
  status: ForecastVersionStatus,
) {
  const { company } = await getCurrentCompany();

  if (!company) {
    throw new Error("Complete a company profile before updating forecasts.");
  }

  const supabase = ensureSupabase();
  const { error } = await supabase
    .from("forecast_versions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("company_id", company.id)
    .eq("id", id);

  if (error) {
    throw new Error(`Forecast version status update failed: ${error.message}`);
  }
}

export async function updateForecastVersionMonthRows({
  forecastVersionId,
  month,
  amounts,
}: {
  forecastVersionId: string;
  month: string;
  amounts: Record<string, number>;
}) {
  const { company } = await getCurrentCompany();

  if (!company) {
    throw new Error("Complete a company profile before updating forecasts.");
  }

  const supabase = ensureSupabase();

  for (const [category, amount] of Object.entries(amounts)) {
    const { error } = await supabase
      .from("forecast_version_rows")
      .update({
        amount,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", company.id)
      .eq("forecast_version_id", forecastVersionId)
      .eq("month", month)
      .eq("category", category)
      .neq("row_type", "Actual");

    if (error) {
      throw new Error(`Forecast row update failed: ${error.message}`);
    }
  }

  const { error: versionError } = await supabase
    .from("forecast_versions")
    .update({ updated_at: new Date().toISOString() })
    .eq("company_id", company.id)
    .eq("id", forecastVersionId);

  if (versionError) {
    throw new Error(`Forecast version timestamp update failed: ${versionError.message}`);
  }
}

export async function loadSelectedOrLatestForecastVersion() {
  const versions = await loadForecastVersions();

  if (versions.length === 0) {
    return null;
  }

  const selectedId = getSelectedForecastVersionId();
  const selected = versions.find((version) => version.id === selectedId);

  if (selected) {
    return selected;
  }

  return (
    versions.find((version) => version.status === "Published") ??
    versions.find((version) => version.status === "Approved") ??
    versions[0]
  );
}

export async function loadForecastVersionContext(): Promise<ForecastVersionContext | null> {
  const version = await loadSelectedOrLatestForecastVersion();

  if (!version) {
    return null;
  }

  return {
    id: version.id,
    name: version.name,
    status: version.status,
    versionType: version.version_type,
    actualsThroughMonth: version.actuals_through_month,
  };
}

export function forecastVersionToDisplayVersion(
  version: ForecastVersionWithRows,
): ForecastVersion {
  return {
    id: version.id,
    name: version.name,
    actualMonths: version.actualMonths,
    description: `${version.version_type} - ${version.actualMonths} actualized month${version.actualMonths === 1 ? "" : "s"} + ${version.forecastMonths} forecast month${version.forecastMonths === 1 ? "" : "s"}.`,
    months: version.periods,
  };
}

export function rowsToForecastMonths(rows: ForecastVersionRowRecord[]): ForecastMonth[] {
  const rowsByMonth = new Map<string, ForecastVersionRowRecord[]>();

  rows.forEach((row) => {
    rowsByMonth.set(row.month, [...(rowsByMonth.get(row.month) ?? []), row]);
  });

  return [...rowsByMonth.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([month, monthRows]) => {
      const revenue = amountForCategory(monthRows, "Revenue");
      const costOfRevenue = amountForCategory(monthRows, "Cost of Revenue");
      const salesAndMarketing = amountForCategory(monthRows, "Sales & Marketing");
      const researchAndDevelopment = amountForCategory(monthRows, "Research & Development");
      const generalAndAdministrative = amountForCategory(monthRows, "General & Administrative");
      const cashBalance = amountForCategory(monthRows, "Cash Balance");
      const grossProfit = calculateGrossProfit(revenue, costOfRevenue);
      const grossMargin = calculateGrossMargin(revenue, grossProfit);
      const operatingExpenses =
        salesAndMarketing + researchAndDevelopment + generalAndAdministrative;
      const ebitda = calculateEbitda(grossProfit, operatingExpenses);
      const netBurn = calculateNetBurn(ebitda);
      const runwayMonths = cashBalance > 0 && netBurn > 0 ? cashBalance / netBurn : 99;
      const rowType = monthRows.some((row) => row.row_type === "Actual")
        ? "Actual"
        : "Forecast";

      return {
        month: dateToDisplayMonth(month),
        revenue,
        costOfRevenue,
        grossProfit,
        grossMargin,
        salesAndMarketing,
        researchAndDevelopment,
        generalAndAdministrative,
        operatingExpenses,
        ebitda,
        cashBalance,
        netBurn,
        runwayMonths,
        periodType: rowType,
      };
    });
}

export function dateToDisplayMonth(monthDate: string | null) {
  if (!monthDate) {
    return "";
  }

  const [year, month] = monthDate.slice(0, 7).split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

export function displayMonthToDate(month: string) {
  const date = new Date(`${month} 1`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export function getFiscalMonthOptions(fiscalYear = new Date().getFullYear()) {
  return Array.from({ length: 12 }, (_, index) => {
    const value = `${fiscalYear}-${String(index + 1).padStart(2, "0")}-01`;

    return {
      value,
      label: dateToDisplayMonth(value),
    };
  });
}

async function buildForecastRows({
  userId,
  companyId,
  forecastVersionId,
  fiscalYear,
  versionType,
  sourceVersionId,
  actualsThroughMonth,
}: {
  userId: string;
  companyId: string;
  forecastVersionId: string;
  fiscalYear: number;
  versionType: ForecastVersionType;
  sourceVersionId?: string;
  actualsThroughMonth: string | null;
}) {
  const fiscalMonths = getFiscalMonthOptions(fiscalYear).map((option) => option.value);
  const [sourceRows, approvedActualPeriods] = await Promise.all([
    loadSourceRows(sourceVersionId, fiscalYear),
    loadApprovedActualPeriods(actualsThroughMonth),
  ]);
  const rows: Record<string, unknown>[] = [];

  fiscalMonths.forEach((month) => {
    const actualPeriod = approvedActualPeriods.get(month);
    const shouldActualize = Boolean(actualsThroughMonth && month <= actualsThroughMonth);
    const sourcePeriod =
      sourceRows.get(month) ??
      samplePeriodForMonth(month, versionType === "Budget" ? "budget" : "latest");
    const period = shouldActualize && actualPeriod ? actualPeriod : sourcePeriod;
    const rowType: ForecastRowType =
      versionType === "Budget"
        ? "Budget"
        : shouldActualize && actualPeriod
          ? "Actual"
          : "Forecast";

    metricCategories.forEach((category) => {
      rows.push({
        user_id: userId,
        company_id: companyId,
        forecast_version_id: forecastVersionId,
        month,
        category,
        amount: amountForPeriod(period, category),
        row_type: rowType,
        source:
          rowType === "Actual"
            ? "Approved Data Room actuals"
            : sourceVersionId
              ? "Source forecast version"
              : "Placeholder forecast assumptions",
        is_locked: rowType === "Actual",
      });
    });
  });

  return rows;
}

async function loadApprovedActualPeriods(actualsThroughMonth: string | null) {
  if (!actualsThroughMonth) {
    return new Map<string, FinancialPeriod>();
  }

  const [accountMappingLookup, actualsSource] = await Promise.all([
    loadAccountMappingLookup(),
    getReportingRowsForMonthlyClose({
      table: "financial_actuals",
      fileCategory: "actuals",
    }),
  ]);
  const approvedRows = actualsSource.sourceMode === "approved" ? actualsSource.rows : [];
  const rowsByMonth = new Map<string, Record<string, unknown>[]>();

  approvedRows.forEach((row) => {
    const month = normalizeMonthDate(String(row.month ?? ""));

    if (!month || month > actualsThroughMonth) {
      return;
    }

    rowsByMonth.set(month, [...(rowsByMonth.get(month) ?? []), row]);
  });

  return new Map(
    [...rowsByMonth.entries()].map(([month, rows]) => [
      month,
      financialRowsToPeriod(month, rows, accountMappingLookup),
    ]),
  );
}

async function loadSourceRows(sourceVersionId: string | undefined, fiscalYear: number) {
  if (sourceVersionId) {
    const source = await loadForecastVersionDetails(sourceVersionId);

    if (source) {
      return new Map(
        source.periods.map((period) => [displayMonthToDate(period.month), period]),
      );
    }
  }

  return new Map(
    getFiscalMonthOptions(fiscalYear).map((option) => [
      option.value,
      samplePeriodForMonth(option.value, "budget"),
    ]),
  );
}

function financialRowsToPeriod(
  monthDate: string,
  rows: Record<string, unknown>[],
  accountMappingLookup: Map<string, string>,
): FinancialPeriod {
  let revenue = 0;
  let costOfRevenue = 0;
  let salesAndMarketing = 0;
  let researchAndDevelopment = 0;
  let generalAndAdministrative = 0;

  rows.forEach((row) => {
    const account = String(row.account ?? "");
    const mappedCategory = accountMappingLookup.get(normalizeAccountName(account));
    const category = mappedCategory ?? String(row.category ?? "");
    const amount = toNumber(row.amount) ?? 0;
    const categoryType = classifyCategory(category);

    if (categoryType === "revenue") {
      revenue += Math.max(0, amount);
      return;
    }

    const expenseAmount = Math.abs(amount);

    if (categoryType === "costOfRevenue") {
      costOfRevenue += expenseAmount;
    } else if (categoryType === "salesAndMarketing") {
      salesAndMarketing += expenseAmount;
    } else if (categoryType === "researchAndDevelopment") {
      researchAndDevelopment += expenseAmount;
    } else {
      generalAndAdministrative += expenseAmount;
    }
  });

  const grossProfit = calculateGrossProfit(revenue, costOfRevenue);
  const grossMargin = calculateGrossMargin(revenue, grossProfit);
  const operatingExpenses =
    salesAndMarketing + researchAndDevelopment + generalAndAdministrative;
  const ebitda = calculateEbitda(grossProfit, operatingExpenses);
  const netBurn = calculateNetBurn(ebitda);
  const sourceCash = samplePeriodForMonth(monthDate, "budget").cashBalance;

  return {
    month: dateToDisplayMonth(monthDate),
    revenue,
    costOfRevenue,
    grossProfit,
    grossMargin,
    salesAndMarketing,
    researchAndDevelopment,
    generalAndAdministrative,
    operatingExpenses,
    ebitda,
    cashBalance: sourceCash,
    netBurn,
    runwayMonths: sourceCash > 0 && netBurn > 0 ? sourceCash / netBurn : 99,
  };
}

function samplePeriodForMonth(monthDate: string, versionId: "budget" | "latest") {
  const displayMonth = dateToDisplayMonth(monthDate);
  const version =
    sampleForecast.find((item) => item.id === versionId) ?? sampleForecast[0];

  return (
    version.months.find((month) => month.month === displayMonth) ??
    version.months[0]
  );
}

function amountForPeriod(period: FinancialPeriod | ForecastMonth, category: string) {
  if (category === "Revenue") return period.revenue;
  if (category === "Cost of Revenue") return period.costOfRevenue;
  if (category === "Sales & Marketing") return period.salesAndMarketing;
  if (category === "Research & Development") return period.researchAndDevelopment;
  if (category === "General & Administrative") return period.generalAndAdministrative;
  if (category === "Cash Balance") return period.cashBalance;
  return 0;
}

function amountForCategory(rows: ForecastVersionRowRecord[], category: string) {
  return rows
    .filter((row) => row.category === category)
    .reduce((total, row) => total + Number(row.amount ?? 0), 0);
}

function countMonthsByType(rows: ForecastVersionRowRecord[], rowType: ForecastRowType) {
  return new Set(
    rows.filter((row) => row.row_type === rowType).map((row) => row.month),
  ).size;
}

function normalizeMonthDate(month: string) {
  const trimmed = month.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }

  return displayMonthToDate(trimmed);
}

function classifyCategory(category: string) {
  const normalized = category.toLowerCase();

  if (normalized.includes("revenue")) return "revenue";
  if (
    normalized.includes("cost of revenue") ||
    normalized.includes("hosting") ||
    normalized.includes("infrastructure") ||
    normalized.includes("payment processing") ||
    normalized.includes("customer support") ||
    normalized.includes("third-party data") ||
    normalized.includes("third party data")
  ) {
    return "costOfRevenue";
  }

  if (
    normalized.includes("sales") ||
    normalized.includes("marketing") ||
    normalized.includes("advertising")
  ) {
    return "salesAndMarketing";
  }

  if (
    normalized.includes("r&d") ||
    normalized.includes("research") ||
    normalized.includes("development") ||
    normalized.includes("engineering") ||
    normalized.includes("product")
  ) {
    return "researchAndDevelopment";
  }

  return "generalAndAdministrative";
}

function ensureSupabase() {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error("Supabase is not configured for this local environment.");
  }

  return createClient();
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
