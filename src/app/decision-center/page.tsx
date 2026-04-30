"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Toast, type ToastMessage, type ToastType } from "@/components/Toast";
import { saveDecisionMemo as saveDecisionMemoRecord } from "@/lib/decisionMemos";
import { formatCurrency, formatRunwayMonths } from "@/lib/formatting";
import {
  getActiveBudgetData,
  getActiveCashData,
  getActiveFinancialData,
  getActualsSourceLabel,
  getBudgetSourceLabel,
  getCashSourceLabel,
  isApprovedDataSource,
  type DataSourceMode,
} from "@/lib/localDataStore";
import {
  getSelectedForecastVersionId,
  loadForecastVersionsForDisplay,
  type ForecastVersionWithRows,
} from "@/lib/forecastVersions";

type DecisionType =
  | "Hiring"
  | "Capital purchase"
  | "Loan / financing"
  | "Acquisition"
  | "Marketing spend"
  | "Office / lease"
  | "Pricing change"
  | "Cost reduction"
  | "Product launch"
  | "Market expansion"
  | "Other";

type DecisionQuestion = {
  id: string;
  label: string;
  question: string;
  fieldType: "text" | "currency" | "percent" | "number" | "date";
  required: boolean;
  placeholder: string;
  whyItMatters: string;
};

type DecisionQuestionResponse = {
  decisionType: DecisionType;
  confidence: "High" | "Medium" | "Low";
  summary: string;
  questions: DecisionQuestion[];
};

type DecisionAnalysis = {
  recommendation:
    | "Proceed"
    | "Proceed with conditions"
    | "Wait"
    | "Resize / reduce scope"
    | "Finance differently"
    | "Not enough information";
  cfoSummary: string;
  financialImpact: {
    upfrontCost: string;
    monthlyRecurringImpact: string;
    runwayImpact: string;
    cashBalanceImpact: string;
    ebitdaOperatingExpenseImpact: string;
    forecastImpact: string;
    paybackRoi: string;
  };
  keyAssumptions: string[];
  risks: {
    category: string;
    severity: "Low" | "Medium" | "High";
    description: string;
    mitigation: string;
  }[];
  unresolvedQuestions: string[];
  recommendedNextSteps: string[];
  scenarios: {
    name: "Base case" | "Conservative case" | "Aggressive case";
    summary: string;
    cashImpact: string;
    runwayImpact: string;
    conditions: string;
  }[];
  dataWarnings: string[];
};

const promptExamples = [
  "Buy new equipment for $250K",
  "Hire a VP Sales",
  "Take out a $500K loan",
  "Increase marketing spend by $40K/month",
  "Open a new office",
  "Acquire a small competitor for $1.2M",
  "Delay hiring for one quarter",
  "Launch a new product line",
];

export default function DecisionCenterPage() {
  const [decisionPrompt, setDecisionPrompt] = useState("");
  const [questionResponse, setQuestionResponse] =
    useState<DecisionQuestionResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [analysis, setAnalysis] = useState<DecisionAnalysis | null>(null);
  const [forecastVersions, setForecastVersions] = useState<ForecastVersionWithRows[]>([]);
  const [selectedForecastVersionId, setSelectedForecastVersionId] = useState("");
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [savedMemoId, setSavedMemoId] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const activeData = useMemo(() => getActiveFinancialData(), []);
  const activeBudget = useMemo(() => getActiveBudgetData(), []);
  const activeCash = useMemo(() => getActiveCashData(), []);
  const selectedForecastVersion =
    forecastVersions.find((version) => version.id === selectedForecastVersionId) ??
    forecastVersions[0] ??
    null;
  const latestFinancialPeriod = activeData.periods.at(-1) ?? null;
  const latestCashPeriod = activeCash.periods.at(-1) ?? null;
  const dataWarning = buildDataWarning({
    actualsSource: activeData.dataSource,
    budgetSource: activeBudget.dataSource,
    cashSource: activeCash.dataSource,
    forecastVersion: selectedForecastVersion,
  });

  function notify(type: ToastType, title: string, detail?: string) {
    setToast({ id: Date.now(), type, title, detail });
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      async function loadVersions() {
        setIsLoadingVersions(true);

        try {
          const loaded = await loadForecastVersionsForDisplay();
          const selectedId = getSelectedForecastVersionId();
          setForecastVersions(loaded);
          setSelectedForecastVersionId(
            selectedId && loaded.some((version) => version.id === selectedId)
              ? selectedId
              : loaded[0]?.id ?? "",
          );
        } catch (error) {
          console.error("Decision Center forecast version load failed", error);
        } finally {
          setIsLoadingVersions(false);
        }
      }

      void loadVersions();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  async function startDecisionAnalysis() {
    const prompt = decisionPrompt.trim();

    if (!prompt) {
      notify("warning", "Describe the decision first.");
      return;
    }

    setIsGeneratingQuestions(true);
    setAnalysis(null);

    try {
      const response = await fetch("/api/ai/decision-questions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision_prompt: prompt }),
      });
      const payload = (await response.json()) as {
        questions?: DecisionQuestionResponse;
        error?: string;
      };

      if (!response.ok || !payload.questions) {
        throw new Error(payload.error ?? "Decision questions could not be generated.");
      }

      setQuestionResponse(payload.questions);
      setAnswers(
        Object.fromEntries(payload.questions.questions.map((question) => [question.id, ""])),
      );
      notify(
        "success",
        "Follow-up questions ready.",
        "Answer what you can; the advisor can proceed with clearly stated assumptions.",
      );
    } catch (error) {
      console.error("Decision questions failed", error);
      notify(
        "error",
        "Follow-up questions could not be generated.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsGeneratingQuestions(false);
    }
  }

  async function analyzeDecision() {
    if (!questionResponse) {
      notify("warning", "Start the decision analysis first.");
      return;
    }

    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/ai/decision-analysis", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision_prompt: decisionPrompt,
          decision_type: questionResponse.decisionType,
          questions: questionResponse.questions,
          answers,
          forecast_version_id: selectedForecastVersion?.id,
        }),
      });
      const payload = (await response.json()) as {
        analysis?: DecisionAnalysis;
        error?: string;
      };

      if (!response.ok || !payload.analysis) {
        throw new Error(payload.error ?? "Decision analysis failed.");
      }

      setAnalysis(payload.analysis);
      setSavedMemoId("");
      notify(
        "success",
        "Decision analysis complete.",
        "Review the recommendation, risks, and scenarios before taking action.",
      );
    } catch (error) {
      console.error("Decision analysis failed", error);
      notify(
        "error",
        "Decision analysis could not be completed.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function saveDecisionMemo() {
    if (!analysis || !questionResponse) {
      notify("warning", "Analyze the decision before saving a memo.");
      return;
    }

    setIsSavingMemo(true);

    try {
      const memo = await saveDecisionMemoRecord({
        title: decisionPrompt.slice(0, 120),
        decisionType: questionResponse.decisionType,
        decisionPrompt: decisionPrompt,
        questions: questionResponse.questions,
        answers,
        analysis,
        recommendation: analysis.recommendation,
      });

      setSavedMemoId(memo.id);
      notify("success", "Decision memo saved.", "Saved as a Draft decision memo.");
    } catch (error) {
      console.error("Decision memo save failed", error);
      notify(
        "error",
        "Decision memo could not be saved.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsSavingMemo(false);
    }
  }

  async function copySummary() {
    if (!analysis) {
      notify("warning", "Analyze the decision before copying a summary.");
      return;
    }

    const text = [
      `Decision: ${decisionPrompt}`,
      `Recommendation: ${analysis.recommendation}`,
      "",
      analysis.cfoSummary,
      "",
      "Next steps:",
      ...analysis.recommendedNextSteps.map((step) => `- ${step}`),
    ].join("\n");

    await navigator.clipboard.writeText(text);
    notify("success", "Summary copied.");
  }

  return (
    <section className="space-y-8">
      <Toast message={toast} onClose={() => setToast(null)} />

      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Decision Center
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Decision Center
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
            Analyze major business decisions with AI using your company&apos;s
            cash, forecast, budget, and operating data.
          </p>
        </div>
        <p className="max-w-md text-sm leading-6 text-[var(--text-muted)]">
          This analysis is decision-support only and should be reviewed by
          management before action.
        </p>
      </div>

      <section className="premium-card overflow-hidden">
        <div className="premium-panel-header p-5">
          <p className="premium-pill inline-flex">AI Decision Advisor</p>
          <h2 className="mt-3 text-xl font-semibold">What decision are you considering?</h2>
        </div>
        <div className="space-y-4 p-5">
          <textarea
            value={decisionPrompt}
            onChange={(event) => setDecisionPrompt(event.target.value)}
            placeholder={promptExamples.join("\n")}
            className="min-h-40 w-full rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] px-4 py-4 text-sm leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isGeneratingQuestions}
              onClick={() => void startDecisionAnalysis()}
              className="h-10 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingQuestions ? "Preparing..." : "Start Decision Analysis"}
            </button>
            {promptExamples.slice(0, 4).map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setDecisionPrompt(example)}
                className="rounded-md border border-[var(--line-soft)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--foreground)]"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <QuestionPanel
          questionResponse={questionResponse}
          answers={answers}
          isAnalyzing={isAnalyzing}
          onAnswer={(id, value) => setAnswers((current) => ({ ...current, [id]: value }))}
          onAnalyze={() => void analyzeDecision()}
        />

        <ContextPanel
          isLoadingVersions={isLoadingVersions}
          forecastVersions={forecastVersions}
          selectedForecastVersionId={selectedForecastVersionId}
          selectedForecastVersion={selectedForecastVersion}
          actualsSource={activeData.dataSource}
          budgetSource={activeBudget.dataSource}
          cashSource={activeCash.dataSource}
          latestFinancialPeriod={latestFinancialPeriod}
          latestCashPeriod={latestCashPeriod}
          dataWarning={dataWarning}
          onSelectForecast={setSelectedForecastVersionId}
        />
      </div>

      {dataWarning ? (
        <div className="premium-notice">
          Some company data is missing or unapproved. This decision analysis may be incomplete.
        </div>
      ) : null}

      {analysis ? (
        <AnalysisPanel
          analysis={analysis}
          isSavingMemo={isSavingMemo}
          onSaveMemo={() => void saveDecisionMemo()}
          onCopySummary={() => void copySummary()}
          savedMemoId={savedMemoId}
        />
      ) : (
        <section className="premium-card p-6">
          <h2 className="text-base font-semibold">Decision analysis output</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Enter a decision, answer the follow-up questions, then run the
            analysis. The output will include a recommendation, financial
            impact, scenarios, risks, unresolved questions, and next steps.
          </p>
        </section>
      )}
    </section>
  );
}

function QuestionPanel({
  questionResponse,
  answers,
  isAnalyzing,
  onAnswer,
  onAnalyze,
}: {
  questionResponse: DecisionQuestionResponse | null;
  answers: Record<string, string>;
  isAnalyzing: boolean;
  onAnswer: (id: string, value: string) => void;
  onAnalyze: () => void;
}) {
  if (!questionResponse) {
    return (
      <section className="premium-card p-6">
        <h2 className="text-base font-semibold">AI follow-up questions</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          The advisor will classify the decision and ask targeted questions
          after you start the analysis.
        </p>
      </section>
    );
  }

  return (
    <section className="premium-card overflow-hidden">
      <div className="premium-panel-header p-5">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge label={questionResponse.decisionType} />
          <SourceBadge label={`${questionResponse.confidence} classification confidence`} />
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
          {questionResponse.summary}
        </p>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        {questionResponse.questions.map((question) => (
          <label key={question.id} className="text-sm font-medium text-[var(--foreground)]">
            {question.label}
            <input
              value={answers[question.id] ?? ""}
              placeholder={question.placeholder}
              type={question.fieldType === "date" ? "date" : "text"}
              inputMode={inputModeForQuestion(question.fieldType)}
              onChange={(event) => onAnswer(question.id, event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
            />
            <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">
              {question.question} {question.required ? "Required input." : "Optional if unknown."}
            </span>
            <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">
              Why it matters: {question.whyItMatters}
            </span>
          </label>
        ))}
      </div>
      <div className="border-t border-[var(--line-soft)] p-5">
        <button
          type="button"
          disabled={isAnalyzing}
          onClick={onAnalyze}
          className="h-10 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAnalyzing ? "Analyzing..." : "Analyze Decision"}
        </button>
      </div>
    </section>
  );
}

function ContextPanel({
  isLoadingVersions,
  forecastVersions,
  selectedForecastVersionId,
  selectedForecastVersion,
  actualsSource,
  budgetSource,
  cashSource,
  latestFinancialPeriod,
  latestCashPeriod,
  dataWarning,
  onSelectForecast,
}: {
  isLoadingVersions: boolean;
  forecastVersions: ForecastVersionWithRows[];
  selectedForecastVersionId: string;
  selectedForecastVersion: ForecastVersionWithRows | null;
  actualsSource: DataSourceMode;
  budgetSource: DataSourceMode;
  cashSource: DataSourceMode;
  latestFinancialPeriod: ReturnType<typeof getActiveFinancialData>["periods"][number] | null;
  latestCashPeriod: ReturnType<typeof getActiveCashData>["periods"][number] | null;
  dataWarning: string;
  onSelectForecast: (id: string) => void;
}) {
  return (
    <aside className="premium-card p-5">
      <h2 className="text-base font-semibold">Decision context</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
        The advisor uses these sources when available.
      </p>

      <div className="mt-5 space-y-3">
        <SourceBadge label={getActualsSourceLabel(actualsSource)} />
        <SourceBadge label={getBudgetSourceLabel(budgetSource)} />
        <SourceBadge label={getCashSourceLabel(cashSource)} />
      </div>

      <label className="mt-5 block text-sm font-medium text-[var(--foreground)]">
        Forecast version
        <select
          value={selectedForecastVersionId}
          disabled={isLoadingVersions || forecastVersions.length === 0}
          onChange={(event) => onSelectForecast(event.target.value)}
          className="mt-2 h-10 w-full rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--foreground)] outline-none"
        >
          {forecastVersions.length === 0 ? (
            <option value="">No forecast version</option>
          ) : (
            forecastVersions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))
          )}
        </select>
      </label>

      <div className="mt-5 grid gap-3">
        <ContextMetric
          label="Cash balance"
          value={formatCurrency(
            latestCashPeriod?.cashBalance ?? latestFinancialPeriod?.cashBalance ?? 0,
          )}
        />
        <ContextMetric
          label="Net burn"
          value={formatCurrency(
            latestCashPeriod?.netBurn ?? latestFinancialPeriod?.netBurn ?? 0,
          )}
        />
        <ContextMetric
          label="Runway"
          value={formatRunwayMonths(
            latestCashPeriod?.runwayMonths ?? latestFinancialPeriod?.runwayMonths ?? 0,
          )}
        />
        <ContextMetric
          label="Forecast"
          value={selectedForecastVersion?.name ?? "No saved forecast"}
          detail={
            selectedForecastVersion
              ? `${selectedForecastVersion.actualMonths} actual, ${selectedForecastVersion.preliminaryMonths} preliminary`
              : undefined
          }
        />
      </div>

      {dataWarning ? (
        <p className="mt-4 rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] p-3 text-sm leading-6 text-[var(--text-muted)]">
          {dataWarning}
        </p>
      ) : null}
    </aside>
  );
}

function AnalysisPanel({
  analysis,
  isSavingMemo,
  savedMemoId,
  onSaveMemo,
  onCopySummary,
}: {
  analysis: DecisionAnalysis;
  isSavingMemo: boolean;
  savedMemoId: string;
  onSaveMemo: () => void;
  onCopySummary: () => void;
}) {
  return (
    <section className="premium-card overflow-hidden">
      <div className="premium-panel-header flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="premium-pill inline-flex">Decision Analysis</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              {analysis.recommendation}
            </h2>
            <RecommendationBadge recommendation={analysis.recommendation} />
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--text-muted)]">
            {analysis.cfoSummary}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopySummary}
            className="h-10 rounded-md border border-[var(--line-soft)] px-4 text-sm font-medium"
          >
            Copy Summary
          </button>
          <button
            type="button"
            disabled={isSavingMemo}
            onClick={onSaveMemo}
            className="h-10 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSavingMemo ? "Saving..." : "Save Decision Memo"}
          </button>
          {savedMemoId ? (
            <>
              <Link
                href={`/reports?type=Decision%20Memo&decisionMemoId=${savedMemoId}`}
                prefetch={false}
                className="inline-flex h-10 items-center rounded-md border border-[var(--line-soft)] px-4 text-sm font-medium"
              >
                Open in Reports
              </Link>
              <Link
                href={`/reports?type=Decision%20Memo&decisionMemoId=${savedMemoId}`}
                prefetch={false}
                className="inline-flex h-10 items-center rounded-md border border-[var(--line-soft)] px-4 text-sm font-medium"
              >
                Create Decision Memo Report
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {analysis.dataWarnings.length > 0 ? (
        <div className="mx-5 mt-5 premium-notice">
          {analysis.dataWarnings.join(" ")}
        </div>
      ) : null}

      <div className="grid gap-4 p-5 lg:grid-cols-2 xl:grid-cols-3">
        {Object.entries(analysis.financialImpact).map(([key, value]) => (
          <ContextMetric key={key} label={labelize(key)} value={value} />
        ))}
      </div>

      <div className="grid gap-6 p-5 xl:grid-cols-2">
        <ListPanel title="Key Assumptions" items={analysis.keyAssumptions} />
        <ListPanel title="Questions Still Unresolved" items={analysis.unresolvedQuestions} />
        <RiskPanel risks={analysis.risks} />
        <ListPanel title="Recommended Next Steps" items={analysis.recommendedNextSteps} />
      </div>

      <div className="border-t border-[var(--line-soft)] p-5">
        <h3 className="text-base font-semibold">Scenario View</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {analysis.scenarios.map((scenario) => (
            <article key={scenario.name} className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] p-4">
              <h4 className="text-sm font-semibold">{scenario.name}</h4>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                {scenario.summary}
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <p><strong>Cash:</strong> {scenario.cashImpact}</p>
                <p><strong>Runway:</strong> {scenario.runwayImpact}</p>
                <p><strong>Conditions:</strong> {scenario.conditions}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function RiskPanel({ risks }: { risks: DecisionAnalysis["risks"] }) {
  return (
    <section className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] p-4">
      <h3 className="text-base font-semibold">Risks</h3>
      <div className="mt-3 space-y-3">
        {risks.map((risk) => (
          <article key={`${risk.category}-${risk.description}`} className="rounded-md border border-[var(--line-soft)] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{risk.category}</p>
              <SourceBadge label={`${risk.severity} risk`} />
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              {risk.description}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              Mitigation: {risk.mitigation}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
        {items.length > 0 ? (
          items.map((item) => (
            <li key={item} className="ml-4 list-disc">
              {item}
            </li>
          ))
        ) : (
          <li>No items returned.</li>
        )}
      </ul>
    </section>
  );
}

function ContextMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[var(--text-muted)]">{detail}</p> : null}
    </article>
  );
}

function SourceBadge({ label }: { label: string }) {
  return (
    <span className="premium-pill rounded-xl px-3 py-2 text-xs font-medium">
      {label}
    </span>
  );
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  return (
    <span className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
      {recommendation}
    </span>
  );
}

function inputModeForQuestion(fieldType: DecisionQuestion["fieldType"]) {
  if (fieldType === "currency" || fieldType === "number" || fieldType === "percent") {
    return "decimal";
  }

  return "text";
}

function buildDataWarning({
  actualsSource,
  budgetSource,
  cashSource,
  forecastVersion,
}: {
  actualsSource: DataSourceMode;
  budgetSource: DataSourceMode;
  cashSource: DataSourceMode;
  forecastVersion: ForecastVersionWithRows | null;
}) {
  const warnings: string[] = [];

  if (!isApprovedDataSource(actualsSource)) {
    warnings.push("actuals are not approved");
  }

  if (budgetSource === "sample") {
    warnings.push("budget data may be demo/sample");
  }

  if (cashSource === "sample") {
    warnings.push("cash/runway data may be demo/sample");
  }

  if (!forecastVersion) {
    warnings.push("no saved forecast version is selected");
  } else if (forecastVersion.preliminaryMonths > 0) {
    warnings.push("selected forecast includes preliminary months");
  }

  return warnings.length > 0
    ? `Context warning: ${warnings.join(", ")}.`
    : "";
}

function labelize(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}
