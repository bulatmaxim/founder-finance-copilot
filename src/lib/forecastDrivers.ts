"use client";

import {
  calculateEbitda,
  calculateGrossProfit,
} from "@/lib/calculations";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { getCurrentCompany } from "@/lib/supabase/data";
import {
  rowsToForecastMonths,
  type ForecastVersionRowRecord,
  type ForecastVersionWithRows,
} from "@/lib/forecastVersions";

export type ForecastDriverType =
  | "Revenue"
  | "Payroll"
  | "Hosting"
  | "Software"
  | "Professional Services"
  | "Other Operating Expenses";

export type ForecastDriverAssumptionRecord = {
  id: string;
  user_id: string | null;
  company_id: string;
  forecast_version_id: string;
  driver_type: ForecastDriverType;
  assumption_name: string;
  assumption_value: number | null;
  assumption_unit: string | null;
  start_month: string | null;
  end_month: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ForecastDriverAssumptions = {
  startingMrr: number;
  monthlyGrowthRate: number;
  churnRate: number;
  expansionRevenueRate: number;
  newCustomerRevenue: number;
  currentHeadcount: number;
  plannedHires: number;
  averageSalary: number;
  benefitsLoadRate: number;
  hostingRevenueRate: number;
  fixedHostingCost: number;
  fixedSoftwareCost: number;
  softwareCostPerEmployee: number;
  fixedProfessionalServices: number;
  oneTimeProfessionalFee: number;
  oneTimeProfessionalFeeMonth: string;
  fixedOtherOpex: number;
  otherOpexGrowthRate: number;
  notes: string;
};

export type ForecastDriverPreviewMonth = {
  month: string;
  monthDate: string;
  revenue: number;
  hosting: number;
  payroll: number;
  software: number;
  professionalServices: number;
  otherOperatingExpenses: number;
  operatingExpenses: number;
  ebitda: number;
  rowType: string;
  isLocked: boolean;
};

type DriverDefinition = {
  key: keyof ForecastDriverAssumptions;
  driverType: ForecastDriverType;
  name: string;
  unit: string;
  defaultValue: number | string;
};

export const defaultDriverAssumptions: ForecastDriverAssumptions = {
  startingMrr: 250000,
  monthlyGrowthRate: 5,
  churnRate: 2,
  expansionRevenueRate: 1,
  newCustomerRevenue: 10000,
  currentHeadcount: 18,
  plannedHires: 4,
  averageSalary: 125000,
  benefitsLoadRate: 22,
  hostingRevenueRate: 8,
  fixedHostingCost: 8000,
  fixedSoftwareCost: 12000,
  softwareCostPerEmployee: 350,
  fixedProfessionalServices: 6000,
  oneTimeProfessionalFee: 0,
  oneTimeProfessionalFeeMonth: "",
  fixedOtherOpex: 15000,
  otherOpexGrowthRate: 1,
  notes: "",
};

export const driverDefinitions: DriverDefinition[] = [
  { key: "startingMrr", driverType: "Revenue", name: "Starting MRR", unit: "currency", defaultValue: 250000 },
  { key: "monthlyGrowthRate", driverType: "Revenue", name: "Monthly growth rate %", unit: "percent", defaultValue: 5 },
  { key: "churnRate", driverType: "Revenue", name: "Churn rate %", unit: "percent", defaultValue: 2 },
  { key: "expansionRevenueRate", driverType: "Revenue", name: "Expansion revenue %", unit: "percent", defaultValue: 1 },
  { key: "newCustomerRevenue", driverType: "Revenue", name: "New customer revenue", unit: "currency", defaultValue: 10000 },
  { key: "currentHeadcount", driverType: "Payroll", name: "Current headcount", unit: "count", defaultValue: 18 },
  { key: "plannedHires", driverType: "Payroll", name: "Planned hires", unit: "count", defaultValue: 4 },
  { key: "averageSalary", driverType: "Payroll", name: "Average salary", unit: "currency", defaultValue: 125000 },
  { key: "benefitsLoadRate", driverType: "Payroll", name: "Benefits/payroll tax load %", unit: "percent", defaultValue: 22 },
  { key: "hostingRevenueRate", driverType: "Hosting", name: "Hosting cost as % of revenue", unit: "percent", defaultValue: 8 },
  { key: "fixedHostingCost", driverType: "Hosting", name: "Fixed monthly hosting cost", unit: "currency", defaultValue: 8000 },
  { key: "fixedSoftwareCost", driverType: "Software", name: "Fixed monthly software cost", unit: "currency", defaultValue: 12000 },
  { key: "softwareCostPerEmployee", driverType: "Software", name: "Software cost per employee", unit: "currency", defaultValue: 350 },
  { key: "fixedProfessionalServices", driverType: "Professional Services", name: "Fixed monthly amount", unit: "currency", defaultValue: 6000 },
  { key: "oneTimeProfessionalFee", driverType: "Professional Services", name: "One-time legal/professional fee", unit: "currency", defaultValue: 0 },
  { key: "fixedOtherOpex", driverType: "Other Operating Expenses", name: "Fixed monthly amount", unit: "currency", defaultValue: 15000 },
  { key: "otherOpexGrowthRate", driverType: "Other Operating Expenses", name: "Growth rate %", unit: "percent", defaultValue: 1 },
];

export async function loadForecastDriverAssumptions(
  forecastVersionId: string,
): Promise<ForecastDriverAssumptions> {
  const records = await loadForecastDriverAssumptionRecords(forecastVersionId);
  const next = { ...defaultDriverAssumptions };

  records.forEach((record) => {
    const definition = driverDefinitions.find(
      (item) =>
        item.driverType === record.driver_type &&
        item.name === record.assumption_name,
    );

    if (!definition) {
      return;
    }

    next[definition.key] = Number(record.assumption_value ?? definition.defaultValue) as never;
  });

  const oneTimeMonth = records.find(
    (record) =>
      record.driver_type === "Professional Services" &&
      record.assumption_name === "One-time legal/professional fee",
  )?.start_month;

  const notes = records.find((record) => record.notes)?.notes;

  next.oneTimeProfessionalFeeMonth = oneTimeMonth ?? "";
  next.notes = notes ?? "";

  return next;
}

export async function loadForecastDriverAssumptionRecords(
  forecastVersionId: string,
) {
  const { company } = await getCurrentCompany();

  if (!company || !hasSupabaseBrowserEnv()) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("forecast_driver_assumptions")
    .select("*")
    .eq("company_id", company.id)
    .eq("forecast_version_id", forecastVersionId)
    .order("driver_type", { ascending: true })
    .order("assumption_name", { ascending: true });

  if (error) {
    throw new Error(`Forecast driver assumptions could not be loaded: ${error.message}`);
  }

  return (data ?? []) as ForecastDriverAssumptionRecord[];
}

export async function saveForecastDriverAssumptions({
  forecastVersionId,
  assumptions,
}: {
  forecastVersionId: string;
  assumptions: ForecastDriverAssumptions;
}) {
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete a company profile before saving forecast drivers.");
  }

  const supabase = ensureSupabase();
  const rows = driverDefinitions.map((definition) => ({
    user_id: user.id,
    company_id: company.id,
    forecast_version_id: forecastVersionId,
    driver_type: definition.driverType,
    assumption_name: definition.name,
    assumption_value: Number(assumptions[definition.key] || 0),
    assumption_unit: definition.unit,
    start_month:
      definition.key === "oneTimeProfessionalFee"
        ? assumptions.oneTimeProfessionalFeeMonth || null
        : null,
    end_month: null,
    notes: assumptions.notes || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("forecast_driver_assumptions").upsert(rows, {
    onConflict:
      "company_id,forecast_version_id,driver_type,assumption_name",
  });

  if (error) {
    throw new Error(`Forecast driver assumptions save failed: ${error.message}`);
  }
}

export async function applyForecastDriversToVersion({
  version,
  assumptions,
}: {
  version: ForecastVersionWithRows;
  assumptions: ForecastDriverAssumptions;
}) {
  const { company } = await getCurrentCompany();

  if (!company) {
    throw new Error("Complete a company profile before applying forecast drivers.");
  }

  const preview = buildForecastDriverPreview(version, assumptions);
  const unlockedMonths = preview.filter((month) => !month.isLocked);
  const supabase = ensureSupabase();

  for (const month of unlockedMonths) {
    const updates: Record<string, number> = {
      Revenue: month.revenue,
      "Cost of Revenue": month.hosting,
      "Sales & Marketing": 0,
      "Research & Development": 0,
      "General & Administrative":
        month.payroll +
        month.software +
        month.professionalServices +
        month.otherOperatingExpenses,
      "Cash Balance": cashForMonth(version.rows, month.monthDate),
    };

    for (const [category, amount] of Object.entries(updates)) {
      const { error } = await supabase
        .from("forecast_version_rows")
        .update({
          amount,
          source: "Driver-based forecast assumptions",
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", company.id)
        .eq("forecast_version_id", version.id)
        .eq("month", month.monthDate)
        .eq("category", category)
        .neq("row_type", "Actual")
        .neq("row_type", "Preliminary");

      if (error) {
        throw new Error(`Forecast driver apply failed: ${error.message}`);
      }
    }
  }

  const { error: versionError } = await supabase
    .from("forecast_versions")
    .update({ updated_at: new Date().toISOString() })
    .eq("company_id", company.id)
    .eq("id", version.id);

  if (versionError) {
    throw new Error(`Forecast version update failed: ${versionError.message}`);
  }
}

export function buildForecastDriverPreview(
  version: ForecastVersionWithRows,
  assumptions: ForecastDriverAssumptions,
): ForecastDriverPreviewMonth[] {
  const periods = rowsToForecastMonths(version.rows);
  let revenue = assumptions.startingMrr;
  let headcount = assumptions.currentHeadcount;
  const unlockedPeriods = periods.filter(
    (period) => period.periodType !== "Actual" && period.periodType !== "Preliminary",
  );
  const hireRamp =
    unlockedPeriods.length > 0 ? assumptions.plannedHires / unlockedPeriods.length : 0;

  return periods.map((period) => {
    const monthDate = displayMonthToDate(period.month);
    const isLocked = period.periodType === "Actual" || period.periodType === "Preliminary";

    if (isLocked) {
      revenue = period.revenue || revenue;
      return {
        month: period.month,
        monthDate,
        revenue: period.revenue,
        hosting: period.costOfRevenue,
        payroll: period.generalAndAdministrative,
        software: 0,
        professionalServices: 0,
        otherOperatingExpenses: 0,
        operatingExpenses: period.operatingExpenses,
        ebitda: period.ebitda,
        rowType: period.periodType,
        isLocked,
      };
    }

    revenue =
      revenue *
        (1 +
          assumptions.monthlyGrowthRate / 100 -
          assumptions.churnRate / 100 +
          assumptions.expansionRevenueRate / 100) +
      assumptions.newCustomerRevenue;
    headcount += hireRamp;

    const hosting =
      assumptions.fixedHostingCost + revenue * (assumptions.hostingRevenueRate / 100);
    const payroll =
      (headcount * assumptions.averageSalary) / 12 *
      (1 + assumptions.benefitsLoadRate / 100);
    const software =
      assumptions.fixedSoftwareCost + headcount * assumptions.softwareCostPerEmployee;
    const professionalServices =
      assumptions.fixedProfessionalServices +
      (assumptions.oneTimeProfessionalFeeMonth === monthDate
        ? assumptions.oneTimeProfessionalFee
        : 0);
    const monthIndex = unlockedPeriods.findIndex((item) => item.month === period.month);
    const otherOperatingExpenses =
      assumptions.fixedOtherOpex *
      Math.pow(1 + assumptions.otherOpexGrowthRate / 100, Math.max(0, monthIndex));
    const operatingExpenses =
      payroll + software + professionalServices + otherOperatingExpenses;
    const grossProfit = calculateGrossProfit(revenue, hosting);
    const ebitda = calculateEbitda(grossProfit, operatingExpenses);

    return {
      month: period.month,
      monthDate,
      revenue,
      hosting,
      payroll,
      software,
      professionalServices,
      otherOperatingExpenses,
      operatingExpenses,
      ebitda,
      rowType: period.periodType,
      isLocked,
    };
  });
}

export function summarizeForecastDriverAssumptions(
  assumptions: ForecastDriverAssumptions,
) {
  return [
    `${formatPercentText(assumptions.monthlyGrowthRate)} monthly MRR growth`,
    `${formatPercentText(assumptions.churnRate)} churn`,
    `${assumptions.plannedHires} planned hire${assumptions.plannedHires === 1 ? "" : "s"}`,
  ].join(", ");
}

function cashForMonth(rows: ForecastVersionRowRecord[], month: string) {
  return Number(
    rows.find((row) => row.month === month && row.category === "Cash Balance")
      ?.amount ?? 0,
  );
}

function displayMonthToDate(month: string) {
  const date = new Date(`${month} 1`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatPercentText(value: number) {
  return `${Number(value).toFixed(1).replace(/\.0$/, "")}%`;
}

function ensureSupabase() {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error("Supabase is not configured for this local environment.");
  }

  return createClient();
}
