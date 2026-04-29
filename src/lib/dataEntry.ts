"use client";

import {
  loadAccountMappingLookup,
  normalizeAccountName,
  suggestAccountMapping,
} from "@/lib/accountMapping";
import {
  monthlyCloseCategories,
  type MonthlyCloseCategory,
  type MonthlyCloseStatus,
} from "@/lib/monthlyClose";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { getCurrentCompany } from "@/lib/supabase/data";
import type {
  DataQualityIssue,
  ValidationSeverity,
  ValidationSummary,
} from "@/lib/validations";

export type DataEntryRow = {
  id: string;
  sourceRowNumber: number | null;
  period: string;
  rawAccountName: string;
  rawCategory: string;
  department: string;
  amount: string;
  notes: string;
  rawData: Record<string, string>;
  mappingStatus: "Unmapped" | "Suggested" | "Mapped" | "Ignored";
  validationStatus: "Unchecked" | "Valid" | "Warning" | "Critical";
  isNew?: boolean;
};

export type DataEntryBatch = {
  id: string;
  uploaded_file_id: string | null;
  reporting_month: string | null;
  file_category: MonthlyCloseCategory;
  status: string;
  detected_period_start: string | null;
  detected_period_end: string | null;
  detected_row_count: number;
  mapped_row_count: number;
  unmapped_row_count: number;
  validation_summary: ValidationSummary | null;
  uploaded_file?: { file_name: string | null } | null;
};

export type DataEntryAdjustment = {
  id: string;
  reporting_month: string | null;
  file_category: string;
  source_type: string;
  rows_added: number;
  rows_changed: number;
  rows_deleted: number;
  adjustment_note: string | null;
  created_at: string | null;
};

export type DataEntryLoadResult = {
  userId: string;
  companyId: string;
  companyName: string;
  batch: DataEntryBatch | null;
  rows: DataEntryRow[];
  adjustments: DataEntryAdjustment[];
};

export type DataEntrySavePreview = {
  rowsAdded: number;
  rowsChanged: number;
  rowsDeleted: number;
  unmappedAccounts: number;
  validationSummary: ValidationSummary;
  nextStatus: MonthlyCloseStatus;
};

export type YearlyDataEntryRow = {
  id: string;
  accountName: string;
  department: string;
  category: string;
  notes: string;
  months: Record<string, string>;
  sourceRowIds: Record<string, string>;
  isNew?: boolean;
};

export type YearlyDataEntryWorkspace = {
  userId: string;
  companyId: string;
  companyName: string;
  reportingYear: number;
  fileCategory: MonthlyCloseCategory;
  rows: YearlyDataEntryRow[];
  adjustments: DataEntryAdjustment[];
};

export type YearlyDataEntrySavePreview = {
  rowsAdded: number;
  rowsChanged: number;
  rowsDeleted: number;
  monthsAffected: string[];
  validationSummary: ValidationSummary;
  nextStatus: MonthlyCloseStatus;
  mayResetApproval: boolean;
};

type StagedRowRecord = {
  id: string;
  source_row_number: number | null;
  period: string | null;
  raw_account_name: string | null;
  raw_category: string | null;
  mapped_category: string | null;
  department: string | null;
  amount: number | null;
  raw_data: Record<string, unknown> | null;
  mapping_status: DataEntryRow["mappingStatus"];
  validation_status: DataEntryRow["validationStatus"];
};

export function currentReportingMonth() {
  const today = new Date();

  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
}

export function categoryLabel(category: MonthlyCloseCategory) {
  return (
    monthlyCloseCategories.find((item) => item.id === category)?.title ?? category
  );
}

export async function loadDataEntryWorkspace({
  reportingMonth,
  fileCategory,
  batchId,
}: {
  reportingMonth: string;
  fileCategory: MonthlyCloseCategory;
  batchId?: string | null;
}): Promise<DataEntryLoadResult> {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error("Supabase is not configured for this local environment.");
  }

  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete your company profile before using Data Entry.");
  }

  const supabase = createClient();
  let batch: DataEntryBatch | null = null;

  if (batchId) {
    const { data, error } = await supabase
      .from("import_batches")
      .select("*, uploaded_file:uploaded_files(file_name)")
      .eq("id", batchId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (error) {
      throw new Error(`Data Entry batch load failed: ${error.message}`);
    }

    batch = (data as DataEntryBatch | null) ?? null;
  }

  if (!batch) {
    const { data, error } = await supabase
      .from("import_batches")
      .select("*, uploaded_file:uploaded_files(file_name)")
      .eq("company_id", company.id)
      .eq("reporting_month", reportingMonth)
      .eq("file_category", fileCategory)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Data Entry batch lookup failed: ${error.message}`);
    }

    batch = (data as DataEntryBatch | null) ?? null;
  }

  const rows = batch ? await loadRowsForBatch(batch.id) : [];
  const adjustments = await loadAdjustments(company.id, reportingMonth, fileCategory);

  return {
    userId: user.id,
    companyId: company.id,
    companyName: company.name,
    batch,
    rows,
    adjustments,
  };
}

export async function createManualDataEntryBatch({
  reportingMonth,
  fileCategory,
}: {
  reportingMonth: string;
  fileCategory: MonthlyCloseCategory;
}) {
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete your company profile before creating a worksheet.");
  }

  const supabase = createClient();
  const validationSummary = emptyValidationSummary();
  const { data: batch, error } = await supabase
    .from("import_batches")
    .insert({
      user_id: user.id,
      company_id: company.id,
      uploaded_file_id: null,
      reporting_month: reportingMonth,
      file_category: fileCategory,
      status: "Staged",
      detected_row_count: 0,
      mapped_row_count: 0,
      unmapped_row_count: 0,
      validation_summary: validationSummary,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !batch) {
    throw new Error(`Manual worksheet creation failed: ${error?.message ?? "No batch returned."}`);
  }

  await upsertMonthlyCloseItem({
    userId: user.id,
    companyId: company.id,
    reportingMonth,
    fileCategory,
    uploadedFileId: null,
    fileName: "Manual Worksheet",
    status: "Uploaded",
    validationSummary,
  });

  return batch.id as string;
}

export function createBlankDataEntryRow({
  fileCategory,
  reportingMonth,
}: {
  fileCategory: MonthlyCloseCategory;
  reportingMonth: string;
}): DataEntryRow {
  const rawData = defaultRawData(fileCategory);

  return {
    id: `new-${crypto.randomUUID()}`,
    sourceRowNumber: null,
    period: reportingMonth,
    rawAccountName: "",
    rawCategory: "",
    department: "",
    amount: "",
    notes: "",
    rawData,
    mappingStatus: "Unmapped",
    validationStatus: "Unchecked",
    isNew: true,
  };
}

export async function previewDataEntrySave({
  originalRows,
  nextRows,
  deletedRowIds,
  fileCategory,
}: {
  originalRows: DataEntryRow[];
  nextRows: DataEntryRow[];
  deletedRowIds: Set<string>;
  fileCategory: MonthlyCloseCategory;
}): Promise<DataEntrySavePreview> {
  const analyzedRows = await analyzeRows(nextRows, fileCategory);
  const validationSummary = buildWorksheetValidationSummary({
    rows: analyzedRows,
    fileCategory,
  });
  const unmappedAccounts = analyzedRows.filter(
    (row) =>
      isMappingRequired(fileCategory) &&
      row.rawAccountName &&
      row.mappingStatus !== "Mapped" &&
      row.mappingStatus !== "Ignored",
  ).length;

  return {
    rowsAdded: analyzedRows.filter((row) => row.isNew).length,
    rowsChanged: countChangedRows(originalRows, analyzedRows),
    rowsDeleted: deletedRowIds.size,
    unmappedAccounts,
    validationSummary,
    nextStatus: statusFromValidation({
      fileCategory,
      unmappedRows: unmappedAccounts,
      validationSummary,
    }),
  };
}

export async function saveDataEntryRows({
  importBatchId,
  reportingMonth,
  fileCategory,
  rows,
  deletedRowIds,
  originalRows,
  adjustmentNote,
}: {
  importBatchId: string;
  reportingMonth: string;
  fileCategory: MonthlyCloseCategory;
  rows: DataEntryRow[];
  deletedRowIds: Set<string>;
  originalRows: DataEntryRow[];
  adjustmentNote: string;
}) {
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete your company profile before saving worksheet changes.");
  }

  const supabase = createClient();
  const { data: batch, error: batchLoadError } = await supabase
    .from("import_batches")
    .select("*")
    .eq("id", importBatchId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (batchLoadError || !batch) {
    throw new Error(`Data Entry batch save failed: ${batchLoadError?.message ?? "Batch not found."}`);
  }

  const preview = await previewDataEntrySave({
    originalRows,
    nextRows: rows,
    deletedRowIds,
    fileCategory,
  });
  const analyzedRows = await analyzeRows(rows, fileCategory);
  const sourceType = batch.uploaded_file_id
    ? "Manual Adjustment"
    : "Manual Entry";

  const { error: deleteError } = await supabase
    .from("import_staged_rows")
    .delete()
    .eq("import_batch_id", importBatchId);

  if (deleteError) {
    throw new Error(`Existing staged rows clear failed: ${deleteError.message}`);
  }

  const rowsToInsert = analyzedRows.map((row, index) => ({
    user_id: user.id,
    company_id: company.id,
    import_batch_id: importBatchId,
    uploaded_file_id: batch.uploaded_file_id ?? null,
    file_category: fileCategory,
    source_row_number: index + 1,
    period: row.period || null,
    raw_account_name: row.rawAccountName || null,
    raw_category: row.rawCategory || null,
    mapped_category:
      row.mappingStatus === "Mapped" ? row.rawData.mappedCategory || null : null,
    department: row.department || null,
    amount: parseAmount(row.amount),
    raw_data: {
      ...row.rawData,
      notes: row.notes,
      source_type: sourceType,
      manually_adjusted: true,
    },
    mapping_status: row.mappingStatus,
    validation_status: row.validationStatus,
    updated_at: new Date().toISOString(),
  }));

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("import_staged_rows")
      .insert(rowsToInsert);

    if (insertError) {
      throw new Error(`Worksheet staged rows save failed: ${insertError.message}`);
    }
  }

  const periods = analyzedRows
    .map((row) => row.period)
    .filter(Boolean)
    .sort();
  const validationSummary = preview.validationSummary;
  const mappedRowCount = analyzedRows.filter(
    (row) => row.mappingStatus === "Mapped" || row.mappingStatus === "Ignored",
  ).length;
  const unmappedRowCount = analyzedRows.length - mappedRowCount;

  const { error: batchUpdateError } = await supabase
    .from("import_batches")
    .update({
      status:
        preview.nextStatus === "Needs Mapping"
          ? "Needs Mapping"
          : preview.nextStatus === "Needs review"
            ? "Ready for Review"
            : "Staged",
      detected_period_start: periods[0] ?? null,
      detected_period_end: periods.at(-1) ?? null,
      detected_row_count: analyzedRows.length,
      mapped_row_count: mappedRowCount,
      unmapped_row_count: unmappedRowCount,
      validation_summary: validationSummary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", importBatchId);

  if (batchUpdateError) {
    throw new Error(`Import batch update failed: ${batchUpdateError.message}`);
  }

  await upsertMonthlyCloseItem({
    userId: user.id,
    companyId: company.id,
    reportingMonth,
    fileCategory,
    uploadedFileId: batch.uploaded_file_id ?? null,
    fileName: batch.uploaded_file_id
      ? "Manually Adjusted Upload"
      : "Manual Worksheet",
    status: preview.nextStatus,
    validationSummary,
  });

  const { error: adjustmentError } = await supabase
    .from("data_entry_adjustments")
    .insert({
      user_id: user.id,
      company_id: company.id,
      import_batch_id: importBatchId,
      uploaded_file_id: batch.uploaded_file_id ?? null,
      reporting_month: reportingMonth,
      file_category: fileCategory,
      source_type: sourceType,
      rows_added: preview.rowsAdded,
      rows_changed: preview.rowsChanged,
      rows_deleted: preview.rowsDeleted,
      adjustment_note: adjustmentNote || null,
    });

  if (adjustmentError) {
    throw new Error(`Data Entry adjustment log failed: ${adjustmentError.message}`);
  }

  return preview;
}

export async function loadYearlyDataEntryWorkspace({
  reportingYear,
  fileCategory,
}: {
  reportingYear: number;
  fileCategory: MonthlyCloseCategory;
}): Promise<YearlyDataEntryWorkspace> {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error("Supabase is not configured for this local environment.");
  }

  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete your company profile before using Data Entry.");
  }

  const supabase = createClient();
  const start = `${reportingYear}-01-01`;
  const end = `${reportingYear}-12-31`;
  const { data: stagedRows, error } = await supabase
    .from("import_staged_rows")
    .select("*")
    .eq("company_id", company.id)
    .eq("file_category", fileCategory)
    .gte("period", start)
    .lte("period", end)
    .order("period", { ascending: true })
    .order("raw_account_name", { ascending: true });

  if (error) {
    throw new Error(`Yearly worksheet rows load failed: ${error.message}`);
  }

  let rows = yearlyRowsFromStagedRows((stagedRows ?? []) as StagedRowRecord[], reportingYear);

  if (rows.length === 0) {
    rows = await loadYearlyRowsFromReportingTables({
      companyId: company.id,
      reportingYear,
      fileCategory,
    });
  }

  const adjustments = await loadYearAdjustments(company.id, reportingYear, fileCategory);

  return {
    userId: user.id,
    companyId: company.id,
    companyName: company.name,
    reportingYear,
    fileCategory,
    rows,
    adjustments,
  };
}

export function createBlankYearlyDataEntryRow(): YearlyDataEntryRow {
  return {
    id: `new-${crypto.randomUUID()}`,
    accountName: "",
    department: "",
    category: "",
    notes: "",
    months: Object.fromEntries(monthKeys().map((month) => [month, ""])),
    sourceRowIds: {},
    isNew: true,
  };
}

export async function previewYearlyDataEntrySave({
  originalRows,
  nextRows,
  deletedRowIds,
  fileCategory,
}: {
  originalRows: YearlyDataEntryRow[];
  nextRows: YearlyDataEntryRow[];
  deletedRowIds: Set<string>;
  fileCategory: MonthlyCloseCategory;
}): Promise<YearlyDataEntrySavePreview> {
  const validationSummary = buildYearlyValidationSummary(nextRows, fileCategory);
  const monthsAffected = changedMonths(originalRows, nextRows, deletedRowIds);

  return {
    rowsAdded: nextRows.filter((row) => row.isNew).length,
    rowsChanged: countChangedYearlyRows(originalRows, nextRows),
    rowsDeleted: deletedRowIds.size,
    monthsAffected,
    validationSummary,
    nextStatus: statusFromValidation({
      fileCategory,
      unmappedRows: isMappingRequired(fileCategory)
        ? nextRows.filter((row) => row.accountName.trim()).length
        : 0,
      validationSummary,
    }),
    mayResetApproval: monthsAffected.length > 0,
  };
}

export async function saveYearlyDataEntryRows({
  reportingYear,
  fileCategory,
  rows,
  originalRows,
  deletedRowIds,
  adjustmentNote,
}: {
  reportingYear: number;
  fileCategory: MonthlyCloseCategory;
  rows: YearlyDataEntryRow[];
  originalRows: YearlyDataEntryRow[];
  deletedRowIds: Set<string>;
  adjustmentNote: string;
}) {
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete your company profile before saving worksheet changes.");
  }

  const preview = await previewYearlyDataEntrySave({
    originalRows,
    nextRows: rows,
    deletedRowIds,
    fileCategory,
  });
  const supabase = createClient();
  const months = preview.monthsAffected.length > 0
    ? preview.monthsAffected
    : monthKeys(reportingYear);

  for (const month of months) {
    const monthRows = rows.flatMap((row, rowIndex) => {
      const amount = row.months[month]?.trim() ?? "";

      if (!amount && !row.accountName && !row.category && !row.department) {
        return [];
      }

      return [{
        row,
        rowIndex,
        amount,
      }];
    });

    const validationSummary = buildYearlyValidationSummary(
      rows.filter((row) => monthRows.some((item) => item.row.id === row.id)),
      fileCategory,
    );

    const { data: existingBatches } = await supabase
      .from("import_batches")
      .select("id")
      .eq("company_id", company.id)
      .eq("file_category", fileCategory)
      .eq("reporting_month", month)
      .is("uploaded_file_id", null);
    const existingBatchIds = (existingBatches ?? []).map((batch) => String(batch.id));

    if (existingBatchIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("import_batches")
        .delete()
        .in("id", existingBatchIds);

      if (deleteError) {
        throw new Error(`Existing manual worksheet cleanup failed: ${deleteError.message}`);
      }
    }

    const mappedRowCount = monthRows.filter((item) => Boolean(item.row.category)).length;
    const unmappedRowCount = Math.max(0, monthRows.length - mappedRowCount);
    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        user_id: user.id,
        company_id: company.id,
        uploaded_file_id: null,
        reporting_month: month,
        file_category: fileCategory,
        status: preview.nextStatus === "Needs Mapping" ? "Needs Mapping" : "Staged",
        detected_period_start: month,
        detected_period_end: month,
        detected_row_count: monthRows.length,
        mapped_row_count: mappedRowCount,
        unmapped_row_count: unmappedRowCount,
        validation_summary: validationSummary,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      throw new Error(`Manual worksheet batch save failed: ${batchError?.message ?? "No batch returned."}`);
    }

    if (monthRows.length > 0) {
      const { error: rowError } = await supabase.from("import_staged_rows").insert(
        monthRows.map(({ row, rowIndex, amount }) => ({
          user_id: user.id,
          company_id: company.id,
          import_batch_id: batch.id,
          uploaded_file_id: null,
          file_category: fileCategory,
          source_row_number: rowIndex + 1,
          period: month,
          raw_account_name: row.accountName || null,
          raw_category: row.category || null,
          mapped_category: row.category || null,
          department: row.department || null,
          amount: parseAmount(amount),
          raw_data: {
            notes: row.notes,
            source_type: "Manual Entry",
            yearly_grid: true,
          },
          mapping_status: row.category ? "Mapped" : "Unmapped",
          validation_status: amount && row.accountName ? "Valid" : "Warning",
          updated_at: new Date().toISOString(),
        })),
      );

      if (rowError) {
        throw new Error(`Manual worksheet row save failed: ${rowError.message}`);
      }
    }

    await upsertMonthlyCloseItem({
      userId: user.id,
      companyId: company.id,
      reportingMonth: month,
      fileCategory,
      uploadedFileId: null,
      fileName: "Manual Yearly Worksheet",
      status: preview.nextStatus,
      validationSummary,
    });

    await supabase.from("data_entry_adjustments").insert({
      user_id: user.id,
      company_id: company.id,
      import_batch_id: batch.id,
      uploaded_file_id: null,
      reporting_month: month,
      file_category: fileCategory,
      source_type: "Manual Entry",
      rows_added: preview.rowsAdded,
      rows_changed: preview.rowsChanged,
      rows_deleted: preview.rowsDeleted,
      adjustment_note: adjustmentNote || null,
    });
  }

  return preview;
}

async function loadRowsForBatch(importBatchId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("import_staged_rows")
    .select("*")
    .eq("import_batch_id", importBatchId)
    .order("source_row_number", { ascending: true });

  if (error) {
    throw new Error(`Data Entry rows load failed: ${error.message}`);
  }

  return ((data ?? []) as StagedRowRecord[]).map(rowFromRecord);
}

async function loadAdjustments(
  companyId: string,
  reportingMonth: string,
  fileCategory: MonthlyCloseCategory,
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("data_entry_adjustments")
    .select("*")
    .eq("company_id", companyId)
    .eq("reporting_month", reportingMonth)
    .eq("file_category", fileCategory)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.error("Data Entry adjustments load failed", error);
    return [];
  }

  return (data ?? []) as DataEntryAdjustment[];
}

function rowFromRecord(row: StagedRowRecord): DataEntryRow {
  const rawData = normalizeRawData(row.raw_data);

  return {
    id: row.id,
    sourceRowNumber: row.source_row_number,
    period: row.period ?? "",
    rawAccountName: row.raw_account_name ?? "",
    rawCategory: row.raw_category ?? "",
    department: row.department ?? "",
    amount: row.amount === null || row.amount === undefined ? "" : String(row.amount),
    notes: rawData.notes ?? "",
    rawData,
    mappingStatus: row.mapping_status,
    validationStatus: row.validation_status,
  };
}

function yearlyRowsFromStagedRows(rows: StagedRowRecord[], reportingYear: number) {
  const grouped = new Map<string, YearlyDataEntryRow>();

  rows.forEach((row) => {
    const rawData = normalizeRawData(row.raw_data);
    const accountName = row.raw_account_name ?? rawData.account_name ?? "Unlabeled row";
    const category = row.mapped_category ?? row.raw_category ?? "";
    const department = row.department ?? "";
    const notes = rawData.notes ?? "";
    const key = `${accountName}|${department}|${category}`;
    const period = normalizeYearMonth(row.period ?? "");

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        accountName,
        department,
        category,
        notes,
        months: Object.fromEntries(monthKeys(reportingYear).map((month) => [month, ""])),
        sourceRowIds: {},
      });
    }

    const groupedRow = grouped.get(key);

    if (groupedRow && period) {
      groupedRow.months[period] =
        row.amount === null || row.amount === undefined ? "" : String(row.amount);
      groupedRow.sourceRowIds[period] = row.id;
    }
  });

  return [...grouped.values()];
}

async function loadYearlyRowsFromReportingTables({
  companyId,
  reportingYear,
  fileCategory,
}: {
  companyId: string;
  reportingYear: number;
  fileCategory: MonthlyCloseCategory;
}) {
  const supabase = createClient();
  const start = `${reportingYear}-01`;
  const end = `${reportingYear}-12`;

  if (fileCategory === "actuals" || fileCategory === "budget") {
    const table = fileCategory === "actuals" ? "financial_actuals" : "budget_rows";
    const { data, error } = await supabase
      .from(table)
      .select("id, month, account, category, amount")
      .eq("company_id", companyId)
      .gte("month", start)
      .lte("month", end)
      .order("account", { ascending: true });

    if (error) {
      throw new Error(`Reporting rows load failed: ${error.message}`);
    }

    const rows = (data ?? []).map((row) => ({
      id: String(row.id),
      source_row_number: null,
      period: normalizeYearMonth(String(row.month ?? "")),
      raw_account_name: String(row.account ?? ""),
      raw_category: String(row.category ?? ""),
      mapped_category: String(row.category ?? ""),
      department: null,
      amount: Number(row.amount ?? 0),
      raw_data: { source_type: "Reporting Table" },
      mapping_status: "Mapped" as const,
      validation_status: "Valid" as const,
    }));

    return yearlyRowsFromStagedRows(rows, reportingYear);
  }

  if (fileCategory === "cash") {
    const { data, error } = await supabase
      .from("cash_rows")
      .select("id, month, cash_balance")
      .eq("company_id", companyId)
      .gte("month", start)
      .lte("month", end)
      .order("month", { ascending: true });

    if (error) {
      throw new Error(`Cash rows load failed: ${error.message}`);
    }

    return yearlyRowsFromStagedRows(
      (data ?? []).map((row) => ({
        id: String(row.id),
        source_row_number: null,
        period: normalizeYearMonth(String(row.month ?? "")),
        raw_account_name: "Ending Cash",
        raw_category: "Cash Report",
        mapped_category: "Cash Report",
        department: null,
        amount: Number(row.cash_balance ?? 0),
        raw_data: { source_type: "Reporting Table" },
        mapping_status: "Mapped" as const,
        validation_status: "Valid" as const,
      })),
      reportingYear,
    );
  }

  return [];
}

async function loadYearAdjustments(
  companyId: string,
  reportingYear: number,
  fileCategory: MonthlyCloseCategory,
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("data_entry_adjustments")
    .select("*")
    .eq("company_id", companyId)
    .eq("file_category", fileCategory)
    .gte("reporting_month", `${reportingYear}-01-01`)
    .lte("reporting_month", `${reportingYear}-12-31`)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.error("Yearly Data Entry adjustments load failed", error);
    return [];
  }

  return (data ?? []) as DataEntryAdjustment[];
}

function buildYearlyValidationSummary(
  rows: YearlyDataEntryRow[],
  fileCategory: MonthlyCloseCategory,
): ValidationSummary {
  const issues: DataQualityIssue[] = [];
  let warningRows = 0;

  rows.forEach((row, index) => {
    const hasAnyAmount = Object.values(row.months).some((value) => value.trim());

    if (requiresAccount(fileCategory) && !row.accountName.trim() && hasAnyAmount) {
      warningRows += 1;
      issues.push({
        id: `${fileCategory}-yearly-account-${index}`,
        fileCategory,
        categoryLabel: categoryLabel(fileCategory),
        severity: "Warning",
        message: "A row has values but no account or line-item name.",
        suggestedFix: "Add an account or line-item name before approval.",
      });
    }

    Object.entries(row.months).forEach(([month, value]) => {
      if (value.trim() && parseAmount(value) === null) {
        warningRows += 1;
        issues.push({
          id: `${fileCategory}-yearly-amount-${index}-${month}`,
          fileCategory,
          categoryLabel: categoryLabel(fileCategory),
          severity: "Warning",
          message: `${row.accountName || "A row"} has a non-numeric value in ${month}.`,
          suggestedFix: "Enter a numeric value or leave the month blank.",
        });
      }
    });
  });

  return {
    totalRows: rows.length,
    validRows: Math.max(0, rows.length - warningRows),
    warningRows,
    errorRows: 0,
    issues,
  };
}

function countChangedYearlyRows(
  originalRows: YearlyDataEntryRow[],
  nextRows: YearlyDataEntryRow[],
) {
  const originalById = new Map(originalRows.map((row) => [row.id, yearlyRowSignature(row)]));

  return nextRows.filter((row) => {
    if (row.isNew) return false;
    return originalById.get(row.id) !== yearlyRowSignature(row);
  }).length;
}

function changedMonths(
  originalRows: YearlyDataEntryRow[],
  nextRows: YearlyDataEntryRow[],
  deletedRowIds: Set<string>,
) {
  const originalById = new Map(originalRows.map((row) => [row.id, row]));
  const changed = new Set<string>();

  const monthList = nextRows[0]?.months
    ? Object.keys(nextRows[0].months)
    : originalRows[0]?.months
      ? Object.keys(originalRows[0].months)
      : monthKeys();

  nextRows.forEach((row) => {
    const original = originalById.get(row.id);

    monthList.forEach((month) => {
      if (!original || original.months[month] !== row.months[month]) {
        if ((row.months[month] ?? "").trim() || original?.months[month]) {
          changed.add(month);
        }
      }
    });
  });

  originalRows
    .filter((row) => deletedRowIds.has(row.id))
    .forEach((row) => {
      Object.entries(row.months).forEach(([month, value]) => {
        if (value.trim()) changed.add(month);
      });
    });

  return [...changed].sort();
}

function yearlyRowSignature(row: YearlyDataEntryRow) {
  return JSON.stringify({
    accountName: row.accountName,
    department: row.department,
    category: row.category,
    notes: row.notes,
    months: row.months,
  });
}

function monthKeys(year = new Date().getFullYear()) {
  return Array.from({ length: 12 }, (_, index) =>
    `${year}-${String(index + 1).padStart(2, "0")}-01`,
  );
}

function normalizeYearMonth(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return value;
}

async function analyzeRows(rows: DataEntryRow[], fileCategory: MonthlyCloseCategory) {
  const mappingLookup = await loadAccountMappingLookup();

  return rows.map((row) => {
    const amount = parseAmount(row.amount);
    const messages = validateRow(row, fileCategory, amount);
    const mappingKey = normalizeAccountName(row.rawAccountName);
    const savedMapping = row.rawAccountName ? mappingLookup.get(mappingKey) : "";
    const suggestion = row.rawAccountName ? suggestAccountMapping(row.rawAccountName) : null;
    const mappingStatus: DataEntryRow["mappingStatus"] =
      row.mappingStatus === "Ignored"
        ? "Ignored"
        : savedMapping
          ? "Mapped"
          : isMappingRequired(fileCategory) && row.rawAccountName
            ? suggestion?.category === "Uncategorized"
              ? "Unmapped"
              : "Suggested"
            : "Mapped";

    if (
      isMappingRequired(fileCategory) &&
      row.rawAccountName &&
      mappingStatus !== "Mapped" &&
      mappingStatus !== "Ignored"
    ) {
      messages.push("Unmapped account");
    }

    const validationStatus: DataEntryRow["validationStatus"] = messages.some((message) =>
      ["Missing period", "Missing amount"].includes(message),
    )
      ? "Critical"
      : messages.length > 0
        ? "Warning"
        : "Valid";

    return {
      ...row,
      amount: row.amount,
      mappingStatus,
      validationStatus,
      rawData: {
        ...row.rawData,
        mappedCategory: savedMapping || suggestion?.category || "",
        validationMessages: messages.join("; "),
      },
    };
  });
}

function validateRow(
  row: DataEntryRow,
  fileCategory: MonthlyCloseCategory,
  amount: number | null,
) {
  const messages: string[] = [];

  if (!row.period) {
    messages.push("Missing period");
  }

  if (requiresAccount(fileCategory) && !row.rawAccountName.trim()) {
    messages.push("Missing account");
  }

  if (requiresAmount(fileCategory) && amount === null) {
    messages.push("Missing amount");
  }

  if (
    amount !== null &&
    amount < 0 &&
    `${row.rawAccountName} ${row.rawCategory}`.toLowerCase().includes("revenue")
  ) {
    messages.push("Negative revenue");
  }

  return messages;
}

function buildWorksheetValidationSummary({
  rows,
  fileCategory,
}: {
  rows: DataEntryRow[];
  fileCategory: MonthlyCloseCategory;
}): ValidationSummary {
  const issues: DataQualityIssue[] = [];
  const groupedMessages = new Map<string, number>();
  const duplicateKeys = new Set<string>();
  const seen = new Set<string>();

  rows.forEach((row) => {
    String(row.rawData.validationMessages ?? "")
      .split(";")
      .map((message) => message.trim())
      .filter(Boolean)
      .forEach((message) => {
        groupedMessages.set(message, (groupedMessages.get(message) ?? 0) + 1);
      });

    const key = `${row.period}|${row.rawAccountName.toLowerCase()}|${row.rawCategory.toLowerCase()}|${row.amount}`;

    if (key.replace(/\|/g, "")) {
      if (seen.has(key)) duplicateKeys.add(key);
      else seen.add(key);
    }
  });

  if (duplicateKeys.size > 0) {
    groupedMessages.set("Duplicate row", duplicateKeys.size);
  }

  [...groupedMessages.entries()].forEach(([message, count], index) => {
    issues.push({
      id: `${fileCategory}-worksheet-${index}`,
      fileCategory,
      categoryLabel: categoryLabel(fileCategory),
      severity: severityForMessage(message),
      message: formatIssue(message, count),
      rowCount: count,
      suggestedFix: suggestedFix(message),
    });
  });

  const periods = rows.map((row) => row.period).filter(Boolean);
  const uniquePeriods = new Set(periods);

  if (uniquePeriods.size > 1) {
    issues.push({
      id: `${fileCategory}-worksheet-multi-period`,
      fileCategory,
      categoryLabel: categoryLabel(fileCategory),
      severity: "Info",
      message: "Multiple periods are included in this worksheet.",
      suggestedFix:
        "Confirm this is intentional. Rows preserve their own periods for staging.",
    });
  }

  const errorRows = rows.filter((row) => row.validationStatus === "Critical").length;
  const warningRows = rows.filter((row) => row.validationStatus === "Warning").length;

  return {
    totalRows: rows.length,
    validRows: rows.length - errorRows - warningRows,
    warningRows,
    errorRows,
    issues,
  };
}

function countChangedRows(originalRows: DataEntryRow[], nextRows: DataEntryRow[]) {
  const originalById = new Map(originalRows.map((row) => [row.id, rowSignature(row)]));

  return nextRows.filter((row) => {
    if (row.isNew) {
      return false;
    }

    return originalById.get(row.id) !== rowSignature(row);
  }).length;
}

function rowSignature(row: DataEntryRow) {
  return JSON.stringify({
    period: row.period,
    rawAccountName: row.rawAccountName,
    rawCategory: row.rawCategory,
    department: row.department,
    amount: row.amount,
    notes: row.notes,
    rawData: row.rawData,
    mappingStatus: row.mappingStatus,
  });
}

async function upsertMonthlyCloseItem({
  userId,
  companyId,
  reportingMonth,
  fileCategory,
  uploadedFileId,
  fileName,
  status,
  validationSummary,
}: {
  userId: string;
  companyId: string;
  reportingMonth: string;
  fileCategory: MonthlyCloseCategory;
  uploadedFileId: string | null;
  fileName: string;
  status: MonthlyCloseStatus;
  validationSummary: ValidationSummary;
}) {
  const supabase = createClient();
  const { error } = await supabase.from("monthly_close_items").upsert(
    {
      user_id: userId,
      company_id: companyId,
      reporting_month: reportingMonth,
      file_category: fileCategory,
      status,
      file_name: fileName,
      uploaded_file_id: uploadedFileId,
      uploaded_at: new Date().toISOString(),
      approved_at: null,
      approved_by: null,
      validation_summary: validationSummary,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,reporting_month,file_category" },
  );

  if (error) {
    throw new Error(`Monthly close item update failed: ${error.message}`);
  }
}

function statusFromValidation({
  fileCategory,
  unmappedRows,
  validationSummary,
}: {
  fileCategory: MonthlyCloseCategory;
  unmappedRows: number;
  validationSummary: ValidationSummary;
}): MonthlyCloseStatus {
  if (isMappingRequired(fileCategory) && unmappedRows > 0) {
    return "Needs Mapping";
  }

  if (validationSummary.issues.some((issue) => issue.severity !== "Info")) {
    return "Needs review";
  }

  return "Uploaded";
}

function defaultRawData(fileCategory: MonthlyCloseCategory): Record<string, string> {
  if (fileCategory === "cash") {
    return { beginningCash: "", cashIn: "", cashOut: "", endingCash: "" };
  }

  if (fileCategory === "payroll") {
    return { benefitsLoad: "", startDate: "", status: "Active" };
  }

  if (fileCategory === "revenue") {
    return { newExisting: "Existing" };
  }

  if (fileCategory === "kpi") {
    return { unit: "" };
  }

  if (fileCategory === "notes") {
    return { owner: "", priority: "Medium" };
  }

  return {};
}

function normalizeRawData(rawData: Record<string, unknown> | null) {
  return Object.fromEntries(
    Object.entries(rawData ?? {}).map(([key, value]) => [
      key,
      typeof value === "string" ? value : String(value ?? ""),
    ]),
  );
}

function parseAmount(value: string) {
  if (!value.trim()) {
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

function isMappingRequired(fileCategory: MonthlyCloseCategory) {
  return fileCategory === "actuals" || fileCategory === "budget";
}

function requiresAccount(fileCategory: MonthlyCloseCategory) {
  return !["cash", "notes"].includes(fileCategory);
}

function requiresAmount(fileCategory: MonthlyCloseCategory) {
  return fileCategory !== "notes";
}

function emptyValidationSummary(): ValidationSummary {
  return {
    totalRows: 0,
    validRows: 0,
    warningRows: 0,
    errorRows: 0,
    issues: [],
  };
}

function severityForMessage(message: string): ValidationSeverity {
  if (["Missing period", "Missing amount"].includes(message)) {
    return "Critical";
  }

  return "Warning";
}

function formatIssue(message: string, count: number) {
  if (message === "Missing period") return `${count} row(s) are missing period.`;
  if (message === "Missing account") return `${count} row(s) are missing account name.`;
  if (message === "Missing amount") return `${count} row(s) are missing amount.`;
  if (message === "Negative revenue") return `${count} row(s) show negative revenue.`;
  if (message === "Unmapped account") return `${count} row(s) have unmapped accounts.`;
  if (message === "Duplicate row") return `${count} duplicate row(s) detected.`;
  return `${count} row(s): ${message}.`;
}

function suggestedFix(message: string) {
  if (message === "Unmapped account") return "Complete Account Mapping before approval.";
  if (message === "Missing period") return "Add a period using YYYY-MM-01.";
  if (message === "Missing amount") return "Add a numeric amount.";
  if (message === "Missing account") return "Add an account or line-item name.";
  if (message === "Negative revenue") return "Confirm the sign or correct the revenue row.";
  if (message === "Duplicate row") return "Remove duplicates or confirm they are intentional.";
  return "Review and correct the worksheet row.";
}
