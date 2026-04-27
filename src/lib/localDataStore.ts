import { sampleBudget } from "@/data/sampleBudget";
import { sampleFinancials } from "@/data/sampleFinancials";
import {
  calculateEbitda,
  calculateGrossMargin,
  calculateGrossProfit,
  calculateNetBurn,
  estimateCashOutDate,
  type FinancialPeriod,
} from "@/lib/calculations";
import type { UploadedCashRow, UploadedFinancialRow } from "@/types/financial";

export type DataSourceMode = "sample" | "uploaded";

export type UploadedActualsPayload = {
  rows: UploadedFinancialRow[];
  savedAt: string;
};

export type UploadedBudgetPayload = {
  rows: UploadedFinancialRow[];
  savedAt: string;
};

export type UploadedCashPayload = {
  rows: UploadedCashRow[];
  savedAt: string;
};

export type CashPeriod = {
  month: string;
  cashBalance: number;
  priorCashBalance: number | null;
  monthlyCashChange: number | null;
  netBurn: number;
  averageMonthlyNetBurn: number;
  threeMonthAverageNetBurn: number;
  runwayMonths: number | null;
  estimatedCashOutDate: string | null;
};

export type ActiveFinancialData = {
  periods: FinancialPeriod[];
  dataSource: DataSourceMode;
  uploadedRows: UploadedFinancialRow[];
  savedAt: string | null;
  warnings: string[];
  errors: string[];
};

export type ActiveBudgetData = {
  periods: FinancialPeriod[];
  dataSource: DataSourceMode;
  uploadedRows: UploadedFinancialRow[];
  savedAt: string | null;
  warnings: string[];
  errors: string[];
};

export type ActiveCashData = {
  periods: CashPeriod[];
  dataSource: DataSourceMode;
  uploadedRows: UploadedCashRow[];
  savedAt: string | null;
  warnings: string[];
  errors: string[];
  latestCashBalance: number;
  priorCashBalance: number | null;
  monthlyCashChange: number | null;
  latestNetBurn: number;
  averageMonthlyNetBurn: number;
  threeMonthAverageNetBurn: number;
  runwayMonths: number | null;
  estimatedCashOutDate: string | null;
  beginningCashBalance: number;
  totalCashChange: number;
};

const uploadedActualsKey = "founder-finance-copilot:uploaded-actuals";
const uploadedBudgetKey = "founder-finance-copilot:uploaded-budget";
const uploadedCashKey = "founder-finance-copilot:uploaded-cash";

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

export function saveUploadedBudget(rows: UploadedFinancialRow[]) {
  if (!canUseLocalStorage()) {
    return;
  }

  const payload: UploadedBudgetPayload = {
    rows,
    savedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(uploadedBudgetKey, JSON.stringify(payload));
}

export function getUploadedBudget() {
  return getUploadedBudgetPayload()?.rows ?? [];
}

export function getUploadedBudgetPayload(): UploadedBudgetPayload | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(uploadedBudgetKey);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<UploadedBudgetPayload>;

    if (!Array.isArray(parsed.rows)) {
      clearUploadedBudget();
      return null;
    }

    return {
      rows: parsed.rows,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch (error) {
    console.error("Failed to read uploaded budget from localStorage", error);
    clearUploadedBudget();
    return null;
  }
}

export function clearUploadedBudget() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(uploadedBudgetKey);
}

export function hasUploadedBudget() {
  return getUploadedBudget().length > 0;
}

export function saveUploadedCash(rows: UploadedCashRow[]) {
  if (!canUseLocalStorage()) {
    return;
  }

  const payload: UploadedCashPayload = {
    rows,
    savedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(uploadedCashKey, JSON.stringify(payload));
}

export function getUploadedCash() {
  return getUploadedCashPayload()?.rows ?? [];
}

export function getUploadedCashPayload(): UploadedCashPayload | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(uploadedCashKey);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<UploadedCashPayload>;

    if (!Array.isArray(parsed.rows)) {
      clearUploadedCash();
      return null;
    }

    return {
      rows: parsed.rows,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch (error) {
    console.error("Failed to read uploaded cash from localStorage", error);
    clearUploadedCash();
    return null;
  }
}

export function clearUploadedCash() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(uploadedCashKey);
}

export function hasUploadedCash() {
  return getUploadedCash().length > 0;
}

export function getActiveFinancialData(): ActiveFinancialData {
  const payload = getUploadedActualsPayload();
  const activeCash = getActiveCashData();

  if (!payload || payload.rows.length === 0) {
    return applyCashDataToActiveFinancialData(getSampleFinancialData(), activeCash);
  }

  const converted = convertUploadedRowsToFinancialPeriods(payload.rows, "actuals");

  if (converted.periods.length === 0 || converted.errors.length > 0) {
    return applyCashDataToActiveFinancialData(
      {
        ...getSampleFinancialData(),
        warnings: [
          ...converted.warnings,
          "Uploaded CSV data could not be converted into monthly financial summaries. Falling back to sample data.",
        ],
        errors: converted.errors,
      },
      activeCash,
    );
  }

  const activeData: ActiveFinancialData = {
    periods: converted.periods,
    dataSource: "uploaded",
    uploadedRows: payload.rows,
    savedAt: payload.savedAt,
    warnings:
      activeCash.dataSource === "uploaded"
        ? converted.warnings
        : [
            ...converted.warnings,
            "Cash balance and runway use sample cash data because no uploaded cash CSV is active.",
          ],
    errors: [],
  };

  return applyCashDataToActiveFinancialData(activeData, activeCash);
}

export function getActiveCashData(): ActiveCashData {
  const payload = getUploadedCashPayload();

  if (!payload || payload.rows.length === 0) {
    return getSampleCashData();
  }

  const converted = convertUploadedCashRowsToPeriods(payload.rows);

  if (converted.periods.length === 0 || converted.errors.length > 0) {
    return {
      ...getSampleCashData(),
      warnings: [
        ...converted.warnings,
        "Uploaded cash CSV data could not be converted into monthly cash summaries. Falling back to sample cash data.",
      ],
      errors: converted.errors,
    };
  }

  return {
    periods: converted.periods,
    dataSource: "uploaded",
    uploadedRows: payload.rows,
    savedAt: payload.savedAt,
    warnings: converted.warnings,
    errors: [],
    ...summarizeCashPeriods(converted.periods),
  };
}

export function getCashSourceLabel(dataSource: DataSourceMode) {
  return dataSource === "uploaded"
    ? "Cash Source: Uploaded Cash CSV"
    : "Cash Source: Sample Data";
}

export function getCashMetricsForMonth(month: string) {
  const activeCash = getActiveCashData();

  return (
    activeCash.periods.find((period) => period.month === month) ??
    activeCash.periods[activeCash.periods.length - 1] ??
    null
  );
}

function applyCashDataToActiveFinancialData(
  activeData: ActiveFinancialData,
  activeCash: ActiveCashData,
): ActiveFinancialData {
  const cashByMonth = new Map(
    activeCash.periods.map((period) => [period.month, period]),
  );
  const missingCashMonths: string[] = [];
  const periods = activeData.periods.map((period) => {
    const cashPeriod = cashByMonth.get(period.month);

    if (!cashPeriod) {
      if (activeCash.dataSource === "uploaded") {
        missingCashMonths.push(period.month);
      }

      return period;
    }

    return {
      ...period,
      cashBalance: cashPeriod.cashBalance,
      netBurn: cashPeriod.netBurn,
      runwayMonths: cashPeriod.runwayMonths ?? 0,
    };
  });
  const cashWarnings =
    activeCash.dataSource === "uploaded" && missingCashMonths.length > 0
      ? [
          `Uploaded cash CSV does not include ${missingCashMonths
            .slice(0, 3)
            .join(", ")}${missingCashMonths.length > 3 ? " and additional periods" : ""}. Missing periods keep their existing cash assumptions.`,
        ]
      : [];

  return {
    ...activeData,
    periods,
    warnings: [...activeData.warnings, ...activeCash.warnings, ...cashWarnings],
    errors: [...activeData.errors, ...activeCash.errors],
  };
}

export function getActiveBudgetData(): ActiveBudgetData {
  const payload = getUploadedBudgetPayload();

  if (!payload || payload.rows.length === 0) {
    return getSampleBudgetData();
  }

  const converted = convertUploadedRowsToFinancialPeriods(payload.rows, "budget");

  if (converted.periods.length === 0 || converted.errors.length > 0) {
    return {
      ...getSampleBudgetData(),
      warnings: [
        ...converted.warnings,
        "Uploaded budget CSV data could not be converted into monthly budget summaries. Falling back to sample budget.",
      ],
      errors: converted.errors,
    };
  }

  return {
    periods: converted.periods,
    dataSource: "uploaded",
    uploadedRows: payload.rows,
    savedAt: payload.savedAt,
    warnings: converted.warnings,
    errors: [],
  };
}

export function getBudgetForMonth(month: string, fallbackIndex = 0) {
  const activeBudget = getActiveBudgetData();

  return (
    activeBudget.periods.find((period) => period.month === month) ??
    activeBudget.periods[fallbackIndex] ??
    activeBudget.periods[activeBudget.periods.length - 1] ??
    sampleBudget[sampleBudget.length - 1]
  );
}

export function getDataSourceLabel(dataSource: DataSourceMode) {
  return dataSource === "uploaded"
    ? "Data Source: Uploaded CSV Data"
    : "Data Source: Sample Data";
}

export function getActualsSourceLabel(dataSource: DataSourceMode) {
  return dataSource === "uploaded"
    ? "Actuals Source: Uploaded Actuals CSV"
    : "Actuals Source: Sample Data";
}

export function getBudgetSourceLabel(dataSource: DataSourceMode) {
  return dataSource === "uploaded"
    ? "Budget Source: Uploaded Budget CSV"
    : "Budget Source: Sample Data";
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

function getSampleBudgetData(): ActiveBudgetData {
  return {
    periods: sampleBudget,
    dataSource: "sample",
    uploadedRows: [],
    savedAt: null,
    warnings: [],
    errors: [],
  };
}

function convertUploadedRowsToFinancialPeriods(
  rows: UploadedFinancialRow[],
  kind: "actuals" | "budget",
) {
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
      buildFinancialPeriodFromRows(month, monthRows, index, warnings, kind),
    );

  if (periods.some((period) => period.revenue === 0)) {
    errors.add(
      `Uploaded ${kind === "budget" ? "budget" : "actuals"} data is missing revenue for one or more months.`,
    );
  }

  if (
    periods.some(
      (period) => period.costOfRevenue + period.operatingExpenses === 0,
    )
  ) {
    warnings.add(
      `Uploaded ${kind === "budget" ? "budget" : "actuals"} data is missing expense categories for one or more months.`,
    );
  }

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
  kind: "actuals" | "budget",
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
  const cashAssumption = getCashAssumption(month, index, kind);

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
    normalized.includes("professional services") ||
    normalized.includes("services") ||
    normalized.includes("software") ||
    normalized.includes("payroll") ||
    normalized.includes("gusto")
  ) {
    return "generalAndAdministrative";
  }

  return "unmappedExpense";
}

function getCashAssumption(
  month: string,
  index: number,
  kind: "actuals" | "budget",
) {
  const samplePeriods = kind === "budget" ? sampleBudget : sampleFinancials;
  const matchingSample = samplePeriods.find((period) => period.month === month);
  const fallbackSample =
    samplePeriods[index] ?? samplePeriods[samplePeriods.length - 1];

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

function getSampleCashData(): ActiveCashData {
  const periods = buildCashPeriods(
    sampleFinancials.map((period) => ({
      month: period.month,
      cashBalance: period.cashBalance,
    })),
  );

  return {
    periods,
    dataSource: "sample",
    uploadedRows: [],
    savedAt: null,
    warnings: [],
    errors: [],
    ...summarizeCashPeriods(periods),
  };
}

function convertUploadedCashRowsToPeriods(rows: UploadedCashRow[]) {
  const warnings = new Set<string>();
  const errors = new Set<string>();
  const validRows = rows
    .filter((row) => row.status !== "Error")
    .filter((row) => row.month && row.cashBalance !== null)
    .map((row) => ({
      month: csvMonthToDisplayMonth(row.month),
      cashBalance: row.cashBalance ?? 0,
    }));

  if (validRows.some((row) => !row.month)) {
    errors.add("Uploaded cash data includes an invalid month.");
  }

  const periods = buildCashPeriods(
    validRows
      .filter((row): row is { month: string; cashBalance: number } =>
        Boolean(row.month),
      )
      .sort(
        (first, second) =>
          monthSortValue(first.month) - monthSortValue(second.month),
      ),
  );

  if (periods.length === 0) {
    errors.add("Uploaded cash data does not include any valid cash balance rows.");
  }

  if (periods.length < 2) {
    warnings.add(
      "Uploaded cash data has fewer than two months, so monthly burn cannot be calculated from cash movement.",
    );
  }

  return {
    periods,
    warnings: [...warnings],
    errors: [...errors],
  };
}

function buildCashPeriods(
  rows: { month: string; cashBalance: number }[],
): CashPeriod[] {
  return rows.map((row, index) => {
    const prior = rows[index - 1] ?? null;
    const monthlyCashChange = prior
      ? row.cashBalance - prior.cashBalance
      : null;
    const netBurn =
      monthlyCashChange !== null ? Math.max(0, -monthlyCashChange) : 0;
    const positiveBurns = rows
      .slice(0, index + 1)
      .map((currentRow, currentIndex) => {
        const priorRow = rows[currentIndex - 1];

        if (!priorRow) {
          return 0;
        }

        return Math.max(0, priorRow.cashBalance - currentRow.cashBalance);
      })
      .filter((burn) => burn > 0);
    const recentPositiveBurns = positiveBurns.slice(-3);
    const averageMonthlyNetBurn = average(positiveBurns);
    const threeMonthAverageNetBurn = average(recentPositiveBurns);
    const burnForRunway =
      threeMonthAverageNetBurn > 0
        ? threeMonthAverageNetBurn
        : averageMonthlyNetBurn;
    const runwayMonths = burnForRunway > 0 ? row.cashBalance / burnForRunway : null;

    return {
      month: row.month,
      cashBalance: row.cashBalance,
      priorCashBalance: prior?.cashBalance ?? null,
      monthlyCashChange,
      netBurn,
      averageMonthlyNetBurn,
      threeMonthAverageNetBurn,
      runwayMonths,
      estimatedCashOutDate:
        runwayMonths === null ? null : estimateCashOutDate(row.month, runwayMonths),
    };
  });
}

function summarizeCashPeriods(periods: CashPeriod[]) {
  const firstPeriod = periods[0];
  const latestPeriod = periods[periods.length - 1];

  return {
    latestCashBalance: latestPeriod?.cashBalance ?? 0,
    priorCashBalance: latestPeriod?.priorCashBalance ?? null,
    monthlyCashChange: latestPeriod?.monthlyCashChange ?? null,
    latestNetBurn: latestPeriod?.netBurn ?? 0,
    averageMonthlyNetBurn: latestPeriod?.averageMonthlyNetBurn ?? 0,
    threeMonthAverageNetBurn: latestPeriod?.threeMonthAverageNetBurn ?? 0,
    runwayMonths: latestPeriod?.runwayMonths ?? null,
    estimatedCashOutDate: latestPeriod?.estimatedCashOutDate ?? null,
    beginningCashBalance: firstPeriod?.cashBalance ?? 0,
    totalCashChange:
      firstPeriod && latestPeriod
        ? latestPeriod.cashBalance - firstPeriod.cashBalance
        : 0,
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}
