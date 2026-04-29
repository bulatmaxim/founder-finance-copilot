"use client";

import { setSelectedForecastVersionId } from "@/lib/forecastVersions";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { getCurrentCompany, type SupabaseCompany } from "@/lib/supabase/data";
import type { MonthlyCloseCategory } from "@/lib/monthlyClose";
import type { AICfoBrief } from "@/lib/localDataStore";

type DemoWorkspaceStatus = {
  hasCompany: boolean;
  hasExistingData: boolean;
  hasDemoData: boolean;
  companyName: string | null;
};

type DemoSeedResult = {
  companyName: string;
  reportingMonth: string;
  forecastVersionName: string;
  rowsSeeded: number;
};

type FinancialLine = {
  month: string;
  account: string;
  category: string;
  amount: number;
};

type ForecastMetric = {
  month: string;
  revenue: number;
  costOfRevenue: number;
  salesAndMarketing: number;
  researchAndDevelopment: number;
  generalAndAdministrative: number;
  cashBalance: number;
};

const demoReportingMonth = "2026-04-01";
const demoMonths = Array.from({ length: 12 }, (_, index) => {
  const month = String(index + 1).padStart(2, "0");

  return {
    monthKey: `2026-${month}`,
    monthDate: `2026-${month}-01`,
    index,
  };
});

const demoMappings = [
  ["AWS Hosting", "Hosting / Infrastructure", "Product & Engineering"],
  ["Stripe Fees", "Payment Processing", "G&A"],
  ["Customer Support", "Customer Support", "Customer Support"],
  ["Gusto Payroll", "G&A Payroll", "G&A"],
  ["Engineering Payroll", "Engineering Payroll", "Product & Engineering"],
  ["Sales & Marketing Payroll", "Sales & Marketing Payroll", "Sales & Marketing"],
  ["HubSpot", "Sales & Marketing Software", "Sales & Marketing"],
  ["Salesforce", "Sales & Marketing Software", "Sales & Marketing"],
  ["Legal Fees", "Legal & Professional Services", "G&A"],
  ["Insurance", "Insurance", "G&A"],
  ["Rent & Office", "Rent & Office", "G&A"],
  ["Software Subscriptions", "Software Subscriptions", "G&A"],
  ["Contractor Expense", "Other Operating Expense", "Operations"],
  ["Travel & Entertainment", "Travel & Entertainment", "Sales & Marketing"],
  ["Subscription Revenue", "Subscription Revenue", ""],
  ["Usage Revenue", "Usage Revenue", ""],
  ["Services Revenue", "Services Revenue", ""],
] as const;

const categoryLabels: Record<MonthlyCloseCategory, string> = {
  actuals: "P&L / Actuals",
  budget: "Budget",
  cash: "Cash Report",
  payroll: "Headcount / Payroll",
  revenue: "Revenue Data",
  kpi: "KPI Inputs",
  notes: "Notes / Assumptions",
};

const uploadedFileConfig: {
  category: MonthlyCloseCategory;
  dataType: string;
  fileName: string;
  status: string;
}[] = [
  {
    category: "actuals",
    dataType: "actuals",
    fileName: "Demo Data - P&L Actuals.csv",
    status: "loaded",
  },
  {
    category: "budget",
    dataType: "budget",
    fileName: "Demo Data - Budget.csv",
    status: "loaded",
  },
  {
    category: "cash",
    dataType: "cash",
    fileName: "Demo Data - Cash Report.csv",
    status: "loaded",
  },
  {
    category: "payroll",
    dataType: "payroll",
    fileName: "Demo Data - Headcount Payroll.csv",
    status: "loaded",
  },
  {
    category: "revenue",
    dataType: "revenueDetail",
    fileName: "Demo Data - Revenue Data.csv",
    status: "loaded",
  },
  {
    category: "kpi",
    dataType: "kpi",
    fileName: "Demo Data - KPI Inputs.csv",
    status: "loaded",
  },
  {
    category: "notes",
    dataType: "notes",
    fileName: "Demo Data - Notes Assumptions.csv",
    status: "loaded",
  },
];

export async function getDemoWorkspaceStatus(): Promise<DemoWorkspaceStatus> {
  if (!hasSupabaseBrowserEnv()) {
    return {
      hasCompany: false,
      hasExistingData: false,
      hasDemoData: false,
      companyName: null,
    };
  }

  const { company } = await getCurrentCompany();

  if (!company) {
    return {
      hasCompany: false,
      hasExistingData: false,
      hasDemoData: false,
      companyName: null,
    };
  }

  const supabase = createClient();
  const [actuals, budget, cash, uploads, forecasts, reports, demoUploads] =
    await Promise.all([
      hasRows("financial_actuals", company.id),
      hasRows("budget_rows", company.id),
      hasRows("cash_rows", company.id),
      hasRows("uploaded_files", company.id),
      hasRows("forecast_versions", company.id),
      hasRows("monthly_reports", company.id),
      supabase
        .from("uploaded_files")
        .select("id")
        .eq("company_id", company.id)
        .eq("status", "demo_data")
        .limit(1),
    ]);

  return {
    hasCompany: true,
    hasExistingData:
      actuals || budget || cash || uploads || forecasts || reports,
    hasDemoData: Boolean(demoUploads.data?.length),
    companyName: company.name,
  };
}

export async function loadDemoCompanyData(): Promise<DemoSeedResult> {
  ensureSupabase();
  const { user, company } = await getCurrentCompany();

  if (!user) {
    throw new Error("Log in before loading demo company data.");
  }

  const activeCompany = await upsertDemoCompany(company, user.id);

  await removePriorDemoData(activeCompany.id);

  const actualRows = buildActualRows();
  const budgetRows = buildBudgetRows();
  const cashRows = buildCashRows(actualRows);
  const payrollRows = buildPayrollRows();
  const revenueRows = buildRevenueRows();
  const kpiRows = buildKpiRows();
  const notesRows = buildNotesRows();
  const uploadIds = await insertDemoUploadedFiles({
    userId: user.id,
    companyId: activeCompany.id,
    rowCounts: {
      actuals: actualRows.length,
      budget: budgetRows.length,
      cash: cashRows.length,
      payroll: payrollRows.length,
      revenue: revenueRows.length,
      kpi: kpiRows.length,
      notes: notesRows.length,
    },
  });

  await seedAccountMappings(user.id, activeCompany.id);
  await Promise.all([
    insertRows(
      "financial_actuals",
      actualRows.map((row) => ({
        company_id: activeCompany.id,
        uploaded_file_id: uploadIds.actuals,
        month: row.month,
        account: row.account,
        category: row.category,
        amount: row.amount,
        source: "demo_data",
      })),
    ),
    insertRows(
      "budget_rows",
      budgetRows.map((row) => ({
        company_id: activeCompany.id,
        uploaded_file_id: uploadIds.budget,
        month: row.month,
        account: row.account,
        category: row.category,
        amount: row.amount,
        source: "demo_data",
      })),
    ),
    insertRows(
      "cash_rows",
      cashRows.map((row) => ({
        company_id: activeCompany.id,
        uploaded_file_id: uploadIds.cash,
        month: row.month,
        cash_balance: row.cashBalance,
        source: "demo_data",
      })),
    ),
    insertRows(
      "payroll_rows",
      payrollRows.map((row) => ({
        company_id: activeCompany.id,
        uploaded_file_id: uploadIds.payroll,
        month: row.month,
        employee_name: row.employeeName,
        department: row.department,
        role: row.role,
        salary: row.salary,
        benefits: row.benefits,
        payroll_tax: row.payrollTax,
        bonus: 0,
        start_date: row.startDate,
        status: row.status,
      })),
    ),
    insertRows(
      "revenue_detail_rows",
      revenueRows.map((row) => ({
        company_id: activeCompany.id,
        uploaded_file_id: uploadIds.revenue,
        month: row.month,
        customer: row.customer,
        product: row.product,
        revenue_type: row.revenueType,
        amount: row.amount,
      })),
    ),
  ]);

  const batchIds = await seedImportBatches({
    userId: user.id,
    companyId: activeCompany.id,
    uploadIds,
    rowCounts: {
      actuals: actualRows.length,
      budget: budgetRows.length,
      cash: cashRows.length,
      payroll: payrollRows.length,
      revenue: revenueRows.length,
      kpi: kpiRows.length,
      notes: notesRows.length,
    },
  });

  await seedStagedRows({
    userId: user.id,
    companyId: activeCompany.id,
    uploadIds,
    batchIds,
    actualRows,
    budgetRows,
    cashRows,
    payrollRows,
    revenueRows,
    kpiRows,
    notesRows,
  });
  await seedMonthlyCloseItems({
    userId: user.id,
    companyId: activeCompany.id,
    uploadIds,
    batchIds,
  });
  const rollingForecastId = await seedForecastVersions({
    userId: user.id,
    companyId: activeCompany.id,
    actualRows,
    budgetRows,
    cashRows,
  });
  await seedAiBrief(user.id, activeCompany.id);
  await seedMonthlyReport(user.id, activeCompany.id, rollingForecastId);

  setSelectedForecastVersionId(rollingForecastId);

  return {
    companyName: "Northstar Analytics",
    reportingMonth: demoReportingMonth,
    forecastVersionName: "FY2026 5+7 Forecast",
    rowsSeeded:
      actualRows.length +
      budgetRows.length +
      cashRows.length +
      payrollRows.length +
      revenueRows.length +
      kpiRows.length +
      notesRows.length,
  };
}

async function upsertDemoCompany(
  company: SupabaseCompany | null,
  userId: string,
) {
  const supabase = createClient();
  const payload = {
    owner_user_id: userId,
    name: "Northstar Analytics",
    industry: "B2B SaaS / Data Infrastructure",
    stage: "Series A",
    employees: 42,
    currency: "USD",
    fiscal_year_start_month: 1,
    current_cash_balance: 8350000,
    monthly_burn: 430000,
    updated_at: new Date().toISOString(),
  };

  if (company) {
    const { data, error } = await supabase
      .from("companies")
      .update(payload)
      .eq("id", company.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Demo company update failed: ${error?.message ?? "No company returned."}`);
    }

    return data as SupabaseCompany;
  }

  const { data, error } = await supabase
    .from("companies")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Demo company creation failed: ${error?.message ?? "No company returned."}`);
  }

  return data as SupabaseCompany;
}

async function removePriorDemoData(companyId: string) {
  const supabase = createClient();
  const { data: demoUploads } = await supabase
    .from("uploaded_files")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "demo_data");
  const uploadIds =
    demoUploads?.map((row) => String(row.id)).filter(Boolean) ?? [];

  if (uploadIds.length > 0) {
    await Promise.all([
      deleteByUploadedFiles("financial_actuals", uploadIds),
      deleteByUploadedFiles("budget_rows", uploadIds),
      deleteByUploadedFiles("cash_rows", uploadIds),
      deleteByUploadedFiles("payroll_rows", uploadIds),
      deleteByUploadedFiles("revenue_detail_rows", uploadIds),
      supabase.from("import_batches").delete().in("uploaded_file_id", uploadIds),
      supabase.from("uploaded_files").delete().in("id", uploadIds),
    ]);
  }

  await Promise.all([
    supabase
      .from("monthly_close_items")
      .delete()
      .eq("company_id", companyId)
      .eq("reporting_month", demoReportingMonth)
      .like("file_name", "Demo Data%"),
    supabase
      .from("monthly_close_activity")
      .delete()
      .eq("company_id", companyId)
      .eq("reporting_month", demoReportingMonth)
      .eq("action", "loaded_demo_data"),
    supabase
      .from("account_mappings")
      .delete()
      .eq("company_id", companyId)
      .eq("statement_type", "Demo Data"),
    supabase
      .from("forecast_versions")
      .delete()
      .eq("company_id", companyId)
      .ilike("notes", "%Demo Data%"),
    supabase
      .from("ai_briefs")
      .delete()
      .eq("company_id", companyId)
      .contains("source_summary", { is_demo_data: true }),
    supabase
      .from("monthly_reports")
      .delete()
      .eq("company_id", companyId)
      .contains("data_source", { is_demo_data: true }),
    supabase
      .from("generated_reports")
      .delete()
      .eq("company_id", companyId)
      .contains("data_source", { is_demo_data: true }),
  ]);
}

async function deleteByUploadedFiles(table: string, uploadIds: string[]) {
  const supabase = createClient();

  return supabase.from(table).delete().in("uploaded_file_id", uploadIds);
}

async function insertDemoUploadedFiles({
  userId,
  companyId,
  rowCounts,
}: {
  userId: string;
  companyId: string;
  rowCounts: Record<MonthlyCloseCategory, number>;
}) {
  const now = new Date().toISOString();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("uploaded_files")
    .insert(
      uploadedFileConfig.map((item) => ({
        user_id: userId,
        company_id: companyId,
        data_type: item.dataType,
        file_category: item.category,
        file_name: item.fileName,
        storage_path: null,
        reporting_month: demoReportingMonth,
        period_start: "2026-01",
        period_end: "2026-12",
        status: "demo_data",
        row_count: rowCounts[item.category],
        error_count: 0,
        warning_count: 0,
        uploaded_at: now,
        is_active: true,
      })),
    )
    .select("id, file_category");

  if (error || !data) {
    throw new Error(`Demo uploaded file metadata failed: ${error?.message ?? "No files returned."}`);
  }

  return Object.fromEntries(
    data.map((row) => [String(row.file_category), String(row.id)]),
  ) as Record<MonthlyCloseCategory, string>;
}

async function seedAccountMappings(userId: string, companyId: string) {
  await insertRows(
    "account_mappings",
    demoMappings.map(([rawAccountName, normalizedCategory, department]) => ({
      user_id: userId,
      company_id: companyId,
      raw_account_name: rawAccountName,
      normalized_category: normalizedCategory,
      department: department || null,
      statement_type: "Demo Data",
      status: "Mapped",
      updated_at: new Date().toISOString(),
    })),
    { upsert: true, onConflict: "company_id,raw_account_name" },
  );
}

async function seedImportBatches({
  userId,
  companyId,
  uploadIds,
  rowCounts,
}: {
  userId: string;
  companyId: string;
  uploadIds: Record<MonthlyCloseCategory, string>;
  rowCounts: Record<MonthlyCloseCategory, number>;
}) {
  const validationSummary = (category: MonthlyCloseCategory, rowCount: number) =>
    buildDemoValidationSummary(category, rowCount);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .insert(
      uploadedFileConfig.map((item) => {
        const rowCount = rowCounts[item.category];

        return {
          user_id: userId,
          company_id: companyId,
          uploaded_file_id: uploadIds[item.category],
          reporting_month: demoReportingMonth,
          file_category: item.category,
          status:
            item.category === "kpi" || item.category === "notes"
              ? "Ready for Review"
              : "Approved",
          detected_period_start: "2026-01-01",
          detected_period_end: "2026-12-01",
          detected_row_count: rowCount,
          mapped_row_count:
            item.category === "actuals" || item.category === "budget"
              ? rowCount
              : 0,
          unmapped_row_count: 0,
          validation_summary: validationSummary(item.category, rowCount),
          updated_at: new Date().toISOString(),
        };
      }),
    )
    .select("id, file_category");

  if (error || !data) {
    throw new Error(`Demo import batch save failed: ${error?.message ?? "No batches returned."}`);
  }

  return Object.fromEntries(
    data.map((row) => [String(row.file_category), String(row.id)]),
  ) as Record<MonthlyCloseCategory, string>;
}

async function seedStagedRows({
  userId,
  companyId,
  uploadIds,
  batchIds,
  actualRows,
  budgetRows,
  cashRows,
  payrollRows,
  revenueRows,
  kpiRows,
  notesRows,
}: {
  userId: string;
  companyId: string;
  uploadIds: Record<MonthlyCloseCategory, string>;
  batchIds: Record<MonthlyCloseCategory, string>;
  actualRows: FinancialLine[];
  budgetRows: FinancialLine[];
  cashRows: ReturnType<typeof buildCashRows>;
  payrollRows: ReturnType<typeof buildPayrollRows>;
  revenueRows: ReturnType<typeof buildRevenueRows>;
  kpiRows: ReturnType<typeof buildKpiRows>;
  notesRows: ReturnType<typeof buildNotesRows>;
}) {
  const mappingLookup = new Map<string, string>(
    demoMappings.map(([rawAccountName, normalizedCategory]) => [
      rawAccountName,
      normalizedCategory,
    ]),
  );
  const rows = [
    ...actualRows.map((row, index) =>
      stagedRow({
        userId,
        companyId,
        uploadId: uploadIds.actuals,
        batchId: batchIds.actuals,
        category: "actuals",
        index,
        period: `${row.month}-01`,
        rawAccountName: row.account,
        rawCategory: row.category,
        mappedCategory: mappingLookup.get(row.account) ?? "Uncategorized",
        department: null,
        amount: row.amount,
        rawData: row,
      }),
    ),
    ...budgetRows.map((row, index) =>
      stagedRow({
        userId,
        companyId,
        uploadId: uploadIds.budget,
        batchId: batchIds.budget,
        category: "budget",
        index,
        period: `${row.month}-01`,
        rawAccountName: row.account,
        rawCategory: row.category,
        mappedCategory: mappingLookup.get(row.account) ?? "Uncategorized",
        department: null,
        amount: row.amount,
        rawData: row,
      }),
    ),
    ...cashRows.map((row, index) =>
      stagedRow({
        userId,
        companyId,
        uploadId: uploadIds.cash,
        batchId: batchIds.cash,
        category: "cash",
        index,
        period: `${row.month}-01`,
        rawAccountName: "Ending Cash",
        rawCategory: "Cash Report",
        mappedCategory: null,
        department: null,
        amount: row.cashBalance,
        rawData: row,
      }),
    ),
    ...payrollRows.map((row, index) =>
      stagedRow({
        userId,
        companyId,
        uploadId: uploadIds.payroll,
        batchId: batchIds.payroll,
        category: "payroll",
        index,
        period: `${row.month}-01`,
        rawAccountName: row.employeeName,
        rawCategory: row.role,
        mappedCategory: null,
        department: row.department,
        amount: row.salary,
        rawData: row,
      }),
    ),
    ...revenueRows.map((row, index) =>
      stagedRow({
        userId,
        companyId,
        uploadId: uploadIds.revenue,
        batchId: batchIds.revenue,
        category: "revenue",
        index,
        period: `${row.month}-01`,
        rawAccountName: row.customer,
        rawCategory: row.revenueType,
        mappedCategory: null,
        department: null,
        amount: row.amount,
        rawData: row,
      }),
    ),
    ...kpiRows.map((row, index) =>
      stagedRow({
        userId,
        companyId,
        uploadId: uploadIds.kpi,
        batchId: batchIds.kpi,
        category: "kpi",
        index,
        period: `${row.month}-01`,
        rawAccountName: row.kpi,
        rawCategory: row.unit,
        mappedCategory: null,
        department: null,
        amount: row.value,
        rawData: row,
      }),
    ),
    ...notesRows.map((row, index) =>
      stagedRow({
        userId,
        companyId,
        uploadId: uploadIds.notes,
        batchId: batchIds.notes,
        category: "notes",
        index,
        period: `${row.month}-01`,
        rawAccountName: row.topic,
        rawCategory: row.priority,
        mappedCategory: null,
        department: null,
        amount: null,
        rawData: row,
      }),
    ),
  ];

  await insertRows("import_staged_rows", rows);
}

async function seedMonthlyCloseItems({
  userId,
  companyId,
  uploadIds,
  batchIds,
}: {
  userId: string;
  companyId: string;
  uploadIds: Record<MonthlyCloseCategory, string>;
  batchIds: Record<MonthlyCloseCategory, string>;
}) {
  const now = new Date().toISOString();
  const approvedCategories = new Set<MonthlyCloseCategory>([
    "actuals",
    "budget",
    "cash",
    "payroll",
    "revenue",
  ]);

  await insertRows(
    "monthly_close_items",
    uploadedFileConfig.map((item) => {
      const rowCount = item.category === "notes" ? 4 : 12;
      const isApproved = approvedCategories.has(item.category);

      return {
        user_id: userId,
        company_id: companyId,
        reporting_month: demoReportingMonth,
        file_category: item.category,
        status: isApproved ? "Approved" : "Uploaded",
        file_name: item.fileName,
        storage_path: null,
        uploaded_file_id: uploadIds[item.category],
        uploaded_at: now,
        approved_at: isApproved ? now : null,
        approved_by: isApproved ? userId : null,
        validation_summary: buildDemoValidationSummary(item.category, rowCount),
        updated_at: now,
      };
    }),
    { upsert: true, onConflict: "company_id,reporting_month,file_category" },
  );

  await insertRows("monthly_close_activity", [
    {
      user_id: userId,
      company_id: companyId,
      reporting_month: demoReportingMonth,
      file_category: "actuals",
      action: "loaded_demo_data",
      details: {
        source: "Demo Data",
        import_batch_ids: batchIds,
        company: "Northstar Analytics",
      },
    },
  ]);
}

async function seedForecastVersions({
  userId,
  companyId,
  actualRows,
  budgetRows,
  cashRows,
}: {
  userId: string;
  companyId: string;
  actualRows: FinancialLine[];
  budgetRows: FinancialLine[];
  cashRows: ReturnType<typeof buildCashRows>;
}) {
  const supabase = createClient();
  const { data: budgetVersion, error: budgetError } = await supabase
    .from("forecast_versions")
    .insert({
      user_id: userId,
      company_id: companyId,
      name: "FY2026 Budget",
      fiscal_year: 2026,
      version_type: "Budget",
      status: "Approved",
      actuals_through_month: null,
      notes: "Demo Data - original FY2026 budget baseline.",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (budgetError || !budgetVersion) {
    throw new Error(`Demo budget forecast save failed: ${budgetError?.message ?? "No version returned."}`);
  }

  const budgetMetrics = metricsByMonth(budgetRows, cashRows);
  await insertRows(
    "forecast_version_rows",
    forecastRowsFromMetrics({
      userId,
      companyId,
      forecastVersionId: String(budgetVersion.id),
      metrics: budgetMetrics,
      rowTypeForMonth: () => "Budget",
      sourceForMonth: () => "Demo Data budget baseline",
      lockForMonth: () => false,
    }),
  );

  const { data: rollingVersion, error: rollingError } = await supabase
    .from("forecast_versions")
    .insert({
      user_id: userId,
      company_id: companyId,
      name: "FY2026 5+7 Forecast",
      fiscal_year: 2026,
      version_type: "Rolling Forecast",
      status: "Published",
      actuals_through_month: "2026-05-01",
      source_version_id: budgetVersion.id,
      notes: "Demo Data - Jan-May actualized, Jun-Dec forecast.",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (rollingError || !rollingVersion) {
    throw new Error(`Demo rolling forecast save failed: ${rollingError?.message ?? "No version returned."}`);
  }

  const actualMetrics = metricsByMonth(actualRows, cashRows);
  const forecastMetrics = mergeActualAndFutureMetrics(actualMetrics, budgetMetrics);
  await insertRows(
    "forecast_version_rows",
    forecastRowsFromMetrics({
      userId,
      companyId,
      forecastVersionId: String(rollingVersion.id),
      metrics: forecastMetrics,
      rowTypeForMonth: (month) => (month <= "2026-05-01" ? "Actual" : "Forecast"),
      sourceForMonth: (month) =>
        month <= "2026-05-01"
          ? "Demo Data approved actuals"
          : "Demo Data driver-based forecast",
      lockForMonth: (month) => month <= "2026-05-01",
    }),
  );
  await seedForecastDriverAssumptions(userId, companyId, String(rollingVersion.id));

  return String(rollingVersion.id);
}

async function seedForecastDriverAssumptions(
  userId: string,
  companyId: string,
  forecastVersionId: string,
) {
  const assumptions = [
    ["Revenue", "Starting MRR", 475000, "currency"],
    ["Revenue", "Monthly growth rate %", 5, "percent"],
    ["Revenue", "Churn rate %", 2, "percent"],
    ["Revenue", "Expansion revenue %", 1.4, "percent"],
    ["Revenue", "New customer revenue", 18000, "currency"],
    ["Payroll", "Current headcount", 42, "count"],
    ["Payroll", "Planned hires", 12, "count"],
    ["Payroll", "Average salary", 142000, "currency"],
    ["Payroll", "Benefits/payroll tax load %", 24, "percent"],
    ["Hosting", "Hosting cost as % of revenue", 9, "percent"],
    ["Hosting", "Fixed monthly hosting cost", 12000, "currency"],
    ["Software", "Fixed monthly software cost", 26000, "currency"],
    ["Software", "Software cost per employee", 420, "currency"],
    ["Professional Services", "Fixed monthly amount", 18000, "currency"],
    ["Professional Services", "One-time legal/professional fee", 0, "currency"],
    ["Other Operating Expenses", "Fixed monthly amount", 36000, "currency"],
    ["Other Operating Expenses", "Growth rate %", 1, "percent"],
  ];

  await insertRows(
    "forecast_driver_assumptions",
    assumptions.map(([driverType, name, value, unit]) => ({
      user_id: userId,
      company_id: companyId,
      forecast_version_id: forecastVersionId,
      driver_type: driverType,
      assumption_name: name,
      assumption_value: value,
      assumption_unit: unit,
      start_month: null,
      end_month: null,
      notes: "Demo Data driver assumptions for Northstar Analytics.",
      updated_at: new Date().toISOString(),
    })),
    {
      upsert: true,
      onConflict:
        "company_id,forecast_version_id,driver_type,assumption_name",
    },
  );
}

async function seedAiBrief(userId: string, companyId: string) {
  const brief: AICfoBrief = {
    executiveSummary:
      "Northstar Analytics closed Apr 2026 with revenue slightly below budget due to delayed enterprise expansion timing, while usage revenue outperformed plan on stronger customer activity. Payroll was favorable because two planned hires shifted into May, and cash runway remains above 12 months.",
    priorityInsights: [
      {
        title: "Enterprise expansion timing pressured revenue",
        severity: "Medium",
        category: "Revenue",
        summary:
          "Subscription revenue was below budget in Apr 2026 as two enterprise expansions moved into May.",
        whyItMatters:
          "Expansion timing can affect forecast confidence and investor narrative if slippage persists.",
        recommendedAction:
          "Review expansion pipeline timing before finalizing the FY2026 5+7 Forecast.",
        sourceMetrics: ["Source: Demo Data", "Reporting month: Apr 2026"],
      },
      {
        title: "Usage revenue outperformed plan",
        severity: "Low",
        category: "Revenue",
        summary:
          "Usage revenue exceeded budget as existing customers increased data processing activity.",
        whyItMatters:
          "Higher usage revenue can improve net revenue retention if gross margins remain controlled.",
        recommendedAction:
          "Monitor usage cohorts and update revenue assumptions if the activity is durable.",
        sourceMetrics: ["Usage Revenue: above plan", "Source: Demo Data"],
      },
      {
        title: "Cloud cost efficiency needs monitoring",
        severity: "Medium",
        category: "Expenses",
        summary:
          "Hosting costs are increasing with usage growth and should be monitored against gross margin targets.",
        whyItMatters:
          "Infrastructure cost creep can offset revenue upside in data infrastructure businesses.",
        recommendedAction:
          "Track AWS cost per usage unit and review committed-spend opportunities.",
        sourceMetrics: ["AWS Hosting", "Source: Demo Data"],
      },
    ],
    runwayWarning:
      "Cash runway remains above 12 months, but management should keep hiring timing tied to revenue conversion.",
    forecastRecommendation:
      "Update hiring timing and cloud cost assumptions before finalizing the FY2026 5+7 Forecast.",
    managementQuestions: [
      "Which enterprise expansions slipped from April to May?",
      "Is usage revenue outperformance durable or timing-driven?",
      "Should hiring start dates be shifted in the 5+7 Forecast?",
      "What is the current AWS cost per usage unit trend?",
    ],
    recommendedActions: [
      "Monitor cloud cost efficiency as usage scales.",
      "Update hiring timing before finalizing the 5+7 Forecast.",
      "Prepare investor commentary explaining revenue mix and runway strength.",
    ],
    investorUpdateBullets: [
      "Apr 2026 revenue was slightly below budget due to delayed enterprise expansion.",
      "Usage revenue was above plan on stronger customer activity.",
      "Runway remains above 12 months with payroll favorability from shifted hires.",
    ],
    boardSlideSummary:
      "Northstar remains on solid footing with strong usage momentum and sufficient runway, while expansion timing and infrastructure efficiency should be monitored.",
    dataQualityNotes: [
      "Source: Demo Data.",
      "P&L, budget, cash, revenue, and payroll demo files are staged in the Data Room.",
    ],
    generatedAt: new Date().toISOString(),
    reportingPeriod: "Apr 2026",
  };

  await insertRows("ai_briefs", [
    {
      user_id: userId,
      company_id: companyId,
      period: "Apr 2026",
      source_summary: {
        source: "Demo Data",
        is_demo_data: true,
        reporting_month: demoReportingMonth,
      },
      ai_output: brief,
      status: "generated",
    },
  ]);
}

async function seedMonthlyReport(
  userId: string,
  companyId: string,
  forecastVersionId: string,
) {
  const commentary = {
    executiveSummary:
      "Northstar Analytics delivered a credible Apr 2026 close with usage revenue strength, delayed enterprise expansion timing, favorable payroll timing, and runway above the 12-month operating threshold.",
    revenueCommentary:
      "Revenue was slightly below budget because subscription expansion slipped into May, partially offset by usage revenue above plan.",
    expenseCommentary:
      "Payroll was favorable because two planned hires shifted into May. Hosting costs are rising with usage and should remain a focus area.",
    cashCommentary:
      "Cash runway remains above 12 months. Burn remains manageable, but hiring timing should stay tied to revenue conversion.",
    forecastCommentary:
      "The FY2026 5+7 Forecast actualizes Jan-May and keeps Jun-Dec as forecast months using driver assumptions.",
    risks:
      "Enterprise expansion delays may affect forward revenue confidence.\nAWS Hosting growth could pressure gross margin if usage efficiency does not improve.",
    recommendations:
      "Review cloud cost efficiency.\nUpdate hiring timing before finalizing the 5+7 Forecast.\nPrepare investor commentary on usage revenue strength and expansion timing.",
  };

  const dataSource = {
    is_demo_data: true,
    source: "Demo Data",
    reportingMonth: demoReportingMonth,
    actuals: "Actuals Source: Demo Data",
    budget: "Budget Source: Demo Data",
    cash: "Cash Source: Demo Data",
    forecastVersionId,
    forecastVersionName: "FY2026 5+7 Forecast",
  };

  await insertRows("monthly_reports", [
    {
      user_id: userId,
      company_id: companyId,
      reporting_month: demoReportingMonth,
      report_type: "Monthly Performance Review",
      title: "Apr 2026 Monthly Performance Review",
      status: "Ready",
      forecast_version_id: forecastVersionId,
      data_source: dataSource,
      commentary,
      sections: {
        cfoBrief: true,
        budgetVsActuals: true,
        forecastUpdate: true,
        cashRunway: true,
        kpiSummary: true,
        risksRecommendations: true,
      },
      generated_file_path: null,
      updated_at: new Date().toISOString(),
    },
  ]);

  await insertRows("generated_reports", [
    {
      user_id: userId,
      company_id: companyId,
      report_type: "monthly_performance_review",
      period: demoReportingMonth,
      title: "Apr 2026 Monthly Performance Review",
      file_name: "Demo Data - Apr 2026 Monthly Performance Review.pptx",
      storage_path: null,
      data_source: dataSource,
    },
  ]);
}

function buildActualRows(): FinancialLine[] {
  return demoMonths.flatMap(({ monthKey, index }) => {
    const growth = 1 + index * 0.035;
    const aprilExpansionDelay = index === 3 ? -26000 : 0;

    return [
      line(monthKey, "Subscription Revenue", "Revenue", 405000 * growth + aprilExpansionDelay),
      line(monthKey, "Usage Revenue", "Revenue", 78000 * (1 + index * 0.052) + (index === 3 ? 18000 : 0)),
      line(monthKey, "Services Revenue", "Revenue", 47000 + index * 2200),
      line(monthKey, "AWS Hosting", "Cost of Revenue", 52000 * (1 + index * 0.055)),
      line(monthKey, "Stripe Fees", "Cost of Revenue", 13200 * (1 + index * 0.04)),
      line(monthKey, "Customer Support", "Cost of Revenue", 43000 + index * 1800),
      line(monthKey, "Gusto Payroll", "Operating Expense", 69000 + index * 900),
      line(monthKey, "Engineering Payroll", "Operating Expense", 218000 + index * 7200),
      line(monthKey, "Sales & Marketing Payroll", "Operating Expense", 126000 + index * 4700 - (index === 3 ? 18000 : 0)),
      line(monthKey, "HubSpot", "Operating Expense", 11800 + index * 250),
      line(monthKey, "Salesforce", "Operating Expense", 15400 + index * 300),
      line(monthKey, "Legal Fees", "Operating Expense", 23000 + (index === 2 ? 14000 : 0)),
      line(monthKey, "Insurance", "Operating Expense", 10200),
      line(monthKey, "Rent & Office", "Operating Expense", 26000),
      line(monthKey, "Software Subscriptions", "Operating Expense", 28800 + index * 1000),
      line(monthKey, "Contractor Expense", "Operating Expense", 35500 + index * 900),
      line(monthKey, "Travel & Entertainment", "Operating Expense", 11200 + index * 650),
    ];
  });
}

function buildBudgetRows(): FinancialLine[] {
  return demoMonths.flatMap(({ monthKey, index }) => {
    const growth = 1 + index * 0.04;

    return [
      line(monthKey, "Subscription Revenue", "Revenue", 418000 * growth),
      line(monthKey, "Usage Revenue", "Revenue", 75000 * (1 + index * 0.045)),
      line(monthKey, "Services Revenue", "Revenue", 50000 + index * 2500),
      line(monthKey, "AWS Hosting", "Cost of Revenue", 50000 * (1 + index * 0.046)),
      line(monthKey, "Stripe Fees", "Cost of Revenue", 12800 * (1 + index * 0.04)),
      line(monthKey, "Customer Support", "Cost of Revenue", 45000 + index * 2100),
      line(monthKey, "Gusto Payroll", "Operating Expense", 70000 + index * 1000),
      line(monthKey, "Engineering Payroll", "Operating Expense", 224000 + index * 8200),
      line(monthKey, "Sales & Marketing Payroll", "Operating Expense", 135000 + index * 5200),
      line(monthKey, "HubSpot", "Operating Expense", 12500 + index * 260),
      line(monthKey, "Salesforce", "Operating Expense", 15800 + index * 350),
      line(monthKey, "Legal Fees", "Operating Expense", 24000),
      line(monthKey, "Insurance", "Operating Expense", 10400),
      line(monthKey, "Rent & Office", "Operating Expense", 26500),
      line(monthKey, "Software Subscriptions", "Operating Expense", 29500 + index * 900),
      line(monthKey, "Contractor Expense", "Operating Expense", 34000 + index * 1200),
      line(monthKey, "Travel & Entertainment", "Operating Expense", 12500 + index * 700),
    ];
  });
}

function buildCashRows(actualRows: FinancialLine[]) {
  let cashBalance = 8900000;
  const actualsByMonth = groupFinancialRowsByMonth(actualRows);

  return demoMonths.map(({ monthKey }) => {
    const monthRows = actualsByMonth.get(monthKey) ?? [];
    const revenue = sumRows(monthRows, (row) => row.category === "Revenue");
    const expenses = sumRows(monthRows, (row) => row.category !== "Revenue");
    const workingCapitalTiming = monthKey === "2026-04" ? 50000 : -25000;
    const cashOut = expenses + 95000;
    const cashIn = revenue + workingCapitalTiming;

    cashBalance += cashIn - cashOut;

    return {
      month: monthKey,
      beginningCash: Math.round(cashBalance - cashIn + cashOut),
      cashIn: Math.round(cashIn),
      cashOut: Math.round(cashOut),
      cashBalance: Math.round(cashBalance),
      burn: Math.max(0, Math.round(cashOut - cashIn)),
      runway: Math.max(12, Math.round(cashBalance / Math.max(1, cashOut - cashIn))),
    };
  });
}

function buildPayrollRows() {
  const departments = [
    ["Product & Engineering", "Engineering Manager", 4, 188000],
    ["Product & Engineering", "Senior Engineer", 12, 165000],
    ["Product & Engineering", "Data Platform Engineer", 6, 158000],
    ["Product & Engineering", "Product Manager", 3, 172000],
    ["Sales & Marketing", "Account Executive", 5, 132000],
    ["Sales & Marketing", "Customer Success Manager", 4, 118000],
    ["Sales & Marketing", "Demand Gen Manager", 2, 128000],
    ["G&A", "Finance / Operations", 3, 145000],
    ["G&A", "Executive / Founder", 3, 210000],
  ] as const;
  let employeeIndex = 0;

  return departments.flatMap(([department, role, count, salary]) =>
    Array.from({ length: count }, () => {
      employeeIndex += 1;

      return {
        month: "2026-04",
        employeeName: `${role} ${employeeIndex}`,
        department,
        role,
        salary,
        benefits: Math.round((salary / 12) * 0.18),
        payrollTax: Math.round((salary / 12) * 0.06),
        startDate: employeeIndex <= 36 ? "2025-09-01" : "2026-03-01",
        status: "Active",
      };
    }),
  );
}

function buildRevenueRows() {
  const segments = [
    ["Enterprise", "Data Platform", "Subscription", 0.48],
    ["Mid-Market", "Data Platform", "Subscription", 0.24],
    ["Usage Expansion", "Usage", "Usage", 0.18],
    ["Services", "Implementation", "Services", 0.1],
  ] as const;
  const actualsByMonth = groupFinancialRowsByMonth(buildActualRows());

  return demoMonths.flatMap(({ monthKey }) => {
    const revenue = sumRows(
      actualsByMonth.get(monthKey) ?? [],
      (row) => row.category === "Revenue",
    );

    return segments.map(([customer, product, revenueType, percent]) => ({
      month: monthKey,
      customer,
      product,
      revenueType,
      amount: Math.round(revenue * percent),
      customerStatus: customer === "Usage Expansion" ? "Existing" : "New / Existing",
    }));
  });
}

function buildKpiRows() {
  return demoMonths.flatMap(({ monthKey, index }) => [
    { month: monthKey, kpi: "MRR", value: 410000 + index * 21000, unit: "USD" },
    { month: monthKey, kpi: "ARR", value: (410000 + index * 21000) * 12, unit: "USD" },
    { month: monthKey, kpi: "Net revenue retention", value: 119 + index * 0.4, unit: "%" },
    { month: monthKey, kpi: "Gross churn", value: 2.1 - index * 0.03, unit: "%" },
    { month: monthKey, kpi: "New customers", value: 7 + Math.floor(index / 2), unit: "count" },
    { month: monthKey, kpi: "Expansion revenue", value: 22000 + index * 3500, unit: "USD" },
    { month: monthKey, kpi: "Pipeline", value: 2250000 + index * 125000, unit: "USD" },
    { month: monthKey, kpi: "Burn multiple", value: 1.5 - index * 0.03, unit: "x" },
  ]);
}

function buildNotesRows() {
  return [
    {
      month: "2026-04",
      topic: "Revenue timing",
      note: "Two enterprise expansions moved from April into May.",
      owner: "CFO",
      priority: "High",
    },
    {
      month: "2026-04",
      topic: "Usage revenue",
      note: "Customer activity exceeded plan across the data processing tier.",
      owner: "Revenue Ops",
      priority: "Medium",
    },
    {
      month: "2026-04",
      topic: "Hiring plan",
      note: "Two planned hires shifted into May, creating payroll favorability.",
      owner: "People Ops",
      priority: "Medium",
    },
    {
      month: "2026-04",
      topic: "Cloud spend",
      note: "Monitor AWS unit economics as usage expands.",
      owner: "Engineering",
      priority: "High",
    },
  ];
}

function metricsByMonth(
  financialRows: FinancialLine[],
  cashRows: ReturnType<typeof buildCashRows>,
) {
  const grouped = groupFinancialRowsByMonth(financialRows);
  const cashByMonth = new Map(cashRows.map((row) => [row.month, row.cashBalance]));

  return demoMonths.map(({ monthDate, monthKey }) => {
    const rows = grouped.get(monthKey) ?? [];

    return {
      month: monthDate,
      revenue: sumRows(rows, (row) => row.category === "Revenue"),
      costOfRevenue: sumRows(rows, (row) => isCostOfRevenue(row.account)),
      salesAndMarketing: sumRows(rows, (row) => isSalesMarketing(row.account)),
      researchAndDevelopment: sumRows(rows, (row) => isResearchDevelopment(row.account)),
      generalAndAdministrative: sumRows(
        rows,
        (row) =>
          row.category !== "Revenue" &&
          !isCostOfRevenue(row.account) &&
          !isSalesMarketing(row.account) &&
          !isResearchDevelopment(row.account),
      ),
      cashBalance: cashByMonth.get(monthKey) ?? 0,
    } satisfies ForecastMetric;
  });
}

function mergeActualAndFutureMetrics(
  actualMetrics: ForecastMetric[],
  budgetMetrics: ForecastMetric[],
) {
  const actualByMonth = new Map(actualMetrics.map((metric) => [metric.month, metric]));
  const budgetByMonth = new Map(budgetMetrics.map((metric) => [metric.month, metric]));

  return demoMonths.map(({ monthDate, index }) => {
    if (monthDate <= "2026-05-01") {
      return actualByMonth.get(monthDate) ?? budgetByMonth.get(monthDate)!;
    }

    const budget = budgetByMonth.get(monthDate)!;
    const uplift = 1 + (index - 4) * 0.012;

    return {
      ...budget,
      revenue: Math.round(budget.revenue * uplift),
      costOfRevenue: Math.round(budget.costOfRevenue * (1 + (index - 4) * 0.015)),
      cashBalance: Math.round(budget.cashBalance * 0.985),
    };
  });
}

function forecastRowsFromMetrics({
  userId,
  companyId,
  forecastVersionId,
  metrics,
  rowTypeForMonth,
  sourceForMonth,
  lockForMonth,
}: {
  userId: string;
  companyId: string;
  forecastVersionId: string;
  metrics: ForecastMetric[];
  rowTypeForMonth: (month: string) => "Actual" | "Forecast" | "Budget";
  sourceForMonth: (month: string) => string;
  lockForMonth: (month: string) => boolean;
}) {
  const categories: [string, keyof Omit<ForecastMetric, "month">][] = [
    ["Revenue", "revenue"],
    ["Cost of Revenue", "costOfRevenue"],
    ["Sales & Marketing", "salesAndMarketing"],
    ["Research & Development", "researchAndDevelopment"],
    ["General & Administrative", "generalAndAdministrative"],
    ["Cash Balance", "cashBalance"],
  ];

  return metrics.flatMap((metric) =>
    categories.map(([category, key]) => ({
      user_id: userId,
      company_id: companyId,
      forecast_version_id: forecastVersionId,
      month: metric.month,
      category,
      amount: Math.round(metric[key]),
      row_type: rowTypeForMonth(metric.month),
      source: sourceForMonth(metric.month),
      is_locked: lockForMonth(metric.month),
      updated_at: new Date().toISOString(),
    })),
  );
}

function stagedRow({
  userId,
  companyId,
  uploadId,
  batchId,
  category,
  index,
  period,
  rawAccountName,
  rawCategory,
  mappedCategory,
  department,
  amount,
  rawData,
}: {
  userId: string;
  companyId: string;
  uploadId: string;
  batchId: string;
  category: MonthlyCloseCategory;
  index: number;
  period: string;
  rawAccountName: string;
  rawCategory: string | null;
  mappedCategory: string | null;
  department: string | null;
  amount: number | null;
  rawData: Record<string, unknown>;
}) {
  return {
    user_id: userId,
    company_id: companyId,
    import_batch_id: batchId,
    uploaded_file_id: uploadId,
    file_category: category,
    source_row_number: index + 2,
    period,
    raw_account_name: rawAccountName,
    raw_category: rawCategory,
    mapped_category: mappedCategory,
    department,
    amount,
    raw_data: {
      ...rawData,
      source: "Demo Data",
    },
    mapping_status: mappedCategory ? "Mapped" : "Ignored",
    validation_status: "Valid",
    updated_at: new Date().toISOString(),
  };
}

function buildDemoValidationSummary(category: MonthlyCloseCategory, rowCount: number) {
  return {
    totalRows: rowCount,
    validRows: rowCount,
    warningRows: 0,
    errorRows: 0,
    issues: [
      {
        id: `${category}-demo-data-source`,
        fileCategory: category,
        categoryLabel: categoryLabels[category],
        severity: "Info",
        message: "Source: Demo Data for Northstar Analytics.",
        rowCount,
        suggestedFix:
          "Replace with real company data when moving from demo evaluation to production use.",
      },
      {
        id: `${category}-demo-period-range`,
        fileCategory: category,
        categoryLabel: categoryLabels[category],
        severity: "Info",
        message: "Multi-period demo data detected: Jan 2026 - Dec 2026.",
        rowCount,
        suggestedFix:
          "Use the period range to explore dashboards, forecasts, reports, and Data Room workflows.",
      },
    ],
  };
}

function groupFinancialRowsByMonth(rows: FinancialLine[]) {
  const byMonth = new Map<string, FinancialLine[]>();

  rows.forEach((row) => {
    byMonth.set(row.month, [...(byMonth.get(row.month) ?? []), row]);
  });

  return byMonth;
}

function line(
  month: string,
  account: string,
  category: string,
  amount: number,
): FinancialLine {
  return {
    month,
    account,
    category,
    amount: Math.round(amount),
  };
}

function sumRows(rows: FinancialLine[], predicate: (row: FinancialLine) => boolean) {
  return rows
    .filter(predicate)
    .reduce((total, row) => total + Math.abs(row.amount), 0);
}

function isCostOfRevenue(account: string) {
  return ["AWS Hosting", "Stripe Fees", "Customer Support"].includes(account);
}

function isSalesMarketing(account: string) {
  return [
    "Sales & Marketing Payroll",
    "HubSpot",
    "Salesforce",
    "Travel & Entertainment",
  ].includes(account);
}

function isResearchDevelopment(account: string) {
  return ["Engineering Payroll", "Contractor Expense"].includes(account);
}

async function insertRows(
  table: string,
  rows: Record<string, unknown>[],
  options: { upsert?: boolean; onConflict?: string } = {},
) {
  if (rows.length === 0) {
    return;
  }

  const supabase = createClient();
  const chunks = chunkRows(rows, 500);

  for (const chunk of chunks) {
    const query = options.upsert
      ? supabase.from(table).upsert(chunk, { onConflict: options.onConflict })
      : supabase.from(table).insert(chunk);
    const { error } = await query;

    if (error) {
      throw new Error(`${table} demo seed failed: ${error.message}`);
    }
  }
}

async function hasRows(table: string, companyId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("company_id", companyId)
    .limit(1);

  if (error) {
    console.error(`Demo status check failed for ${table}`, error);
    return false;
  }

  return Boolean(data?.length);
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

function ensureSupabase() {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error("Supabase is not configured for this environment.");
  }

  return createClient();
}
