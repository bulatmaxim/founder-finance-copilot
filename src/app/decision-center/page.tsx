"use client";

import { useMemo, useState } from "react";
import { FinanceCopilotPanel } from "@/components/FinanceCopilotPanel";
import { ReportingSourceNotice } from "@/components/ReportingSourceNotice";
import { sampleCompany } from "@/data/sampleCompany";
import { sampleFinancials } from "@/data/sampleFinancials";
import {
  calculateHireCostImpact,
  calculateHireScenario,
  estimateCashOutDate,
} from "@/lib/calculations";
import {
  formatCurrency,
  formatRunwayMonths,
} from "@/lib/formatting";
import {
  getActiveCashData,
  getActiveFinancialData,
  getActualsSourceLabel,
  getCashSourceLabel,
  type ActiveCashData,
  type ActiveFinancialData,
} from "@/lib/localDataStore";

type HireForm = {
  roleTitle: string;
  department: string;
  startMonth: string;
  annualSalary: number;
  bonusPercent: number;
  benefitsLoadPercent: number;
  payrollTaxPercent: number;
  oneTimeEquipmentCost: number;
  scenarioName: string;
};

const latestFinancials = sampleFinancials[sampleFinancials.length - 1];
const currentRunwayMonths = latestFinancials.runwayMonths;

const startMonths = [
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
];

const initialForm: HireForm = {
  roleTitle: "Senior Account Executive",
  department: "Sales & Marketing",
  startMonth: "Apr 2026",
  annualSalary: 155000,
  bonusPercent: 20,
  benefitsLoadPercent: 18,
  payrollTaxPercent: 8,
  oneTimeEquipmentCost: 3500,
  scenarioName: "Q2 revenue capacity hire",
};

export default function DecisionCenterPage() {
  const [draft, setDraft] = useState<HireForm>(initialForm);
  const [submitted, setSubmitted] = useState<HireForm>(initialForm);
  const [activeData] = useState<ActiveFinancialData>(() => getActiveFinancialData());
  const [activeCash] = useState<ActiveCashData>(() => getActiveCashData());

  const latestActiveFinancials =
    activeData.periods[activeData.periods.length - 1] ?? latestFinancials;
  const latestCashMetrics = activeCash.periods.at(-1);
  const baseline = useMemo(
    () => ({
      month: latestActiveFinancials.month,
      cashBalance: latestCashMetrics?.cashBalance ?? latestActiveFinancials.cashBalance,
      netBurn: latestCashMetrics?.netBurn ?? latestActiveFinancials.netBurn,
      runwayMonths: latestCashMetrics?.runwayMonths ?? latestActiveFinancials.runwayMonths,
    }),
    [latestActiveFinancials, latestCashMetrics],
  );
  const analysis = useMemo(
    () => buildHireAnalysis(submitted, baseline),
    [baseline, submitted],
  );

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Decision Center
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Can we afford this hire?
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          Local decision-support workflow for {sampleCompany.name}. This model
          estimates how one hire changes burn, runway, and cash-out timing using
          the active finance data source.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <DataSourceBadge label={getActualsSourceLabel(activeData.dataSource)} />
          <DataSourceBadge label={getCashSourceLabel(activeCash.dataSource)} />
        </div>
      </div>

      <ReportingSourceNotice
        reportingMonth={latestActiveFinancials.month}
        sources={[activeData.dataSource, activeCash.dataSource]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
        <HireInputForm
          form={draft}
          onChange={setDraft}
          onSubmit={() => setSubmitted(draft)}
        />

        <section className="rounded-md border border-neutral-200 bg-white p-5">
          <h2 className="text-base font-semibold">Current Baseline</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Latest month: {latestActiveFinancials.month}
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <BaselineMetric
              label="Cash balance"
              value={formatCurrency(latestCashMetrics?.cashBalance ?? latestActiveFinancials.cashBalance)}
            />
            <BaselineMetric
              label="Net burn"
              value={formatCurrency(latestCashMetrics?.netBurn ?? latestActiveFinancials.netBurn)}
            />
            <BaselineMetric
              label="Runway"
              value={formatRunwayMonths(latestCashMetrics?.runwayMonths ?? latestActiveFinancials.runwayMonths)}
            />
          </div>

          <div className="mt-6 rounded-md border border-neutral-200 p-4">
            <p className="text-sm font-medium text-neutral-900">
              Plain-English Recommendation
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-700">
              {analysis.recommendation}
            </p>
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Current runway"
          value={formatRunwayMonths(baseline.runwayMonths)}
        />
        <SummaryCard
          label="New runway"
          value={formatRunwayMonths(analysis.baseScenario.runwayMonths)}
        />
        <SummaryCard
          label="Runway impact"
          value={formatMonthChange(analysis.baseScenario.runwayChangeMonths)}
        />
        <SummaryCard
          label="Monthly cost impact"
          value={formatCurrency(analysis.costImpact.totalMonthlyCostImpact)}
        />
        <SummaryCard
          label="First-year cash impact"
          value={formatCurrency(analysis.costImpact.firstYearCashImpact)}
        />
      </div>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">Cost Build</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <BaselineMetric
            label="Monthly salary"
            value={formatCurrency(analysis.costImpact.monthlySalaryCost)}
          />
          <BaselineMetric
            label="Monthly bonus"
            value={formatCurrency(analysis.costImpact.monthlyBonusCost)}
          />
          <BaselineMetric
            label="Benefits load"
            value={formatCurrency(analysis.costImpact.monthlyBenefitsCost)}
          />
          <BaselineMetric
            label="Payroll tax"
            value={formatCurrency(analysis.costImpact.monthlyPayrollTaxCost)}
          />
          <BaselineMetric
            label="Equipment"
            value={formatCurrency(submitted.oneTimeEquipmentCost)}
          />
        </div>
      </section>

      <ScenarioTable scenarios={analysis.scenarios} />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-md border border-neutral-200 bg-white p-5">
          <h2 className="text-base font-semibold">Founder Takeaway</h2>
          <p className="mt-4 text-sm leading-6 text-neutral-700">
            {analysis.founderTakeaway}
          </p>
          <p className="mt-4 text-sm leading-6 text-neutral-700">
            Estimated new cash-out date in the base case:{" "}
            <span className="font-medium text-neutral-950">
              {analysis.estimatedCashOutDate}
            </span>
            .
          </p>
        </section>

        <section className="rounded-md border border-neutral-200 bg-white p-5">
          <h2 className="text-base font-semibold">Suggested Actions</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-neutral-700">
            {analysis.suggestedActions.map((action) => (
              <li key={action} className="ml-4 list-decimal">
                {action}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <FinanceCopilotPanel
        reportingMonth={baseline.month}
        mode="dashboard"
        showAsk
      />
    </section>
  );
}

function DataSourceBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700">
      {label}
    </span>
  );
}

function HireInputForm({
  form,
  onChange,
  onSubmit,
}: {
  form: HireForm;
  onChange: (form: HireForm) => void;
  onSubmit: () => void;
}) {
  function updateField<K extends keyof HireForm>(key: K, value: HireForm[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold">Hire Assumptions</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Enter the role economics and generate an updated runway view.
        </p>
      </div>

      <div className="mt-5 grid gap-4">
        <TextField
          label="Hiring scenario name"
          value={form.scenarioName}
          onChange={(value) => updateField("scenarioName", value)}
        />
        <TextField
          label="Role title"
          value={form.roleTitle}
          onChange={(value) => updateField("roleTitle", value)}
        />

        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Department
          <select
            value={form.department}
            onChange={(event) => updateField("department", event.target.value)}
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none focus:border-neutral-950"
          >
            <option>Sales & Marketing</option>
            <option>Research & Development</option>
            <option>General & Administrative</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Start month
          <select
            value={form.startMonth}
            onChange={(event) => updateField("startMonth", event.target.value)}
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none focus:border-neutral-950"
          >
            {startMonths.map((month) => (
              <option key={month}>{month}</option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Annual salary"
            value={form.annualSalary}
            onChange={(value) => updateField("annualSalary", value)}
          />
          <NumberField
            label="Bonus %"
            value={form.bonusPercent}
            onChange={(value) => updateField("bonusPercent", value)}
          />
          <NumberField
            label="Benefits load %"
            value={form.benefitsLoadPercent}
            onChange={(value) => updateField("benefitsLoadPercent", value)}
          />
          <NumberField
            label="Payroll tax %"
            value={form.payrollTaxPercent}
            onChange={(value) => updateField("payrollTaxPercent", value)}
          />
        </div>

        <NumberField
          label="One-time equipment cost"
          value={form.oneTimeEquipmentCost}
          onChange={(value) => updateField("oneTimeEquipmentCost", value)}
        />

        <button
          type="button"
          onClick={onSubmit}
          className="mt-2 h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Run Hire Analysis
        </button>
      </div>
    </section>
  );
}

function ScenarioTable({
  scenarios,
}: {
  scenarios: ReturnType<typeof buildHireAnalysis>["scenarios"];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base font-semibold">Scenario Comparison</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Best, base, and worst cases show how the hire changes monthly burn and
          runway.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">Scenario</th>
              <th className="px-4 py-3 font-medium">Monthly burn impact</th>
              <th className="px-4 py-3 font-medium">Runway months</th>
              <th className="px-4 py-3 font-medium">Runway change</th>
              <th className="px-4 py-3 font-medium">Recommendation level</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => (
              <tr key={scenario.name} className="border-b border-neutral-100">
                <td className="px-4 py-3 font-medium">{scenario.name}</td>
                <td className="px-4 py-3">
                  {formatCurrency(scenario.monthlyBurnImpact)}
                </td>
                <td className="px-4 py-3">
                  {formatRunwayMonths(scenario.runwayMonths)}
                </td>
                <td className="px-4 py-3">
                  {formatMonthChange(scenario.runwayChangeMonths)}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
                    {scenario.recommendationLevel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildHireAnalysis(
  form: HireForm,
  baseline = {
    month: latestFinancials.month,
    cashBalance: latestFinancials.cashBalance,
    netBurn: latestFinancials.netBurn,
    runwayMonths: currentRunwayMonths,
  },
) {
  const costImpact = calculateHireCostImpact({
    annualSalary: form.annualSalary,
    bonusPercent: form.bonusPercent,
    benefitsLoadPercent: form.benefitsLoadPercent,
    payrollTaxPercent: form.payrollTaxPercent,
    oneTimeEquipmentCost: form.oneTimeEquipmentCost,
  });

  const currentScenario = calculateHireScenario({
    name: "Current case",
    currentCashBalance: baseline.cashBalance,
    currentNetBurn: baseline.netBurn,
    currentRunwayMonths: baseline.runwayMonths,
    monthlyBurnImpact: 0,
  });
  const bestScenario = calculateHireScenario({
    name: "Best case",
    currentCashBalance: baseline.cashBalance,
    currentNetBurn: baseline.netBurn,
    currentRunwayMonths: baseline.runwayMonths,
    monthlyBurnImpact: costImpact.totalMonthlyCostImpact * 0.75,
  });
  const baseScenario = calculateHireScenario({
    name: "Base case",
    currentCashBalance: baseline.cashBalance,
    currentNetBurn: baseline.netBurn,
    currentRunwayMonths: baseline.runwayMonths,
    monthlyBurnImpact: costImpact.totalMonthlyCostImpact,
  });
  const worstScenario = calculateHireScenario({
    name: "Worst case",
    currentCashBalance: baseline.cashBalance,
    currentNetBurn: baseline.netBurn,
    currentRunwayMonths: baseline.runwayMonths,
    monthlyBurnImpact: costImpact.totalMonthlyCostImpact * 1.15,
  });

  const recommendation = getRecommendation(baseScenario.runwayMonths, form);
  const estimatedCashOutDate = estimateCashOutDate(
    baseline.month,
    baseScenario.runwayMonths,
  );

  return {
    costImpact,
    currentScenario,
    bestScenario,
    baseScenario,
    worstScenario,
    scenarios: [currentScenario, bestScenario, baseScenario, worstScenario],
    recommendation,
    founderTakeaway: getFounderTakeaway(
      form,
      baseScenario.runwayMonths,
      baseScenario.runwayChangeMonths,
      costImpact.totalMonthlyCostImpact,
      baseline.runwayMonths,
    ),
    suggestedActions: getSuggestedActions(baseScenario.runwayMonths),
    estimatedCashOutDate,
  };
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none focus:border-neutral-950"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
      {label}
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none focus:border-neutral-950"
      />
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-md border border-neutral-200 bg-white p-5">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}

function BaselineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 p-4">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function getRecommendation(runwayMonths: number, form: HireForm) {
  if (runwayMonths > 12) {
    return `The ${form.roleTitle} hire appears affordable based on current cash and burn. The base case keeps runway above 12 months, but the forecast should still be updated before approval.`;
  }

  if (runwayMonths >= 9) {
    return `The ${form.roleTitle} hire may be affordable, but management should monitor burn and revenue closely. The decision leaves less cushion, so approval should be paired with forecast updates and monthly spend review.`;
  }

  return `The ${form.roleTitle} hire creates runway pressure and should likely be delayed, reduced, or paired with cost offsets before approval.`;
}

function getFounderTakeaway(
  form: HireForm,
  newRunway: number,
  runwayChange: number,
  monthlyCostImpact: number,
  baselineRunwayMonths: number,
) {
  return `${form.scenarioName} adds ${formatCurrency(monthlyCostImpact)} of monthly burn beginning in ${form.startMonth}. In the base case, runway moves from ${formatRunwayMonths(baselineRunwayMonths)} to ${formatRunwayMonths(newRunway)}, a change of ${formatMonthChange(runwayChange)}. This is a financeable decision only if the role has a clear link to revenue, product delivery, or operating leverage.`;
}

function getSuggestedActions(runwayMonths: number) {
  if (runwayMonths < 9) {
    return [
      "Delay the hire by 60 days while reviewing cash runway.",
      "Hire a contractor first to reduce fixed monthly burn.",
      "Offset the hire with expense reductions before approving the role.",
      "Review revenue assumptions and update the latest forecast.",
      "Prepare investor update language if runway falls below target.",
    ];
  }

  if (runwayMonths <= 12) {
    return [
      "Proceed only after updating the forecast with the new hire cost.",
      "Review revenue assumptions tied to the role.",
      "Identify discretionary spend that could offset part of the hire.",
      "Monitor net burn monthly against the revised forecast.",
      "Prepare investor update language around runway and hiring discipline.",
    ];
  }

  return [
    "Proceed, but update the forecast before the offer is finalized.",
    "Define success metrics for the role before approval.",
    "Review revenue assumptions tied to the hire.",
    "Monitor monthly burn after the start date.",
    "Confirm the hire fits the current operating plan.",
  ];
}

function formatMonthChange(value: number) {
  const rounded = Math.abs(value).toFixed(1);

  if (value === 0) {
    return "0.0 months";
  }

  return value > 0 ? `+${rounded} months` : `-${rounded} months`;
}
