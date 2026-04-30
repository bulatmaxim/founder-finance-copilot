"use client";

import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { getCurrentCompany } from "@/lib/supabase/data";

export type AccountMappingStatus =
  | "Unmapped"
  | "Suggested"
  | "Mapped"
  | "Needs review"
  | "Ignored";
export type AccountSourceType = string;

export type AccountMappingRow = {
  id: string | null;
  rawAccountName: string;
  accountCode: string;
  departmentCode: string;
  sourceType: AccountSourceType;
  suggestedCategory: string;
  selectedCategory: string;
  suggestedDepartment: string;
  department: string;
  confidence: "High" | "Medium" | "Low";
  reason: string;
  status: AccountMappingStatus;
  lastUpdated: string | null;
  firstSeenDate: string | null;
  latestSeenDate: string | null;
  totalAmount: number;
  rowCount: number;
  sourceFiles: string[];
};

export type AccountMappingSummary = {
  totalAccounts: number;
  mappedAccounts: number;
  suggestedAccounts: number;
  unmappedAccounts: number;
  ignoredAccounts: number;
  needsReview: number;
  completionPercent: number;
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

  const [actuals, budget, stagedAccounts, mappings] = await Promise.all([
    loadAccountFacts("financial_actuals", "Actuals"),
    loadAccountFacts("budget_rows", "Budget"),
    loadStagedAccountFacts(),
    loadMappings(),
  ]);
  const mappingByName = new Map(
    mappings.map((mapping) => [
      normalizeAccountName(mapping.raw_account_name),
      mapping,
    ]),
  );
  const accountFacts = new Map<string, AccountAggregate>();

  actuals.forEach((account) => {
    mergeAccountFact(accountFacts, account);
  });
  budget.forEach((account) => {
    mergeAccountFact(accountFacts, account);
  });
  stagedAccounts.forEach((account) => {
    mergeAccountFact(accountFacts, account);
  });

  return [...accountFacts.entries()]
    .map(([key, fact]) => {
      const rawAccountName = fact.rawAccountName;
      const existing = mappingByName.get(key);
      const suggestion = suggestAccountMapping(rawAccountName);
      const selectedCategory = existing?.normalized_category ?? "";
      const suggestedCategory = fact.suggestedCategory || suggestion.category;
      const status =
        existing?.status ??
        (suggestedCategory === "Uncategorized" ? "Unmapped" : "Suggested");

      return {
        id: existing?.id ?? null,
        rawAccountName,
        accountCode: fact.accountCode,
        departmentCode: fact.departmentCode,
        sourceType: formatSourceType(fact.sources),
        suggestedCategory,
        selectedCategory,
        suggestedDepartment: fact.suggestedDepartment || suggestion.department,
        department: existing?.department || fact.suggestedDepartment || suggestion.department,
        confidence: existing ? "High" : fact.confidence,
        reason: existing
          ? "Matched from confirmed Company Mapping."
          : fact.reason || "Suggested from uploaded account evidence; confirmation is required.",
        status,
        lastUpdated: existing?.updated_at ?? null,
        firstSeenDate: fact.firstSeenDate,
        latestSeenDate: fact.latestSeenDate,
        totalAmount: fact.totalAmount,
        rowCount: fact.rowCount,
        sourceFiles: [...fact.sourceFiles],
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
  const rowsToSave = rows.filter(
    (row) => row.status !== "Mapped" && row.status !== "Ignored",
  );

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
  const mappedAccounts = rows.filter((row) => row.status === "Mapped").length;
  const ignoredAccounts = rows.filter((row) => row.status === "Ignored").length;
  const completeAccounts = mappedAccounts + ignoredAccounts;

  return {
    totalAccounts: rows.length,
    mappedAccounts,
    suggestedAccounts: rows.filter((row) => row.status === "Suggested").length,
    unmappedAccounts: rows.filter((row) => row.status === "Unmapped").length,
    ignoredAccounts,
    needsReview: rows.filter((row) => row.status === "Needs review").length,
    completionPercent:
      rows.length === 0 ? 100 : Math.round((completeAccounts / rows.length) * 100),
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

type AccountFact = {
  rawAccountName: string;
  accountCode: string;
  departmentCode: string;
  sourceType: string;
  suggestedCategory: string;
  suggestedDepartment: string;
  confidence: "High" | "Medium" | "Low";
  reason: string;
  firstSeenDate: string | null;
  latestSeenDate: string | null;
  totalAmount: number;
  rowCount: number;
  sourceFiles: string[];
};

type AccountAggregate = {
  rawAccountName: string;
  accountCode: string;
  departmentCode: string;
  sources: Set<string>;
  suggestedCategory: string;
  suggestedDepartment: string;
  confidence: "High" | "Medium" | "Low";
  reason: string;
  firstSeenDate: string | null;
  latestSeenDate: string | null;
  totalAmount: number;
  rowCount: number;
  sourceFiles: Set<string>;
};

async function loadAccountFacts(
  table: "financial_actuals" | "budget_rows",
  sourceType: string,
) {
  const { company } = await getCurrentCompany();

  if (!company) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from(table)
    .select("account, month, amount, uploaded_file_id")
    .eq("company_id", company.id)
    .not("account", "is", null);

  if (error) {
    throw new Error(`Failed to load ${table} accounts: ${error.message}`);
  }

  const facts = new Map<string, AccountAggregate>();

  (data ?? []).forEach((row) => {
    const rawAccountName = String(row.account ?? "").trim();

    if (!rawAccountName) {
      return;
    }

    mergeAccountFact(facts, {
      rawAccountName,
      accountCode: "",
      departmentCode: "",
      sourceType,
      suggestedCategory: "",
      suggestedDepartment: "",
      confidence: "Low",
      reason: "",
      firstSeenDate: normalizeMonthDate(String(row.month ?? "")),
      latestSeenDate: normalizeMonthDate(String(row.month ?? "")),
      totalAmount: Number(row.amount ?? 0),
      rowCount: 1,
      sourceFiles: [String(row.uploaded_file_id ?? "")].filter(Boolean),
    });
  });

  return [...facts.values()].map(aggregateToFact);
}

async function loadStagedAccountFacts() {
  const { company } = await getCurrentCompany();

  if (!company) {
    return [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("import_staged_rows")
    .select(
      "raw_account_name, account_code, department_code, department, mapped_category, file_category, period, amount, uploaded_file_id, mapping_status",
    )
    .eq("company_id", company.id)
    .not("raw_account_name", "is", null);

  if (error) {
    console.error("Failed to load staged import accounts", error);
    return [];
  }

  const facts = new Map<string, AccountAggregate>();

  (data ?? []).forEach((row) => {
    const rawAccountName = String(row.raw_account_name ?? "").trim();

    if (!rawAccountName || row.mapping_status === "Ignored") {
      return;
    }

    mergeAccountFact(facts, {
      rawAccountName,
      accountCode: String(row.account_code ?? ""),
      departmentCode: String(row.department_code ?? ""),
      sourceType: sourceTypeForCategory(String(row.file_category ?? "")),
      suggestedCategory: String(row.mapped_category ?? ""),
      suggestedDepartment: String(row.department ?? ""),
      confidence: row.mapping_status === "Mapped" ? "High" : row.mapped_category ? "Medium" : "Low",
      reason:
        row.mapping_status === "Mapped"
          ? "Matched from confirmed Company Mapping."
          : row.mapped_category
            ? "Suggested from uploaded description/name; confirmation is required."
            : "No confirmed account mapping exists for this imported value.",
      firstSeenDate: normalizeMonthDate(String(row.period ?? "")),
      latestSeenDate: normalizeMonthDate(String(row.period ?? "")),
      totalAmount: Number(row.amount ?? 0),
      rowCount: 1,
      sourceFiles: [String(row.uploaded_file_id ?? "")].filter(Boolean),
    });
  });

  return [...facts.values()].map(aggregateToFact);
}

function mergeAccountFact(facts: Map<string, AccountAggregate>, next: AccountFact) {
  const key = normalizeAccountName(next.rawAccountName);
  const existing = facts.get(key);

  if (!existing) {
    facts.set(key, {
      rawAccountName: next.rawAccountName,
      accountCode: next.accountCode,
      departmentCode: next.departmentCode,
      sources: new Set([next.sourceType]),
      suggestedCategory: next.suggestedCategory,
      suggestedDepartment: next.suggestedDepartment,
      confidence: next.confidence,
      reason: next.reason,
      firstSeenDate: next.firstSeenDate,
      latestSeenDate: next.latestSeenDate,
      totalAmount: next.totalAmount,
      rowCount: next.rowCount,
      sourceFiles: new Set(next.sourceFiles),
    });
    return;
  }

  existing.sources.add(next.sourceType);
  existing.firstSeenDate = minDate(existing.firstSeenDate, next.firstSeenDate);
  existing.latestSeenDate = maxDate(existing.latestSeenDate, next.latestSeenDate);
  existing.totalAmount += next.totalAmount;
  existing.rowCount += next.rowCount;
  next.sourceFiles.forEach((sourceFile) => existing.sourceFiles.add(sourceFile));
  existing.accountCode ||= next.accountCode;
  existing.departmentCode ||= next.departmentCode;
  existing.suggestedCategory ||= next.suggestedCategory;
  existing.suggestedDepartment ||= next.suggestedDepartment;
  if (existing.confidence === "Low" && next.confidence !== "Low") {
    existing.confidence = next.confidence;
  }
  existing.reason ||= next.reason;
}

function aggregateToFact(aggregate: AccountAggregate): AccountFact {
  return {
    rawAccountName: aggregate.rawAccountName,
    accountCode: aggregate.accountCode,
    departmentCode: aggregate.departmentCode,
    sourceType: formatSourceType(aggregate.sources),
    suggestedCategory: aggregate.suggestedCategory,
    suggestedDepartment: aggregate.suggestedDepartment,
    confidence: aggregate.confidence,
    reason: aggregate.reason,
    firstSeenDate: aggregate.firstSeenDate,
    latestSeenDate: aggregate.latestSeenDate,
    totalAmount: aggregate.totalAmount,
    rowCount: aggregate.rowCount,
    sourceFiles: [...aggregate.sourceFiles],
  };
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

function formatSourceType(sources: Set<string>): AccountSourceType {
  return [...sources].filter(Boolean).sort().join(", ") || "Uploaded";
}

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function normalizeMonthDate(value: string) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value}-01`;
  }

  return null;
}

function minDate(first: string | null, second: string | null) {
  if (!first) return second;
  if (!second) return first;
  return first < second ? first : second;
}

function maxDate(first: string | null, second: string | null) {
  if (!first) return second;
  if (!second) return first;
  return first > second ? first : second;
}

function sourceTypeForCategory(fileCategory: string) {
  if (fileCategory === "actuals") return "Actuals";
  if (fileCategory === "budget") return "Budget";
  if (fileCategory === "cash") return "Cash";
  if (fileCategory === "payroll") return "Payroll";
  if (fileCategory === "revenue") return "Revenue";
  return fileCategory || "Staged";
}
