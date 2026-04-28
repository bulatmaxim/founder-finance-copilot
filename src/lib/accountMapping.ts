"use client";

import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { getCurrentCompany } from "@/lib/supabase/data";

export type AccountMappingStatus = "Unmapped" | "Mapped" | "Needs review";
export type AccountSourceType = "Actuals" | "Budget" | "Actuals, Budget";

export type AccountMappingRow = {
  id: string | null;
  rawAccountName: string;
  sourceType: AccountSourceType;
  suggestedCategory: string;
  selectedCategory: string;
  suggestedDepartment: string;
  department: string;
  status: AccountMappingStatus;
  lastUpdated: string | null;
};

export type AccountMappingSummary = {
  totalAccounts: number;
  mappedAccounts: number;
  unmappedAccounts: number;
  needsReview: number;
};

export const standardFpnaCategories = [
  "Subscription Revenue",
  "Services Revenue",
  "Usage Revenue",
  "Other Revenue",
  "Hosting / Infrastructure",
  "Payment Processing",
  "Customer Support",
  "Third-Party Data",
  "Other Cost of Revenue",
  "Sales & Marketing Payroll",
  "Sales & Marketing Software",
  "Advertising & Demand Gen",
  "Engineering Payroll",
  "Product & Engineering Software",
  "G&A Payroll",
  "Legal & Professional Services",
  "Finance & Accounting",
  "Insurance",
  "Rent & Office",
  "Software Subscriptions",
  "Travel & Entertainment",
  "Other Operating Expense",
  "Other Income",
  "Other Expense",
  "Uncategorized",
];

export const departments = [
  "",
  "Sales & Marketing",
  "Product & Engineering",
  "G&A",
  "Finance",
  "Operations",
  "Customer Support",
];

type AccountMappingRecord = {
  id: string;
  raw_account_name: string;
  normalized_category: string;
  department: string | null;
  statement_type: string | null;
  status: AccountMappingStatus;
  updated_at: string | null;
};

export async function loadAccountMappingRows() {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error("Supabase is not configured for this local environment.");
  }

  const { company } = await getCurrentCompany();

  if (!company) {
    throw new Error("Please complete your company profile before mapping accounts.");
  }

  const [actuals, budget, mappings] = await Promise.all([
    loadDistinctAccounts("financial_actuals"),
    loadDistinctAccounts("budget_rows"),
    loadMappings(),
  ]);
  const mappingByName = new Map(
    mappings.map((mapping) => [
      normalizeAccountName(mapping.raw_account_name),
      mapping,
    ]),
  );
  const accountSources = new Map<string, Set<"Actuals" | "Budget">>();
  const displayNames = new Map<string, string>();

  actuals.forEach((account) => {
    const key = normalizeAccountName(account);
    displayNames.set(key, account);
    accountSources.set(key, accountSources.get(key) ?? new Set());
    accountSources.get(key)?.add("Actuals");
  });
  budget.forEach((account) => {
    const key = normalizeAccountName(account);
    displayNames.set(key, displayNames.get(key) ?? account);
    accountSources.set(key, accountSources.get(key) ?? new Set());
    accountSources.get(key)?.add("Budget");
  });

  return [...accountSources.entries()]
    .map(([key, sources]) => {
      const rawAccountName = displayNames.get(key) ?? key;
      const existing = mappingByName.get(key);
      const suggestion = suggestAccountMapping(rawAccountName);

      return {
        id: existing?.id ?? null,
        rawAccountName,
        sourceType: formatSourceType(sources),
        suggestedCategory: suggestion.category,
        selectedCategory: existing?.normalized_category ?? "",
        suggestedDepartment: suggestion.department,
        department: existing?.department ?? suggestion.department,
        status: existing?.status ?? "Unmapped",
        lastUpdated: existing?.updated_at ?? null,
      } satisfies AccountMappingRow;
    })
    .sort((first, second) => first.rawAccountName.localeCompare(second.rawAccountName));
}

export async function saveAccountMapping({
  rawAccountName,
  normalizedCategory,
  department,
  statementType,
  status = "Mapped",
}: {
  rawAccountName: string;
  normalizedCategory: string;
  department: string;
  statementType: string;
  status?: AccountMappingStatus;
}) {
  const { user, company } = await getCurrentCompany();

  if (!user || !company) {
    throw new Error("Log in and complete a company profile before saving mappings.");
  }

  if (!normalizedCategory) {
    throw new Error("Select an FP&A category before saving this mapping.");
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("account_mappings")
    .upsert(
      {
        user_id: user.id,
        company_id: company.id,
        raw_account_name: rawAccountName,
        normalized_category: normalizedCategory,
        department: department || null,
        statement_type: statementType,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,raw_account_name" },
    );

  if (error) {
    throw new Error(`Account mapping save failed: ${error.message}`);
  }
}

export async function applySuggestedAccountMappings(rows: AccountMappingRow[]) {
  const rowsToSave = rows.filter((row) => row.status !== "Mapped");

  for (const row of rowsToSave) {
    await saveAccountMapping({
      rawAccountName: row.rawAccountName,
      normalizedCategory: row.suggestedCategory,
      department: row.department || row.suggestedDepartment,
      statementType: row.sourceType,
      status: row.suggestedCategory === "Uncategorized" ? "Needs review" : "Mapped",
    });
  }
}

export async function loadAccountMappingLookup() {
  const mappings = await loadMappings();
  const lookup = new Map<string, string>();

  mappings
    .filter((mapping) => mapping.status === "Mapped")
    .forEach((mapping) => {
      lookup.set(
        normalizeAccountName(mapping.raw_account_name),
        mapping.normalized_category,
      );
    });

  return lookup;
}

export async function loadAccountMappingSummary(): Promise<AccountMappingSummary> {
  const rows = await loadAccountMappingRows();

  return summarizeAccountMappings(rows);
}

export function summarizeAccountMappings(rows: AccountMappingRow[]): AccountMappingSummary {
  return {
    totalAccounts: rows.length,
    mappedAccounts: rows.filter((row) => row.status === "Mapped").length,
    unmappedAccounts: rows.filter((row) => row.status === "Unmapped").length,
    needsReview: rows.filter((row) => row.status === "Needs review").length,
  };
}

export function suggestAccountMapping(rawAccountName: string) {
  const normalized = rawAccountName.toLowerCase();

  if (includesAny(normalized, ["aws", "cloud", "hosting", "server"])) {
    return { category: "Hosting / Infrastructure", department: "Product & Engineering" };
  }

  if (includesAny(normalized, ["stripe", "payment", "processing"])) {
    return { category: "Payment Processing", department: "G&A" };
  }

  if (includesAny(normalized, ["hubspot", "salesforce", "crm"])) {
    return { category: "Sales & Marketing Software", department: "Sales & Marketing" };
  }

  if (includesAny(normalized, ["advertising", "ads", "demand gen"])) {
    return { category: "Advertising & Demand Gen", department: "Sales & Marketing" };
  }

  if (includesAny(normalized, ["legal", "attorney", "law"])) {
    return { category: "Legal & Professional Services", department: "G&A" };
  }

  if (includesAny(normalized, ["insurance"])) {
    return { category: "Insurance", department: "G&A" };
  }

  if (includesAny(normalized, ["rent", "office"])) {
    return { category: "Rent & Office", department: "G&A" };
  }

  if (includesAny(normalized, ["contractor", "consulting"])) {
    return includesAny(normalized, ["legal", "finance", "accounting"])
      ? { category: "Legal & Professional Services", department: "G&A" }
      : { category: "Other Operating Expense", department: "Operations" };
  }

  if (includesAny(normalized, ["payroll", "salary", "wages", "gusto", "founder salary"])) {
    if (includesAny(normalized, ["sales", "marketing"])) {
      return { category: "Sales & Marketing Payroll", department: "Sales & Marketing" };
    }

    if (includesAny(normalized, ["engineering", "product", "developer", "dev"])) {
      return { category: "Engineering Payroll", department: "Product & Engineering" };
    }

    return { category: "G&A Payroll", department: "G&A" };
  }

  if (includesAny(normalized, ["software", "subscription", "saas"])) {
    return { category: "Software Subscriptions", department: "G&A" };
  }

  if (includesAny(normalized, ["travel", "entertainment", "meals"])) {
    return { category: "Travel & Entertainment", department: "G&A" };
  }

  if (includesAny(normalized, ["accounting", "bookkeeping", "finance"])) {
    return { category: "Finance & Accounting", department: "Finance" };
  }

  if (includesAny(normalized, ["subscription", "mrr", "arr"])) {
    return { category: "Subscription Revenue", department: "" };
  }

  if (includesAny(normalized, ["usage"])) {
    return { category: "Usage Revenue", department: "" };
  }

  if (includesAny(normalized, ["revenue", "sales"])) {
    return { category: "Other Revenue", department: "" };
  }

  return { category: "Uncategorized", department: "" };
}

export function normalizeAccountName(value: string) {
  return value.trim().toLowerCase();
}

async function loadDistinctAccounts(table: "financial_actuals" | "budget_rows") {
  const { company } = await getCurrentCompany();

  if (!company) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from(table)
    .select("account")
    .eq("company_id", company.id)
    .not("account", "is", null);

  if (error) {
    throw new Error(`Failed to load ${table} accounts: ${error.message}`);
  }

  return [
    ...new Set(
      (data ?? [])
        .map((row) => String(row.account ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

async function loadMappings() {
  const { company } = await getCurrentCompany();

  if (!company) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("account_mappings")
    .select("*")
    .eq("company_id", company.id)
    .order("raw_account_name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load account mappings: ${error.message}`);
  }

  return (data ?? []) as AccountMappingRecord[];
}

function formatSourceType(sources: Set<"Actuals" | "Budget">): AccountSourceType {
  const hasActuals = sources.has("Actuals");
  const hasBudget = sources.has("Budget");

  if (hasActuals && hasBudget) {
    return "Actuals, Budget";
  }

  return hasActuals ? "Actuals" : "Budget";
}

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}
