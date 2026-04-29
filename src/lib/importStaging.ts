"use client";

import Papa from "papaparse";
import {
  loadAccountMappingLookup,
  normalizeAccountName,
  suggestAccountMapping,
} from "@/lib/accountMapping";
import { createClient } from "@/lib/supabase/client";
import type { MonthlyCloseCategory } from "@/lib/monthlyClose";
import type { DataQualityIssue, ValidationSummary } from "@/lib/validations";

export type ImportBatchStatus =
  | "Staged"
  | "Needs Mapping"
  | "Ready for Review"
  | "Approved"
  | "Rejected";

export type StagedRowMappingStatus =
  | "Unmapped"
  | "Suggested"
  | "Mapped"
  | "Ignored";

export type StagedRowValidationStatus =
  | "Unchecked"
  | "Valid"
  | "Warning"
  | "Critical";

export type ImportBatchSummary = {
  id: string;
  uploaded_file_id?: string | null;
  reporting_month: string | null;
  file_category: MonthlyCloseCategory;
  status: ImportBatchStatus;
  detected_period_start: string | null;
  detected_period_end: string | null;
  detected_row_count: number;
  mapped_row_count: number;
  unmapped_row_count: number;
  validation_summary: ValidationSummary | null;
};

export type StagedAccountRollup = {
  rawAccountName: string;
  sourceType: string;
  sourceFiles: string[];
  firstSeenDate: string | null;
  latestSeenDate: string | null;
  totalAmount: number;
  rowCount: number;
  mappingStatus: StagedRowMappingStatus;
  suggestedCategory: string;
  mappedCategory: string;
  department: string;
};

type RawCsvRow = Record<string, unknown>;

type FieldMap = {
  period?: string;
  account?: string;
  category?: string;
  amount?: string;
  debit?: string;
  credit?: string;
  department?: string;
};

type FlexibleRow = {
  sourceRowNumber: number;
  period: string | null;
  rawAccountName: string;
  rawCategory: string | null;
  mappedCategory: string | null;
  department: string | null;
  amount: number | null;
  rawData: RawCsvRow;
  mappingStatus: StagedRowMappingStatus;
  validationStatus: StagedRowValidationStatus;
  messages: string[];
};

type FlexibleParseResult = {
  rows: FlexibleRow[];
  fieldMap: FieldMap;
  issues: DataQualityIssue[];
  detectedPeriodStart: string | null;
  detectedPeriodEnd: string | null;
  detectedRowCount: number;
  mappedRowCount: number;
  unmappedRowCount: number;
  validationSummary: ValidationSummary;
};

const periodAliases = [
  "month",
  "date",
  "period",
  "accounting period",
  "reporting month",
  "fiscal month",
];
const accountAliases = [
  "account",
  "account name",
  "gl account",
  "line item",
  "category",
  "expense category",
];
const categoryAliases = ["raw category", "category", "type", "classification"];
const amountAliases = [
  "amount",
  "actual",
  "value",
  "total",
  "budget amount",
  "revenue amount",
];
const debitAliases = ["debit", "debits"];
const creditAliases = ["credit", "credits"];
const departmentAliases = ["department", "dept", "function", "team", "cost center"];

export async function createImportBatchForUpload({
  userId,
  companyId,
  uploadedFileId,
  reportingMonth,
  fileCategory,
  csvText,
}: {
  userId: string;
  companyId: string;
  uploadedFileId: string;
  reportingMonth: string;
  fileCategory: MonthlyCloseCategory;
  csvText: string;
}) {
  const mappingLookup = await loadAccountMappingLookup();
  const parsed = parseFlexibleImport({
    csvText,
    fileCategory,
    reportingMonth,
    mappingLookup,
  });

  const supabase = createClient();
  const batchStatus: ImportBatchStatus =
    parsed.unmappedRowCount > 0 ? "Needs Mapping" : "Ready for Review";

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      user_id: userId,
      company_id: companyId,
      uploaded_file_id: uploadedFileId,
      reporting_month: reportingMonth,
      file_category: fileCategory,
      status: batchStatus,
      detected_period_start: parsed.detectedPeriodStart,
      detected_period_end: parsed.detectedPeriodEnd,
      detected_row_count: parsed.detectedRowCount,
      mapped_row_count: parsed.mappedRowCount,
      unmapped_row_count: parsed.unmappedRowCount,
      validation_summary: parsed.validationSummary,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(`Import staging batch save failed: ${batchError?.message ?? "No batch returned."}`);
  }

  const stagedRows = parsed.rows.map((row) => ({
    user_id: userId,
    company_id: companyId,
    import_batch_id: batch.id,
    uploaded_file_id: uploadedFileId,
    file_category: fileCategory,
    source_row_number: row.sourceRowNumber,
    period: row.period,
    raw_account_name: row.rawAccountName || null,
    raw_category: row.rawCategory,
    mapped_category: row.mappedCategory,
    department: row.department,
    amount: row.amount,
    raw_data: row.rawData,
    mapping_status: row.mappingStatus,
    validation_status: row.validationStatus,
    updated_at: new Date().toISOString(),
  }));

  if (stagedRows.length > 0) {
    const { error: rowError } = await supabase
      .from("import_staged_rows")
      .insert(stagedRows);

    if (rowError) {
      throw new Error(`Import staged rows save failed: ${rowError.message}`);
    }
  }

  return {
    batchId: batch.id as string,
    status: batchStatus,
    validationSummary: parsed.validationSummary,
    detectedPeriodStart: parsed.detectedPeriodStart,
    detectedPeriodEnd: parsed.detectedPeriodEnd,
    detectedRowCount: parsed.detectedRowCount,
    mappedRowCount: parsed.mappedRowCount,
    unmappedRowCount: parsed.unmappedRowCount,
  };
}

export async function loadImportBatchesForUploadedFiles(
  uploadedFileIds: string[],
) {
  if (uploadedFileIds.length === 0) {
    return new Map<string, ImportBatchSummary>();
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("*")
    .in("uploaded_file_id", uploadedFileIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Import batch load failed", error);
    return new Map<string, ImportBatchSummary>();
  }

  const batches = new Map<string, ImportBatchSummary>();

  (data ?? []).forEach((batch) => {
    const uploadedFileId = String(batch.uploaded_file_id ?? "");

    if (uploadedFileId && !batches.has(uploadedFileId)) {
      batches.set(uploadedFileId, batch as ImportBatchSummary);
    }
  });

  return batches;
}

export async function loadImportBatchesForMonthlyClose({
  companyId,
  reportingMonth,
}: {
  companyId: string;
  reportingMonth: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("*")
    .eq("company_id", companyId)
    .eq("reporting_month", reportingMonth)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Import batch load failed", error);
    return [];
  }

  return (data ?? []) as ImportBatchSummary[];
}

export async function loadStagedAccountRollups() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("import_staged_rows")
    .select(
      "raw_account_name, file_category, period, amount, mapping_status, mapped_category, department, uploaded_file_id",
    )
    .not("raw_account_name", "is", null);

  if (error) {
    console.error("Staged account rollup load failed", error);
    return [];
  }

  const mappingLookup = await loadAccountMappingLookup();
  const byAccount = new Map<string, StagedAccountRollup>();

  (data ?? []).forEach((row) => {
    const rawAccountName = String(row.raw_account_name ?? "").trim();

    if (!rawAccountName) {
      return;
    }

    const key = normalizeAccountName(rawAccountName);
    const existing = byAccount.get(key);
    const period = normalizePeriod(String(row.period ?? ""));
    const amount = Number(row.amount ?? 0);
    const suggestion = suggestAccountMapping(rawAccountName);
    const mappedCategory =
      mappingLookup.get(key) ?? String(row.mapped_category ?? "");
    const mappingStatus: StagedRowMappingStatus = mappedCategory
      ? "Mapped"
      : suggestion.category === "Uncategorized"
        ? "Unmapped"
        : "Suggested";

    if (!existing) {
      byAccount.set(key, {
        rawAccountName,
        sourceType: sourceTypeForCategory(String(row.file_category ?? "")),
        sourceFiles: [String(row.uploaded_file_id ?? "")].filter(Boolean),
        firstSeenDate: period,
        latestSeenDate: period,
        totalAmount: Number.isFinite(amount) ? amount : 0,
        rowCount: 1,
        mappingStatus,
        suggestedCategory: suggestion.category,
        mappedCategory,
        department: String(row.department ?? suggestion.department ?? ""),
      });
      return;
    }

    existing.rowCount += 1;
    existing.totalAmount += Number.isFinite(amount) ? amount : 0;
    existing.sourceType = mergeSourceTypes(
      existing.sourceType,
      sourceTypeForCategory(String(row.file_category ?? "")),
    );
    if (row.uploaded_file_id) {
      existing.sourceFiles = [
        ...new Set([...existing.sourceFiles, String(row.uploaded_file_id)]),
      ];
    }
    if (period) {
      existing.firstSeenDate = minDate(existing.firstSeenDate, period);
      existing.latestSeenDate = maxDate(existing.latestSeenDate, period);
    }
    if (existing.mappingStatus !== "Mapped") {
      existing.mappingStatus = mappingStatus;
      existing.mappedCategory = mappedCategory;
    }
  });

  return [...byAccount.values()].sort((first, second) =>
    first.rawAccountName.localeCompare(second.rawAccountName),
  );
}

export function mergeValidationSummaries(
  base: ValidationSummary,
  staging: ValidationSummary,
) {
  const issueIds = new Set(base.issues.map((issue) => issue.id));
  const stagingIssues = staging.issues.filter((issue) => !issueIds.has(issue.id));

  return {
    totalRows: Math.max(base.totalRows, staging.totalRows),
    validRows: base.validRows,
    warningRows: base.warningRows + staging.warningRows,
    errorRows: base.errorRows + staging.errorRows,
    issues: [...base.issues, ...stagingIssues],
  } satisfies ValidationSummary;
}

function parseFlexibleImport({
  csvText,
  fileCategory,
  reportingMonth,
  mappingLookup,
}: {
  csvText: string;
  fileCategory: MonthlyCloseCategory;
  reportingMonth: string;
  mappingLookup: Map<string, string>;
}): FlexibleParseResult {
  const parsed = Papa.parse<RawCsvRow>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const fields = parsed.meta.fields ?? [];
  const fieldMap = detectFieldMap(fields);
  const parserIssues = parsed.errors.map((error, index) => ({
    id: `${fileCategory}-staging-parse-${index}`,
    fileCategory,
    categoryLabel: categoryLabel(fileCategory),
    severity: "Warning" as const,
    message: `${error.message}${typeof error.row === "number" ? ` on row ${error.row + 2}` : ""}.`,
    suggestedFix: "Review the CSV formatting and replace the file if rows did not import as expected.",
  }));
  const columnIssues = buildColumnIssues(fileCategory, fieldMap);
  const rowDuplicateKeys = findDuplicateFlexibleRows(parsed.data, fieldMap);
  const rows = parsed.data.map((rawRow, index) =>
    normalizeFlexibleRow({
      rawRow,
      rowNumber: index + 2,
      fieldMap,
      fileCategory,
      mappingLookup,
      duplicateKeys: rowDuplicateKeys,
    }),
  );
  const periods = rows
    .map((row) => row.period)
    .filter((period): period is string => Boolean(period))
    .sort();
  const detectedPeriodStart = periods[0] ?? null;
  const detectedPeriodEnd = periods.at(-1) ?? null;
  const uniquePeriods = new Set(periods);
  const rowIssueCounts = countRowIssues(rows);
  const rowIssues = buildRowIssues({
    fileCategory,
    rowIssueCounts,
    uniquePeriodCount: uniquePeriods.size,
    reportingMonth,
    detectedPeriodStart,
    detectedPeriodEnd,
  });
  const issues = [...parserIssues, ...columnIssues, ...rowIssues];
  const mappedRowCount = rows.filter((row) => row.mappingStatus === "Mapped").length;
  const unmappedRowCount = rows.filter(
    (row) => row.mappingStatus === "Unmapped" || row.mappingStatus === "Suggested",
  ).length;
  const errorRows = rows.filter((row) => row.validationStatus === "Critical").length;
  const warningRows = rows.filter((row) => row.validationStatus === "Warning").length;

  return {
    rows,
    fieldMap,
    issues,
    detectedPeriodStart,
    detectedPeriodEnd,
    detectedRowCount: rows.length,
    mappedRowCount,
    unmappedRowCount,
    validationSummary: {
      totalRows: rows.length,
      validRows: rows.length - errorRows - warningRows,
      warningRows,
      errorRows,
      issues,
    },
  };
}

function detectFieldMap(fields: string[]): FieldMap {
  return {
    period: findField(fields, periodAliases),
    account: findField(fields, accountAliases),
    category: findField(fields, categoryAliases),
    amount: findField(fields, amountAliases),
    debit: findField(fields, debitAliases),
    credit: findField(fields, creditAliases),
    department: findField(fields, departmentAliases),
  };
}

function findField(fields: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);

  return fields.find((field) => normalizedAliases.includes(normalizeHeader(field)));
}

function normalizeFlexibleRow({
  rawRow,
  rowNumber,
  fieldMap,
  fileCategory,
  mappingLookup,
  duplicateKeys,
}: {
  rawRow: RawCsvRow;
  rowNumber: number;
  fieldMap: FieldMap;
  fileCategory: MonthlyCloseCategory;
  mappingLookup: Map<string, string>;
  duplicateKeys: Set<string>;
}): FlexibleRow {
  const period = normalizePeriod(readField(rawRow, fieldMap.period));
  const rawAccountName = readField(rawRow, fieldMap.account);
  const rawCategory = readField(rawRow, fieldMap.category) || null;
  const amount = parseFlexibleAmount({
    amountValue: readField(rawRow, fieldMap.amount),
    debitValue: readField(rawRow, fieldMap.debit),
    creditValue: readField(rawRow, fieldMap.credit),
  });
  const department = readField(rawRow, fieldMap.department) || null;
  const mappingKey = normalizeAccountName(rawAccountName);
  const savedMapping = rawAccountName ? mappingLookup.get(mappingKey) : "";
  const suggestion = rawAccountName ? suggestAccountMapping(rawAccountName) : null;
  const mappedCategory = savedMapping || suggestion?.category || null;
  const mappingStatus: StagedRowMappingStatus = savedMapping
    ? "Mapped"
    : rawAccountName
      ? suggestion?.category === "Uncategorized"
        ? "Unmapped"
        : "Suggested"
      : "Unmapped";
  const messages: string[] = [];

  if (!period) messages.push("Missing period/date");
  if (!rawAccountName && isFinancialCategory(fileCategory)) {
    messages.push("Missing account");
  }
  if (amount === null) messages.push("Missing amount");
  if (duplicateKeys.has(flexibleRowKey({ period, rawAccountName, amount }))) {
    messages.push("Duplicate row");
  }
  if (
    amount !== null &&
    amount < 0 &&
    `${rawAccountName} ${rawCategory}`.toLowerCase().includes("revenue")
  ) {
    messages.push("Negative revenue");
  }
  if (mappingStatus !== "Mapped" && rawAccountName && isFinancialCategory(fileCategory)) {
    messages.push("Unmapped account");
  }

  const validationStatus: StagedRowValidationStatus = messages.some((message) =>
    ["Missing period/date", "Missing amount"].includes(message),
  )
    ? "Critical"
    : messages.length > 0
      ? "Warning"
      : "Valid";

  return {
    sourceRowNumber: rowNumber,
    period,
    rawAccountName,
    rawCategory,
    mappedCategory,
    department,
    amount,
    rawData: rawRow,
    mappingStatus,
    validationStatus,
    messages,
  };
}

function buildColumnIssues(
  fileCategory: MonthlyCloseCategory,
  fieldMap: FieldMap,
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  if (!fieldMap.period) {
    issues.push({
      id: `${fileCategory}-staging-missing-period-column`,
      fileCategory,
      categoryLabel: categoryLabel(fileCategory),
      severity: "Warning",
      message: "No recognizable period/date column was detected.",
      suggestedFix:
        "Add a month, date, period, accounting period, reporting month, or fiscal month column.",
    });
  }

  if (!fieldMap.amount && !fieldMap.debit && !fieldMap.credit) {
    issues.push({
      id: `${fileCategory}-staging-missing-amount-column`,
      fileCategory,
      categoryLabel: categoryLabel(fileCategory),
      severity: "Warning",
      message: "No recognizable amount column was detected.",
      suggestedFix:
        "Add an amount, actual, value, total, budget amount, revenue amount, or debit/credit column.",
    });
  }

  if (!fieldMap.account && isFinancialCategory(fileCategory)) {
    issues.push({
      id: `${fileCategory}-staging-missing-account-column`,
      fileCategory,
      categoryLabel: categoryLabel(fileCategory),
      severity: "Warning",
      message: "No recognizable account or line-item column was detected.",
      suggestedFix:
        "Add an account, account name, GL account, line item, category, or expense category column.",
    });
  }

  return issues;
}

function buildRowIssues({
  fileCategory,
  rowIssueCounts,
  uniquePeriodCount,
  reportingMonth,
  detectedPeriodStart,
  detectedPeriodEnd,
}: {
  fileCategory: MonthlyCloseCategory;
  rowIssueCounts: Map<string, number>;
  uniquePeriodCount: number;
  reportingMonth: string;
  detectedPeriodStart: string | null;
  detectedPeriodEnd: string | null;
}) {
  const issues: DataQualityIssue[] = [];

  [...rowIssueCounts.entries()].forEach(([message, count], index) => {
    issues.push({
      id: `${fileCategory}-staging-row-${index}`,
      fileCategory,
      categoryLabel: categoryLabel(fileCategory),
      severity: criticalStagingMessage(message) ? "Critical" : "Warning",
      message: formatStagingIssue(message, count),
      rowCount: count,
      suggestedFix: suggestedStagingFix(message),
    });
  });

  if (uniquePeriodCount > 1 && detectedPeriodStart && detectedPeriodEnd) {
    issues.push({
      id: `${fileCategory}-staging-multiple-periods`,
      fileCategory,
      categoryLabel: categoryLabel(fileCategory),
      severity: "Info",
      message: `Multi-period file detected: ${formatPeriod(detectedPeriodStart)} - ${formatPeriod(detectedPeriodEnd)}.`,
      suggestedFix:
        "Confirm the detected period range is intentional. Staged rows keep their original periods.",
    });
  }

  if (
    detectedPeriodStart &&
    detectedPeriodEnd &&
    !periodInRange(reportingMonth, detectedPeriodStart, detectedPeriodEnd)
  ) {
    issues.push({
      id: `${fileCategory}-staging-selected-month-outside-range`,
      fileCategory,
      categoryLabel: categoryLabel(fileCategory),
      severity: "Warning",
      message: "The selected Data Room month is outside the detected file period range.",
      suggestedFix:
        "Confirm the upload belongs to this close checklist or replace it with the correct file.",
    });
  }

  return issues;
}

function countRowIssues(rows: FlexibleRow[]) {
  const counts = new Map<string, number>();

  rows.forEach((row) => {
    row.messages.forEach((message) => {
      counts.set(message, (counts.get(message) ?? 0) + 1);
    });
  });

  return counts;
}

function findDuplicateFlexibleRows(rows: RawCsvRow[], fieldMap: FieldMap) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  rows.forEach((row) => {
    const key = flexibleRowKey({
      period: normalizePeriod(readField(row, fieldMap.period)),
      rawAccountName: readField(row, fieldMap.account),
      amount: parseFlexibleAmount({
        amountValue: readField(row, fieldMap.amount),
        debitValue: readField(row, fieldMap.debit),
        creditValue: readField(row, fieldMap.credit),
      }),
    });

    if (!key.replace(/\|/g, "")) {
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

function flexibleRowKey({
  period,
  rawAccountName,
  amount,
}: {
  period: string | null;
  rawAccountName: string;
  amount: number | null;
}) {
  return `${period ?? ""}|${rawAccountName.trim().toLowerCase()}|${amount ?? ""}`;
}

function readField(row: RawCsvRow, field: string | undefined) {
  if (!field) {
    return "";
  }

  const value = row[field];

  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function parseFlexibleAmount({
  amountValue,
  debitValue,
  creditValue,
}: {
  amountValue: string;
  debitValue: string;
  creditValue: string;
}) {
  const amount = parseAmount(amountValue);

  if (amount !== null) {
    return amount;
  }

  const debit = parseAmount(debitValue);
  const credit = parseAmount(creditValue);

  if (debit !== null && credit !== null) {
    return credit - debit;
  }

  if (debit !== null) {
    return -Math.abs(debit);
  }

  if (credit !== null) {
    return Math.abs(credit);
  }

  return null;
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

function normalizePeriod(value: string) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const monthMatch = trimmed.match(/^(\d{4})[-/](0?[1-9]|1[0-2])(?:[-/]\d{1,2})?$/);

  if (monthMatch) {
    return `${monthMatch[1]}-${monthMatch[2].padStart(2, "0")}-01`;
  }

  const monthNameMatch = trimmed.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})$/i,
  );

  if (monthNameMatch) {
    const month = monthNameToNumber(monthNameMatch[1]);

    return month ? `${monthNameMatch[2]}-${month}-01` : null;
  }

  const date = new Date(trimmed);

  if (!Number.isNaN(date.getTime())) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  }

  return null;
}

function monthNameToNumber(value: string) {
  const normalized = value.toLowerCase().slice(0, 3);
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const index = months.indexOf(normalized);

  return index >= 0 ? String(index + 1).padStart(2, "0") : "";
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function criticalStagingMessage(message: string) {
  return ["Missing period/date", "Missing amount"].includes(message);
}

function formatStagingIssue(message: string, count: number) {
  if (message === "Unmapped account") {
    return `${count} row(s) have accounts that need mapping.`;
  }

  if (message === "Missing period/date") {
    return `${count} row(s) are missing a usable period/date.`;
  }

  if (message === "Missing amount") {
    return `${count} row(s) are missing a usable amount.`;
  }

  if (message === "Duplicate row") {
    return `${count} possible duplicate row(s) detected.`;
  }

  if (message === "Negative revenue") {
    return `${count} row(s) show negative revenue.`;
  }

  return `${count} row(s): ${message}.`;
}

function suggestedStagingFix(message: string) {
  if (message === "Unmapped account") {
    return "Map these raw accounts on the Account Mapping page before approving reporting data.";
  }

  if (message === "Missing period/date") {
    return "Add month or date values so rows can be assigned to the correct reporting period.";
  }

  if (message === "Missing amount") {
    return "Add numeric amount values or debit/credit columns.";
  }

  if (message === "Duplicate row") {
    return "Remove duplicate rows or confirm duplicates are intentional.";
  }

  if (message === "Negative revenue") {
    return "Confirm the revenue sign is intentional or correct the source file.";
  }

  return "Review the staged rows and replace the file if corrections are needed.";
}

function isFinancialCategory(fileCategory: MonthlyCloseCategory) {
  return fileCategory === "actuals" || fileCategory === "budget";
}

function sourceTypeForCategory(fileCategory: string) {
  if (fileCategory === "actuals") return "Actuals";
  if (fileCategory === "budget") return "Budget";
  if (fileCategory === "cash") return "Cash";
  if (fileCategory === "payroll") return "Payroll";
  if (fileCategory === "revenue") return "Revenue";
  return fileCategory || "Staged";
}

function mergeSourceTypes(first: string, second: string) {
  const values = new Set(
    [...first.split(", "), second].map((value) => value.trim()).filter(Boolean),
  );

  return [...values].join(", ");
}

function minDate(first: string | null, second: string) {
  if (!first) return second;
  return first < second ? first : second;
}

function maxDate(first: string | null, second: string) {
  if (!first) return second;
  return first > second ? first : second;
}

function periodInRange(period: string, start: string, end: string) {
  return period >= start && period <= end;
}

function formatPeriod(period: string) {
  const date = new Date(`${period}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? period
    : date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function categoryLabel(category: MonthlyCloseCategory) {
  const labels: Record<MonthlyCloseCategory, string> = {
    actuals: "P&L / Actuals",
    budget: "Budget",
    cash: "Cash Report",
    payroll: "Headcount / Payroll",
    revenue: "Revenue Data",
    kpi: "KPI Inputs",
    notes: "Notes / Assumptions",
  };

  return labels[category];
}
