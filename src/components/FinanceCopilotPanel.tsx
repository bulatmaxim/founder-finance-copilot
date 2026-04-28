"use client";

import { useEffect, useMemo, useState } from "react";
import { InsightCard } from "@/components/InsightCard";
import { Toast, type ToastMessage } from "@/components/Toast";
import {
  answerFinanceCopilotQuestion,
  generateFinanceInsights,
} from "@/lib/financeInsights";
import { buildFinanceSummary } from "@/lib/financeSummary";
import {
  clearLatestAIBrief,
  getLatestAIBrief,
  saveLatestAIBrief,
  type AICfoBrief,
} from "@/lib/localDataStore";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import {
  getAIBriefHistory,
  saveAIBriefToSupabase,
} from "@/lib/supabase/data";

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

type AIBriefHistoryRow = {
  id: string;
  period: string | null;
  status: string | null;
  created_at: string | null;
};

export function FinanceCopilotPanel({
  reportingMonth,
  mode = "full",
  showAsk = true,
}: FinanceCopilotPanelProps) {
  const insightResult = useMemo(
    () => generateFinanceInsights({ reportingMonth }),
    [reportingMonth],
  );
  const [aiBrief, setAiBrief] = useState<AICfoBrief | null>(() =>
    getLatestAIBrief(),
  );
  const [isGeneratingAiBrief, setIsGeneratingAiBrief] = useState(false);
  const [aiFallbackNote, setAiFallbackNote] = useState(
    aiBrief ? "" : "Using rule-based local analysis because OpenAI API is not configured.",
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState(presetQuestions[0]);
  const [briefHistory, setBriefHistory] = useState<AIBriefHistoryRow[]>([]);
  const answer = useMemo(
    () =>
      aiBrief
        ? answerQuestionFromAIBrief(selectedQuestion, aiBrief)
        : answerFinanceCopilotQuestion(selectedQuestion, {
            reportingMonth,
          }),
    [aiBrief, reportingMonth, selectedQuestion],
  );
  const showPriorityAlerts = mode !== "forecast";
  const showInvestorBullets = mode === "full" || mode === "reports";
  const showForecastRecommendation =
    mode === "full" || mode === "reports" || mode === "forecast";
  const displayedInsights = aiBrief
    ? aiBrief.priorityInsights.map((insight, index) => ({
        id: `ai-${index}-${insight.title}`,
        ...insight,
      }))
    : insightResult.priorityAlerts;
  const founderSummary = aiBrief?.executiveSummary ?? insightResult.founderSummary;
  const recommendedActions = aiBrief?.recommendedActions ?? insightResult.recommendedActions;
  const managementQuestions = aiBrief?.managementQuestions ?? insightResult.managementQuestions;
  const investorBullets = aiBrief?.investorUpdateBullets ?? insightResult.investorUpdateBullets;
  const forecastSummary =
    aiBrief?.forecastRecommendation ?? insightResult.forecastRecommendation.summary;

  useEffect(() => {
    async function loadBriefHistory() {
      if (!hasSupabaseBrowserEnv()) {
        return;
      }

      setBriefHistory(await getAIBriefHistory());
    }

    void loadBriefHistory();
  }, []);

  async function handleGenerateAIBrief() {
    setIsGeneratingAiBrief(true);
    setAiFallbackNote("");

    try {
      const financeSummary = buildFinanceSummary(reportingMonth);
      const dataWarning = getFinanceSummaryWarning(financeSummary);
      const response = await fetch("/api/ai/cfo-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financeSummary }),
      });
      const payload = (await response.json()) as {
        brief?: AICfoBrief;
        error?: string;
      };

      if (!response.ok || !payload.brief) {
        throw new Error(payload.error ?? "AI CFO Brief failed.");
      }

      const brief = {
        ...payload.brief,
        generatedAt: new Date().toISOString(),
        reportingPeriod: financeSummary.displayPeriod,
      };

      saveLatestAIBrief(brief);
      if (hasSupabaseBrowserEnv()) {
        try {
          await saveAIBriefToSupabase({
            period: financeSummary.period,
            sourceSummary: financeSummary,
            aiOutput: brief,
          });
          setBriefHistory(await getAIBriefHistory());
        } catch (saveError) {
          console.error("AI CFO Brief Supabase save failed", saveError);
        }
      }
      setAiBrief(brief);
      setToast({
        id: Date.now(),
        type: dataWarning ? "warning" : "success",
        title: dataWarning
          ? "AI CFO Brief generated with data warning."
          : "AI CFO Brief generated successfully.",
        detail: dataWarning,
      });
    } catch (error) {
      console.error("AI CFO Brief failed", error);
      setAiFallbackNote(
        "Using rule-based local analysis because OpenAI API is not configured.",
      );
      setToast({
        id: Date.now(),
        type: "error",
        title: "AI CFO Brief failed. Check API key or server logs.",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsGeneratingAiBrief(false);
    }
  }

  function handleClearAIBrief() {
    clearLatestAIBrief();
    setAiBrief(null);
    setAiFallbackNote(
      "Using rule-based local analysis because OpenAI API is not configured.",
    );
    setToast({
      id: Date.now(),
      type: "info",
      title: "AI CFO Brief cleared.",
    });
  }

  return (
    <section className="space-y-6">
      <Toast message={toast} onClose={() => setToast(null)} />
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
          Finance Copilot
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Local CFO Analyst
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          {aiBrief
            ? "AI-generated CFO commentary using calculated local finance summary data."
            : `Rule-based finance analysis for ${insightResult.companyName}, using local browser data only.`}
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
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerateAIBrief}
            disabled={isGeneratingAiBrief}
            className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {isGeneratingAiBrief ? "Generating CFO Brief..." : "Generate AI CFO Brief"}
          </button>
          {aiBrief ? (
            <button
              type="button"
              onClick={handleClearAIBrief}
              className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50"
            >
              Clear AI Brief
            </button>
          ) : null}
        </div>
        {aiFallbackNote && !aiBrief ? (
          <p className="mt-3 text-sm text-neutral-500">{aiFallbackNote}</p>
        ) : null}
        {aiBrief ? (
          <p className="mt-3 text-sm text-neutral-500">
            Latest AI brief saved locally
            {aiBrief.reportingPeriod ? ` for ${aiBrief.reportingPeriod}` : ""}.
            {hasSupabaseBrowserEnv() ? " Supabase persistence is enabled." : ""}
          </p>
        ) : null}
      </div>

      {briefHistory.length > 0 ? (
        <section className="rounded-md border border-neutral-200 bg-white p-5">
          <h3 className="text-base font-semibold">Prior CFO Briefs</h3>
          <div className="mt-4 divide-y divide-neutral-100">
            {briefHistory.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-neutral-950">
                  {item.period || "Unlabeled period"}
                </span>
                <span className="text-neutral-500">
                  {formatHistoryDate(item.created_at)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h3 className="text-base font-semibold">
          {aiBrief ? "AI CFO Summary" : "Founder Summary"}
        </h3>
        <p className="mt-3 text-sm leading-6 text-neutral-700">
          {founderSummary}
        </p>
        {aiBrief?.boardSlideSummary ? (
          <p className="mt-3 text-sm leading-6 text-neutral-500">
            Board slide summary: {aiBrief.boardSlideSummary}
          </p>
        ) : null}
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
            {displayedInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <ListSection
          title="Recommended Actions"
          items={recommendedActions}
          ordered
        />
        <ListSection
          title="Management Questions"
          items={managementQuestions}
        />
      </div>

      {showInvestorBullets ? (
        <ListSection
          title="Investor Update Bullets"
          items={investorBullets}
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
                {forecastSummary}
              </p>
            </div>
            <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
              {aiBrief
                ? "AI generated"
                : insightResult.forecastRecommendation.shouldUpdate
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
                {(aiBrief
                  ? [aiBrief.forecastRecommendation]
                  : insightResult.forecastRecommendation.reasons
                ).map((reason) => (
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
                {(aiBrief
                  ? ["AI CFO brief"]
                  : insightResult.forecastRecommendation.drivers
                ).map((driver) => (
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

function getFinanceSummaryWarning(financeSummary: ReturnType<typeof buildFinanceSummary>) {
  if (financeSummary.dataSourceStatus.isUsingUnapproved) {
    return `The monthly close for ${financeSummary.displayPeriod} is not fully approved. This CFO Brief may be based on incomplete or unapproved data.`;
  }

  if (financeSummary.dataSourceStatus.isUsingSample) {
    return `The CFO Brief for ${financeSummary.displayPeriod} uses demo sample data where approved company uploads are missing.`;
  }

  return "";
}

function formatHistoryDate(value: string | null) {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function answerQuestionFromAIBrief(question: string, brief: AICfoBrief) {
  switch (question) {
    case "What changed this month?":
      return brief.executiveSummary;
    case "Why did runway change?":
      return brief.runwayWarning || brief.executiveSummary;
    case "Are we off budget?":
      return brief.priorityInsights
        .filter((insight) => ["Revenue", "Expenses", "Forecast"].includes(insight.category))
        .map((insight) => insight.summary)
        .join(" ");
    case "Should we update the forecast?":
      return brief.forecastRecommendation;
    case "What should we tell investors?":
      return brief.investorUpdateBullets.join(" ");
    case "What actions should management take?":
      return brief.recommendedActions.join(" ");
    default:
      return brief.executiveSummary;
  }
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
