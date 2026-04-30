"use client";

import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { getCurrentCompany } from "@/lib/supabase/data";
import {
  loadAccountMappingRows,
  saveAccountMapping,
  standardFpnaCategories,
  type AccountMappingRow,
} from "@/lib/accountMapping";

export type CompanyDepartment = {
  id: string;
  user_id: string | null;
  company_id: string;
  name: string;
  code: string | null;
  function: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CompanyAccount = {
  id: string;
  user_id: string | null;
  company_id: string;
  account_name: string;
  account_code: string | null;
  uploaded_alias: string | null;
  department_id: string | null;
  normalized_category: string | null;
  statement_type: string | null;
  is_active: boolean | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MappingRule = {
  id: string;
  user_id: string | null;
  company_id: string;
  rule_type: string;
  match_value: string;
  mapped_account_id: string | null;
  mapped_department_id: string | null;
  normalized_category: string | null;
  priority: number | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CompanyMappingWorkspace = {
  departments: CompanyDepartment[];
  accounts: CompanyAccount[];
  rules: MappingRule[];
  unmappedImports: AccountMappingRow[];
};

export const masterFpnaCategories = [
  "Revenue",
  "Cost of Revenue",
  "Payroll / Headcount",
  "Sales & Marketing",
  "Product & Engineering",
  "G&A",
  "Legal & Professional",
  "Software",
  "Insurance",
  "Rent & Office",
  "Other OpEx",
  "Other Income / Expense",
  ...standardFpnaCategories,
];

export async function loadCompanyMappingWorkspace(): Promise<CompanyMappingWorkspace> {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const { company } = await getCurrentCompany();

  if (!company) {
    throw new Error("Complete your company profile before configuring mappings.");
  }

  const supabase = createClient();
  const [departments, accounts, rules, imports] = await Promise.all([
    supabase
      .from("company_departments")
      .select("*")
      .eq("company_id", company.id)
      .order("name", { ascending: true }),
    supabase
      .from("company_accounts")
      .select("*")
      .eq("company_id", company.id)
      .order("account_name", { ascending: true }),
    supabase
      .from("mapping_rules")
      .select("*")
      .eq("company_id", company.id)
      .order("priority", { ascending: true }),
    loadAccountMappingRows(),
  ]);

  if (departments.error) throw new Error(`Departments load failed: ${departments.error.message}`);
  if (accounts.error) throw new Error(`Accounts load failed: ${accounts.error.message}`);
  if (rules.error) throw new Error(`Mapping rules load failed: ${rules.error.message}`);

  return {
    departments: (departments.data ?? []) as CompanyDepartment[],
    accounts: (accounts.data ?? []) as CompanyAccount[],
    rules: (rules.data ?? []) as MappingRule[],
    unmappedImports: imports.filter((row) => row.status !== "Mapped"),
  };
}

export async function saveDepartment(input: Partial<CompanyDepartment>) {
  const { user, company } = await getCurrentCompany();
  if (!user || !company) throw new Error("Log in and complete your company profile.");

  const supabase = createClient();
  const payload = {
    user_id: user.id,
    company_id: company.id,
    name: input.name || "New Department",
    code: input.code || null,
    function: input.function || null,
    notes: input.notes || null,
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("company_departments").update(payload).eq("id", input.id).select("id").single()
    : supabase.from("company_departments").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(`Department save failed: ${error.message}`);
  return data?.id ?? input.id ?? null;
}

export async function saveCompanyAccount(input: Partial<CompanyAccount>) {
  const { user, company } = await getCurrentCompany();
  if (!user || !company) throw new Error("Log in and complete your company profile.");

  const supabase = createClient();
  const payload = {
    user_id: user.id,
    company_id: company.id,
    account_name: input.account_name || "New Account",
    account_code: input.account_code || null,
    uploaded_alias: input.uploaded_alias || null,
    department_id: input.department_id || null,
    normalized_category: input.normalized_category || null,
    statement_type: input.statement_type || null,
    is_active: input.is_active ?? true,
    notes: input.notes || null,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("company_accounts").update(payload).eq("id", input.id)
    : supabase.from("company_accounts").insert(payload);
  const { error } = await query;
  if (error) throw new Error(`Account save failed: ${error.message}`);

  if (payload.uploaded_alias || payload.account_name) {
    await saveAccountMapping({
      rawAccountName: payload.uploaded_alias || payload.account_name,
      normalizedCategory: payload.normalized_category || "Uncategorized",
      department: "",
      statementType: payload.statement_type || "Company Mapping",
      status: payload.normalized_category ? "Mapped" : "Needs review",
    });
  }
}

export async function saveMappingRule(input: Partial<MappingRule>) {
  const { user, company } = await getCurrentCompany();
  if (!user || !company) throw new Error("Log in and complete your company profile.");

  const supabase = createClient();
  const payload = {
    user_id: user.id,
    company_id: company.id,
    rule_type: input.rule_type || "raw_name_equals",
    match_value: input.match_value || "",
    mapped_account_id: input.mapped_account_id || null,
    mapped_department_id: input.mapped_department_id || null,
    normalized_category: input.normalized_category || null,
    priority: input.priority ?? 100,
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("mapping_rules").update(payload).eq("id", input.id)
    : supabase.from("mapping_rules").insert(payload);
  const { error } = await query;
  if (error) throw new Error(`Mapping rule save failed: ${error.message}`);
}
