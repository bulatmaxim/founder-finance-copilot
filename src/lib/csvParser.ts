import Papa from "papaparse";
import type {
  ParsedFinancialCsv,
  UploadedFinancialRow,
  UploadValidationStatus,
} from "@/types/financial";

type RawFinancialCsvRow = {
  month?: string;
  account?: string;
  category?: string;
  amount?: string;
};

const expectedColumns = ["month", "account", "category", "amount"];
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

export function parsePnlActualsCsv(csvText: string): ParsedFinancialCsv {
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

function summarizeRows(rows: UploadedFinancialRow[]) {
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
