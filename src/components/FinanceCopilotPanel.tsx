"use client";

import { useMemo, useState } from "react";
import { InsightCard } from "@/components/InsightCard";
import {
  answerFinanceCopilotQuestion,
  generateFinanceInsights,
} from "@/lib/financeInsights";

type FinanceCopilotPanelProps = {
  reportingMonth?: string;
  mode?: "full" | "dashboard" | "reports" | "forecast";
  showAsk?: boolean;
};

const presetQuestions = [
  "What changed this month?",
  "Why did runway change?",
  "Are we off budget?",
  "Should we update the forecast?",
  "What should we tell investors?",
  "What actions should management take?",
];

export function FinanceCopilotPanel({
  reportingMonth,
  mode = "full",
  showAsk = true,
}: FinanceCopilotPanelProps) {
  const insightResult = useMemo(
    () => generateFinanceInsights({ reportingMonth }),
    [reportingMonth],
  );
  const [selectedQuestion, setSelectedQuestion] = useState(presetQuestions[0]);
  const answer = useMemo(
    () =>
      answerFinanceCopilotQuestion(selectedQuestion, {
        reportingMonth,
      }),
    [reportingMonth, selectedQuestion],
  );
  const showPriorityAlerts = mode !== "forecast";
  const showInvestorBullets = mode === "full" || mode === "reports";
  const showForecastRecommendation =
    mode === "full" || mode === "reports" || mode === "forecast";

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Finance Copilot
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Local CFO Analyst
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          Rule-based finance analysis for {insightResult.companyName}, using
          local browser data only.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700">
            {insightResult.actualsSource}
          </span>
          <span className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700">
            {insightResult.budgetSource}
          </span>
          <span className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700">
            {insightResult.cashSource}
          </span>
          {insightResult.dataWarnings.map((warning) => (
            <span key={warning} className="text-sm text-neutral-500">
              {warning}
            </span>
          ))}
        </div>
      </div>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h3 className="text-base font-semibold">Founder Summary</h3>
        <p className="mt-3 text-sm leading-6 text-neutral-700">
          {insightResult.founderSummary}
        </p>
      </section>

      {showPriorityAlerts ? (
        <section className="space-y-4">
          <div>
            <h3 className="text-base font-semibold">Priority Alerts</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Highest-priority insights sorted by severity.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {insightResult.priorityAlerts.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <ListSection
          title="Recommended Actions"
          items={insightResult.recommendedActions}
          ordered
        />
        <ListSection
          title="Management Questions"
          items={insightResult.managementQuestions}
        />
      </div>

      {showInvestorBullets ? (
        <ListSection
          title="Investor Update Bullets"
          items={insightResult.investorUpdateBullets}
        />
      ) : null}

      {showForecastRecommendation ? (
        <section className="rounded-md border border-neutral-200 bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-base font-semibold">
                Forecast Update Recommendation
              </h3>
              <p className="mt-2 text-sm leading-6 text-neutral-700">
                {insightResult.forecastRecommendation.summary}
              </p>
            </div>
            <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
              {insightResult.forecastRecommendation.shouldUpdate
                ? "Update recommended"
                : "No immediate update"}
            </span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
                Reasons
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-700">
                {insightResult.forecastRecommendation.reasons.map((reason) => (
                  <li key={reason} className="ml-4 list-disc">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
                Drivers
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {insightResult.forecastRecommendation.drivers.map((driver) => (
                  <span
                    key={driver}
                    className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700"
                  >
                    {driver}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {showAsk ? (
        <section className="rounded-md border border-neutral-200 bg-white p-5">
          <h3 className="text-base font-semibold">Ask Finance Copilot</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {presetQuestions.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => setSelectedQuestion(question)}
                className={`rounded-md border px-3 py-2 text-sm font-medium ${
                  selectedQuestion === question
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {question}
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-sm font-medium text-neutral-950">
              {selectedQuestion}
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-700">{answer}</p>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ListSection({
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
      <h3 className="text-base font-semibold">{title}</h3>
      <ListTag className="mt-4 space-y-3 text-sm leading-6 text-neutral-700">
        {items.map((item) => (
          <li
            key={item}
            className={ordered ? "ml-4 list-decimal" : "ml-4 list-disc"}
          >
            {item}
          </li>
        ))}
      </ListTag>
    </section>
  );
}
