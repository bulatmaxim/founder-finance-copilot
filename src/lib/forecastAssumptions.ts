"use client";

import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { getCurrentCompany } from "@/lib/supabase/data";

export type ForecastAssumptionField = {
  key: string;
  label: string;
  driverType: string;
  assumptionName: string;
  unit: "currency" | "percent" | "count" | "months" | "text";
  placeholder?: string;
};

export type ForecastAssumptionSection = {
  title: string;
  description: string;
  fields: ForecastAssumptionField[];
};

export type ForecastAssumptionDraft = Record<string, string>;

export type ForecastCommentaryDraft = {
  executiveSummary: string;
  revenueCommentary: string;
  grossMarginCommentary: string;
  payrollCommentary: string;
  operatingExpenseCommentary: string;
  cashRunwayCommentary: string;
  forecastRisks: string;
  managementNotes: string;
};

export type ForecastCommentaryRecord = {
  id: string;
  user_id: string | null;
  company_id: string;
  forecast_version_id: string;
  commentary: ForecastCommentaryDraft | null;
  source: "manual" | "ai_draft" | "ai_edited" | string | null;
  created_at: string | null;
  updated_at: string | null;
};

export const forecastAssumptionSections: ForecastAssumptionSection[] = [
  {
    title: "Revenue Assumptions",
    description: "Core growth, retention, and revenue mix assumptions.",
    fields: [
      field("startingMrr", "Starting MRR", "Revenue", "Starting MRR", "currency", "$250,000"),
      field("monthlyGrowthRate", "Monthly growth %", "Revenue", "Monthly growth rate %", "percent", "5.0"),
      field("churnRate", "Churn %", "Revenue", "Churn rate %", "percent", "2.0"),
      field("expansionRevenueRate", "Expansion %", "Revenue", "Expansion revenue %", "percent", "1.0"),
      field("newCustomerRevenue", "New customer revenue", "Revenue", "New customer revenue", "currency", "$10,000"),
      field("usageRevenueGrowth", "Usage revenue growth", "Revenue", "Usage revenue growth", "percent", "3.5"),
      field("servicesRevenueAssumptions", "Services revenue assumptions", "Revenue", "Services revenue assumptions", "text", "Implementation services remain flat through Q3."),
    ],
  },
  {
    title: "Gross Margin / Cost of Revenue Assumptions",
    description: "Infrastructure, payment, support, and vendor cost assumptions.",
    fields: [
      field("hostingRevenueRate", "Hosting as % of revenue", "Hosting", "Hosting cost as % of revenue", "percent", "8.0"),
      field("paymentProcessingRate", "Payment processing %", "Cost of Revenue", "Payment processing %", "percent", "2.9"),
      field("supportCostAssumptions", "Support cost assumptions", "Cost of Revenue", "Support cost assumptions", "text", "Support scales with enterprise accounts."),
      field("thirdPartyVendorCosts", "Third-party data/vendor costs", "Cost of Revenue", "Third-party data/vendor costs", "currency", "$7,500"),
    ],
  },
  {
    title: "Payroll / Headcount Assumptions",
    description: "Hiring pace, compensation, benefits, and timing assumptions.",
    fields: [
      field("currentHeadcount", "Current headcount", "Payroll", "Current headcount", "count", "42"),
      field("plannedHires", "Planned hires", "Payroll", "Planned hires", "count", "6"),
      field("averageSalary", "Average salary", "Payroll", "Average salary", "currency", "$125,000"),
      field("benefitsLoadRate", "Benefits/payroll tax load %", "Payroll", "Benefits/payroll tax load %", "percent", "22"),
      field("hiringTimingNotes", "Hiring timing notes", "Payroll", "Hiring timing notes", "text", "Two engineering hires shift into May."),
    ],
  },
  {
    title: "Operating Expense Assumptions",
    description: "Software, marketing, professional services, office, and other OpEx assumptions.",
    fields: [
      field("softwareCostPerEmployee", "Software cost per employee", "Software", "Software cost per employee", "currency", "$350"),
      field("marketingSpend", "Marketing spend", "Operating Expenses", "Marketing spend", "currency", "$35,000"),
      field("legalProfessionalServices", "Legal/professional services", "Professional Services", "Fixed monthly amount", "currency", "$6,000"),
      field("rentOffice", "Rent/office", "Operating Expenses", "Rent/office", "currency", "$9,000"),
      field("insurance", "Insurance", "Operating Expenses", "Insurance", "currency", "$4,000"),
      field("travelOtherOpex", "Travel/other OpEx", "Other Operating Expenses", "Travel/other OpEx", "currency", "$12,000"),
    ],
  },
  {
    title: "Cash / Runway Assumptions",
    description: "Cash planning, financing, burn, and runway guardrail assumptions.",
    fields: [
      field("beginningCash", "Beginning cash", "Cash", "Beginning cash", "currency", "$3,200,000"),
      field("burnAssumptions", "Burn assumptions", "Cash", "Burn assumptions", "text", "Burn stays below plan until hiring normalizes."),
      field("financingAssumptions", "Financing assumptions", "Cash", "Financing assumptions", "text", "No financing assumed in base case."),
      field("minimumRunwayTarget", "Minimum runway target", "Cash", "Minimum runway target", "months", "12"),
    ],
  },
];

export const emptyForecastCommentary: ForecastCommentaryDraft = {
  executiveSummary: "",
  revenueCommentary: "",
  grossMarginCommentary: "",
  payrollCommentary: "",
  operatingExpenseCommentary: "",
  cashRunwayCommentary: "",
  forecastRisks: "",
  managementNotes: "",
};

export function emptyForecastAssumptionDraft() {
  return Object.fromEntries(
    allAssumptionFields().map((assumptionField) => [assumptionField.key, ""]),
  );
}

export function allAssumptionFields() {
  return forecastAssumptionSections.flatMap((section) => section.fields);
}

export async function loadForecastAssumptionDraft(forecastVersionId: string) {
  const draft = emptyForecastAssumptionDraft();

  if (!forecastVersionId || !hasSupabaseBrowserEnv()) {
    return draft;
  }

  const { company } = await getCurrentCompany();

  if (!company) {
    return draft;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("forecast_driver_assumptions")
    .select("driver_type, assumption_name, assumption_value, assumption_unit, notes")
    .eq("company_id", company.id)
    .eq("forecast_version_id", forecastVersionId);

  if (error) {
    throw new Error(`Forecast assumptions could not be loaded: ${error.message}`);
  }

  const records = data ?? [];

  allAssumptionFields().forEach((assumptionField) => {
    const record = records.find(
      (item) =>
        item.driver_type === assumptionField.driverType &&
        item.assumption_name === assumptionField.assumptionName,
    );

    if (!record) {
      return;
    }

    draft[assumptionField.key] =
      assumptionField.unit === "text"
        ? String(record.notes ?? "")
        : record.assumption_value === null || record.assumption_value === undefined
          ? ""
          : String(record.assumption_value);
  });

  return draft;
}

export async function saveForecastAssumptionDraft({
  forecastVersionId,
  assumptions,
}: {
  forecastVersionId: string;
  assumptions: ForecastAssumptionDraft;
}) {
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete a company profile before saving forecast assumptions.");
  }

  const supabase = createClient();
  const rows = allAssumptionFields().map((assumptionField) => {
    const value = assumptions[assumptionField.key]?.trim() ?? "";

    return {
      user_id: user.id,
      company_id: company.id,
      forecast_version_id: forecastVersionId,
      driver_type: assumptionField.driverType,
      assumption_name: assumptionField.assumptionName,
      assumption_value:
        assumptionField.unit === "text" || value === ""
          ? null
          : Number(value.replace(/[$,%\s,]/g, "")),
      assumption_unit: assumptionField.unit,
      start_month: null,
      end_month: null,
      notes: assumptionField.unit === "text" ? value || null : null,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase.from("forecast_driver_assumptions").upsert(rows, {
    onConflict:
      "company_id,forecast_version_id,driver_type,assumption_name",
  });

  if (error) {
    throw new Error(`Forecast assumptions could not be saved: ${error.message}`);
  }
}

export async function loadForecastCommentary(forecastVersionId: string) {
  if (!forecastVersionId || !hasSupabaseBrowserEnv()) {
    return {
      commentary: emptyForecastCommentary,
      source: "manual",
      updatedAt: null,
    };
  }

  const { company } = await getCurrentCompany();

  if (!company) {
    return {
      commentary: emptyForecastCommentary,
      source: "manual",
      updatedAt: null,
    };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("forecast_commentary")
    .select("*")
    .eq("company_id", company.id)
    .eq("forecast_version_id", forecastVersionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Forecast commentary could not be loaded: ${error.message}`);
  }

  const record = data as ForecastCommentaryRecord | null;

  return {
    commentary: { ...emptyForecastCommentary, ...(record?.commentary ?? {}) },
    source: record?.source ?? "manual",
    updatedAt: record?.updated_at ?? null,
  };
}

export async function saveForecastCommentary({
  forecastVersionId,
  commentary,
  source,
}: {
  forecastVersionId: string;
  commentary: ForecastCommentaryDraft;
  source: "manual" | "ai_draft" | "ai_edited";
}) {
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete a company profile before saving forecast commentary.");
  }

  const supabase = createClient();
  const { error } = await supabase.from("forecast_commentary").upsert(
    {
      user_id: user.id,
      company_id: company.id,
      forecast_version_id: forecastVersionId,
      commentary,
      source,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,forecast_version_id" },
  );

  if (error) {
    throw new Error(`Forecast commentary could not be saved: ${error.message}`);
  }
}

function field(
  key: string,
  label: string,
  driverType: string,
  assumptionName: string,
  unit: ForecastAssumptionField["unit"],
  placeholder?: string,
) {
  return { key, label, driverType, assumptionName, unit, placeholder };
}
