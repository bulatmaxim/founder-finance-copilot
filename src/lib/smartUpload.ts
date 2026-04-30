"use client";

import Papa from "papaparse";
import {
  formatReportingMonth,
  monthlyCloseCategories,
  reportingMonthKey,
  type MonthlyCloseCategory,
  type MonthlyCloseStatus,
} from "@/lib/monthlyClose";
import {
  normalizeAccountName,
  saveAccountMapping,
  suggestAccountMapping,
} from "@/lib/accountMapping";
import { createClient } from "@/lib/supabase/client";
import { getCurrentCompany } from "@/lib/supabase/data";
import type {
  CompanyAccount,
  CompanyDepartment,
  MappingRule,
} from "@/lib/companyMapping";
import type { ValidationSummary } from "@/lib/validations";

export type SmartUploadConfidence = "High" | "Medium" | "Low";
export type SmartUploadDetectedCategory = MonthlyCloseCategory | "unknown";
export type SmartUploadStandardField =
  | "Period"
  | "Account Code"
  | "Account Name"
  | "Raw Category"
  | "Department Code"
  | "Department"
  | "Amount"
  | "Notes"
  | "Customer / Segment"
  | "Revenue Type"
  | "Revenue Amount"
  | "Employee / Role"
  | "Salary"
  | "KPI Name"
  | "KPI Value"
  | "Ignore";

export type SmartColumnMapping = Record<string, SmartUploadStandardField>;

export type SmartUploadMappingAction =
  | "Confirm"
  | "Ignore"
  | "Needs Review";

export type SmartUploadMappingSuggestion = {
  id: string;
  rawValue: string;
  accountCode: string;
  accountName: string;
  departmentCode: string;
  departmentName: string;
  normalizedCategory: string;
  statementType: string;
  confidence: SmartUploadConfidence;
  reason: string;
  action: SmartUploadMappingAction;
  matchedExisting: boolean;
  mappingState: "Matched from Company Mapping" | "Needs Confirmation" | "Unmapped";
};

export type SmartUploadTransformedRow = {
  sourceRowNumber: number;
  period: string | null;
  accountCode: string;
  accountName: string;
  rawCategory: string;
  departmentCode: string;
  department: string;
  category: string;
  amount: number | null;
  notes: string;
  mappingStatus: "Mapped" | "Suggested" | "Unmapped" | "Ignored";
  accountConfirmed: boolean;
  hasDepartmentEvidence: boolean;
  departmentConfirmed: boolean;
  rawData: Record<string, unknown>;
};

export type SmartUploadReview = {
  fileName: string;
  fileFormat: "CSV" | "XLSX" | "XLS";
  sheetNames: string[];
  selectedSheetName: string | null;
  sheetCount: number;
  sheetRowCount: number;
  sheetColumnCount: number;
  detectedCategory: SmartUploadDetectedCategory;
  confidence: SmartUploadConfidence;
  detectedPeriodStart: string | null;
  detectedPeriodEnd: string | null;
  columnMapping: SmartColumnMapping;
  suggestedMappings: SmartUploadMappingSuggestion[];
  transformedRows: SmartUploadTransformedRow[];
  warnings: string[];
  reasoning: string;
  headers: string[];
  sampleRows: Record<string, unknown>[];
  rowCount: number;
  aiUsed: boolean;
};

type CompanyMappingContext = {
  departments: CompanyDepartment[];
  accounts: CompanyAccount[];
  rules: MappingRule[];
};

type SmartUploadAiMapping = {
  detected_category?: string;
  confidence?: SmartUploadConfidence;
  period_range?: { start?: string | null; end?: string | null };
  column_mapping?: Record<string, string>;
  suggested_accounts?: Array<Record<string, unknown>>;
  warnings?: string[];
  reasoning?: string;
};

type ParsedSmartUploadFile = {
  fileFormat: SmartUploadReview["fileFormat"];
  headers: string[];
  rows: Record<string, unknown>[];
  sheetNames: string[];
  selectedSheetName: string | null;
  rowCount: number;
  columnCount: number;
  warnings: string[];
};

const standardFields: SmartUploadStandardField[] = [
  "Period",
  "Account Code",
  "Account Name",
  "Raw Category",
  "Department Code",
  "Department",
  "Amount",
  "Notes",
  "Customer / Segment",
  "Revenue Type",
  "Revenue Amount",
  "Employee / Role",
  "Salary",
  "KPI Name",
  "KPI Value",
  "Ignore",
];

const headerSignals: Record<Exclude<SmartUploadDetectedCategory, "unknown">, string[]> = {
  actuals: ["account", "account name", "gl", "actual", "amount", "debit", "credit", "month", "period"],
  budget: ["budget", "plan", "forecast baseline", "budget amount"],
  cash: ["beginning cash", "ending cash", "cash in", "cash out", "burn", "runway"],
  revenue: ["customer", "revenue", "mrr", "arr", "product", "segment", "new", "existing"],
  payroll: ["employee", "role", "department", "salary", "benefits", "start date", "status"],
  kpi: ["kpi", "metric", "value", "unit"],
  notes: ["note", "assumption", "topic", "owner", "priority"],
};

const fieldAliases: Record<SmartUploadStandardField, string[]> = {
  Period: ["month", "date", "period", "accounting period", "reporting month", "fiscal month"],
  "Account Code": ["gl code", "account code", "account no", "account number", "code"],
  "Account Name": ["account", "account name", "description", "line item", "name"],
  "Raw Category": ["category", "type", "classification", "expense category"],
  "Department Code": ["dept code", "department code", "cost center code", "function code"],
  Department: ["department", "dept", "function", "team", "cost center"],
  Amount: ["amount", "actual", "value", "total", "debit", "credit"],
  Notes: ["note", "notes", "assumption", "comment", "memo"],
  "Customer / Segment": ["customer", "segment", "account"],
  "Revenue Type": ["revenue type", "product", "stream"],
  "Revenue Amount": ["revenue amount", "revenue", "mrr", "arr"],
  "Employee / Role": ["employee", "role", "employee name"],
  Salary: ["salary", "compensation", "base pay"],
  "KPI Name": ["kpi", "metric", "metric name"],
  "KPI Value": ["kpi value", "metric value", "value"],
  Ignore: [],
};

export const smartUploadStandardFields = standardFields;

async function parseSmartUploadFile(
  file: File,
  selectedSheetName?: string | null,
): Promise<ParsedSmartUploadFile> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    return parseExcelSmartUploadFile(file, selectedSheetName);
  }

  if (!lowerName.endsWith(".csv")) {
    throw new Error("Unsupported file type. Smart Upload supports CSV, XLSX, and XLS files.");
  }

  const csvText = await file.text();
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const headers = dedupeHeaders(parsed.meta.fields ?? []);
  const rows = parsed.data.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").trim()),
  );

  return {
    fileFormat: "CSV",
    headers,
    rows,
    sheetNames: [],
    selectedSheetName: null,
    rowCount: rows.length,
    columnCount: headers.length,
    warnings: parsed.errors.map((error) => `CSV parser warning: ${error.message}.`),
  };
}

async function parseExcelSmartUploadFile(
  file: File,
  selectedSheetName?: string | null,
): Promise<ParsedSmartUploadFile> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
    raw: false,
  });
  const sheetNames = workbook.SheetNames;
  const selectedSheet =
    selectedSheetName && sheetNames.includes(selectedSheetName)
      ? selectedSheetName
      : sheetNames[0];

  if (!selectedSheet) {
    throw new Error("The Excel workbook does not contain any sheets.");
  }

  const worksheet = workbook.Sheets[selectedSheet];
  const matrix = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date | null>>(
    worksheet,
    {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    },
  );
  const normalizedRows = matrix.map((row) => row.map(normalizeCellValue));
  const headerIndex = findHeaderRowIndex(normalizedRows);
  const rawHeaders = normalizedRows[headerIndex] ?? [];
  const headers = dedupeHeaders(
    rawHeaders.map((header, index) => header.trim() || `Column ${index + 1}`),
  );
  const rows = normalizedRows
    .slice(headerIndex + 1)
    .map((row) => rowToObject(headers, row))
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
  const warnings: string[] = [];

  if (headerIndex > 0) {
    warnings.push(`${headerIndex} blank or title row(s) were skipped before the detected header row.`);
  }

  if (file.name.toLowerCase().endsWith(".xls")) {
    warnings.push("Legacy XLS parsing is best effort. Review the preview before staging.");
  }

  if (sheetNames.length > 1) {
    warnings.push(`Workbook has ${sheetNames.length} sheets. Confirm the selected sheet before staging.`);
  }

  return {
    fileFormat: file.name.toLowerCase().endsWith(".xls") ? "XLS" : "XLSX",
    headers,
    rows,
    sheetNames,
    selectedSheetName: selectedSheet,
    rowCount: rows.length,
    columnCount: headers.length,
    warnings,
  };
}

export async function analyzeSmartUpload(
  file: File,
  options: { sheetName?: string | null } = {},
): Promise<SmartUploadReview> {
  const parsedFile = await parseSmartUploadFile(file, options.sheetName);
  const { headers, rows } = parsedFile;
  const companyMapping = await loadCompanyMappingContext();
  const ruleReview = buildReview({
    fileName: file.name,
    parsedFile,
    headers,
    rows,
    companyMapping,
  });

  try {
    const response = await fetch("/api/ai/smart-upload-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        file_name: file.name,
        headers,
        selected_sheet_name: parsedFile.selectedSheetName,
        sheet_names: parsedFile.sheetNames,
        sample_rows: rows.slice(0, 8),
        existing_company_departments: companyMapping.departments.map((department) => ({
          name: department.name,
          code: department.code,
          function: department.function,
        })),
        existing_company_accounts: companyMapping.accounts.map((account) => ({
          account_name: account.account_name,
          account_code: account.account_code,
          uploaded_alias: account.uploaded_alias,
          normalized_category: account.normalized_category,
        })),
        mapping_rules: companyMapping.rules.map((rule) => ({
          rule_type: rule.rule_type,
          match_value: rule.match_value,
          normalized_category: rule.normalized_category,
        })),
        rule_based_result: serializeReviewForAi(ruleReview),
      }),
    });
    const body = (await response.json()) as {
      mapping?: {
        detected_category?: string;
        confidence?: SmartUploadConfidence;
        period_range?: { start?: string | null; end?: string | null };
        column_mapping?: Record<string, string>;
        suggested_accounts?: Array<Partial<SmartUploadMappingSuggestion> & {
          raw_value?: string;
          account_code?: string;
          account_name?: string;
          department_code?: string;
          department_name?: string;
          normalized_category?: string;
          statement_type?: string;
        }>;
        warnings?: string[];
        reasoning?: string;
      };
    };

    if (!response.ok || !body.mapping) {
      return ruleReview;
    }

    return applyAiMapping(ruleReview, body.mapping, rows, companyMapping);
  } catch (error) {
    console.warn("Smart Upload AI mapping fell back to rules", error);
    return ruleReview;
  }
}

export function updateSmartUploadColumnMapping(
  review: SmartUploadReview,
  sourceColumn: string,
  standardField: SmartUploadStandardField,
) {
  const nextReview = {
    ...review,
    columnMapping: {
      ...review.columnMapping,
      [sourceColumn]: standardField,
    },
  };

  return recomputeReview(nextReview);
}

export function updateSmartUploadMappingSuggestion(
  review: SmartUploadReview,
  suggestionId: string,
  patch: Partial<SmartUploadMappingSuggestion>,
) {
  const nextReview = {
    ...review,
    suggestedMappings: review.suggestedMappings.map((suggestion) =>
      suggestion.id === suggestionId ? { ...suggestion, ...patch } : suggestion,
    ),
  };

  return recomputeReview(nextReview);
}

export function requiredSmartUploadFields(category: SmartUploadDetectedCategory) {
  if (category === "actuals" || category === "budget") {
    return ["Period", "Amount", "Account Name or Account Code"];
  }

  if (category === "cash") {
    return ["Period", "Amount"];
  }

  return ["Period"];
}

export function missingSmartUploadRequirements(review: SmartUploadReview) {
  const mappedFields = new Set(Object.values(review.columnMapping));
  const missing: string[] = [];

  if (review.detectedCategory === "unknown") {
    missing.push("File type");
  }

  if (!mappedFields.has("Period")) {
    missing.push("Period");
  }

  if (
    (review.detectedCategory === "actuals" || review.detectedCategory === "budget") &&
    !mappedFields.has("Account Name") &&
    !mappedFields.has("Account Code")
  ) {
    missing.push("Account Name or Account Code");
  }

  if (
    review.detectedCategory !== "notes" &&
    !mappedFields.has("Amount") &&
    !mappedFields.has("Revenue Amount") &&
    !mappedFields.has("Salary") &&
    !mappedFields.has("KPI Value")
  ) {
    missing.push("Amount");
  }

  return missing;
}

export async function confirmSmartUpload({
  file,
  reportingMonth,
  review,
}: {
  file: File;
  reportingMonth: string;
  review: SmartUploadReview;
}) {
  if (review.detectedCategory === "unknown") {
    throw new Error("Choose a file type before staging.");
  }

  const missing = missingSmartUploadRequirements(review);

  if (missing.length > 0) {
    throw new Error(`Complete required mapping first: ${missing.join(", ")}.`);
  }

  const { user, company } = await getCurrentCompany();

  if (!user) {
    throw new Error("Log in before staging uploads.");
  }

  if (!company) {
    throw new Error("Please complete your company profile before staging uploads.");
  }

  const supabase = createClient();
  const categoryConfig = monthlyCloseCategories.find(
    (category) => category.id === review.detectedCategory,
  );

  if (!categoryConfig) {
    throw new Error("Unknown Smart Upload category.");
  }

  await saveConfirmedCompanyMappings(review);

  const stagedRows = review.transformedRows.filter(
    (row) => row.mappingStatus !== "Ignored",
  );
  const validationSummary = buildValidationSummary(review, stagedRows);
  const status = statusFromReview(review, validationSummary);
  const storagePath = `${user.id}/${company.id}/smart-upload/${reportingMonth}/${review.detectedCategory}/${Date.now()}-${sanitizeFileName(file.name)}`;

  const { error: storageError } = await supabase.storage
    .from("finance-uploads")
    .upload(storagePath, file, {
      contentType: file.type || "text/csv",
      upsert: false,
    });

  if (storageError) {
    throw new Error(`Storage upload failed: ${storageError.message}`);
  }

  await supabase
    .from("uploaded_files")
    .update({ is_active: false })
    .eq("company_id", company.id)
    .eq("reporting_month", reportingMonth)
    .eq("file_category", review.detectedCategory)
    .eq("is_active", true);

  const { data: uploadedFile, error: fileError } = await supabase
    .from("uploaded_files")
    .insert({
      company_id: company.id,
      user_id: user.id,
      data_type: categoryConfig.dataType,
      file_category: review.detectedCategory,
      file_name: file.name,
      storage_path: storagePath,
      reporting_month: reportingMonth,
      period_start: review.detectedPeriodStart?.slice(0, 7) ?? reportingMonthKey(reportingMonth),
      period_end: review.detectedPeriodEnd?.slice(0, 7) ?? reportingMonthKey(reportingMonth),
      status:
        status === "Needs Mapping"
          ? "needs_mapping"
          : status === "Needs review"
            ? "needs_review"
            : "staged",
      row_count: stagedRows.length,
      error_count: validationSummary.errorRows,
      warning_count: validationSummary.warningRows,
      uploaded_at: new Date().toISOString(),
      is_active: true,
    })
    .select("id")
    .single();

  if (fileError || !uploadedFile) {
    throw new Error(`Upload metadata save failed: ${fileError?.message ?? "No file row returned."}`);
  }

  const mappedRowCount = stagedRows.filter((row) => row.mappingStatus === "Mapped").length;
  const unmappedRowCount = stagedRows.filter(
    (row) => row.mappingStatus === "Suggested" || row.mappingStatus === "Unmapped",
  ).length;
  const batchStatus =
    status === "Needs Mapping"
      ? "Needs Mapping"
      : status === "Needs review"
        ? "Ready for Review"
        : "Staged";
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      user_id: user.id,
      company_id: company.id,
      uploaded_file_id: uploadedFile.id,
      reporting_month: reportingMonth,
      file_category: review.detectedCategory,
      status: batchStatus,
      detected_period_start: review.detectedPeriodStart,
      detected_period_end: review.detectedPeriodEnd,
      detected_row_count: stagedRows.length,
      mapped_row_count: mappedRowCount,
      unmapped_row_count: unmappedRowCount,
      validation_summary: validationSummary,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(`Import staging batch save failed: ${batchError?.message ?? "No batch returned."}`);
  }

  if (stagedRows.length > 0) {
    const { error: rowError } = await supabase.from("import_staged_rows").insert(
      stagedRows.map((row) => ({
        user_id: user.id,
        company_id: company.id,
        import_batch_id: batch.id,
        uploaded_file_id: uploadedFile.id,
        file_category: review.detectedCategory,
        source_row_number: row.sourceRowNumber,
        period: row.period,
        raw_account_name: row.accountName || row.accountCode || null,
        account_code: row.accountCode || null,
        raw_category: row.rawCategory || null,
        mapped_category: row.category || null,
        department: row.department || null,
        department_code: row.departmentCode || null,
        amount: row.amount,
        raw_data: {
          ...row.rawData,
          smart_upload_column_mapping: review.columnMapping,
          smart_upload_file_format: review.fileFormat,
          selected_sheet_name: review.selectedSheetName,
          workbook_sheet_count: review.sheetCount,
          account_code: row.accountCode || null,
          department_code: row.departmentCode || null,
          notes: row.notes || null,
        },
        mapping_status: row.mappingStatus,
        validation_status:
          !row.period || (review.detectedCategory !== "notes" && row.amount === null)
            ? "Critical"
            : row.mappingStatus === "Unmapped" || row.mappingStatus === "Suggested"
              ? "Warning"
              : "Valid",
        updated_at: new Date().toISOString(),
      })),
    );

    if (rowError) {
      throw new Error(`Import staged rows save failed: ${rowError.message}`);
    }
  }

  const { error: itemError } = await supabase
    .from("monthly_close_items")
    .upsert(
      {
        user_id: user.id,
        company_id: company.id,
        reporting_month: reportingMonth,
        file_category: review.detectedCategory,
        status,
        file_name: file.name,
        storage_path: storagePath,
        uploaded_file_id: uploadedFile.id,
        uploaded_at: new Date().toISOString(),
        approved_at: null,
        approved_by: null,
        validation_summary: validationSummary,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,reporting_month,file_category" },
    );

  if (itemError) {
    throw new Error(`Checklist update failed: ${itemError.message}`);
  }

  await supabase.from("monthly_close_activity").insert({
    user_id: user.id,
    company_id: company.id,
    reporting_month: reportingMonth,
    file_category: review.detectedCategory,
    action: "uploaded_file",
    details: {
      file_name: file.name,
      uploaded_file_id: uploadedFile.id,
      import_batch_id: batch.id,
      smart_upload: true,
      selected_sheet_name: review.selectedSheetName,
      workbook_sheet_count: review.sheetCount,
      status,
      detected_period_start: review.detectedPeriodStart,
      detected_period_end: review.detectedPeriodEnd,
      detected_row_count: stagedRows.length,
      unmapped_row_count: unmappedRowCount,
    },
  });

  return { status, uploadedFileId: String(uploadedFile.id), importBatchId: String(batch.id) };
}

export function categoryTitle(category: SmartUploadDetectedCategory) {
  if (category === "unknown") return "Unknown / Needs Review";

  return monthlyCloseCategories.find((item) => item.id === category)?.title ?? category;
}

export function smartUploadSummary(review: SmartUploadReview, reportingMonth: string) {
  return [
    `Format: ${review.fileFormat}${review.selectedSheetName ? ` (${review.selectedSheetName})` : ""}`,
    `Detected File Type: ${categoryTitle(review.detectedCategory)}`,
    `Confidence: ${review.confidence}`,
    `Detected Period Range: ${formatPeriodRange(
      review.detectedPeriodStart,
      review.detectedPeriodEnd,
    )}`,
    `Rows detected: ${review.rowCount.toLocaleString()}`,
    `Columns detected: ${review.sheetColumnCount.toLocaleString()}`,
    `Selected Data Room Month: ${formatReportingMonth(reportingMonth)}`,
  ];
}

function buildReview({
  fileName,
  parsedFile,
  headers,
  rows,
  companyMapping,
}: {
  fileName: string;
  parsedFile: ParsedSmartUploadFile;
  headers: string[];
  rows: Record<string, unknown>[];
  companyMapping: CompanyMappingContext;
}): SmartUploadReview {
  const detectedCategory = detectCategory(headers);
  const columnMapping = detectColumnMapping(headers, detectedCategory);
  const transformedRows = transformRows(rows, columnMapping, companyMapping);
  const periods = transformedRows.map((row) => row.period).filter((period): period is string => Boolean(period)).sort();
  const warnings = buildWarnings({
    detectedCategory,
    columnMapping,
    transformedRows,
    periodCount: new Set(periods).size,
  });

  return {
    fileName,
    fileFormat: parsedFile.fileFormat,
    sheetNames: parsedFile.sheetNames,
    selectedSheetName: parsedFile.selectedSheetName,
    sheetCount: parsedFile.sheetNames.length,
    sheetRowCount: parsedFile.rowCount,
    sheetColumnCount: parsedFile.columnCount,
    detectedCategory: detectedCategory.category,
    confidence: detectedCategory.confidence,
    detectedPeriodStart: periods[0] ?? null,
    detectedPeriodEnd: periods.at(-1) ?? null,
    columnMapping,
    suggestedMappings: buildMappingSuggestions(transformedRows, companyMapping),
    transformedRows,
    warnings: [...parsedFile.warnings, ...warnings],
    reasoning: detectedCategory.reasoning,
    headers,
    sampleRows: rows.slice(0, 8),
    rowCount: rows.length,
    aiUsed: false,
  };
}

function recomputeReview(review: SmartUploadReview): SmartUploadReview {
  const transformedRows = transformRows(review.sampleRows.length === review.rowCount ? review.sampleRows : review.transformedRows.map((row) => row.rawData), review.columnMapping, {
    departments: [],
    accounts: [],
    rules: [],
  });
  const suggestionsByRaw = new Map(review.suggestedMappings.map((suggestion) => [suggestion.id, suggestion]));
  const suggestedMappings = buildMappingSuggestions(transformedRows, {
    departments: [],
    accounts: [],
    rules: [],
  }).map((suggestion) => ({
    ...suggestion,
    ...(suggestionsByRaw.get(suggestion.id) ?? {}),
  }));
  const rows: SmartUploadTransformedRow[] = applySuggestionActions(transformedRows, suggestedMappings);
  const periods = rows.map((row) => row.period).filter((period): period is string => Boolean(period)).sort();

  return {
    ...review,
    transformedRows: rows,
    suggestedMappings,
    detectedPeriodStart: periods[0] ?? null,
    detectedPeriodEnd: periods.at(-1) ?? null,
    warnings: buildWarnings({
      detectedCategory: { category: review.detectedCategory, confidence: review.confidence, reasoning: review.reasoning },
      columnMapping: review.columnMapping,
      transformedRows: rows,
      periodCount: new Set(periods).size,
    }),
  };
}

function applyAiMapping(
  review: SmartUploadReview,
  payload: SmartUploadAiMapping,
  rows: Record<string, unknown>[],
  companyMapping: CompanyMappingContext,
) {
  const columnMapping = normalizeAiColumnMapping(
    payload.column_mapping ?? {},
    review.columnMapping,
    review.headers,
  );
  const category = normalizeDetectedCategory(
    payload.detected_category ?? review.detectedCategory,
  );
  const transformedRows = transformRows(rows, columnMapping, companyMapping);
  const baseSuggestions = buildMappingSuggestions(transformedRows, companyMapping);
  const aiSuggestions = mergeAiSuggestions(baseSuggestions, payload.suggested_accounts ?? []);
  const finalRows = applySuggestionActions(transformedRows, aiSuggestions);
  const periods = finalRows.map((row) => row.period).filter((period): period is string => Boolean(period)).sort();

  return {
    ...review,
    detectedCategory: category,
    confidence: payload.confidence ?? review.confidence,
    detectedPeriodStart: payload.period_range?.start ?? periods[0] ?? review.detectedPeriodStart,
    detectedPeriodEnd: payload.period_range?.end ?? periods.at(-1) ?? review.detectedPeriodEnd,
    columnMapping,
    suggestedMappings: aiSuggestions,
    transformedRows: finalRows,
    warnings: [...new Set([...review.warnings, ...(payload.warnings ?? [])])],
    reasoning: payload.reasoning ?? review.reasoning,
    aiUsed: true,
  } satisfies SmartUploadReview;
}

function detectCategory(headers: string[]) {
  const scores = Object.entries(headerSignals).map(([category, signals]) => {
    const matches = signals.filter((signal) =>
      headers.some((header) => normalizeHeader(header).includes(normalizeHeader(signal))),
    );

    return {
      category: category as SmartUploadDetectedCategory,
      score: matches.length,
      matches,
    };
  });
  const best = scores.sort((a, b) => b.score - a.score)[0];
  const category = best && best.score >= 2 ? best.category : "unknown";
  const confidence: SmartUploadConfidence =
    best && best.score >= 5 ? "High" : best && best.score >= 2 ? "Medium" : "Low";

  return {
    category,
    confidence,
    reasoning:
      category === "unknown"
        ? "The file did not contain enough recognizable finance headers."
        : `Rule-based detection matched ${best.matches.length} header signal(s).`,
  };
}

function detectColumnMapping(
  headers: string[],
  detected: ReturnType<typeof detectCategory>,
): SmartColumnMapping {
  const mapping: SmartColumnMapping = Object.fromEntries(
    headers.map((header) => [header, "Ignore"]),
  ) as SmartColumnMapping;

  standardFields
    .filter((field) => field !== "Ignore")
    .forEach((field) => {
      const header = findHeader(headers, fieldAliases[field]);

      if (header && mapping[header] === "Ignore") {
        mapping[header] = field;
      }
    });

  if (detected.category === "budget") {
    mapFirst(headers, mapping, ["budget amount", "budget", "plan"], "Amount");
  }

  if (detected.category === "revenue") {
    mapFirst(headers, mapping, ["customer", "segment"], "Customer / Segment");
    mapFirst(headers, mapping, ["revenue type", "product"], "Revenue Type");
    mapFirst(headers, mapping, ["revenue amount", "revenue", "mrr", "arr"], "Revenue Amount");
  }

  return mapping;
}

function transformRows(
  rows: Record<string, unknown>[],
  columnMapping: SmartColumnMapping,
  companyMapping: CompanyMappingContext,
): SmartUploadTransformedRow[] {
  return rows.map((row, index) => {
    const period = normalizePeriod(readMappedValue(row, columnMapping, "Period"));
    const accountCode = readMappedValue(row, columnMapping, "Account Code");
    const rawAccountName =
      readMappedValue(row, columnMapping, "Account Name") ||
      readMappedValue(row, columnMapping, "Customer / Segment") ||
      readMappedValue(row, columnMapping, "Employee / Role") ||
      readMappedValue(row, columnMapping, "KPI Name");
    const rawCategory =
      readMappedValue(row, columnMapping, "Raw Category") ||
      readMappedValue(row, columnMapping, "Revenue Type");
    const departmentCode = readMappedValue(row, columnMapping, "Department Code");
    const department = readMappedValue(row, columnMapping, "Department");
    const amount = parseAmount(
      readMappedValue(row, columnMapping, "Amount") ||
        readMappedValue(row, columnMapping, "Revenue Amount") ||
        readMappedValue(row, columnMapping, "Salary") ||
        readMappedValue(row, columnMapping, "KPI Value"),
    );
    const match = findCompanyAccountMatch({
      accountCode,
      accountName: rawAccountName,
      companyMapping,
    });
    const departmentMatch = findCompanyDepartmentMatch({
      departmentCode,
      departmentName: department || match.departmentName,
      companyMapping,
    });
    const accountRule = findCompanyMappingRuleMatch(rawAccountName || accountCode, companyMapping);
    const departmentRule = findCompanyMappingRuleMatch(department || departmentCode, companyMapping);
    const evidence = [rawAccountName, rawCategory, accountCode].filter(Boolean).join(" ");
    const suggested = suggestAccountMapping(expandKnownAlias(evidence || rawAccountName || accountCode));
    const hasDepartmentEvidence = Boolean(departmentCode || department);
    const accountIsConfirmed = match.matched || accountRule.matched;
    const departmentIsConfirmed =
      !hasDepartmentEvidence ||
      departmentMatch.matched ||
      Boolean(departmentRule.matched && departmentRule.departmentName);
    const category = accountIsConfirmed
      ? match.normalizedCategory || accountRule.normalizedCategory || rawCategory || ""
      : accountRule.normalizedCategory || suggested.category || rawCategory || "";
    const finalDepartment =
      (departmentMatch.matched ? departmentMatch.name : "") ||
      match.departmentName ||
      accountRule.departmentName ||
      (departmentRule.matched ? departmentRule.departmentName : "") ||
      department ||
      departmentMatch.suggestedName ||
      suggested.department ||
      "";
    const hasSuggestion =
      Boolean(category && category !== "Uncategorized") ||
      Boolean(finalDepartment) ||
      Boolean(rawCategory);
    const mappingStatus: SmartUploadTransformedRow["mappingStatus"] =
      accountIsConfirmed && departmentIsConfirmed
        ? "Mapped"
        : rawAccountName || accountCode
          ? hasSuggestion
            ? "Suggested"
            : "Unmapped"
          : "Unmapped";

    return {
      sourceRowNumber: index + 2,
      period,
      accountCode,
      accountName: rawAccountName || accountCode,
      rawCategory,
      departmentCode,
      department: finalDepartment,
      category,
      amount,
      notes: readMappedValue(row, columnMapping, "Notes"),
      mappingStatus,
      accountConfirmed: accountIsConfirmed,
      hasDepartmentEvidence,
      departmentConfirmed: departmentIsConfirmed,
      rawData: row,
    } satisfies SmartUploadTransformedRow;
  });
}

function buildMappingSuggestions(
  rows: SmartUploadTransformedRow[],
  companyMapping: CompanyMappingContext,
) {
  const byKey = new Map<string, SmartUploadMappingSuggestion>();

  rows.forEach((row) => {
    const rawValue = row.accountName || row.accountCode;
    if (!rawValue) return;
    const key = normalizeAccountName(`${row.accountCode}|${rawValue}|${row.departmentCode}`);
    if (byKey.has(key)) return;

    const matched = findCompanyAccountMatch({
      accountCode: row.accountCode,
      accountName: rawValue,
      companyMapping,
    });
    const departmentMatch = findCompanyDepartmentMatch({
      departmentCode: row.departmentCode,
      departmentName: row.department,
      companyMapping,
    });
    const accountRule = findCompanyMappingRuleMatch(rawValue || row.accountCode, companyMapping);
    const departmentRule = findCompanyMappingRuleMatch(row.department || row.departmentCode, companyMapping);
    const matchedExisting =
      row.accountConfirmed &&
      (!row.hasDepartmentEvidence ||
        row.departmentConfirmed ||
        departmentMatch.matched ||
        Boolean(departmentRule.matched && departmentRule.departmentName));
    const suggestedCategory =
      matched.normalizedCategory ||
      accountRule.normalizedCategory ||
      row.category ||
      "Uncategorized";
    const confidence: SmartUploadConfidence = matchedExisting
      ? "High"
      : suggestedCategory && suggestedCategory !== "Uncategorized"
        ? "Medium"
        : "Low";
    const mappingState =
      matchedExisting
        ? "Matched from Company Mapping"
        : confidence === "Low"
          ? "Unmapped"
          : "Needs Confirmation";

    byKey.set(key, {
      id: key,
      rawValue,
      accountCode: row.accountCode,
      accountName: matched.accountName || accountRule.accountName || row.accountName || expandKnownAlias(rawValue),
      departmentCode: row.departmentCode,
      departmentName:
        (departmentMatch.matched ? departmentMatch.name : "") ||
        matched.departmentName ||
        accountRule.departmentName ||
        (departmentRule.matched ? departmentRule.departmentName : "") ||
        row.department ||
        departmentMatch.suggestedName,
      normalizedCategory: suggestedCategory,
      statementType: "P&L",
      confidence,
      reason: matchedExisting
        ? "Matched from confirmed Company Mapping for this company."
        : confidence === "Low"
          ? "No confirmed company-specific mapping exists yet. Leave unmapped or create a mapping in Company Mapping."
          : "AI/rules suggested this mapping based on the uploaded code and description. Confirm before it becomes part of Company Mapping.",
      action: matchedExisting ? "Confirm" : "Needs Review",
      matchedExisting,
      mappingState,
    });
  });

  return [...byKey.values()];
}

function applySuggestionActions(
  rows: SmartUploadTransformedRow[],
  suggestions: SmartUploadMappingSuggestion[],
): SmartUploadTransformedRow[] {
  const suggestionsByKey = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));

  return rows.map((row) => {
    const key = normalizeAccountName(`${row.accountCode}|${row.accountName || row.accountCode}|${row.departmentCode}`);
    const suggestion = suggestionsByKey.get(key);

    if (!suggestion) return row;

    return {
      ...row,
      accountCode: suggestion.accountCode,
      accountName: row.accountName || suggestion.rawValue,
      departmentCode: suggestion.departmentCode,
      department: suggestion.departmentName,
      category: suggestion.normalizedCategory,
      mappingStatus:
        suggestion.action === "Ignore"
          ? "Ignored"
          : suggestion.action === "Confirm"
            ? "Mapped"
            : "Suggested",
    };
  });
}

async function saveConfirmedCompanyMappings(review: SmartUploadReview) {
  const { user, company } = await getCurrentCompany();
  if (!user || !company) return;
  const supabase = createClient();

  for (const suggestion of review.suggestedMappings.filter(
    (item) => item.action === "Confirm" && !item.matchedExisting,
  )) {
    let departmentId: string | null = null;

    if (suggestion.departmentName) {
      const { data: department } = await supabase
        .from("company_departments")
        .upsert(
          {
            user_id: user.id,
            company_id: company.id,
            name: suggestion.departmentName,
            code: suggestion.departmentCode || null,
            function: suggestion.departmentName,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,name" },
        )
        .select("id")
        .single();

      departmentId = String(department?.id ?? "");
    }

    await supabase.from("company_accounts").upsert(
      {
        user_id: user.id,
        company_id: company.id,
        account_name: suggestion.accountName || suggestion.rawValue,
        account_code: suggestion.accountCode || null,
        uploaded_alias: suggestion.rawValue || null,
        department_id: departmentId || null,
        normalized_category: suggestion.normalizedCategory || null,
        statement_type: suggestion.statementType || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,account_name" },
    );

    if (suggestion.rawValue && suggestion.normalizedCategory) {
      await saveAccountMapping({
        rawAccountName: suggestion.rawValue,
        normalizedCategory: suggestion.normalizedCategory,
        department: suggestion.departmentName,
        statementType: suggestion.statementType,
        status: "Mapped",
      });
    }

    if (suggestion.accountCode) {
      await supabase.from("mapping_rules").upsert(
        {
          user_id: user.id,
          company_id: company.id,
          rule_type: "account_code_equals",
          match_value: suggestion.accountCode,
          normalized_category: suggestion.normalizedCategory || null,
          priority: 25,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,rule_type,match_value" },
      );
    }
  }
}

async function loadCompanyMappingContext(): Promise<CompanyMappingContext> {
  try {
    const { company } = await getCurrentCompany();
    if (!company) return { departments: [], accounts: [], rules: [] };
    const supabase = createClient();
    const [departments, accounts, rules] = await Promise.all([
      supabase.from("company_departments").select("*").eq("company_id", company.id),
      supabase.from("company_accounts").select("*").eq("company_id", company.id),
      supabase.from("mapping_rules").select("*").eq("company_id", company.id).eq("is_active", true),
    ]);

    return {
      departments: (departments.data ?? []) as CompanyDepartment[],
      accounts: (accounts.data ?? []) as CompanyAccount[],
      rules: (rules.data ?? []) as MappingRule[],
    };
  } catch {
    return { departments: [], accounts: [], rules: [] };
  }
}

function findCompanyAccountMatch({
  accountCode,
  accountName,
  companyMapping,
}: {
  accountCode: string;
  accountName: string;
  companyMapping: CompanyMappingContext;
}) {
  const normalizedName = normalizeAccountName(accountName);
  const normalizedCode = normalizeAccountName(accountCode);
  const account = companyMapping.accounts.find(
    (item) =>
      item.is_active !== false &&
      ((accountCode && item.account_code && normalizeAccountName(item.account_code) === normalizedCode) ||
      (item.uploaded_alias && normalizeAccountName(item.uploaded_alias) === normalizedName) ||
      normalizeAccountName(item.account_name) === normalizedName),
  );

  return {
    matched: Boolean(account),
    accountName: account?.account_name ?? "",
    departmentName:
      companyMapping.departments.find((department) => department.id === account?.department_id)?.name ?? "",
    normalizedCategory: account?.normalized_category ?? "",
  };
}

function findCompanyDepartmentMatch({
  departmentCode,
  departmentName,
  companyMapping,
}: {
  departmentCode: string;
  departmentName: string;
  companyMapping: CompanyMappingContext;
}) {
  const normalizedName = normalizeAccountName(departmentName);
  const normalizedCode = normalizeAccountName(departmentCode);
  const department = companyMapping.departments.find(
    (item) =>
      item.is_active !== false &&
      ((departmentCode && item.code && normalizeAccountName(item.code) === normalizedCode) ||
      normalizeAccountName(item.name) === normalizedName),
  );

  return {
    matched: Boolean(department),
    id: department?.id ?? "",
    name: department?.name ?? "",
    suggestedName: department?.name ?? expandDepartmentCode(departmentCode),
  };
}

function findCompanyMappingRuleMatch(rawValue: string, companyMapping: CompanyMappingContext) {
  const normalizedRaw = normalizeAccountName(rawValue);
  const rule = companyMapping.rules
    .filter((item) => item.is_active !== false)
    .sort((first, second) => (first.priority ?? 100) - (second.priority ?? 100))
    .find((item) => {
      const match = normalizeAccountName(item.match_value);
      if (item.rule_type.includes("contains")) return normalizedRaw.includes(match);
      return normalizedRaw === match;
    });
  const account = companyMapping.accounts.find((item) => item.id === rule?.mapped_account_id);
  const department = companyMapping.departments.find((item) => item.id === rule?.mapped_department_id);

  return {
    matched: Boolean(rule),
    accountName: account?.account_name ?? "",
    departmentName: department?.name ?? "",
    normalizedCategory: rule?.normalized_category ?? account?.normalized_category ?? "",
  };
}

function normalizeAiColumnMapping(
  aiMapping: Record<string, string>,
  fallback: SmartColumnMapping,
  headers: string[],
) {
  const mapping = { ...fallback };

  Object.entries(aiMapping).forEach(([source, target]) => {
    const header = headers.find((item) => normalizeHeader(item) === normalizeHeader(source)) ?? source;
    const field = standardFields.find((item) => normalizeHeader(item) === normalizeHeader(target));
    if (header && field) mapping[header] = field;
  });

  return mapping;
}

function mergeAiSuggestions(
  suggestions: SmartUploadMappingSuggestion[],
  aiSuggestions: Array<Record<string, unknown>>,
) {
  const byRaw = new Map<string, SmartUploadMappingSuggestion>();

  suggestions.forEach((suggestion) => {
    byRaw.set(normalizeAccountName(suggestion.rawValue), suggestion);
    if (suggestion.accountCode) {
      byRaw.set(normalizeAccountName(suggestion.accountCode), suggestion);
    }
  });

  aiSuggestions.forEach((item) => {
    const rawValue = String(item.raw_value ?? "");
    const existing = byRaw.get(normalizeAccountName(rawValue));
    if (!existing) return;

    existing.accountCode = String(item.account_code ?? existing.accountCode);
    existing.accountName = String(item.account_name ?? existing.accountName);
    existing.departmentCode = String(item.department_code ?? existing.departmentCode);
    existing.departmentName = String(item.department_name ?? existing.departmentName);
    existing.normalizedCategory = String(item.normalized_category ?? existing.normalizedCategory);
    existing.statementType = String(item.statement_type ?? existing.statementType);
    existing.confidence = normalizeConfidence(String(item.confidence ?? existing.confidence));
    existing.reason = String(item.reason ?? existing.reason);
    existing.mappingState = existing.matchedExisting
      ? "Matched from Company Mapping"
      : existing.confidence === "Low"
        ? "Unmapped"
        : "Needs Confirmation";
    existing.action = existing.matchedExisting ? "Confirm" : "Needs Review";
  });

  return suggestions;
}

function buildValidationSummary(
  review: SmartUploadReview,
  rows: SmartUploadTransformedRow[],
): ValidationSummary {
  const issues = [...review.warnings];
  const criticalRows = rows.filter(
    (row) => !row.period || (review.detectedCategory !== "notes" && row.amount === null),
  ).length;
  const warningRows = rows.filter(
    (row) => row.mappingStatus === "Suggested" || row.mappingStatus === "Unmapped",
  ).length;

  return {
    totalRows: rows.length,
    validRows: Math.max(0, rows.length - criticalRows - warningRows),
    warningRows,
    errorRows: criticalRows,
    issues: [
      ...issues.map((message, index) => ({
        id: `smart-upload-warning-${index}`,
        fileCategory: review.detectedCategory === "unknown" ? "actuals" : review.detectedCategory,
        categoryLabel: categoryTitle(review.detectedCategory),
        severity: message.toLowerCase().includes("missing") ? "Warning" as const : "Info" as const,
        message,
        suggestedFix: "Review the confirmed mapping before approval.",
      })),
      ...(criticalRows > 0
        ? [{
            id: "smart-upload-critical-rows",
            fileCategory: review.detectedCategory === "unknown" ? "actuals" : review.detectedCategory,
            categoryLabel: categoryTitle(review.detectedCategory),
            severity: "Critical" as const,
            message: `${criticalRows} row(s) are missing required period or amount values.`,
            rowCount: criticalRows,
            suggestedFix: "Complete required column mappings or fix the source file.",
          }]
        : []),
      ...(warningRows > 0
        ? [{
            id: "smart-upload-unmapped-rows",
            fileCategory: review.detectedCategory === "unknown" ? "actuals" : review.detectedCategory,
            categoryLabel: categoryTitle(review.detectedCategory),
            severity: "Warning" as const,
            message: `${warningRows} row(s) still need mapping confirmation.`,
            rowCount: warningRows,
            suggestedFix: "Confirm mappings or review them in Company Mapping before approval.",
          }]
        : []),
    ],
  };
}

function statusFromReview(
  review: SmartUploadReview,
  validationSummary: ValidationSummary,
): MonthlyCloseStatus {
  if (review.transformedRows.some((row) => row.mappingStatus === "Suggested" || row.mappingStatus === "Unmapped")) {
    return "Needs Mapping";
  }
  if (validationSummary.errorRows > 0 || validationSummary.warningRows > 0 || review.confidence === "Low") {
    return "Needs review";
  }
  return "Uploaded";
}

function buildWarnings({
  detectedCategory,
  columnMapping,
  transformedRows,
  periodCount,
}: {
  detectedCategory: ReturnType<typeof detectCategory> | { category: SmartUploadDetectedCategory; confidence: SmartUploadConfidence; reasoning: string };
  columnMapping: SmartColumnMapping;
  transformedRows: SmartUploadTransformedRow[];
  periodCount: number;
}) {
  const fields = new Set(Object.values(columnMapping));
  const warnings: string[] = [];

  if (detectedCategory.category === "unknown") warnings.push("File type needs review before staging.");
  if (!fields.has("Period")) warnings.push("No clear date/period column detected.");
  if (!fields.has("Amount") && detectedCategory.category !== "notes") warnings.push("No clear amount/value column detected.");
  if (
    ["actuals", "budget"].includes(detectedCategory.category) &&
    !fields.has("Account Name") &&
    !fields.has("Account Code")
  ) {
    warnings.push("No clear account name or account code column detected.");
  }
  if (periodCount > 12) warnings.push("Multiple years detected.");
  if (periodCount > 1) warnings.push(`${periodCount} reporting periods detected.`);
  if (transformedRows.some((row) => row.mappingStatus === "Suggested" || row.mappingStatus === "Unmapped")) {
    warnings.push("Some accounts or departments need confirmation before approval.");
  }

  return warnings;
}

function serializeReviewForAi(review: SmartUploadReview) {
  return {
    detected_category: categoryTitle(review.detectedCategory),
    confidence: review.confidence,
    period_range: {
      start: review.detectedPeriodStart,
      end: review.detectedPeriodEnd,
    },
    column_mapping: review.columnMapping,
    suggested_accounts: review.suggestedMappings.slice(0, 30),
    selected_sheet_name: review.selectedSheetName,
    workbook_sheet_count: review.sheetCount,
    warnings: review.warnings,
  };
}

function findHeaderRowIndex(rows: string[][]) {
  const index = rows.findIndex((row) => {
    const nonEmpty = row.filter((cell) => cell.trim());
    const textLike = nonEmpty.filter((cell) => /[a-zA-Z]/.test(cell));
    return nonEmpty.length >= 2 && textLike.length >= 1;
  });

  return index >= 0 ? index : 0;
}

function rowToObject(headers: string[], row: string[]) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
}

function normalizeCellValue(value: string | number | boolean | Date | null) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-01`;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function dedupeHeaders(headers: string[]) {
  const seen = new Map<string, number>();

  return headers.map((header, index) => {
    const base = header.trim() || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);

    return count === 0 ? base : `${base} ${count + 1}`;
  });
}

function readMappedValue(
  row: Record<string, unknown>,
  mapping: SmartColumnMapping,
  field: SmartUploadStandardField,
) {
  const source = Object.entries(mapping).find(([, target]) => target === field)?.[0];
  if (!source) return "";
  const value = row[source];
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function findHeader(headers: string[], aliases: string[]) {
  return headers.find((header) =>
    aliases.some((alias) => normalizeHeader(header).includes(normalizeHeader(alias))),
  );
}

function mapFirst(
  headers: string[],
  mapping: SmartColumnMapping,
  aliases: string[],
  field: SmartUploadStandardField,
) {
  const header = findHeader(headers, aliases);
  if (header) mapping[header] = field;
}

function normalizeDetectedCategory(value: string): SmartUploadDetectedCategory {
  const normalized = value.toLowerCase();
  if (normalized.includes("actual") || normalized.includes("p&l")) return "actuals";
  if (normalized.includes("budget")) return "budget";
  if (normalized.includes("cash")) return "cash";
  if (normalized.includes("revenue")) return "revenue";
  if (normalized.includes("payroll") || normalized.includes("headcount")) return "payroll";
  if (normalized.includes("kpi")) return "kpi";
  if (normalized.includes("note") || normalized.includes("assumption")) return "notes";
  return "unknown";
}

function normalizeConfidence(value: string): SmartUploadConfidence {
  if (value === "High" || value === "Medium" || value === "Low") return value;
  return "Medium";
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function normalizePeriod(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  const monthNameMatch = trimmed.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-\s/]*(\d{4})$/i,
  );
  if (monthNameMatch) {
    return `${monthNameMatch[2]}-${monthNameToNumber(monthNameMatch[1])}-01`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-01`;
}

function parseAmount(value: string) {
  if (!value.trim()) return null;
  const amount = Number(value.replace(/\$/g, "").replace(/,/g, "").replace(/^\((.*)\)$/, "-$1").trim());
  return Number.isFinite(amount) ? amount : null;
}

function monthNameToNumber(value: string) {
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(value.toLowerCase().slice(0, 3));
  return String(Math.max(0, month) + 1).padStart(2, "0");
}

function expandKnownAlias(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "aws") return "AWS Hosting";
  if (normalized === "hub" || normalized === "hubspot") return "HubSpot";
  if (normalized === "sfdc" || normalized === "salesforce") return "Salesforce";
  if (normalized === "gusto") return "Gusto Payroll";
  if (normalized === "stripe") return "Stripe Fees";
  return value;
}

function expandDepartmentCode(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "eng") return "Engineering";
  if (["s&m", "sm", "sales", "mktg"].includes(normalized)) return "Sales & Marketing";
  if (normalized === "ga" || normalized === "g&a") return "G&A";
  if (normalized === "cs") return "Customer Success";
  return value;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatPeriodRange(start: string | null, end: string | null) {
  if (!start && !end) return "Not detected";
  if (start === end) return formatReportingMonth(start ?? "");
  return `${formatReportingMonth(start ?? "")} - ${formatReportingMonth(end ?? "")}`;
}
