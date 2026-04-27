"use client";

import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import type {
  ParsedBankTransactionsCsv,
  ParsedCashCsv,
  ParsedFinancialCsv,
  ParsedForecastCsv,
  ParsedPayrollCsv,
  ParsedPipelineCsv,
  ParsedRevenueDetailCsv,
  UploadedBankTransactionRow,
  UploadedCashRow,
  UploadedFinancialRow,
  UploadedForecastRow,
  UploadedPayrollRow,
  UploadedPipelineRow,
  UploadedRevenueDetailRow,
} from "@/types/financial";
import type { AICfoBrief } from "@/lib/localDataStore";

export type UploadDataType =
  | "actuals"
  | "budget"
  | "cash"
  | "payroll"
  | "revenueDetail"
  | "pipeline"
  | "bankTransactions"
  | "forecast";

type ParsedUpload =
  | ParsedFinancialCsv
  | ParsedCashCsv
  | ParsedPayrollCsv
  | ParsedRevenueDetailCsv
  | ParsedPipelineCsv
  | ParsedBankTransactionsCsv
  | ParsedForecastCsv;

export type SupabaseCompany = {
  id: string;
  owner_user_id: string;
  name: string;
  industry: string | null;
  stage: string | null;
  employees: number | null;
  currency: string | null;
  fiscal_year_start_month: number | null;
};

function ensureSupabase() {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error("Supabase is not configured for this local environment.");
  }

  return createClient();
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function getCurrentCompany() {
  if (!hasSupabaseBrowserEnv()) {
    return { user: null, company: null };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, company: null };
  }

  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load current company", error);
  }

  return { user, company: (company as SupabaseCompany | null) ?? null };
}

export async function getFinancialRows() {
  return getFinancialRowsByType("actuals");
}

export async function getBudgetRows() {
  return getFinancialRowsByType("budget");
}

export async function getForecastRows() {
  return getFinancialRowsByType("forecast");
}

async function getFinancialRowsByType(dataType: string) {
  const { company } = await getCurrentCompany();

  if (!company) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("financial_rows")
    .select("*")
    .eq("company_id", company.id)
    .eq("data_type", dataType)
    .order("month", { ascending: true })
    .order("account", { ascending: true });

  if (error) {
    console.error(`Failed to load ${dataType} rows`, error);
    return [];
  }

  return data ?? [];
}

export async function getCashBalances() {
  return getRows("cash_balances", "month");
}

export async function getPayrollRows() {
  return getRows("payroll_rows", "month");
}

export async function getRevenueDetailRows() {
  return getRows("revenue_detail_rows", "month");
}

export async function getPipelineRows() {
  return getRows("pipeline_rows", "expected_close_month");
}

export async function getBankTransactions() {
  return getRows("bank_transaction_rows", "date");
}

export async function getReports() {
  return getRows("reports", "created_at", false);
}

export async function getLatestAIBrief() {
  const { company } = await getCurrentCompany();

  if (!company) {
    return null;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("ai_briefs")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to load latest AI brief", error);
    return null;
  }

  return data;
}

async function getRows(table: string, orderBy: string, ascending = true) {
  const { company } = await getCurrentCompany();

  if (!company) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("company_id", company.id)
    .order(orderBy, { ascending });

  if (error) {
    console.error(`Failed to load ${table}`, error);
    return [];
  }

  return data ?? [];
}

export async function persistUploadedCsv({
  dataType,
  displayName,
  file,
  parsed,
}: {
  dataType: UploadDataType;
  displayName: string;
  file: File | null;
  parsed: ParsedUpload;
}) {
  const supabase = ensureSupabase();
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and create a company profile before saving to Supabase.");
  }

  await clearSupabaseData(dataType);

  let storagePath: string | null = null;

  if (file) {
    storagePath = `${user.id}/${company.id}/${dataType}/${Date.now()}-${sanitizeFileName(
      file.name,
    )}`;

    const { error: uploadError } = await supabase.storage
      .from("finance-uploads")
      .upload(storagePath, file, {
        contentType: file.type || "text/csv",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`CSV storage upload failed: ${uploadError.message}`);
    }
  }

  const { data: uploadedFile, error: fileError } = await supabase
    .from("uploaded_files")
    .insert({
      company_id: company.id,
      user_id: user.id,
      data_type: dataType,
      file_name: file?.name ?? `${displayName}.csv`,
      storage_path: storagePath,
      period_start: getPeriodBoundary(parsed.rows, "start"),
      period_end: getPeriodBoundary(parsed.rows, "end"),
      status: "loaded",
      row_count: parsed.summary.totalRows,
      error_count: parsed.summary.errorRows,
      warning_count: parsed.summary.warningRows,
    })
    .select("id")
    .single();

  if (fileError || !uploadedFile) {
    throw new Error(`Upload metadata save failed: ${fileError?.message ?? "No file row returned."}`);
  }

  await insertParsedRows({
    dataType,
    companyId: company.id,
    uploadedFileId: uploadedFile.id,
    rows: parsed.rows,
  });

  return { uploadedFileId: uploadedFile.id as string, storagePath };
}

export async function clearSupabaseData(dataType: UploadDataType) {
  if (!hasSupabaseBrowserEnv()) {
    return;
  }

  const supabase = createClient();
  const { company } = await getCurrentCompany();

  if (!company) {
    return;
  }

  const { data: files } = await supabase
    .from("uploaded_files")
    .select("storage_path")
    .eq("company_id", company.id)
    .eq("data_type", dataType);

  const storagePaths =
    files?.map((file) => file.storage_path).filter((path): path is string => Boolean(path)) ??
    [];

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("finance-uploads")
      .remove(storagePaths);

    if (storageError) {
      console.error(`${dataType} storage cleanup failed`, storageError);
    }
  }

  if (dataType === "actuals" || dataType === "budget" || dataType === "forecast") {
    const { error } = await supabase
      .from("financial_rows")
      .delete()
      .eq("company_id", company.id)
      .eq("data_type", dataType);

    if (error) {
      throw new Error(`${dataType} rows clear failed: ${error.message}`);
    }
  } else {
    const tableByType: Record<Exclude<UploadDataType, "actuals" | "budget" | "forecast">, string> = {
      cash: "cash_balances",
      payroll: "payroll_rows",
      revenueDetail: "revenue_detail_rows",
      pipeline: "pipeline_rows",
      bankTransactions: "bank_transaction_rows",
    };

    const { error } = await supabase
      .from(tableByType[dataType])
      .delete()
      .eq("company_id", company.id);

    if (error) {
      throw new Error(`${dataType} rows clear failed: ${error.message}`);
    }
  }

  const { error: fileError } = await supabase
    .from("uploaded_files")
    .delete()
    .eq("company_id", company.id)
    .eq("data_type", dataType);

  if (fileError) {
    throw new Error(`${dataType} upload metadata clear failed: ${fileError.message}`);
  }
}

async function insertParsedRows({
  dataType,
  companyId,
  uploadedFileId,
  rows,
}: {
  dataType: UploadDataType;
  companyId: string;
  uploadedFileId: string;
  rows: ParsedUpload["rows"];
}) {
  if (dataType === "actuals" || dataType === "budget" || dataType === "forecast") {
    const financialRows = (rows as (UploadedFinancialRow | UploadedForecastRow)[])
      .filter((row) => row.amount !== null)
      .map((row) => ({
        company_id: companyId,
        uploaded_file_id: uploadedFileId,
        data_type: dataType,
        month: row.month,
        account: row.account,
        category: row.category,
        amount: row.amount,
        forecast_version: "forecastVersion" in row ? row.forecastVersion : null,
      }));

    await insertRows("financial_rows", financialRows);
    return;
  }

  if (dataType === "cash") {
    const cashRows = (rows as UploadedCashRow[])
      .filter((row) => row.cashBalance !== null)
      .map((row) => ({
        company_id: companyId,
        uploaded_file_id: uploadedFileId,
        month: row.month,
        cash_balance: row.cashBalance,
      }));

    await insertRows("cash_balances", cashRows);
    return;
  }

  if (dataType === "payroll") {
    const payrollRows = (rows as UploadedPayrollRow[]).map((row) => ({
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

    await insertRows("payroll_rows", payrollRows);
    return;
  }

  if (dataType === "revenueDetail") {
    const revenueRows = (rows as UploadedRevenueDetailRow[])
      .filter((row) => row.amount !== null)
      .map((row) => ({
        company_id: companyId,
        uploaded_file_id: uploadedFileId,
        month: row.month,
        customer: row.customer,
        product: row.product,
        revenue_type: row.revenueType,
        amount: row.amount,
      }));

    await insertRows("revenue_detail_rows", revenueRows);
    return;
  }

  if (dataType === "pipeline") {
    const pipelineRows = (rows as UploadedPipelineRow[])
      .filter((row) => row.amount !== null && row.probability !== null)
      .map((row) => ({
        company_id: companyId,
        uploaded_file_id: uploadedFileId,
        deal_name: row.dealName,
        customer: row.customer,
        stage: row.stage,
        amount: row.amount,
        probability: row.probability,
        expected_close_month: row.expectedCloseMonth,
        owner: row.owner,
      }));

    await insertRows("pipeline_rows", pipelineRows);
    return;
  }

  const bankRows = (rows as UploadedBankTransactionRow[])
    .filter((row) => row.amount !== null)
    .map((row) => ({
      company_id: companyId,
      uploaded_file_id: uploadedFileId,
      date: row.date,
      description: row.description,
      category: row.category,
      amount: row.amount,
    }));

  await insertRows("bank_transaction_rows", bankRows);
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

function getPeriodBoundary(rows: ParsedUpload["rows"], boundary: "start" | "end") {
  const periods = rows
    .map((row) => {
      if ("month" in row) {
        return row.month;
      }

      if ("expectedCloseMonth" in row) {
        return row.expectedCloseMonth;
      }

      if ("date" in row) {
        return row.date.slice(0, 7);
      }

      return "";
    })
    .filter(Boolean)
    .sort();

  if (periods.length === 0) {
    return null;
  }

  return boundary === "start" ? periods[0] : periods[periods.length - 1];
}

export async function saveAIBriefToSupabase({
  period,
  sourceSummary,
  aiOutput,
}: {
  period: string;
  sourceSummary: unknown;
  aiOutput: AICfoBrief;
}) {
  const supabase = ensureSupabase();
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    return;
  }

  const { error } = await supabase.from("ai_briefs").insert({
    company_id: company.id,
    user_id: user.id,
    period,
    source_summary: sourceSummary,
    ai_output: aiOutput,
    status: "generated",
  });

  if (error) {
    throw new Error(`AI brief save failed: ${error.message}`);
  }
}
