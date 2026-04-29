"use client";

import {
  parseBudgetCsv,
  parseCashBalanceCsv,
  parsePayrollCsv,
  parsePnlActualsCsv,
  parseRevenueDetailCsv,
} from "@/lib/csvParser";
import {
  createImportBatchForUpload,
  loadImportBatchesForMonthlyClose,
  loadImportBatchesForUploadedFiles,
  mergeValidationSummaries,
  type ImportBatchSummary,
} from "@/lib/importStaging";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { getCurrentCompany } from "@/lib/supabase/data";
import {
  buildRawFileValidationSummary,
  buildValidationSummary,
  type DataQualityIssue,
  type PriorActualRow,
  type ValidationSummary,
} from "@/lib/validations";
import type {
  ParsedCashCsv,
  ParsedFinancialCsv,
  ParsedPayrollCsv,
  ParsedRevenueDetailCsv,
  UploadedCashRow,
  UploadedFinancialRow,
  UploadedPayrollRow,
  UploadedRevenueDetailRow,
} from "@/types/financial";

export type MonthlyCloseCategory =
  | "actuals"
  | "budget"
  | "cash"
  | "payroll"
  | "revenue"
  | "kpi"
  | "notes";

export type MonthlyCloseStatus =
  | "Not uploaded"
  | "Uploaded"
  | "Needs Mapping"
  | "Needs review"
  | "Approved";

export type MonthlyCloseItem = {
  id: string;
  user_id: string | null;
  company_id: string;
  reporting_month: string;
  file_category: MonthlyCloseCategory;
  status: MonthlyCloseStatus;
  file_name: string | null;
  storage_path: string | null;
  uploaded_file_id: string | null;
  uploaded_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  validation_summary: ValidationSummary | null;
  import_batch?: ImportBatchSummary | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MonthlyCloseActivity = {
  id: string;
  user_id: string | null;
  company_id: string;
  reporting_month: string;
  file_category: MonthlyCloseCategory;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

export type MonthlyCloseCategoryConfig = {
  id: MonthlyCloseCategory;
  title: string;
  description: string;
  dataType: string;
  parserSupported: boolean;
};

export type ReportingMonthOption = {
  value: string;
  label: string;
};

type ParsedSupportedUpload =
  | ParsedFinancialCsv
  | ParsedCashCsv
  | ParsedPayrollCsv
  | ParsedRevenueDetailCsv;

export const monthlyCloseCategories: MonthlyCloseCategoryConfig[] = [
  {
    id: "actuals",
    title: "P&L / Actuals",
    description:
      "Monthly income statement or actual financial results by account/category.",
    dataType: "actuals",
    parserSupported: true,
  },
  {
    id: "budget",
    title: "Budget",
    description:
      "Approved budget or forecast baseline used for variance comparison.",
    dataType: "budget",
    parserSupported: true,
  },
  {
    id: "cash",
    title: "Cash Report",
    description: "Cash balance, burn, and runway-related data.",
    dataType: "cash",
    parserSupported: true,
  },
  {
    id: "payroll",
    title: "Headcount / Payroll",
    description:
      "Employee, department, salary, start date, and payroll-related data.",
    dataType: "payroll",
    parserSupported: true,
  },
  {
    id: "revenue",
    title: "Revenue Data",
    description: "Revenue by customer, product, segment, or stream.",
    dataType: "revenueDetail",
    parserSupported: true,
  },
  {
    id: "kpi",
    title: "KPI Inputs",
    description:
      "Operational metrics such as customers, churn, pipeline, usage, or volume.",
    dataType: "kpi",
    parserSupported: false,
  },
  {
    id: "notes",
    title: "Notes / Assumptions",
    description:
      "Management notes explaining major changes, unusual activity, or forecast assumptions.",
    dataType: "notes",
    parserSupported: false,
  },
];

export function getReportingMonthOptions() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 12, 1);
  const monthCount = 16;

  return Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}-01`;
    return {
      value,
      label: formatReportingMonth(value),
    };
  });
}

export function formatReportingMonth(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function reportingMonthKey(reportingMonth: string) {
  return reportingMonth.slice(0, 7);
}

export function getOverallCloseStatus(items: MonthlyCloseItem[]) {
  const uploadedCount = items.filter((item) => item.status !== "Not uploaded").length;
  const approvedCount = items.filter((item) => item.status === "Approved").length;
  const needsReview = items.some(
    (item) => item.status === "Needs review" || item.status === "Needs Mapping",
  );

  if (uploadedCount === 0) {
    return "Not Started";
  }

  if (needsReview) {
    return "Needs Review";
  }

  if (approvedCount === monthlyCloseCategories.length) {
    return "Complete";
  }

  return "In Progress";
}

export function collectValidationIssues(items: MonthlyCloseItem[]) {
  return items.flatMap((item) => item.validation_summary?.issues ?? []);
}

export function hasCriticalValidationIssues(item: MonthlyCloseItem) {
  return (item.validation_summary?.issues ?? []).some(
    (issue) => issue.severity === "Critical",
  );
}

export async function loadMonthlyCloseItems(reportingMonth: string) {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error("Supabase is not configured for this local environment.");
  }

  const supabase = createClient();
  const { user, company } = await getCurrentCompany();

  if (!user) {
    throw new Error("Log in before using the Data Room.");
  }

  if (!company) {
    throw new Error("Please complete your company profile before using the Data Room.");
  }

  const existing = await fetchItems(company.id, reportingMonth);
  const existingCategories = new Set(
    existing.map((item) => item.file_category as MonthlyCloseCategory),
  );
  const missingRows = monthlyCloseCategories
    .filter((category) => !existingCategories.has(category.id))
    .map((category) => ({
      user_id: user.id,
      company_id: company.id,
      reporting_month: reportingMonth,
      file_category: category.id,
      status: "Not uploaded" as MonthlyCloseStatus,
      updated_at: new Date().toISOString(),
    }));

  if (missingRows.length > 0) {
    const { error } = await supabase.from("monthly_close_items").upsert(missingRows, {
      onConflict: "company_id,reporting_month,file_category",
      ignoreDuplicates: true,
    });

    if (error) {
      throw new Error(`Monthly close checklist initialization failed: ${error.message}`);
    }
  }

  return {
    user,
    company,
    items: await fetchItems(company.id, reportingMonth),
    activity: await fetchActivity(company.id, reportingMonth),
  };
}

export async function uploadMonthlyCloseFile({
  reportingMonth,
  fileCategory,
  file,
}: {
  reportingMonth: string;
  fileCategory: MonthlyCloseCategory;
  file: File;
}) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Please upload a .csv file.");
  }

  const supabase = createClient();
  const { user, company } = await getCurrentCompany();

  if (!user) {
    throw new Error("Log in before uploading files.");
  }

  if (!company) {
    throw new Error("Please complete your company profile before uploading files.");
  }

  const config = monthlyCloseCategories.find((category) => category.id === fileCategory);

  if (!config) {
    throw new Error("Unknown monthly close file category.");
  }

  const existingItem = await fetchItem(company.id, reportingMonth, fileCategory);
  const isReplacement = Boolean(existingItem?.uploaded_file_id);
  const csvText = await file.text();
  const storagePath = `${user.id}/${company.id}/monthly-close/${reportingMonth}/${fileCategory}/${Date.now()}-${sanitizeFileName(
    file.name,
  )}`;

  const { error: storageError } = await supabase.storage
    .from("finance-uploads")
    .upload(storagePath, file, {
      contentType: file.type || "text/csv",
      upsert: false,
    });

  if (storageError) {
    throw new Error(`Storage upload failed: ${storageError.message}`);
  }

  const parsed = config.parserSupported
    ? parseSupportedUpload(fileCategory, csvText)
    : null;
  const priorActualRows =
    fileCategory === "actuals"
      ? await loadPriorActualRows(company.id, reportingMonth)
      : [];
  let validationSummary = parsed
    ? buildValidationSummary({
        fileCategory,
        reportingMonth: reportingMonthKey(reportingMonth),
        parsed,
        priorActualRows,
      })
    : buildRawFileValidationSummary(fileCategory);

  await markExistingUploadsInactive(company.id, reportingMonth, fileCategory);

  const { data: uploadedFile, error: fileError } = await supabase
    .from("uploaded_files")
    .insert({
      company_id: company.id,
      user_id: user.id,
      data_type: config.dataType,
      file_category: fileCategory,
      file_name: file.name,
      storage_path: storagePath,
      reporting_month: reportingMonth,
      period_start: reportingMonthKey(reportingMonth),
      period_end: reportingMonthKey(reportingMonth),
      status: "staged",
      row_count: validationSummary.totalRows,
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

  let importBatch: Awaited<ReturnType<typeof createImportBatchForUpload>> | null = null;

  try {
    importBatch = await createImportBatchForUpload({
      userId: user.id,
      companyId: company.id,
      uploadedFileId: uploadedFile.id as string,
      reportingMonth,
      fileCategory,
      csvText,
    });
    validationSummary = mergeValidationSummaries(
      validationSummary,
      importBatch.validationSummary,
    );
  } catch (stagingError) {
    console.error("Import staging failed", stagingError);
    validationSummary = {
      ...validationSummary,
      warningRows: validationSummary.warningRows + 1,
      issues: [
        ...validationSummary.issues,
        {
          id: `${fileCategory}-import-staging-failed`,
          fileCategory,
          categoryLabel: config.title,
          severity: "Warning",
          message: "Import staging could not be completed for this file.",
          suggestedFix:
            stagingError instanceof Error
              ? stagingError.message
              : "Check the import staging tables and try replacing the file.",
        },
      ],
    };
  }

  const status = getUploadStatusFromValidation({
    fileCategory,
    validationSummary,
    importBatch,
  });

  const { error: uploadedFileUpdateError } = await supabase
    .from("uploaded_files")
    .update({
      period_start: importBatch?.detectedPeriodStart
        ? importBatch.detectedPeriodStart.slice(0, 7)
        : reportingMonthKey(reportingMonth),
      period_end: importBatch?.detectedPeriodEnd
        ? importBatch.detectedPeriodEnd.slice(0, 7)
        : reportingMonthKey(reportingMonth),
      status:
        status === "Needs Mapping"
          ? "needs_mapping"
          : status === "Needs review"
            ? "needs_review"
            : "loaded",
      row_count: validationSummary.totalRows,
      error_count: validationSummary.errorRows,
      warning_count: validationSummary.warningRows,
    })
    .eq("id", uploadedFile.id);

  if (uploadedFileUpdateError) {
    throw new Error(`Upload metadata update failed: ${uploadedFileUpdateError.message}`);
  }

  if (parsed) {
    await persistParsedMonthlyRows({
      companyId: company.id,
      uploadedFileId: uploadedFile.id as string,
      reportingMonth: reportingMonthKey(reportingMonth),
      fileCategory,
      parsed,
    });
  }

  const { error: itemError } = await supabase
    .from("monthly_close_items")
    .upsert(
      {
        user_id: user.id,
        company_id: company.id,
        reporting_month: reportingMonth,
        file_category: fileCategory,
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

  await logMonthlyCloseActivity({
    userId: user.id,
    companyId: company.id,
    reportingMonth,
    fileCategory,
    action: isReplacement ? "replaced_file" : "uploaded_file",
    details: {
      file_name: file.name,
      uploaded_file_id: uploadedFile.id,
      prior_uploaded_file_id: existingItem?.uploaded_file_id ?? null,
      status,
      import_batch_id: importBatch?.batchId ?? null,
      detected_period_start: importBatch?.detectedPeriodStart ?? null,
      detected_period_end: importBatch?.detectedPeriodEnd ?? null,
      detected_row_count: importBatch?.detectedRowCount ?? null,
      unmapped_row_count: importBatch?.unmappedRowCount ?? null,
    },
  });

  return loadMonthlyCloseItems(reportingMonth);
}

export async function updateMonthlyCloseItemStatus({
  item,
  status,
}: {
  item: MonthlyCloseItem;
  status: Exclude<MonthlyCloseStatus, "Not uploaded">;
}) {
  const supabase = createClient();
  const { user } = await getCurrentCompany();

  if (!user) {
    throw new Error("Log in before updating monthly close status.");
  }

  if (status === "Approved" && item.status === "Not uploaded") {
    throw new Error("Upload a file before approving this checklist item.");
  }

  if (status === "Approved" && hasCriticalValidationIssues(item)) {
    throw new Error(
      "This file has critical validation issues. Resolve or replace the file before approving.",
    );
  }

  if (status === "Approved" && hasBlockingMappingIssues(item)) {
    throw new Error(
      "This file has unmapped accounts. Review Account Mapping before approving reporting data.",
    );
  }

  const approvedFields =
    status === "Approved"
      ? {
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        }
      : {
          approved_at: null,
          approved_by: null,
        };

  const { error } = await supabase
    .from("monthly_close_items")
    .update({
      status,
      ...approvedFields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  if (error) {
    throw new Error(`Monthly close status update failed: ${error.message}`);
  }

  if (status === "Approved") {
    await materializeApprovedStagedRows(item);
  }

  if (item.uploaded_file_id || item.import_batch?.id) {
    const { error: batchError } = await supabase
      .from("import_batches")
      .update({
        status:
          status === "Approved"
            ? "Approved"
            : status === "Needs Mapping"
              ? "Needs Mapping"
              : "Ready for Review",
        updated_at: new Date().toISOString(),
      })
      .eq(item.uploaded_file_id ? "uploaded_file_id" : "id", item.uploaded_file_id ?? item.import_batch?.id);

    if (batchError) {
      console.error("Import batch status update failed", batchError);
    }
  }

  await logMonthlyCloseActivity({
    userId: user.id,
    companyId: item.company_id,
    reportingMonth: item.reporting_month,
    fileCategory: item.file_category,
    action: status === "Approved" ? "approved_file" : "marked_needs_review",
    details: {
      file_name: item.file_name,
      uploaded_file_id: item.uploaded_file_id,
    },
  });

  return loadMonthlyCloseItems(item.reporting_month);
}

export async function removeMonthlyCloseFile(item: MonthlyCloseItem) {
  const supabase = createClient();
  const { user } = await getCurrentCompany();

  if (!user) {
    throw new Error("Log in before removing files.");
  }

  if (item.uploaded_file_id) {
    const { error: uploadError } = await supabase
      .from("uploaded_files")
      .update({ is_active: false, status: "removed" })
      .eq("id", item.uploaded_file_id);

    if (uploadError) {
      throw new Error(`Upload record update failed: ${uploadError.message}`);
    }

    const { error: batchError } = await supabase
      .from("import_batches")
      .update({ status: "Rejected", updated_at: new Date().toISOString() })
      .eq("uploaded_file_id", item.uploaded_file_id);

    if (batchError) {
      console.error("Import batch removal update failed", batchError);
    }
  }

  if (!item.uploaded_file_id && item.import_batch?.id) {
    const { error: batchError } = await supabase
      .from("import_batches")
      .update({ status: "Rejected", updated_at: new Date().toISOString() })
      .eq("id", item.import_batch.id);

    if (batchError) {
      console.error("Manual import batch removal update failed", batchError);
    }
  }

  const { error } = await supabase
    .from("monthly_close_items")
    .update({
      status: "Not uploaded",
      file_name: null,
      storage_path: null,
      uploaded_file_id: null,
      uploaded_at: null,
      approved_at: null,
      approved_by: null,
      validation_summary: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  if (error) {
    throw new Error(`Monthly close file removal failed: ${error.message}`);
  }

  await logMonthlyCloseActivity({
    userId: user.id,
    companyId: item.company_id,
    reportingMonth: item.reporting_month,
    fileCategory: item.file_category,
    action: "removed_file",
    details: {
      file_name: item.file_name,
      uploaded_file_id: item.uploaded_file_id,
    },
  });

  return loadMonthlyCloseItems(item.reporting_month);
}

function parseSupportedUpload(
  fileCategory: MonthlyCloseCategory,
  csvText: string,
): ParsedSupportedUpload {
  if (fileCategory === "actuals") {
    return parsePnlActualsCsv(csvText);
  }

  if (fileCategory === "budget") {
    return parseBudgetCsv(csvText);
  }

  if (fileCategory === "cash") {
    return parseCashBalanceCsv(csvText);
  }

  if (fileCategory === "payroll") {
    return parsePayrollCsv(csvText);
  }

  if (fileCategory === "revenue") {
    return parseRevenueDetailCsv(csvText);
  }

  throw new Error("Automated parsing is not enabled for this file category.");
}

async function persistParsedMonthlyRows({
  companyId,
  uploadedFileId,
  fileCategory,
  parsed,
}: {
  companyId: string;
  uploadedFileId: string;
  reportingMonth: string;
  fileCategory: MonthlyCloseCategory;
  parsed: ParsedSupportedUpload;
}) {
  if (fileCategory === "actuals" || fileCategory === "budget") {
    const table = fileCategory === "actuals" ? "financial_actuals" : "budget_rows";
    const rows = (parsed.rows as UploadedFinancialRow[])
      .filter(
        (row) =>
          row.status !== "Error" &&
          Boolean(row.month) &&
          row.amount !== null,
      )
      .map((row) => ({
        company_id: companyId,
        uploaded_file_id: uploadedFileId,
        month: row.month,
        account: row.account,
        category: row.category,
        amount: row.amount,
      }));

    await replaceRowsForMonths(table, companyId, rows.map((row) => row.month));
    await insertRows(table, rows);
    return;
  }

  if (fileCategory === "cash") {
    const rows = (parsed.rows as UploadedCashRow[])
      .filter(
        (row) =>
          row.status !== "Error" &&
          Boolean(row.month) &&
          row.cashBalance !== null,
      )
      .map((row) => ({
        company_id: companyId,
        uploaded_file_id: uploadedFileId,
        month: row.month,
        cash_balance: row.cashBalance,
      }));

    await replaceRowsForMonths("cash_rows", companyId, rows.map((row) => row.month));
    await insertRows("cash_rows", rows);
    return;
  }

  if (fileCategory === "payroll") {
    const rows = (parsed.rows as UploadedPayrollRow[])
      .filter((row) => row.status !== "Error" && Boolean(row.month))
      .map((row) => ({
        company_id: companyId,
        uploaded_file_id: uploadedFileId,
        month: row.month,
        employee_name: row.employeeName,
        department: row.department,
        role: row.role,
        salary: row.salary,
        benefits: row.benefits,
        payroll_tax: row.payrollTax,
        bonus: row.bonus,
        start_date: row.startDate,
        status: row.statusText,
      }));

    await replaceRowsForMonths("payroll_rows", companyId, rows.map((row) => row.month));
    await insertRows("payroll_rows", rows);
    return;
  }

  if (fileCategory === "revenue") {
    const rows = (parsed.rows as UploadedRevenueDetailRow[])
      .filter(
        (row) =>
          row.status !== "Error" &&
          Boolean(row.month) &&
          row.amount !== null,
      )
      .map((row) => ({
        company_id: companyId,
        uploaded_file_id: uploadedFileId,
        month: row.month,
        customer: row.customer,
        product: row.product,
        revenue_type: row.revenueType,
        amount: row.amount,
      }));

    await replaceRowsForMonths(
      "revenue_detail_rows",
      companyId,
      rows.map((row) => row.month),
    );
    await insertRows("revenue_detail_rows", rows);
  }
}

async function fetchItems(companyId: string, reportingMonth: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("monthly_close_items")
    .select("*")
    .eq("company_id", companyId)
    .eq("reporting_month", reportingMonth)
    .order("file_category", { ascending: true });

  if (error) {
    throw new Error(`Monthly close checklist load failed: ${error.message}`);
  }

  const items = orderItems((data ?? []) as MonthlyCloseItem[]);
  const uploadedFileIds = items
    .map((item) => item.uploaded_file_id)
    .filter((id): id is string => Boolean(id));
  const [batchesByUploadedFile, monthlyBatches] = await Promise.all([
    loadImportBatchesForUploadedFiles(uploadedFileIds),
    loadImportBatchesForMonthlyClose({ companyId, reportingMonth }),
  ]);

  return items.map((item) => ({
    ...item,
    import_batch: item.uploaded_file_id
      ? batchesByUploadedFile.get(item.uploaded_file_id) ?? null
      : monthlyBatches.find(
          (batch) =>
            batch.file_category === item.file_category &&
            !batch.uploaded_file_id &&
            batch.status !== "Rejected",
        ) ?? null,
  }));
}

async function fetchItem(
  companyId: string,
  reportingMonth: string,
  fileCategory: MonthlyCloseCategory,
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("monthly_close_items")
    .select("*")
    .eq("company_id", companyId)
    .eq("reporting_month", reportingMonth)
    .eq("file_category", fileCategory)
    .maybeSingle();

  if (error) {
    throw new Error(`Monthly close item lookup failed: ${error.message}`);
  }

  return data as MonthlyCloseItem | null;
}

async function fetchActivity(companyId: string, reportingMonth: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("monthly_close_activity")
    .select("*")
    .eq("company_id", companyId)
    .eq("reporting_month", reportingMonth)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    console.error("Monthly close activity load failed", error);
    return [];
  }

  return (data ?? []) as MonthlyCloseActivity[];
}

async function markExistingUploadsInactive(
  companyId: string,
  reportingMonth: string,
  fileCategory: MonthlyCloseCategory,
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("uploaded_files")
    .update({ is_active: false })
    .eq("company_id", companyId)
    .eq("reporting_month", reportingMonth)
    .eq("file_category", fileCategory)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Prior upload update failed: ${error.message}`);
  }
}

async function logMonthlyCloseActivity({
  userId,
  companyId,
  reportingMonth,
  fileCategory,
  action,
  details,
}: {
  userId: string;
  companyId: string;
  reportingMonth: string;
  fileCategory: MonthlyCloseCategory;
  action: string;
  details: Record<string, unknown>;
}) {
  const supabase = createClient();
  const { error } = await supabase.from("monthly_close_activity").insert({
    user_id: userId,
    company_id: companyId,
    reporting_month: reportingMonth,
    file_category: fileCategory,
    action,
    details,
  });

  if (error) {
    console.error("Monthly close activity log failed", error);
  }
}

function orderItems(items: MonthlyCloseItem[]) {
  const rank = new Map(
    monthlyCloseCategories.map((category, index) => [category.id, index]),
  );

  return [...items].sort(
    (first, second) =>
      (rank.get(first.file_category) ?? 99) -
      (rank.get(second.file_category) ?? 99),
  );
}

async function replaceRowsForMonths(
  table: string,
  companyId: string,
  reportingMonths: string[],
) {
  const months = [...new Set(reportingMonths.filter(Boolean))];

  if (months.length === 0) {
    return;
  }

  const supabase = createClient();
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("company_id", companyId)
    .in("month", months);

  if (error) {
    throw new Error(`${table} row replacement failed: ${error.message}`);
  }
}

async function insertRows(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return;
  }

  const supabase = createClient();
  const { error } = await supabase.from(table).insert(rows);

  if (error) {
    throw new Error(`${table} insert failed: ${error.message}`);
  }
}

async function materializeApprovedStagedRows(item: MonthlyCloseItem) {
  const importBatchId = item.import_batch?.id;

  if (!importBatchId) {
    return;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("import_staged_rows")
    .select("*")
    .eq("import_batch_id", importBatchId)
    .order("source_row_number", { ascending: true });

  if (error) {
    throw new Error(`Approved staged rows load failed: ${error.message}`);
  }

  const stagedRows = (data ?? []).filter(
    (row) => String(row.mapping_status ?? "") !== "Ignored",
  );
  const periods = [
    ...new Set(
      stagedRows
        .map((row) => monthFromDate(String(row.period ?? "")))
        .filter(Boolean),
    ),
  ];

  if (periods.length === 0) {
    return;
  }

  if (item.file_category === "actuals" || item.file_category === "budget") {
    const table =
      item.file_category === "actuals" ? "financial_actuals" : "budget_rows";
    const rows = stagedRows
      .map((row) => ({
        company_id: item.company_id,
        uploaded_file_id: item.uploaded_file_id,
        month: monthFromDate(String(row.period ?? "")),
        account: String(row.raw_account_name ?? ""),
        category: String(row.mapped_category || row.raw_category || "Uncategorized"),
        amount: toNumber(row.amount),
      }))
      .filter((row) => row.month && row.account && row.amount !== null);

    await replaceRowsForMonths(table, item.company_id, periods);
    await insertRows(table, rows);
    return;
  }

  if (item.file_category === "cash") {
    const rows = stagedRows
      .map((row) => ({
        company_id: item.company_id,
        uploaded_file_id: item.uploaded_file_id,
        month: monthFromDate(String(row.period ?? "")),
        cash_balance: toNumber(row.amount),
      }))
      .filter((row) => row.month && row.cash_balance !== null);

    await replaceRowsForMonths("cash_rows", item.company_id, periods);
    await insertRows("cash_rows", rows);
    return;
  }

  if (item.file_category === "payroll") {
    const rows = stagedRows
      .map((row) => {
        const rawData = toRecord(row.raw_data);

        return {
          company_id: item.company_id,
          uploaded_file_id: item.uploaded_file_id,
          month: monthFromDate(String(row.period ?? "")),
          employee_name: String(row.raw_account_name ?? ""),
          department: String(row.department ?? ""),
          role: String(row.raw_category ?? ""),
          salary: toNumber(row.amount),
          benefits: null,
          payroll_tax: null,
          bonus: null,
          start_date: rawData.startDate || null,
          status: rawData.status || null,
        };
      })
      .filter((row) => row.month && row.employee_name);

    await replaceRowsForMonths("payroll_rows", item.company_id, periods);
    await insertRows("payroll_rows", rows);
    return;
  }

  if (item.file_category === "revenue") {
    const rows = stagedRows
      .map((row) => ({
        company_id: item.company_id,
        uploaded_file_id: item.uploaded_file_id,
        month: monthFromDate(String(row.period ?? "")),
        customer: String(row.raw_account_name ?? ""),
        product: null,
        revenue_type: String(row.raw_category ?? ""),
        amount: toNumber(row.amount),
      }))
      .filter((row) => row.month && row.amount !== null);

    await replaceRowsForMonths("revenue_detail_rows", item.company_id, periods);
    await insertRows("revenue_detail_rows", rows);
  }
}

function monthFromDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.slice(0, 7);
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  return "";
}

function toNumber(value: unknown) {
  const amount = Number(value);

  return Number.isFinite(amount) ? amount : null;
}

function toRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, string>)
    : {};
}

async function loadPriorActualRows(
  companyId: string,
  reportingMonth: string,
): Promise<PriorActualRow[]> {
  const priorMonth = previousMonthKey(reportingMonth);

  if (!priorMonth) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("financial_actuals")
    .select("account, category, amount")
    .eq("company_id", companyId)
    .eq("month", priorMonth);

  if (error) {
    console.error("Prior-month actuals validation lookup failed", error);
    return [];
  }

  return (data ?? []) as PriorActualRow[];
}

function previousMonthKey(reportingMonth: string) {
  const date = new Date(`${reportingMonth}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setMonth(date.getMonth() - 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function hasValidationIssue(summary: ValidationSummary) {
  return summary.issues.some((issue: DataQualityIssue) =>
    ["Warning", "Critical"].includes(issue.severity),
  );
}

function getUploadStatusFromValidation({
  fileCategory,
  validationSummary,
  importBatch,
}: {
  fileCategory: MonthlyCloseCategory;
  validationSummary: ValidationSummary;
  importBatch: Awaited<ReturnType<typeof createImportBatchForUpload>> | null;
}): MonthlyCloseStatus {
  if (
    (fileCategory === "actuals" || fileCategory === "budget") &&
    (importBatch?.unmappedRowCount ?? 0) > 0
  ) {
    return "Needs Mapping";
  }

  return hasValidationIssue(validationSummary) ? "Needs review" : "Uploaded";
}

function hasBlockingMappingIssues(item: MonthlyCloseItem) {
  return (
    (item.file_category === "actuals" || item.file_category === "budget") &&
    (item.import_batch?.unmapped_row_count ?? 0) > 0
  );
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}
