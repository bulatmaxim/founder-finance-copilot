"use client";

import { useMemo, useState } from "react";
import { sampleBudget } from "@/data/sampleBudget";
import { sampleCompany } from "@/data/sampleCompany";
import { sampleFinancials } from "@/data/sampleFinancials";
import {
  calculateVarianceDollars,
  calculateVariancePercent,
  getVarianceStatus,
  type FavorableDirection,
} from "@/lib/calculations";
import {
  formatCurrency,
  formatPercent,
  formatPercentVarianceLabel,
  formatRunwayMonths,
  formatVarianceLabel,
} from "@/lib/formatting";
import { generateMonthlyCfoDeck } from "@/lib/powerpoint";

type Highlight = {
  label: string;
  actual: string;
  budget: string;
  variance: string;
  status: string;
};

type BriefContent = {
  executiveSummary: string[];
  highlights: Highlight[];
  revenueCommentary: string[];
  expenseCommentary: string[];
  cashRunwayCommentary: string[];
  budgetCommentary: string[];
  risks: string[];
  actions: string[];
  investorBullets: string[];
};

type MetricVariance = {
  dollars: number;
  percent: number;
  status: string;
};

export function CFOBrief() {
  const [selectedMonth, setSelectedMonth] = useState(
    sampleFinancials[sampleFinancials.length - 1].month,
  );
  const [generatedMonth, setGeneratedMonth] = useState(selectedMonth);
  const [deckMessage, setDeckMessage] = useState("");
  const [isGeneratingDeck, setIsGeneratingDeck] = useState(false);

  const brief = useMemo(
    () => buildBriefForMonth(generatedMonth),
    [generatedMonth],
  );

  async function handleDeckGeneration() {
    const deckMonth = selectedMonth;

    setGeneratedMonth(deckMonth);
    setIsGeneratingDeck(true);
    setDeckMessage("Generating PowerPoint deck from local sample data...");

    try {
      const deckBrief = buildBriefForMonth(deckMonth);
      const fileName = await generateMonthlyCfoDeck({
        reportingMonth: deckMonth,
        brief: deckBrief,
      });
      setDeckMessage(`${fileName} was generated and sent to your browser downloads.`);
    } catch (error) {
      console.error("Monthly CFO Deck generation failed", error);
      const message =
        error instanceof Error
          ? error.message
          : "Unknown PowerPoint export error.";
      setDeckMessage(`Deck generation failed: ${message}`);
    } finally {
      setIsGeneratingDeck(false);
    }
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
            Reports
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            CFO Brief
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
            Rule-based monthly finance brief for {sampleCompany.name}, using
            local sample actuals and budget data only.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 sm:min-w-52">
            Reporting period
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none focus:border-neutral-950"
            >
              {sampleFinancials.map((period) => (
                <option key={period.month} value={period.month}>
                  {period.month}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setGeneratedMonth(selectedMonth)}
            className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Generate CFO Brief
          </button>
          <button
            type="button"
            onClick={handleDeckGeneration}
            disabled={isGeneratingDeck}
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            Generate Monthly CFO Deck
          </button>
        </div>
      </div>

      {deckMessage ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          {deckMessage}
        </div>
      ) : null}

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">Monthly CFO Brief</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          Generate an investor-ready monthly CFO deck from the local dashboard,
          budget vs actuals, forecast, and rule-based CFO commentary.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            "Title Slide",
            "Executive Summary",
            "Key Financial Metrics",
            "Revenue Performance",
            "Expense Performance",
            "Budget vs Actuals",
            "Cash & Runway",
            "Forecast Update",
            "Key Risks",
            "Recommended Actions",
            "Investor Update Bullets",
            "Appendix",
          ].map((slideName, index) => (
            <div
              key={slideName}
              className="rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
            >
              <span className="font-medium text-neutral-950">
                Slide {index + 1}:
              </span>{" "}
              {slideName}
            </div>
          ))}
        </div>
      </section>

      <BriefSection title="Executive Summary" items={brief.executiveSummary} />

      <section className="rounded-md border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-base font-semibold">Key Financial Highlights</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Actual performance compared with budget for {generatedMonth}.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-4 py-3 font-medium">Metric</th>
                <th className="px-4 py-3 font-medium">Actual</th>
                <th className="px-4 py-3 font-medium">Budget</th>
                <th className="px-4 py-3 font-medium">Variance</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {brief.highlights.map((highlight) => (
                <tr key={highlight.label} className="border-b border-neutral-100">
                  <td className="px-4 py-3 font-medium">{highlight.label}</td>
                  <td className="px-4 py-3">{highlight.actual}</td>
                  <td className="px-4 py-3">{highlight.budget}</td>
                  <td className="px-4 py-3">{highlight.variance}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
                      {highlight.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <BriefSection title="Revenue Commentary" items={brief.revenueCommentary} />
        <BriefSection title="Expense Commentary" items={brief.expenseCommentary} />
        <BriefSection
          title="Cash & Runway Commentary"
          items={brief.cashRunwayCommentary}
        />
        <BriefSection
          title="Budget vs Actual Commentary"
          items={brief.budgetCommentary}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <BriefSection title="Key Risks" items={brief.risks} ordered />
        <BriefSection title="Recommended Actions" items={brief.actions} ordered />
        <BriefSection
          title="Investor Update Bullets"
          items={brief.investorBullets}
        />
      </div>
    </section>
  );
}

function BriefSection({
  title,
  items,
  ordered = false,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
}) {
  const ListTag = ordered ? "ol" : "ul";

  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <ListTag className="mt-4 space-y-3 text-sm leading-6 text-neutral-700">
        {items.map((item) => (
          <li key={item} className={ordered ? "list-decimal ml-4" : "list-disc ml-4"}>
            {item}
          </li>
        ))}
      </ListTag>
    </section>
  );
}

function buildBriefForMonth(month: string): BriefContent {
  const index = sampleFinancials.findIndex((period) => period.month === month);
  const actual = sampleFinancials[index];
  const budget = sampleBudget[index];
  const priorActual = index > 0 ? sampleFinancials[index - 1] : null;

  if (!actual || !budget) {
    throw new Error(`Missing local sample data for reporting period ${month}.`);
  }

  const revenue = metricVariance(actual.revenue, budget.revenue, "higher");
  const grossMargin = metricVariance(
    actual.grossMargin,
    budget.grossMargin,
    "higher",
  );
  const operatingExpenses = metricVariance(
    actual.operatingExpenses,
    budget.operatingExpenses,
    "lower",
  );
  const ebitda = metricVariance(actual.ebitda, budget.ebitda, "higher");
  const cashBalance = metricVariance(
    actual.cashBalance,
    budget.cashBalance,
    "higher",
  );
  const netBurn = metricVariance(actual.netBurn, budget.netBurn, "lower");
  const runway = metricVariance(
    actual.runwayMonths,
    budget.runwayMonths,
    "higher",
  );

  const cashChange = priorActual
    ? actual.cashBalance - priorActual.cashBalance
    : 0;
  const bothRevenueAndExpensesUnfavorable =
    revenue.status === "Unfavorable" &&
    operatingExpenses.status === "Unfavorable";
  const profitabilityDriver = bothRevenueAndExpensesUnfavorable
    ? "both revenue shortfall and expense pressure"
    : revenue.status === "Unfavorable"
      ? "revenue shortfall"
      : operatingExpenses.status === "Unfavorable"
        ? "expense pressure"
        : "continued planned investment";

  const executiveSummary = [
    `${sampleCompany.name} generated ${formatCurrency(actual.revenue)} of revenue in ${month}, ${revenue.status === "Favorable" ? "ahead of" : revenue.status === "Unfavorable" ? "below" : "in line with"} budget by ${formatVarianceLabel(revenue.dollars)} (${formatPercentVarianceLabel(revenue.percent)}).`,
    `Operating expenses were ${formatCurrency(actual.operatingExpenses)}, ${operatingExpenses.status === "Favorable" ? "favorable to" : operatingExpenses.status === "Unfavorable" ? "above" : "in line with"} budget by ${formatVarianceLabel(operatingExpenses.dollars)}.`,
    `EBITDA finished at ${formatCurrency(actual.ebitda)}, ${ebitda.status === "Favorable" ? "better than" : ebitda.status === "Unfavorable" ? "below" : "in line with"} plan by ${formatVarianceLabel(ebitda.dollars)} due to ${profitabilityDriver}.`,
  ];

  const revenueCommentary =
    revenue.status === "Favorable"
      ? [
          `Revenue outperformed budget by ${formatVarianceLabel(revenue.dollars)} (${formatPercentVarianceLabel(revenue.percent)}), indicating demand and conversion tracked ahead of the operating plan.`,
          `Management should validate whether the upside is recurring and update the forecast if the improvement is durable.`,
        ]
      : revenue.status === "Unfavorable"
        ? [
            `Revenue finished below budget by ${formatVarianceLabel(revenue.dollars)} (${formatPercentVarianceLabel(revenue.percent)}), creating pressure on EBITDA and cash efficiency.`,
            `The shortfall should be reviewed against pipeline conversion, churn, expansion, and timing assumptions.`,
          ]
        : [
            "Revenue landed in line with budget, which keeps the operating plan anchored to the current forecast.",
            "Management should continue monitoring pipeline quality and expansion revenue to preserve momentum.",
          ];

  const expenseCommentary =
    operatingExpenses.status === "Favorable"
      ? [
          `Operating expenses were favorable to budget by ${formatVarianceLabel(operatingExpenses.dollars)}, showing near-term expense discipline.`,
          "The team should confirm whether the favorability reflects timing delays or structural savings before changing the forecast.",
        ]
      : operatingExpenses.status === "Unfavorable"
        ? [
            `Operating expenses exceeded budget by ${formatVarianceLabel(operatingExpenses.dollars)}, indicating expense pressure in the month.`,
            `R&D and go-to-market spend should be reviewed first, as those categories represent the largest operating expense pools in the local sample data.`,
          ]
        : [
            "Operating expenses were in line with budget, which suggests spend control is tracking to plan.",
            "Management should keep hiring and vendor commitments tied to the current revenue trajectory.",
          ];

  const cashRunwayCommentary = [
    cashChange < 0
      ? `Cash decreased month over month by ${formatCurrency(Math.abs(cashChange))}, ending at ${formatCurrency(actual.cashBalance)}.`
      : cashChange > 0
        ? `Cash increased month over month by ${formatCurrency(cashChange)}, ending at ${formatCurrency(actual.cashBalance)}.`
        : `Cash ended at ${formatCurrency(actual.cashBalance)}, with no prior-month movement available for this period.`,
    `Net burn was ${formatCurrency(actual.netBurn)}, ${netBurn.status === "Favorable" ? "below" : netBurn.status === "Unfavorable" ? "above" : "in line with"} budget by ${formatVarianceLabel(netBurn.dollars)}.`,
    `Runway stands at ${formatRunwayMonths(actual.runwayMonths)}, compared with ${formatRunwayMonths(budget.runwayMonths)} in the budget.`,
  ];

  const budgetCommentary = [
    revenue.status === "Favorable"
      ? `Revenue was favorable to budget by ${formatVarianceLabel(revenue.dollars)}.`
      : revenue.status === "Unfavorable"
        ? `Revenue was unfavorable to budget by ${formatVarianceLabel(revenue.dollars)}.`
        : "Revenue was in line with budget.",
    operatingExpenses.status === "Favorable"
      ? `Operating expenses were favorable by ${formatVarianceLabel(operatingExpenses.dollars)}.`
      : operatingExpenses.status === "Unfavorable"
        ? `Operating expenses were unfavorable by ${formatVarianceLabel(operatingExpenses.dollars)}.`
        : "Operating expenses were in line with budget.",
    ebitda.status === "Unfavorable"
      ? `Profitability was below plan due to ${profitabilityDriver}.`
      : `Profitability was ${ebitda.status === "Favorable" ? "ahead of" : "in line with"} plan for the month.`,
  ];

  const risks = buildRisks({
    revenue,
    operatingExpenses,
    ebitda,
    netBurn,
    runway,
    runwayMonths: actual.runwayMonths,
  });

  const actions = buildActions({
    revenue,
    operatingExpenses,
    ebitda,
    netBurn,
    runwayMonths: actual.runwayMonths,
  });

  const investorBullets = [
    `${month} revenue was ${formatCurrency(actual.revenue)}, ${revenue.status === "Favorable" ? "ahead of" : revenue.status === "Unfavorable" ? "below" : "in line with"} budget by ${formatVarianceLabel(revenue.dollars)}.`,
    `Gross margin was ${formatPercent(actual.grossMargin)} versus ${formatPercent(budget.grossMargin)} budget.`,
    `Ending cash was ${formatCurrency(actual.cashBalance)} with ${formatRunwayMonths(actual.runwayMonths)} of runway.`,
    `Net burn was ${formatCurrency(actual.netBurn)}, ${netBurn.status === "Favorable" ? "below" : netBurn.status === "Unfavorable" ? "above" : "in line with"} plan.`,
    `Management focus: ${actions[0].toLowerCase()}`,
  ];

  return {
    executiveSummary,
    highlights: [
      highlight("Revenue", actual.revenue, budget.revenue, revenue, "currency"),
      highlight(
        "Gross Margin",
        actual.grossMargin,
        budget.grossMargin,
        grossMargin,
        "percent",
      ),
      highlight(
        "Operating Expenses",
        actual.operatingExpenses,
        budget.operatingExpenses,
        operatingExpenses,
        "currency",
      ),
      highlight("EBITDA", actual.ebitda, budget.ebitda, ebitda, "currency"),
      highlight(
        "Cash Balance",
        actual.cashBalance,
        budget.cashBalance,
        cashBalance,
        "currency",
      ),
      highlight("Net Burn", actual.netBurn, budget.netBurn, netBurn, "currency"),
      highlight(
        "Runway Months",
        actual.runwayMonths,
        budget.runwayMonths,
        runway,
        "months",
      ),
    ],
    revenueCommentary,
    expenseCommentary,
    cashRunwayCommentary,
    budgetCommentary,
    risks,
    actions,
    investorBullets,
  };
}

function metricVariance(
  actual: number,
  budget: number,
  favorableDirection: FavorableDirection,
): MetricVariance {
  return {
    dollars: calculateVarianceDollars(actual, budget),
    percent: calculateVariancePercent(actual, budget),
    status: getVarianceStatus(actual, budget, favorableDirection),
  };
}

function highlight(
  label: string,
  actual: number,
  budget: number,
  variance: MetricVariance,
  format: "currency" | "percent" | "months",
): Highlight {
  return {
    label,
    actual: formatValue(actual, format),
    budget: formatValue(budget, format),
    variance:
      format === "currency"
        ? `${formatVarianceLabel(variance.dollars)} (${formatPercentVarianceLabel(variance.percent)})`
        : format === "percent"
          ? `${formatPointVariance(variance.dollars)} (${formatPercentVarianceLabel(variance.percent)})`
          : `${formatMonthVariance(variance.dollars)} (${formatPercentVarianceLabel(variance.percent)})`,
    status: variance.status,
  };
}

function buildRisks({
  revenue,
  operatingExpenses,
  ebitda,
  netBurn,
  runway,
  runwayMonths,
}: {
  revenue: MetricVariance;
  operatingExpenses: MetricVariance;
  ebitda: MetricVariance;
  netBurn: MetricVariance;
  runway: MetricVariance;
  runwayMonths: number;
}) {
  const risks: string[] = [];

  if (revenue.status === "Unfavorable") {
    risks.push("Revenue is tracking below budget, which could pressure forecast confidence.");
  }

  if (operatingExpenses.status === "Unfavorable") {
    risks.push("Operating expenses are above budget, creating spend pressure.");
  }

  if (runwayMonths < 9) {
    risks.push("Runway is below 9 months and should be treated as a high-priority financing and cost-control risk.");
  } else if (runwayMonths < 12) {
    risks.push("Runway is below 12 months and should be monitored as a key risk.");
  } else if (runway.status === "Unfavorable") {
    risks.push("Runway is below budget, reducing cushion versus the operating plan.");
  }

  if (netBurn.status === "Unfavorable") {
    risks.push("Net burn is running higher than planned.");
  }

  if (ebitda.status === "Unfavorable") {
    risks.push("EBITDA is below budget, indicating profitability is behind plan.");
  }

  return risks.slice(0, 5);
}

function buildActions({
  revenue,
  operatingExpenses,
  ebitda,
  netBurn,
  runwayMonths,
}: {
  revenue: MetricVariance;
  operatingExpenses: MetricVariance;
  ebitda: MetricVariance;
  netBurn: MetricVariance;
  runwayMonths: number;
}) {
  const actions: string[] = [];

  if (operatingExpenses.status === "Unfavorable") {
    actions.push("Review expense categories driving the unfavorable variance.");
  }

  if (revenue.status === "Unfavorable") {
    actions.push("Investigate the revenue shortfall versus budget.");
  }

  if (netBurn.status === "Unfavorable") {
    actions.push("Update the latest forecast to reflect higher burn.");
  }

  if (runwayMonths < 12) {
    actions.push("Review the hiring plan and discretionary spend against runway targets.");
  }

  if (ebitda.status === "Unfavorable") {
    actions.push("Prepare management commentary explaining EBITDA performance versus plan.");
  }

  actions.push("Prepare investor update language around cash runway.");

  return ensureCount(actions, [
    "Refresh the latest forecast with actual monthly performance.",
    "Confirm whether favorable variances are timing-related or structural.",
    "Review hiring, vendor, and go-to-market spend before the next close.",
  ]);
}

function ensureCount(items: string[], fallback: string[]) {
  const unique = [...new Set([...items, ...fallback])];

  return unique.slice(0, 5);
}

function formatValue(value: number, format: "currency" | "percent" | "months") {
  if (format === "percent") {
    return formatPercent(value);
  }

  if (format === "months") {
    return formatRunwayMonths(value);
  }

  return formatCurrency(value);
}

function formatPointVariance(value: number) {
  const prefix = value >= 0 ? "+" : "-";

  return `${prefix}${Math.abs(value * 100).toFixed(1)} pts`;
}

function formatMonthVariance(value: number) {
  const prefix = value >= 0 ? "+" : "-";

  return `${prefix}${Math.abs(value).toFixed(1)} months`;
}
