"use client";

import { FormEvent, useEffect, useState } from "react";
import { Toast, type ToastMessage } from "@/components/Toast";
import { sampleCompany } from "@/data/sampleCompany";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";

type CompanyState = {
  id: string;
  name: string;
  industry: string;
  stage: string;
  employees: string;
  currency: string;
  fiscalYearStartMonth: string;
};

const fallbackCompany: CompanyState = {
  id: "",
  name: sampleCompany.name,
  industry: sampleCompany.industry,
  stage: sampleCompany.stage,
  employees: sampleCompany.employees.toString(),
  currency: sampleCompany.currency,
  fiscalYearStartMonth: "1",
};

export default function CompanyProfilePage() {
  const [company, setCompany] = useState<CompanyState>(fallbackCompany);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    async function loadCompany() {
      if (!hasSupabaseBrowserEnv()) {
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Failed to load company profile", error);
        return;
      }

      if (data) {
        setCompany({
          id: data.id,
          name: data.name ?? "",
          industry: data.industry ?? "",
          stage: data.stage ?? "",
          employees: data.employees?.toString() ?? "",
          currency: data.currency ?? "USD",
          fiscalYearStartMonth: data.fiscal_year_start_month?.toString() ?? "1",
        });
      }
    }

    void loadCompany();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasSupabaseBrowserEnv() || !company.id) {
      setToast({
        id: Date.now(),
        type: "info",
        title: "Company profile is in sample mode.",
        detail: "Configure Supabase and complete onboarding to save edits.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("companies")
        .update({
          name: company.name,
          industry: company.industry,
          stage: company.stage,
          employees: Number(company.employees) || null,
          currency: company.currency,
          fiscal_year_start_month: Number(company.fiscalYearStartMonth) || 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", company.id);

      if (error) {
        throw error;
      }

      setToast({
        id: Date.now(),
        type: "success",
        title: "Company profile saved.",
      });
    } catch (error) {
      console.error("Company profile save failed", error);
      setToast({
        id: Date.now(),
        type: "error",
        title: "Company profile could not be saved.",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <Toast message={toast} onClose={() => setToast(null)} />
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Company Profile
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {company.name || "Acme AI"}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          The app is intentionally scoped to one company per account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-md border border-neutral-200 bg-white p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Company name" value={company.name} onChange={(value) => setCompany({ ...company, name: value })} required />
          <Field label="Industry" value={company.industry} onChange={(value) => setCompany({ ...company, industry: value })} />
          <Field label="Stage" value={company.stage} onChange={(value) => setCompany({ ...company, stage: value })} />
          <Field label="Employees" type="number" value={company.employees} onChange={(value) => setCompany({ ...company, employees: value })} />
          <Field label="Currency" value={company.currency} onChange={(value) => setCompany({ ...company, currency: value })} />
          <Field
            label="Fiscal year start month"
            type="number"
            min="1"
            max="12"
            value={company.fiscalYearStartMonth}
            onChange={(value) => setCompany({ ...company, fiscalYearStartMonth: value })}
          />
        </div>
        <button
          type="submit"
          disabled={isSaving}
          className="mt-6 h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {isSaving ? "Saving..." : "Save company profile"}
        </button>
      </form>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">Product Direction</h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-neutral-600">
          A finance analyst workspace that turns accounting, cash, payroll,
          revenue, pipeline, and forecast data into CFO-style recommendations,
          runway warnings, and investor-ready monthly reporting.
        </p>
      </section>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
      />
    </label>
  );
}
