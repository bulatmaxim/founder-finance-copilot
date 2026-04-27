"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Toast, type ToastMessage } from "@/components/Toast";
import { sampleCompany } from "@/data/sampleCompany";
import { createClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState(sampleCompany.name);
  const [industry, setIndustry] = useState(sampleCompany.industry);
  const [stage, setStage] = useState(sampleCompany.stage);
  const [employees, setEmployees] = useState(sampleCompany.employees.toString());
  const [currency, setCurrency] = useState(sampleCompany.currency);
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState("1");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    async function loadExistingCompany() {
      if (!hasSupabaseBrowserEnv()) {
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (company) {
        router.replace("/dashboard");
        return;
      }

      setIsLoading(false);
    }

    void loadExistingCompany();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasSupabaseBrowserEnv()) {
      setToast({
        id: Date.now(),
        type: "error",
        title: "Supabase is not configured.",
        detail: "Add Supabase environment variables to .env.local before onboarding.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("You must be logged in to create a company profile.");
      }

      const { error } = await supabase.from("companies").insert({
        owner_user_id: user.id,
        name: companyName,
        industry,
        stage,
        employees: Number(employees) || null,
        currency,
        fiscal_year_start_month: Number(fiscalYearStartMonth) || 1,
      });

      if (error) {
        throw error;
      }

      await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email,
        updated_at: new Date().toISOString(),
      });

      setToast({
        id: Date.now(),
        type: "success",
        title: "Company profile created.",
      });
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Company onboarding failed", error);
      setToast({
        id: Date.now(),
        type: "error",
        title: "Company profile could not be saved.",
        detail: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Company setup</h1>
        <p className="text-sm text-neutral-500">Checking workspace status...</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <Toast message={toast} onClose={() => setToast(null)} />
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Onboarding
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Create Company Profile
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          This app supports one company per account. Set up Acme AI once, then
          all uploads, AI briefs, and reports attach to this workspace.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-md border border-neutral-200 bg-white p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Company name" value={companyName} onChange={setCompanyName} required />
          <Field label="Industry" value={industry} onChange={setIndustry} />
          <Field label="Stage" value={stage} onChange={setStage} />
          <Field label="Employees" value={employees} onChange={setEmployees} type="number" />
          <Field label="Currency" value={currency} onChange={setCurrency} />
          <Field
            label="Fiscal year start month"
            value={fiscalYearStartMonth}
            onChange={setFiscalYearStartMonth}
            type="number"
            min="1"
            max="12"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 h-11 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {isSubmitting ? "Saving..." : "Create company"}
        </button>
      </form>
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
