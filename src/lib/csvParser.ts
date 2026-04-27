import Papa from "papaparse";
import type {
  ParsedCashCsv,
  ParsedFinancialCsv,
  UploadedCashRow,
  UploadedFinancialRow,
  UploadValidationStatus,
} from "@/types/financial";

type RawFinancialCsvRow = {
  month?: string;
  account?: string;
  category?: string;
  amount?: string;
};

type RawCashCsvRow = {
  month?: string;
  cashBalance?: string;
};

const expectedColumns = ["month", "account", "category", "amount"];
const expectedCashColumns = ["month", "cashBalance"];
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export const pnlActualsSampleCsv = [
  "month,account,category,amount",
  "2026-01,Subscription Revenue,Revenue,120000",
  "2026-01,AWS Hosting,Cloud Hosting,-18000",
  "2026-01,Gusto Payroll,Payroll,-85000",
  "2026-02,Subscription Revenue,Revenue,135000",
  "2026-02,AWS Hosting,Cloud Hosting,-19500",
  "2026-02,Gusto Payroll,Payroll,-87000",
].join("\n");

export const budgetSampleCsv = [
  "month,account,category,amount",
  ...Array.from({ length: 12 }, (_, index) => {
    const month = `2026-${String(index + 1).padStart(2, "0")}`;
    const revenue = 125000 + index * 14500;
    const hosting = -(17000 + index * 1200);
    const payroll = -(82000 + index * 3500);
    const software = -(12000 + index * 450);
    const professionalServices = -(9000 + index * 250);
    const salesMarketing = -(36000 + index * 1800);
    const researchDevelopment = -(52000 + index * 2200);
    const generalAdministrative = -(26000 + index * 900);

    return [
      `${month},Subscription Revenue,Revenue,${revenue}`,
      `${month},AWS Hosting,Cloud Hosting,${hosting}`,
      `${month},Gusto Payroll,Payroll,${payroll}`,
      `${month},SaaS Tools,Software,${software}`,
      `${month},Legal and Accounting,Professional Services,${professionalServices}`,
      `${month},Demand Generation,Sales & Marketing,${salesMarketing}`,
      `${month},Engineering Team,Research & Development,${researchDevelopment}`,
      `${month},Operations Team,General & Administrative,${generalAdministrative}`,
    ].join("\n");
  }),
].join("\n");

export const cashBalanceSampleCsv = [
  "month,cashBalance",
  "2026-01,1961000",
  "2026-02,1835000",
  "2026-03,1717000",
  "2026-04,1599000",
  "2026-05,1480000",
  "2026-06,1365000",
  "2026-07,1253000",
  "2026-08,1145000",
  "2026-09,1040000",
  "2026-10,935000",
  "2026-11,832000",
  "2026-12,730000",
].join("\n");

export function parsePnlActualsCsv(csvText: string): ParsedFinancialCsv {
  return parseFinancialCsv(csvText);
}

export function parseBudgetCsv(csvText: string): ParsedFinancialCsv {
  return parseFinancialCsv(csvText);
}

export function parseCashBalanceCsv(csvText: string): ParsedCashCsv {
  const parsed = Papa.parse<RawCashCsvRow>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => {
      const normalized = header.trim().toLowerCase();

      return normalized === "cashbalance" ? "cashBalance" : normalized;
    },
  });

  const parseErrors = parsed.errors.map((error) => {
    const row = typeof error.row === "number" ? ` on row ${error.row + 2}` : "";

    return `${error.message}${row}`;
  });
  const fields = parsed.meta.fields ?? [];
  const missingColumns = expectedCashColumns.filter(
    (column) => !fields.includes(column),
  );

  if (missingColumns.length > 0) {
    parseErrors.push(
      `Missing required column(s): ${missingColumns
        .join(", ")}.`,
    );
  }

  const duplicateMonths = findDuplicateMonths(parsed.data);
  const baseRows = parsed.data.map((row, index) =>
    validateCashRow(row, index + 2, duplicateMonths),
  );
  const rows = addCashMovementWarnings(baseRows);

  return {
    rows,
    summary: summarizeRows(rows),
    errors: parseErrors,
  };
}

function parseFinancialCsv(csvText: string): ParsedFinancialCsv {
  const parsed = Papa.parse<RawFinancialCsvRow>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const parseErrors = parsed.errors.map((error) => {
    const row = typeof error.row === "number" ? ` on row ${error.row + 2}` : "";

    return `${error.message}${row}`;
  });
  const fields = parsed.meta.fields ?? [];
  const missingColumns = expectedColumns.filter(
    (column) => !fields.includes(column),
  );

  if (missingColumns.length > 0) {
    parseErrors.push(`Missing required column(s): ${missingColumns.join(", ")}.`);
  }

  const duplicateKeys = findDuplicateKeys(parsed.data);
  const rows = parsed.data.map((row, index) =>
    validateFinancialRow(row, index + 2, duplicateKeys),
  );

  return {
    rows,
    summary: summarizeRows(rows),
    errors: parseErrors,
  };
}

function validateFinancialRow(
  row: RawFinancialCsvRow,
  rowNumber: number,
  duplicateKeys: Set<string>,
): UploadedFinancialRow {
  const month = clean(row.month);
  const account = clean(row.account);
  const category = clean(row.category);
  const amountRaw = clean(row.amount);
  const amount = parseAmount(amountRaw);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!month) {
    errors.push("Missing month");
  } else if (!monthPattern.test(month)) {
    errors.push("Invalid month format");
  }

  if (!account) {
    errors.push("Missing account");
  }

  if (!category) {
    errors.push("Missing category");
  }

  if (!amountRaw) {
    errors.push("Missing amount");
  } else if (amount === null) {
    errors.push("Non-numeric amount");
  }

  if (duplicateKeys.has(rowKey(month, account, category))) {
    errors.push("Duplicate row");
  }

  if (amount !== null && category) {
    if (isRevenueCategory(category) && amount < 0) {
      warnings.push("Unexpected negative revenue");
    }

    if (!isRevenueCategory(category) && amount > 0) {
      warnings.push("Unexpected positive expense");
    }
  }

  const status: UploadValidationStatus =
    errors.length > 0 ? "Error" : warnings.length > 0 ? "Warning" : "Valid";

  return {
    rowNumber,
    month,
    account,
    category,
    amountRaw,
    amount,
    status,
    messages: [...errors, ...warnings],
  };
}

function validateCashRow(
  row: RawCashCsvRow,
  rowNumber: number,
  duplicateMonths: Set<string>,
): UploadedCashRow {
  const month = clean(row.month);
  const cashBalanceRaw = clean(row.cashBalance);
  const cashBalance = parseAmount(cashBalanceRaw);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!month) {
    errors.push("Missing month");
  } else if (!monthPattern.test(month)) {
    errors.push("Invalid month format");
  }

  if (!cashBalanceRaw) {
    errors.push("Missing cashBalance");
  } else if (cashBalance === null) {
    errors.push("Non-numeric cashBalance");
  }

  if (duplicateMonths.has(month.toLowerCase())) {
    errors.push("Duplicate month");
  }

  if (cashBalance !== null && cashBalance < 0) {
    errors.push("Negative cash balance");
  }

  const status: UploadValidationStatus =
    errors.length > 0 ? "Error" : warnings.length > 0 ? "Warning" : "Valid";

  return {
    rowNumber,
    month,
    cashBalanceRaw,
    cashBalance,
    monthlyChange: null,
    status,
    messages: [...errors, ...warnings],
  };
}

function addCashMovementWarnings(rows: UploadedCashRow[]) {
  const rowsByMonth = [...rows].sort(
    (first, second) => cashMonthSortValue(first.month) - cashMonthSortValue(second.month),
  );
  const monthlyChangeByRowNumber = new Map<number, number | null>();
  const movementWarningRows = new Set<number>();

  rowsByMonth.forEach((row, index) => {
    const priorRow = rowsByMonth[index - 1];

    if (
      !priorRow ||
      row.cashBalance === null ||
      priorRow.cashBalance === null ||
      priorRow.cashBalance === 0 ||
      row.status === "Error" ||
      priorRow.status === "Error"
    ) {
      monthlyChangeByRowNumber.set(row.rowNumber, null);
      return;
    }

    const monthlyChange = row.cashBalance - priorRow.cashBalance;
    monthlyChangeByRowNumber.set(row.rowNumber, monthlyChange);

    if (Math.abs(monthlyChange) / Math.abs(priorRow.cashBalance) > 0.25) {
      movementWarningRows.add(row.rowNumber);
    }
  });

  return rows.map((row) => {
    const messages = [...row.messages];
    let status = row.status;

    if (movementWarningRows.has(row.rowNumber) && status !== "Error") {
      messages.push("Large month-over-month cash movement");
      status = "Warning";
    }

    return {
      ...row,
      monthlyChange: monthlyChangeByRowNumber.get(row.rowNumber) ?? null,
      status,
      messages,
    };
  });
}

function findDuplicateKeys(rows: RawFinancialCsvRow[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  rows.forEach((row) => {
    const key = rowKey(clean(row.month), clean(row.account), clean(row.category));

    if (!key) {
      return;
    }

    if (seen.has(key)) {
      duplicates.add(key);
    } else {
      seen.add(key);
    }
  });

  return duplicates;
}

function findDuplicateMonths(rows: RawCashCsvRow[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  rows.forEach((row) => {
    const month = clean(row.month).toLowerCase();

    if (!month) {
      return;
    }

    if (seen.has(month)) {
      duplicates.add(month);
    } else {
      seen.add(month);
    }
  });

  return duplicates;
}

function summarizeRows(rows: { status: UploadValidationStatus }[]) {
  return rows.reduce(
    (summary, row) => {
      summary.totalRows += 1;

      if (row.status === "Valid") {
        summary.validRows += 1;
      } else if (row.status === "Warning") {
        summary.warningRows += 1;
      } else {
        summary.errorRows += 1;
      }

      return summary;
    },
    {
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      errorRows: 0,
    },
  );
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseAmount(value: string) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .trim();
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

function rowKey(month: string, account: string, category: string) {
  if (!month || !account || !category) {
    return "";
  }

  return `${month.toLowerCase()}|${account.toLowerCase()}|${category.toLowerCase()}`;
}

function isRevenueCategory(category: string) {
  return category.toLowerCase().includes("revenue");
}

function cashMonthSortValue(month: string) {
  if (!monthPattern.test(month)) {
    return Number.POSITIVE_INFINITY;
  }

  return new Date(`${month}-01T00:00:00`).getTime();
}
