"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Toast, type ToastMessage, type ToastType } from "@/components/Toast";
import {
  emptyForecastAssumptionDraft,
  emptyForecastCommentary,
  forecastAssumptionSections,
  loadForecastAssumptionDraft,
  loadForecastCommentary,
  saveForecastAssumptionDraft,
  saveForecastCommentary,
  type ForecastAssumptionDraft,
  type ForecastAssumptionField,
  type ForecastCommentaryDraft,
} from "@/lib/forecastAssumptions";
import {
  dateToDisplayMonth,
  getSelectedForecastVersionId,
  loadForecastVersionsForDisplay,
  setSelectedForecastVersionId,
  type ForecastVersionWithRows,
} from "@/lib/forecastVersions";
import { formatCurrency } from "@/lib/formatting";

type CommentarySource = "manual" | "ai_draft" | "ai_edited";

const commentaryFields: {
  key: keyof ForecastCommentaryDraft;
  label: string;
  placeholder: string;
}[] = [
  {
    key: "executiveSummary",
    label: "Executive forecast summary",
    placeholder: "Summarize the forecast case, key movements, and management focus.",
  },
  {
    key: "revenueCommentary",
    label: "Revenue commentary",
    placeholder: "Explain growth, churn, expansion, usage, and services revenue assumptions.",
  },
  {
    key: "grossMarginCommentary",
    label: "Gross margin / cost of revenue commentary",
    placeholder: "Explain hosting, support, payment processing, and vendor cost trends.",
  },
  {
    key: "payrollCommentary",
    label: "Payroll / headcount commentary",
    placeholder: "Explain hiring timing, headcount growth, payroll load, and role mix.",
  },
  {
    key: "operatingExpenseCommentary",
    label: "Operating expense commentary",
    placeholder: "Explain software, marketing, professional services, office, and travel assumptions.",
  },
  {
    key: "cashRunwayCommentary",
    label: "Cash / runway commentary",
    placeholder: "Explain burn, runway, financing assumptions, and cash guardrails.",
  },
  {
    key: "forecastRisks",
    label: "Forecast risks",
    placeholder: "List the assumptions most likely to move the forecast materially.",
  },
  {
    key: "managementNotes",
    label: "Management notes",
    placeholder: "Capture internal context, decisions, or follow-ups for reports and CFO briefs.",
  },
];

export default function ForecastsPage() {
  const [versions, setVersions] = useState<ForecastVersionWithRows[]>([]);
  const [selectedVersionId, setSelectedVersionIdState] = useState("");
  const [assumptions, setAssumptions] = useState<ForecastAssumptionDraft>(() =>
    emptyForecastAssumptionDraft(),
  );
  const [commentary, setCommentary] =
    useState<ForecastCommentaryDraft>(emptyForecastCommentary);
  const [commentarySource, setCommentarySource] =
    useState<CommentarySource>("manual");
  const [lastSavedAssumptions, setLastSavedAssumptions] = useState("");
  const [lastSavedCommentary, setLastSavedCommentary] = useState("");
  const [lastAiDraft, setLastAiDraft] = useState("");
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSavingAssumptions, setIsSavingAssumptions] = useState(false);
  const [isSavingCommentary, setIsSavingCommentary] = useState(false);
  const [isGeneratingCommentary, setIsGeneratingCommentary] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const selectedVersion = useMemo(
    () =>
      versions.find((version) => version.id === selectedVersionId) ??
      versions[0] ??
      null,
    [selectedVersionId, versions],
  );
  const assumptionsDirty =
    JSON.stringify(assumptions) !== lastSavedAssumptions && !isLoadingDetails;
  const commentaryDirty =
    JSON.stringify(commentary) !== lastSavedCommentary && !isLoadingDetails;

  function notify(type: ToastType, title: string, detail?: string) {
    setToast({ id: Date.now(), type, title, detail });
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      async function loadVersions() {
        setIsLoadingVersions(true);

        try {
          const loaded = await loadForecastVersionsForDisplay();
          const savedSelectedId = getSelectedForecastVersionId();

          setVersions(loaded);
          setSelectedVersionIdState(
            savedSelectedId && loaded.some((version) => version.id === savedSelectedId)
              ? savedSelectedId
              : loaded[0]?.id ?? "",
          );
        } catch (error) {
          console.error("Forecast versions could not be loaded", error);
          notify(
            "error",
            "Forecast versions could not be loaded.",
            error instanceof Error ? error.message : "Try again.",
          );
        } finally {
          setIsLoadingVersions(false);
        }
      }

      void loadVersions();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!selectedVersion) {
      return;
    }

    const timeout = window.setTimeout(() => {
      async function loadVersionDetails() {
        setIsLoadingDetails(true);

        try {
          const [loadedAssumptions, loadedCommentary] = await Promise.all([
            loadForecastAssumptionDraft(selectedVersion.id),
            loadForecastCommentary(selectedVersion.id),
          ]);

          setAssumptions(loadedAssumptions);
          setCommentary(loadedCommentary.commentary);
          setCommentarySource(
            normalizeCommentarySource(loadedCommentary.source),
          );
          setLastSavedAssumptions(JSON.stringify(loadedAssumptions));
          setLastSavedCommentary(JSON.stringify(loadedCommentary.commentary));
          setLastAiDraft("");
        } catch (error) {
          console.error("Forecast assumptions could not be loaded", error);
          notify(
            "error",
            "Forecast assumptions could not be loaded.",
            error instanceof Error ? error.message : "Try again.",
          );
        } finally {
          setIsLoadingDetails(false);
        }
      }

      void loadVersionDetails();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [selectedVersion]);

  function selectVersion(id: string) {
    setSelectedVersionIdState(id);
    setSelectedForecastVersionId(id);
  }

  function updateAssumption(key: string, value: string) {
    setAssumptions((current) => ({ ...current, [key]: value }));
  }

  function updateCommentary(key: keyof ForecastCommentaryDraft, value: string) {
    setCommentary((current) => ({ ...current, [key]: value }));
    if (commentarySource === "ai_draft") {
      setCommentarySource("ai_edited");
    }
  }

  async function handleSaveAssumptions() {
    if (!selectedVersion) {
      return;
    }

    if (!confirmApprovedVersionSave(selectedVersion)) {
      return;
    }

    setIsSavingAssumptions(true);

    try {
      await saveForecastAssumptionDraft({
        forecastVersionId: selectedVersion.id,
        assumptions,
      });
      setLastSavedAssumptions(JSON.stringify(assumptions));
      notify(
        "success",
        "Forecast assumptions saved.",
        "Reports, CFO Briefs, and forecast narratives can now reference the saved assumptions.",
      );
    } catch (error) {
      console.error("Forecast assumptions save failed", error);
      notify(
        "error",
        "Forecast assumptions could not be saved.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsSavingAssumptions(false);
    }
  }

  async function handleSaveCommentary() {
    if (!selectedVersion) {
      return;
    }

    if (!confirmApprovedVersionSave(selectedVersion)) {
      return;
    }

    setIsSavingCommentary(true);

    try {
      const serializedCommentary = JSON.stringify(commentary);
      const source: CommentarySource =
        lastAiDraft && serializedCommentary === lastAiDraft
          ? "ai_draft"
          : lastAiDraft || commentarySource === "ai_edited"
            ? "ai_edited"
            : "manual";

      await saveForecastCommentary({
        forecastVersionId: selectedVersion.id,
        commentary,
        source,
      });
      setCommentarySource(source);
      setLastSavedCommentary(serializedCommentary);
      notify(
        "success",
        "Forecast commentary saved.",
        "Saved commentary is stored by forecast version for future CFO Brief and report use.",
      );
    } catch (error) {
      console.error("Forecast commentary save failed", error);
      notify(
        "error",
        "Forecast commentary could not be saved.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsSavingCommentary(false);
    }
  }

  async function handleGenerateCommentary(allowUnapprovedData = false) {
    if (!selectedVersion) {
      return;
    }

    if (
      !allowUnapprovedData &&
      (selectedVersion.preliminaryMonths > 0 ||
        (selectedVersion.actuals_through_month && selectedVersion.actualMonths === 0))
    ) {
      const confirmed = window.confirm(
        "Some data used for this commentary is not approved. Commentary may be incomplete. Continue?",
      );

      if (!confirmed) {
        return;
      }

      await handleGenerateCommentary(true);
      return;
    }

    setIsGeneratingCommentary(true);

    try {
      const response = await fetch("/api/ai/forecast-commentary", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forecast_version_id: selectedVersion.id,
          allow_unapproved_data: allowUnapprovedData,
        }),
      });
      const payload = (await response.json()) as {
        commentary?: ForecastCommentaryDraft;
        error?: string;
        requires_confirmation?: boolean;
      };

      if (response.status === 409 && payload.requires_confirmation && !allowUnapprovedData) {
        const confirmed = window.confirm(
          "Some data used for this commentary is not approved. Commentary may be incomplete. Continue?",
        );

        if (confirmed) {
          await handleGenerateCommentary(true);
        }
        return;
      }

      if (!response.ok || !payload.commentary) {
        throw new Error(payload.error ?? "AI commentary generation failed.");
      }

      const nextCommentary = {
        ...emptyForecastCommentary,
        ...payload.commentary,
      };

      setCommentary(nextCommentary);
      setCommentarySource("ai_draft");
      setLastAiDraft(JSON.stringify(nextCommentary));
      notify(
        "success",
        "AI commentary draft generated.",
        "Review and edit the draft before saving it as forecast commentary.",
      );
    } catch (error) {
      console.error("AI forecast commentary failed", error);
      notify(
        "error",
        "AI commentary could not be generated.",
        error instanceof Error ? error.message : "Existing commentary was not changed.",
      );
    } finally {
      setIsGeneratingCommentary(false);
    }
  }

  if (isLoadingVersions) {
    return (
      <section className="space-y-8">
        <div className="premium-card p-6">
          <p className="text-sm text-[var(--text-muted)]">Loading forecast assumptions...</p>
        </div>
      </section>
    );
  }

  if (versions.length === 0) {
    return (
      <section className="space-y-8">
        <Toast message={toast} onClose={() => setToast(null)} />
        <PageHeader />
        <section className="premium-card p-6">
          <h2 className="text-lg font-semibold">No forecast versions yet.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
            Create a forecast in Forecast Editing first, then return here to
            document the assumptions and narrative behind that version.
          </p>
          <Link
            href="/forecast-versions"
            prefetch={false}
            className="mt-5 inline-flex h-10 items-center rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-[var(--background)]"
          >
            Open Forecast Editing
          </Link>
        </section>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <Toast message={toast} onClose={() => setToast(null)} />
      <PageHeader />

      <section className="premium-card p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-end">
          <div>
            <label className="text-sm font-medium text-[var(--text-muted)]">
              Forecast Version
              <select
                value={selectedVersion?.id ?? ""}
                onChange={(event) => selectVersion(event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <SourceBadge label={selectedVersion?.status ?? "Draft"} />
            <SourceBadge label={`FY${selectedVersion?.fiscal_year ?? ""}`} />
            <SourceBadge
              label={`${selectedVersion?.actualMonths ?? 0} actual / ${selectedVersion?.preliminaryMonths ?? 0} preliminary`}
            />
            <SourceBadge label={`Commentary: ${commentarySourceLabel(commentarySource)}`} />
          </div>
        </div>
      </section>

      {selectedVersion ? <ForecastContext version={selectedVersion} /> : null}

      {isLoadingDetails ? (
        <section className="premium-card p-6">
          <p className="text-sm text-[var(--text-muted)]">Loading selected forecast details...</p>
        </section>
      ) : (
        <>
          <section className="premium-card overflow-hidden">
            <div className="premium-panel-header flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="premium-pill inline-flex">Forecast Assumptions</p>
                <h2 className="mt-3 text-xl font-semibold">Assumption Inputs</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
                  Maintain the driver assumptions behind the selected forecast
                  version. These are stored by forecast version and can support
                  future CFO Briefs, reports, and deck narratives.
                </p>
                {assumptionsDirty ? (
                  <p className="mt-2 text-sm font-medium text-[var(--accent)]">
                    Unsaved assumption changes
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={isSavingAssumptions || !selectedVersion}
                onClick={() => void handleSaveAssumptions()}
                className="h-10 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingAssumptions ? "Saving..." : "Save Assumptions"}
              </button>
            </div>
            <div className="grid gap-4 p-5 xl:grid-cols-2">
              {forecastAssumptionSections.map((section) => (
                <AssumptionSection
                  key={section.title}
                  section={section}
                  assumptions={assumptions}
                  onChange={updateAssumption}
                />
              ))}
            </div>
          </section>

          <section className="premium-card overflow-hidden">
            <div className="premium-panel-header flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="premium-pill inline-flex">Forecast Commentary</p>
                <h2 className="mt-3 text-xl font-semibold">Editable Narrative</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
                  Type commentary manually or generate an AI draft. AI output
                  stays editable and is not saved until you confirm it.
                </p>
                {commentaryDirty ? (
                  <p className="mt-2 text-sm font-medium text-[var(--accent)]">
                    Unsaved commentary changes
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isGeneratingCommentary || !selectedVersion}
                  onClick={() => void handleGenerateCommentary(false)}
                  className="h-10 rounded-md border border-[var(--line-soft)] px-4 text-sm font-medium text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGeneratingCommentary ? "Generating..." : "Generate Commentary with AI"}
                </button>
                <button
                  type="button"
                  disabled={isSavingCommentary || !selectedVersion}
                  onClick={() => void handleSaveCommentary()}
                  className="h-10 rounded-md bg-[var(--foreground)] px-4 text-sm font-medium text-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingCommentary ? "Saving..." : "Save Commentary"}
                </button>
              </div>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              {commentaryFields.map((field) => (
                <label key={field.key} className="text-sm font-medium text-[var(--foreground)]">
                  {field.label}
                  <textarea
                    value={commentary[field.key]}
                    placeholder={field.placeholder}
                    onChange={(event) => updateCommentary(field.key, event.target.value)}
                    className="mt-2 min-h-32 w-full resize-y rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] px-3 py-3 text-sm leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  />
                </label>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Forecast Assumptions
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Forecast Assumptions
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
          Review, edit, and document the key assumptions behind each saved
          forecast version.
        </p>
      </div>
      <Link
        href="/forecast-versions"
        prefetch={false}
        className="inline-flex h-10 items-center rounded-md border border-[var(--line-soft)] px-4 text-sm font-medium text-[var(--foreground)]"
      >
        Open Forecast Editing
      </Link>
    </div>
  );
}

function ForecastContext({ version }: { version: ForecastVersionWithRows }) {
  const fullYearRevenue = version.periods.reduce((total, month) => total + month.revenue, 0);
  const fullYearEbitda = version.periods.reduce((total, month) => total + month.ebitda, 0);
  const endingCash = version.periods.at(-1)?.cashBalance ?? 0;
  const sourceLabels = [
    ...new Set(
      version.rows
        .map((row) => row.source)
        .filter((source): source is string => Boolean(source)),
    ),
  ].slice(0, 4);

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <ContextCard label="Full-year revenue" value={formatCurrency(fullYearRevenue)} />
      <ContextCard label="Full-year EBITDA" value={formatCurrency(fullYearEbitda)} />
      <ContextCard label="Ending cash" value={formatCurrency(endingCash)} />
      <ContextCard
        label="Actuals expected"
        value={
          version.actuals_through_month
            ? `Through ${dateToDisplayMonth(version.actuals_through_month)}`
            : "None"
        }
        detail={
          sourceLabels.length > 0
            ? `Sources: ${sourceLabels.join(", ")}`
            : "No source labels available."
        }
      />
    </section>
  );
}

function AssumptionSection({
  section,
  assumptions,
  onChange,
}: {
  section: (typeof forecastAssumptionSections)[number];
  assumptions: ForecastAssumptionDraft;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <article className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-soft)] p-4">
      <h3 className="text-base font-semibold">{section.title}</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
        {section.description}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {section.fields.map((field) => (
          <AssumptionInput
            key={field.key}
            field={field}
            value={assumptions[field.key] ?? ""}
            onChange={(value) => onChange(field.key, value)}
          />
        ))}
      </div>
    </article>
  );
}

function AssumptionInput({
  field,
  value,
  onChange,
}: {
  field: ForecastAssumptionField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.unit === "text") {
    return (
      <label className="text-sm font-medium text-[var(--foreground)] md:col-span-2">
        {field.label}
        <textarea
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 min-h-24 w-full rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-3 text-sm leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
        />
      </label>
    );
  }

  return (
    <label className="text-sm font-medium text-[var(--foreground)]">
      {field.label}
      <input
        value={value}
        placeholder={field.placeholder}
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
      />
    </label>
  );
}

function ContextCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article className="premium-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{detail}</p>
      ) : null}
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

function normalizeCommentarySource(source: string | null): CommentarySource {
  if (source === "ai_draft" || source === "ai_edited") {
    return source;
  }

  return "manual";
}

function commentarySourceLabel(source: CommentarySource) {
  if (source === "ai_draft") return "AI draft";
  if (source === "ai_edited") return "AI edited";
  return "Manual";
}

function confirmApprovedVersionSave(version: ForecastVersionWithRows) {
  if (version.status !== "Approved" && version.status !== "Published") {
    return true;
  }

  return window.confirm(
    [
      "Save Forecast Assumptions?",
      "",
      "You are about to update assumptions or commentary for this forecast version. These changes may affect CFO Briefs, reports, forecast narratives, and exported decks.",
    ].join("\n"),
  );
}
