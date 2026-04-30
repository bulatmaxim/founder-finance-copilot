"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Toast, type ToastMessage, type ToastType } from "@/components/Toast";
import {
  loadCompanyMappingWorkspace,
  masterFpnaCategories,
  saveCompanyAccount,
  saveDepartment,
  saveMappingRule,
  type CompanyAccount,
  type CompanyDepartment,
  type CompanyMappingWorkspace,
  type MappingRule,
} from "@/lib/companyMapping";
import { saveAccountMapping, type AccountMappingRow } from "@/lib/accountMapping";
import { formatCurrency } from "@/lib/formatting";

type Tab = "Departments" | "Accounts / Line Items" | "Category Mapping" | "Unmapped Imports" | "Mapping Rules";

const tabs: Tab[] = [
  "Departments",
  "Accounts / Line Items",
  "Category Mapping",
  "Unmapped Imports",
  "Mapping Rules",
];

export default function AccountMappingPage() {
  const [workspace, setWorkspace] = useState<CompanyMappingWorkspace>({
    departments: [],
    accounts: [],
    rules: [],
    unmappedImports: [],
  });
  const [activeTab, setActiveTab] = useState<Tab>("Departments");
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback((type: ToastType, title: string, detail?: string) => {
    setToast({ id: Date.now(), type, title, detail });
  }, []);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    try {
      setWorkspace(await loadCompanyMappingWorkspace());
    } catch (error) {
      console.error("Company mapping load failed", error);
      notify(
        "error",
        "Company Mapping could not be loaded.",
        error instanceof Error ? error.message : "Check Supabase setup.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadWorkspace]);

  const summary = useMemo(() => {
    const mappedImports = workspace.unmappedImports.filter((row) => row.status === "Mapped").length;
    const totalImports = workspace.unmappedImports.length;
    return {
      departments: workspace.departments.length,
      accounts: workspace.accounts.length,
      rules: workspace.rules.length,
      unmapped: workspace.unmappedImports.filter((row) => row.status !== "Mapped").length,
      completion: totalImports === 0 ? 100 : Math.round((mappedImports / totalImports) * 100),
    };
  }, [workspace]);

  async function saveAndReload(label: string, action: () => Promise<void>) {
    setSavingKey(label);
    try {
      await action();
      await loadWorkspace();
      notify("success", `${label} saved.`);
    } catch (error) {
      notify("error", `${label} could not be saved.`, error instanceof Error ? error.message : "Try again.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <section className="space-y-8">
      <Toast message={toast} onClose={() => setToast(null)} />
      <div className="premium-card rounded-3xl p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200/70">
              Company Mapping
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[color:var(--text-strong)]">
              Company Mapping
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
              Define departments, accounts, codes, aliases, and FP&A mappings so
              uploads, forecasts, AI, and reports understand company-specific data.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <SummaryCard label="Departments" value={summary.departments} />
        <SummaryCard label="Accounts" value={summary.accounts} />
        <SummaryCard label="Rules" value={summary.rules} />
        <SummaryCard label="Unmapped Imports" value={summary.unmapped} />
        <SummaryCard label="Completion" value={`${summary.completion}%`} />
      </div>

      <section className="premium-card rounded-2xl p-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                activeTab === tab
                  ? "border-sky-300/40 bg-sky-300/10 text-[color:var(--text-strong)]"
                  : "border-white/10 text-[color:var(--text-muted)]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      {isLoading ? (
        <section className="premium-card rounded-2xl p-6">
          <div className="premium-skeleton h-24 rounded-2xl" />
        </section>
      ) : (
        <>
          {activeTab === "Departments" ? (
            <DepartmentsTab
              rows={workspace.departments}
              isSaving={Boolean(savingKey)}
              onSave={(row) => saveAndReload("Department", () => saveDepartment(row))}
            />
          ) : null}
          {activeTab === "Accounts / Line Items" || activeTab === "Category Mapping" ? (
            <AccountsTab
              rows={workspace.accounts}
              departments={workspace.departments}
              categoryOnly={activeTab === "Category Mapping"}
              isSaving={Boolean(savingKey)}
              onSave={(row) => saveAndReload("Account", () => saveCompanyAccount(row))}
            />
          ) : null}
          {activeTab === "Unmapped Imports" ? (
            <UnmappedImportsTab
              rows={workspace.unmappedImports}
              onSave={(row) =>
                saveAndReload("Import mapping", async () => {
                  const normalizedCategory = row.selectedCategory || row.suggestedCategory;
                  const departmentName = row.department || row.suggestedDepartment;
                  let departmentId =
                    workspace.departments.find(
                      (department) =>
                        department.name.toLowerCase() === departmentName.toLowerCase() ||
                        (row.departmentCode &&
                          (department.code ?? "").toLowerCase() === row.departmentCode.toLowerCase()),
                    )?.id ?? "";

                  if (!departmentId && departmentName) {
                    departmentId =
                      (await saveDepartment({
                        name: departmentName,
                        code: row.departmentCode || null,
                        function: departmentName,
                        is_active: true,
                      })) ?? "";
                  }

                  await saveCompanyAccount({
                    account_name: row.rawAccountName,
                    account_code: row.accountCode || null,
                    uploaded_alias: row.rawAccountName,
                    department_id: departmentId || null,
                    normalized_category: normalizedCategory,
                    statement_type: row.sourceType,
                    notes: row.reason,
                    is_active: true,
                  });

                  await saveAccountMapping({
                    rawAccountName: row.rawAccountName,
                    normalizedCategory,
                    department: departmentName,
                    statementType: row.sourceType,
                    status: "Mapped",
                  });
                })
              }
            />
          ) : null}
          {activeTab === "Mapping Rules" ? (
            <RulesTab
              rows={workspace.rules}
              accounts={workspace.accounts}
              departments={workspace.departments}
              onSave={(row) => saveAndReload("Mapping rule", () => saveMappingRule(row))}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function DepartmentsTab({ rows, isSaving, onSave }: {
  rows: CompanyDepartment[];
  isSaving: boolean;
  onSave: (row: Partial<CompanyDepartment>) => void;
}) {
  const [drafts, setDrafts] = useState<Partial<CompanyDepartment>[]>(rows);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDrafts(rows), 0);
    return () => window.clearTimeout(timeout);
  }, [rows]);

  return (
    <EditorTable
      title="Departments"
      description="Create company departments and department codes used by uploads and forecasts."
      onAdd={() => setDrafts((current) => [...current, { name: "", code: "", function: "", notes: "", is_active: true }])}
    >
      <thead><tr><Th>Name</Th><Th>Code</Th><Th>Function</Th><Th>Notes</Th><Th>Status</Th><Th>Action</Th></tr></thead>
      <tbody>
        {drafts.map((row, index) => (
          <tr key={row.id ?? index} className="border-b border-white/10">
            <Td><Input value={row.name ?? ""} onChange={(name) => updateDraft(setDrafts, index, { name })} /></Td>
            <Td><Input value={row.code ?? ""} onChange={(code) => updateDraft(setDrafts, index, { code })} /></Td>
            <Td><Input value={row.function ?? ""} onChange={(value) => updateDraft(setDrafts, index, { function: value })} /></Td>
            <Td><Input value={row.notes ?? ""} onChange={(notes) => updateDraft(setDrafts, index, { notes })} /></Td>
            <Td><Toggle active={row.is_active ?? true} onChange={(is_active) => updateDraft(setDrafts, index, { is_active })} /></Td>
            <Td><SaveButton disabled={isSaving || !row.name} onClick={() => onSave(row)} /></Td>
          </tr>
        ))}
      </tbody>
    </EditorTable>
  );
}

function AccountsTab({ rows, departments, categoryOnly, isSaving, onSave }: {
  rows: CompanyAccount[];
  departments: CompanyDepartment[];
  categoryOnly: boolean;
  isSaving: boolean;
  onSave: (row: Partial<CompanyAccount>) => void;
}) {
  const [drafts, setDrafts] = useState<Partial<CompanyAccount>[]>(rows);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDrafts(rows), 0);
    return () => window.clearTimeout(timeout);
  }, [rows]);

  return (
    <EditorTable
      title={categoryOnly ? "Category Mapping" : "Accounts / Line Items"}
      description="Map company-specific accounts, codes, and uploaded aliases into standardized FP&A categories."
      onAdd={() => setDrafts((current) => [...current, { account_name: "", account_code: "", uploaded_alias: "", normalized_category: "", statement_type: "P&L", is_active: true }])}
    >
      <thead><tr><Th>Account Name</Th><Th>Code</Th>{!categoryOnly ? <Th>Alias / Uploaded Name</Th> : null}<Th>Department</Th><Th>FP&A Category</Th><Th>Statement Type</Th><Th>Status</Th><Th>Action</Th></tr></thead>
      <tbody>
        {drafts.map((row, index) => (
          <tr key={row.id ?? index} className="border-b border-white/10">
            <Td><Input value={row.account_name ?? ""} onChange={(account_name) => updateDraft(setDrafts, index, { account_name })} /></Td>
            <Td><Input value={row.account_code ?? ""} onChange={(account_code) => updateDraft(setDrafts, index, { account_code })} /></Td>
            {!categoryOnly ? <Td><Input value={row.uploaded_alias ?? ""} onChange={(uploaded_alias) => updateDraft(setDrafts, index, { uploaded_alias })} /></Td> : null}
            <Td>
              <Select value={row.department_id ?? ""} onChange={(department_id) => updateDraft(setDrafts, index, { department_id })}>
                <option value="">None</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </Select>
            </Td>
            <Td><CategorySelect value={row.normalized_category ?? ""} onChange={(normalized_category) => updateDraft(setDrafts, index, { normalized_category })} /></Td>
            <Td><Input value={row.statement_type ?? ""} onChange={(statement_type) => updateDraft(setDrafts, index, { statement_type })} /></Td>
            <Td><Toggle active={row.is_active ?? true} onChange={(is_active) => updateDraft(setDrafts, index, { is_active })} /></Td>
            <Td><SaveButton disabled={isSaving || !row.account_name} onClick={() => onSave(row)} /></Td>
          </tr>
        ))}
      </tbody>
    </EditorTable>
  );
}

function UnmappedImportsTab({ rows, onSave }: {
  rows: AccountMappingRow[];
  onSave: (row: AccountMappingRow) => void;
}) {
  const [drafts, setDrafts] = useState(rows);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDrafts(rows), 0);
    return () => window.clearTimeout(timeout);
  }, [rows]);

  return (
    <EditorTable
      title="Unmapped Imports"
      description="Accounts and codes found in uploaded or staged data that do not yet have a trusted company mapping."
    >
      <thead><tr><Th>Raw Uploaded Value</Th><Th>Account Code</Th><Th>Department Code</Th><Th>Source</Th><Th>Total Amount</Th><Th>Rows</Th><Th>Period Range</Th><Th>Suggested Department</Th><Th>Suggested FP&A Category</Th><Th>Confidence</Th><Th>Reason</Th><Th>Status</Th><Th>Action</Th></tr></thead>
      <tbody>
        {drafts.length === 0 ? <tr><td colSpan={13} className="px-4 py-10 text-center text-[color:var(--text-muted)]">No unmapped imports right now.</td></tr> : null}
        {drafts.map((row, index) => (
          <tr key={row.rawAccountName} className="border-b border-white/10">
            <Td>{row.rawAccountName}</Td>
            <Td>{row.accountCode || "-"}</Td>
            <Td>{row.departmentCode || "-"}</Td>
            <Td>{row.sourceType}</Td>
            <Td>{formatCurrency(row.totalAmount)}</Td>
            <Td>{row.rowCount}</Td>
            <Td>{row.firstSeenDate ?? "-"} to {row.latestSeenDate ?? "-"}</Td>
            <Td><Input value={row.department || row.suggestedDepartment} onChange={(department) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, department } : item))} /></Td>
            <Td><CategorySelect value={row.selectedCategory || row.suggestedCategory} onChange={(selectedCategory) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, selectedCategory } : item))} /></Td>
            <Td>{row.confidence}</Td>
            <Td><span className="block max-w-72 text-xs leading-5 text-[color:var(--text-muted)]">{row.reason}</span></Td>
            <Td><span className="premium-pill rounded-full px-2 py-1 text-xs">{row.status}</span></Td>
            <Td><SaveButton disabled={!(row.selectedCategory || row.suggestedCategory)} onClick={() => onSave(drafts[index])} /></Td>
          </tr>
        ))}
      </tbody>
    </EditorTable>
  );
}

function RulesTab({ rows, accounts, departments, onSave }: {
  rows: MappingRule[];
  accounts: CompanyAccount[];
  departments: CompanyDepartment[];
  onSave: (row: Partial<MappingRule>) => void;
}) {
  const [drafts, setDrafts] = useState<Partial<MappingRule>[]>(rows);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDrafts(rows), 0);
    return () => window.clearTimeout(timeout);
  }, [rows]);

  return (
    <EditorTable
      title="Mapping Rules"
      description="Simple rules for uploaded account codes, department codes, and raw names."
      onAdd={() => setDrafts((current) => [...current, { rule_type: "raw_name_equals", match_value: "", priority: 100, is_active: true }])}
    >
      <thead><tr><Th>Rule Type</Th><Th>Match Value</Th><Th>Account</Th><Th>Department</Th><Th>Category</Th><Th>Priority</Th><Th>Status</Th><Th>Action</Th></tr></thead>
      <tbody>
        {drafts.map((row, index) => (
          <tr key={row.id ?? index} className="border-b border-white/10">
            <Td><Select value={row.rule_type ?? "raw_name_equals"} onChange={(rule_type) => updateDraft(setDrafts, index, { rule_type })}><option value="raw_name_equals">Raw name equals</option><option value="department_equals">Department/code equals</option><option value="raw_name_contains">Raw name contains</option></Select></Td>
            <Td><Input value={row.match_value ?? ""} onChange={(match_value) => updateDraft(setDrafts, index, { match_value })} /></Td>
            <Td><Select value={row.mapped_account_id ?? ""} onChange={(mapped_account_id) => updateDraft(setDrafts, index, { mapped_account_id })}><option value="">None</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.account_name}</option>)}</Select></Td>
            <Td><Select value={row.mapped_department_id ?? ""} onChange={(mapped_department_id) => updateDraft(setDrafts, index, { mapped_department_id })}><option value="">None</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></Td>
            <Td><CategorySelect value={row.normalized_category ?? ""} onChange={(normalized_category) => updateDraft(setDrafts, index, { normalized_category })} /></Td>
            <Td><Input value={String(row.priority ?? 100)} onChange={(priority) => updateDraft(setDrafts, index, { priority: Number(priority) || 100 })} /></Td>
            <Td><Toggle active={row.is_active ?? true} onChange={(is_active) => updateDraft(setDrafts, index, { is_active })} /></Td>
            <Td><SaveButton disabled={!row.match_value} onClick={() => onSave(row)} /></Td>
          </tr>
        ))}
      </tbody>
    </EditorTable>
  );
}

function EditorTable({ title, description, children, onAdd }: {
  title: string;
  description: string;
  children: React.ReactNode;
  onAdd?: () => void;
}) {
  return (
    <section className="premium-card overflow-hidden rounded-2xl">
      <div className="premium-panel-header flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--text-strong)]">{title}</h2>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">{description}</p>
        </div>
        {onAdd ? <button type="button" onClick={onAdd} className="premium-pill h-10 rounded-xl px-4 text-sm font-medium">Add</button> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">{children}</table>
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="premium-card rounded-2xl p-5">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--text-strong)]">{value}</p>
    </article>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function Input({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-36 rounded-xl border px-3 text-sm" />;
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-44 rounded-xl border px-3 text-sm">{children}</select>;
}

function CategorySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={onChange}>
      <option value="">Select category</option>
      {[...new Set(masterFpnaCategories)].map((category) => <option key={category} value={category}>{category}</option>)}
    </Select>
  );
}

function Toggle({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" checked={active} onChange={(event) => onChange(event.target.checked)} />
      {active ? "Active" : "Inactive"}
    </label>
  );
}

function SaveButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="h-10 rounded-xl bg-neutral-950 px-4 text-sm font-medium disabled:opacity-50">Save</button>;
}

function updateDraft<T>(setDrafts: React.Dispatch<React.SetStateAction<Partial<T>[]>>, index: number, patch: Partial<T>) {
  setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
}
