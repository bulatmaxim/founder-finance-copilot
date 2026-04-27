import { sampleBudget } from "@/data/sampleBudget";
import { sampleFinancials } from "@/data/sampleFinancials";
import {
  calculateEbitda,
  calculateGrossMargin,
  calculateGrossProfit,
  calculateNetBurn,
  type FinancialPeriod,
} from "@/lib/calculations";
import type { UploadedFinancialRow } from "@/types/financial";

export type DataSourceMode = "sample" | "uploaded";

export type UploadedActualsPayload = {
  rows: UploadedFinancialRow[];
  savedAt: string;
};

export type ActiveFinancialData = {
  periods: FinancialPeriod[];
  dataSource: DataSourceMode;
  uploadedRows: UploadedFinancialRow[];
  savedAt: string | null;
  warnings: string[];
  errors: string[];
};

const uploadedActualsKey = "founder-finance-copilot:uploaded-actuals";

export function saveUploadedActuals(rows: UploadedFinancialRow[]) {
  if (!canUseLocalStorage()) {
    return;
  }

  const payload: UploadedActualsPayload = {
    rows,
    savedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(uploadedActualsKey, JSON.stringify(payload));
}

export function getUploadedActuals() {
  return getUploadedActualsPayload()?.rows ?? [];
}

export function getUploadedActualsPayload(): UploadedActualsPayload | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(uploadedActualsKey);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<UploadedActualsPayload>;

    if (!Array.isArray(parsed.rows)) {
      clearUploadedActuals();
      return null;
    }

    return {
      rows: parsed.rows,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch (error) {
    console.error("Failed to read uploaded actuals from localStorage", error);
    clearUploadedActuals();
    return null;
  }
}

export function clearUploadedActuals() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(uploadedActualsKey);
}

export function hasUploadedActuals() {
  return getUploadedActuals().length > 0;
}

export function getActiveFinancialData(): ActiveFinancialData {
  const payload = getUploadedActualsPayload();

  if (!payload || payload.rows.length === 0) {
    return getSampleFinancialData();
  }

  const converted = convertUploadedRowsToFinancialPeriods(payload.rows);

  if (converted.periods.length === 0 || converted.errors.length > 0) {
    return {
      ...getSampleFinancialData(),
      warnings: [
        ...converted.warnings,
        "Uploaded CSV data could not be converted into monthly financial summaries. Falling back to sample data.",
      ],
      errors: converted.errors,
    };
  }

  return {
    periods: converted.periods,
    dataSource: "uploaded",
    uploadedRows: payload.rows,
    savedAt: payload.savedAt,
    warnings: [
      ...converted.warnings,
      "Cash balance and runway still use sample assumptions because cash upload has not been built yet.",
    ],
    errors: [],
  };
}

export function getBudgetForMonth(month: string, fallbackIndex = 0) {
  return (
    sampleBudget.find((period) => period.month === month) ??
    sampleBudget[fallbackIndex] ??
    sampleBudget[sampleBudget.length - 1]
  );
}

export function getDataSourceLabel(dataSource: DataSourceMode) {
  return dataSource === "uploaded"
    ? "Data Source: Uploaded CSV Data"
    : "Data Source: Sample Data";
}

function getSampleFinancialData(): ActiveFinancialData {
  return {
    periods: sampleFinancials,
    dataSource: "sample",
    uploadedRows: [],
    savedAt: null,
    warnings: [],
    errors: [],
  };
}

function convertUploadedRowsToFinancialPeriods(rows: UploadedFinancialRow[]) {
  const warnings = new Set<string>();
  const errors = new Set<string>();
  const grouped = new Map<string, UploadedFinancialRow[]>();

  rows
    .filter((row) => row.status !== "Error")
    .forEach((row) => {
      if (!row.month || row.amount === null) {
        return;
      }

      const displayMonth = csvMonthToDisplayMonth(row.month);

      if (!displayMonth) {
        errors.add(`Invalid uploaded month: ${row.month}`);
        return;
      }

      grouped.set(displayMonth, [...(grouped.get(displayMonth) ?? []), row]);
    });

  const periods = [...grouped.entries()]
    .sort(([firstMonth], [secondMonth]) => monthSortValue(firstMonth) - monthSortValue(secondMonth))
    .map(([month, monthRows], index) =>
      buildFinancialPeriodFromRows(month, monthRows, index, warnings),
    );

  return {
    periods,
    warnings: [...warnings],
    errors: [...errors],
  };
}

function buildFinancialPeriodFromRows(
  month: string,
  rows: UploadedFinancialRow[],
  index: number,
  warnings: Set<string>,
): FinancialPeriod {
  let revenue = 0;
  let costOfRevenue = 0;
  let salesAndMarketing = 0;
  let researchAndDevelopment = 0;
  let generalAndAdministrative = 0;

  rows.forEach((row) => {
    const amount = row.amount ?? 0;
    const categoryType = classifyCategory(row.category);

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

      if (categoryType === "unmappedExpense") {
        warnings.add(
          `Some uploaded expense categories were mapped to G&A by default.`,
        );
      }
    }
  });

  const grossProfit = calculateGrossProfit(revenue, costOfRevenue);
  const grossMargin = calculateGrossMargin(revenue, grossProfit);
  const operatingExpenses =
    salesAndMarketing + researchAndDevelopment + generalAndAdministrative;
  const ebitda = calculateEbitda(grossProfit, operatingExpenses);
  const netBurn = calculateNetBurn(ebitda);
  const cashAssumption = getCashAssumption(month, index);

  return {
    month,
    revenue,
    costOfRevenue,
    grossProfit,
    grossMargin,
    salesAndMarketing,
    researchAndDevelopment,
    generalAndAdministrative,
    operatingExpenses,
    ebitda,
    cashBalance: cashAssumption.cashBalance,
    netBurn,
    runwayMonths: cashAssumption.runwayMonths,
  };
}

function classifyCategory(category: string) {
  const normalized = category.toLowerCase();

  if (normalized.includes("revenue")) return "revenue";
  if (
    normalized.includes("cogs") ||
    normalized.includes("cost of revenue") ||
    normalized.includes("hosting") ||
    normalized.includes("cloud") ||
    normalized.includes("infrastructure")
  ) {
    return "costOfRevenue";
  }
  if (
    normalized.includes("sales") ||
    normalized.includes("marketing") ||
    normalized.includes("advertising") ||
    normalized.includes("go-to-market")
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
  if (
    normalized.includes("g&a") ||
    normalized.includes("general") ||
    normalized.includes("administrative") ||
    normalized.includes("admin") ||
    normalized.includes("legal") ||
    normalized.includes("finance") ||
    normalized.includes("accounting") ||
    normalized.includes("payroll") ||
    normalized.includes("gusto")
  ) {
    return "generalAndAdministrative";
  }

  return "unmappedExpense";
}

function getCashAssumption(month: string, index: number) {
  const matchingSample = sampleFinancials.find((period) => period.month === month);
  const fallbackSample =
    sampleFinancials[index] ?? sampleFinancials[sampleFinancials.length - 1];

  return {
    cashBalance: matchingSample?.cashBalance ?? fallbackSample.cashBalance,
    runwayMonths: matchingSample?.runwayMonths ?? fallbackSample.runwayMonths,
  };
}

function csvMonthToDisplayMonth(month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));
}

function monthSortValue(month: string) {
  const date = new Date(`${month} 1`);

  return date.getTime();
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}
