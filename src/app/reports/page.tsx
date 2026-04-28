"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Toast, type ToastMessage, type ToastType } from "@/components/Toast";
import { loadAccountMappingSummary } from "@/lib/accountMapping";
import {
  loadForecastDriverAssumptionRecords,
  loadForecastDriverAssumptions,
  summarizeForecastDriverAssumptions,
} from "@/lib/forecastDrivers";
import {
  dateToDisplayMonth as forecastDateToDisplayMonth,
  loadForecastVersions,
  setSelectedForecastVersionId,
  type ForecastVersionRecord,
} from "@/lib/forecastVersions";
import { formatCurrency, formatPercent, formatRunwayMonths } from "@/lib/formatting";
import {
  buildDefaultReportCommentary,
  buildReportDataSource,
  buildReportDeckContent,
  dateToDisplayMonth,
  defaultReportSections,
  downloadMonthlyReportFile,
  loadMonthlyReportHistory,
  markMonthlyReportExported,
  reportTypes,
  saveMonthlyReportDraft,
  type MonthlyReportCommentary,
  type MonthlyReportRecord,
  type MonthlyReportSections,
  type MonthlyReportType,
} from "@/lib/monthlyReports";
import {
  collectValidationIssues,
  formatReportingMonth,
  getOverallCloseStatus,
  getReportingMonthOptions,
  loadMonthlyCloseItems,
  monthlyCloseCategories,
  type MonthlyCloseItem,
} from "@/lib/monthlyClose";
import {
  getActiveCashData,
  getActiveFinancialData,
  getBudgetForMonth,
  type ActiveBudgetData,
  type ActiveCashData,
  type ActiveFinancialData,
} from "@/lib/localDataStore";
import { generateMonthlyCfoDeck } from "@/lib/powerpoint";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { saveGeneratedReportToSupabase } from "@/lib/supabase/data";

type ReadinessItem = {
  label: string;
  status: string;
  detail: string;
};

const sectionLabels: Record<keyof MonthlyReportSections, string> = {
  cfoBrief: "Include CFO Brief commentary",
  budgetVsActuals: "Include Budget vs Actuals",
  forecastUpdate: "Include Forecast Update",
  cashRunway: "Include Cash Runway",
  kpiSummary: "Include KPI Summary",
  risksRecommendations: "Include Risks & Recommendations",
};

export default function ReportsPage() {
  const monthOptions = useMemo(() => getReportingMonthOptions(), []);
  const [reportingMonth, setReportingMonth] = useState(
    monthOptions.find((month) => month.value === currentMonthValue())?.value ??
      monthOptions[monthOptions.length - 1]?.value ??
      "",
  );
  const [reportType, setReportType] =
    useState<MonthlyReportType>("Monthly Performance Review");
  const [forecastVersionId, setForecastVersionId] = useState("");
  const [sections, setSections] =
    useState<MonthlyReportSections>(defaultReportSections);
  const [commentary, setCommentary] = useState<MonthlyReportCommentary>(() =>
    buildDefaultReportCommentary(reportingMonth),
  );
  const [reportId, setReportId] = useState<string | null>(null);
  const [closeItems, setCloseItems] = useState<MonthlyCloseItem[]>([]);
  const [forecastVersions, setForecastVersions] = useState<ForecastVersionRecord[]>([]);
  const [mappingWarning, setMappingWarning] = useState<string | null>(null);
  const [forecastDriverSummary, setForecastDriverSummary] = useState<string | null>(null);
  const [history, setHistory] = useState<MonthlyReportRecord[]>([]);
  const [activeData, setActiveData] = useState<ActiveFinancialData>(() =>
    getActiveFinancialData(),
  );
  const [activeCash, setActiveCash] = useState<ActiveCashData>(() =>
    getActiveCashData(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback((type: ToastType, title: string, detail?: string) => {
    setToast({ id: Date.now(), type, title, detail });
  }, []);

  const selectedForecastVersion =
    forecastVersions.find((version) => version.id === forecastVersionId) ?? null;
  const closeStatus = getOverallCloseStatus(closeItems);
  const readinessItems = buildReadinessItems({
    closeItems,
    mappingWarning,
    forecastVersion: selectedForecastVersion,
  });
  const closeIssues = collectValidationIssues(closeItems);
  const actualsAvailable = activeData.periods.length > 0;
  const reportTitle = `${reportType} - ${formatReportingMonth(reportingMonth)}`;
  const dataSource = buildReportDataSource({
    reportingMonth,
    reportType,
    forecastVersionId: selectedForecastVersion?.id ?? null,
    forecastVersionName: selectedForecastVersion?.name ?? null,
    closeStatus,
    mappingWarning,
    forecastDriverSummary,
  });
  const latestActual = activeData.periods.find(
    (period) => period.month === formatReportingMonth(reportingMonth),
  ) ?? activeData.periods.at(-1);
  const latestBudget = latestActual
    ? getBudgetForMonth(latestActual.month, activeData.periods.length - 1)
    : null;
  const latestCash = activeCash.periods.find(
    (period) => period.month === latestActual?.month,
  ) ?? activeCash.periods.at(-1);

  const loadPageData = useCallback(async () => {
    setIsLoading(true);

    try {
      setActiveData(getActiveFinancialData());
      setActiveCash(getActiveCashData());

      const [closeResult, mappings, versions, reportHistory] = await Promise.all([
        loadMonthlyCloseItems(reportingMonth),
        loadAccountMappingSummary(),
        loadForecastVersions(),
        loadMonthlyReportHistory(),
      ]);

      setCloseItems(closeResult.items);
      setForecastVersions(versions);
      setHistory(reportHistory);
      setMappingWarning(
        mappings.unmappedAccounts > 0 || mappings.needsReview > 0
          ? `${mappings.unmappedAccounts} unmapped account${mappings.unmappedAccounts === 1 ? "" : "s"} and ${mappings.needsReview} mapping${mappings.needsReview === 1 ? "" : "s"} needing review.`
          : null,
      );
      setForecastVersionId((current) => current || versions[0]?.id || "");
    } catch (error) {
      console.error("Report builder load failed", error);
      notify(
        "error",
        "Report builder could not load.",
        error instanceof Error ? error.message : "Check Supabase setup.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [notify, reportingMonth]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPageData();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadPageData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      async function loadDriverContext() {
        if (!forecastVersionId) {
          setForecastDriverSummary(null);
          return;
        }

        try {
          const records = await loadForecastDriverAssumptionRecords(forecastVersionId);

          if (records.length === 0) {
            setForecastDriverSummary(null);
            return;
          }

          const assumptions = await loadForecastDriverAssumptions(forecastVersionId);
          setForecastDriverSummary(summarizeForecastDriverAssumptions(assumptions));
        } catch (error) {
          console.error("Report forecast driver summary failed", error);
          setForecastDriverSummary(null);
        }
      }

      void loadDriverContext();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [forecastVersionId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setCommentary(
        buildDefaultReportCommentary(
          reportingMonth,
          selectedForecastVersion?.name ?? undefined,
        ),
      );
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [reportingMonth, selectedForecastVersion?.name]);

  function updateSection(key: keyof MonthlyReportSections, value: boolean) {
    setSections((current) => ({ ...current, [key]: value }));
  }

  function updateCommentary(key: keyof MonthlyReportCommentary, value: string) {
    setCommentary((current) => ({ ...current, [key]: value }));
  }

  async function handleSaveDraft(status: "Draft" | "Ready" = "Draft") {
    setIsSaving(true);

    try {
      const report = await saveMonthlyReportDraft({
        reportId,
        reportingMonth,
        reportType,
        title: reportTitle,
        forecastVersionId: selectedForecastVersion?.id ?? null,
        dataSource,
        commentary,
        sections,
        status,
      });

      setReportId(report.id);
      setHistory(await loadMonthlyReportHistory());
      notify("success", status === "Ready" ? "Report marked ready." : "Report draft saved.");
    } catch (error) {
      console.error("Monthly report save failed", error);
      notify(
        "error",
        "Report could not be saved.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExport() {
    if (!actualsAvailable) {
      notify("error", "Report cannot be exported.", "No actual data is available.");
      return;
    }

    setIsExporting(true);

    try {
      if (forecastVersionId) {
        setSelectedForecastVersionId(forecastVersionId);
      }

      const savedReport = await saveMonthlyReportDraft({
        reportId,
        reportingMonth,
        reportType,
        title: reportTitle,
        forecastVersionId: selectedForecastVersion?.id ?? null,
        dataSource,
        commentary,
        sections,
        status: closeStatus === "Complete" && !mappingWarning ? "Ready" : "Draft",
      });
      const { fileName, blob } = await generateMonthlyCfoDeck({
        reportingMonth: dateToDisplayMonth(reportingMonth),
        brief: buildReportDeckContent(commentary),
      });
      let storagePath: string | null = null;

      if (hasSupabaseBrowserEnv()) {
        const generatedReport = await saveGeneratedReportToSupabase({
          reportType: reportType.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          period: reportingMonth,
          title: reportTitle,
          fileName,
          file: blob,
          dataSource: {
            ...dataSource,
            selectedSections: sections,
            monthlyReportId: savedReport.id,
          },
        });
        storagePath =
          typeof generatedReport?.storage_path === "string"
            ? generatedReport.storage_path
            : null;
      }

      await markMonthlyReportExported({
        reportId: savedReport.id,
        generatedFilePath: storagePath,
        dataSource,
      });
      setReportId(savedReport.id);
      setHistory(await loadMonthlyReportHistory());
      notify(
        "success",
        "Report exported.",
        storagePath
          ? "PowerPoint generated, downloaded, and saved to Supabase."
          : "PowerPoint generated and downloaded.",
      );
    } catch (error) {
      console.error("Monthly report export failed", error);
      notify(
        "error",
        "Report export failed.",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDownload(report: MonthlyReportRecord) {
    try {
      await downloadMonthlyReportFile(report);
    } catch (error) {
      console.error("Report download failed", error);
      notify(
        "error",
        "Download link could not be created.",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  }

  return (
    <section className="space-y-8">
      <Toast message={toast} onClose={() => setToast(null)} />

      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-neutral-500">
            Reports
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Monthly Report Builder
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
            Create investor-ready monthly finance reports using approved close
            data, forecast versions, and CFO commentary.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSaveDraft("Draft")}
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            {isSaving ? "Saving..." : "Save draft"}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSaveDraft("Ready")}
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            Mark ready
          </button>
          <button
            type="button"
            disabled={isExporting || !actualsAvailable}
            onClick={() => void handleExport()}
            className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {isExporting ? "Exporting..." : "Export PowerPoint"}
          </button>
        </div>
      </div>

      <ReportSetupPanel
        reportingMonth={reportingMonth}
        monthOptions={monthOptions}
        reportType={reportType}
        forecastVersionId={forecastVersionId}
        forecastVersions={forecastVersions}
        sections={sections}
        onMonthChange={(value) => {
          setReportingMonth(value);
          setReportId(null);
        }}
        onReportTypeChange={setReportType}
        onForecastVersionChange={setForecastVersionId}
        onSectionChange={updateSection}
      />

      {isLoading ? (
        <section className="rounded-md border border-neutral-200 bg-white p-6">
          <p className="text-sm text-neutral-500">Loading report readiness...</p>
        </section>
      ) : (
        <ReadinessPanel
          items={readinessItems}
          closeStatus={closeStatus}
          hasWarning={closeStatus !== "Complete" || Boolean(mappingWarning)}
          validationIssueCount={closeIssues.length}
        />
      )}

      <ReportSourcePanel dataSource={dataSource} />

      <ReportPreview
        reportTitle={reportTitle}
        reportType={reportType}
        reportingMonth={reportingMonth}
        sections={sections}
        commentary={commentary}
        latestActual={latestActual}
        latestBudget={latestBudget}
        latestCash={latestCash}
        selectedForecastVersion={selectedForecastVersion}
        forecastDriverSummary={forecastDriverSummary}
        onCommentaryChange={updateCommentary}
      />

      <ReportHistoryTable
        reports={history}
        onDownload={(report) => void handleDownload(report)}
      />
    </section>
  );
}

function ReportSourcePanel({
  dataSource,
}: {
  dataSource: Record<string, unknown>;
}) {
  const rows = [
    ["Actuals", String(dataSource.actuals ?? "Unknown")],
    ["Budget", String(dataSource.budget ?? "Unknown")],
    ["Cash", String(dataSource.cash ?? "Unknown")],
    ["Monthly close", String(dataSource.closeStatus ?? "Unknown")],
    [
      "Forecast version",
      String(dataSource.forecastVersionName ?? "No saved forecast selected"),
    ],
  ];

  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <h2 className="text-base font-semibold">Report Data Sources</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {rows.map(([label, value]) => (
          <article key={label} className="rounded-md border border-neutral-200 p-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
              {label}
            </p>
            <p className="mt-2 text-sm font-medium text-neutral-800">{value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportSetupPanel({
  reportingMonth,
  monthOptions,
  reportType,
  forecastVersionId,
  forecastVersions,
  sections,
  onMonthChange,
  onReportTypeChange,
  onForecastVersionChange,
  onSectionChange,
}: {
  reportingMonth: string;
  monthOptions: { value: string; label: string }[];
  reportType: MonthlyReportType;
  forecastVersionId: string;
  forecastVersions: ForecastVersionRecord[];
  sections: MonthlyReportSections;
  onMonthChange: (value: string) => void;
  onReportTypeChange: (value: MonthlyReportType) => void;
  onForecastVersionChange: (value: string) => void;
  onSectionChange: (key: keyof MonthlyReportSections, value: boolean) => void;
}) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <h2 className="text-base font-semibold">Report Setup</h2>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <label className="text-sm font-medium text-neutral-700">
          Reporting month
          <select
            value={reportingMonth}
            onChange={(event) => onMonthChange(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950"
          >
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-neutral-700">
          Report type
          <select
            value={reportType}
            onChange={(event) =>
              onReportTypeChange(event.target.value as MonthlyReportType)
            }
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950"
          >
            {reportTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-neutral-700">
          Forecast version
          <select
            value={forecastVersionId}
            onChange={(event) => onForecastVersionChange(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950"
          >
            <option value="">No saved forecast selected</option>
            {forecastVersions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(sectionLabels) as (keyof MonthlyReportSections)[]).map(
          (key) => (
            <label
              key={key}
              className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700"
            >
              <input
                type="checkbox"
                checked={sections[key]}
                onChange={(event) => onSectionChange(key, event.target.checked)}
                className="h-4 w-4 accent-neutral-950"
              />
              {sectionLabels[key]}
            </label>
          ),
        )}
      </div>
    </section>
  );
}

function ReadinessPanel({
  items,
  closeStatus,
  hasWarning,
  validationIssueCount,
}: {
  items: ReadinessItem[];
  closeStatus: string;
  hasWarning: boolean;
  validationIssueCount: number;
}) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">Monthly Close Readiness</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Overall close status: {closeStatus}. Validation issues detected:{" "}
            {validationIssueCount}.
          </p>
        </div>
        {hasWarning ? (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
            This report may include incomplete or unapproved data.
          </div>
        ) : null}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <article key={item.label} className="rounded-md border border-neutral-200 p-4">
            <p className="text-sm font-semibold">{item.label}</p>
            <p className="mt-2 text-sm font-medium text-neutral-700">{item.status}</p>
            <p className="mt-1 text-xs leading-5 text-neutral-500">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportPreview({
  reportTitle,
  reportType,
  reportingMonth,
  sections,
  commentary,
  latestActual,
  latestBudget,
  latestCash,
  selectedForecastVersion,
  forecastDriverSummary,
  onCommentaryChange,
}: {
  reportTitle: string;
  reportType: MonthlyReportType;
  reportingMonth: string;
  sections: MonthlyReportSections;
  commentary: MonthlyReportCommentary;
  latestActual: ActiveFinancialData["periods"][number] | undefined;
  latestBudget: ActiveBudgetData["periods"][number] | null;
  latestCash: ActiveCashData["periods"][number] | undefined;
  selectedForecastVersion: ForecastVersionRecord | null;
  forecastDriverSummary: string | null;
  onCommentaryChange: (key: keyof MonthlyReportCommentary, value: string) => void;
}) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Report Preview</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {reportTitle}. Preview sections can be edited before export.
        </p>
      </div>

      {sections.cfoBrief ? (
        <EditableSection
          title="Executive Summary"
          value={commentary.executiveSummary}
          onChange={(value) => onCommentaryChange("executiveSummary", value)}
        />
      ) : null}

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h3 className="text-base font-semibold">Financial Highlights</h3>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Revenue" value={formatCurrency(latestActual?.revenue ?? 0)} />
          <MetricCard label="Gross Margin" value={formatPercent(latestActual?.grossMargin ?? 0)} />
          <MetricCard label="EBITDA" value={formatCurrency(latestActual?.ebitda ?? 0)} />
          <MetricCard label="Runway" value={formatRunwayMonths(latestActual?.runwayMonths ?? 0)} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <EditableSection
          title="Revenue Performance"
          value={commentary.revenueCommentary}
          onChange={(value) => onCommentaryChange("revenueCommentary", value)}
        />
        <EditableSection
          title="Expense Performance"
          value={commentary.expenseCommentary}
          onChange={(value) => onCommentaryChange("expenseCommentary", value)}
        />
        {sections.budgetVsActuals ? (
          <section className="rounded-md border border-neutral-200 bg-white p-5">
            <h3 className="text-base font-semibold">Budget vs Actuals</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Revenue budget: {formatCurrency(latestBudget?.revenue ?? 0)}.
              Operating expense budget:{" "}
              {formatCurrency(latestBudget?.operatingExpenses ?? 0)}.
            </p>
          </section>
        ) : null}
        {sections.cashRunway ? (
          <EditableSection
            title="Cash & Runway"
            value={commentary.cashCommentary}
            onChange={(value) => onCommentaryChange("cashCommentary", value)}
          />
        ) : null}
        {sections.forecastUpdate ? (
          <EditableSection
            title="Forecast Update"
            value={[
              commentary.forecastCommentary,
              selectedForecastVersion
                ? `Selected forecast version: ${selectedForecastVersion.name} (${selectedForecastVersion.status}).`
                : "",
              forecastDriverSummary
                ? `Driver assumptions: ${forecastDriverSummary}.`
                : "",
            ]
              .filter(Boolean)
              .join("\n")}
            onChange={(value) => onCommentaryChange("forecastCommentary", value)}
          />
        ) : null}
        {sections.kpiSummary ? (
          <section className="rounded-md border border-neutral-200 bg-white p-5">
            <h3 className="text-base font-semibold">KPI Summary</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              KPI summary is included as a placeholder section until formal KPI
              inputs are modeled. Cash balance:{" "}
              {formatCurrency(latestCash?.cashBalance ?? latestActual?.cashBalance ?? 0)}.
            </p>
          </section>
        ) : null}
        {sections.risksRecommendations ? (
          <>
            <EditableSection
              title="Risks"
              value={commentary.risks}
              onChange={(value) => onCommentaryChange("risks", value)}
            />
            <EditableSection
              title="Recommendations"
              value={commentary.recommendations}
              onChange={(value) => onCommentaryChange("recommendations", value)}
            />
          </>
        ) : null}
      </div>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h3 className="text-base font-semibold">Appendix</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Report type: {reportType}. Reporting month:{" "}
          {dateToDisplayMonth(reportingMonth)}. Source pages: Dashboard, Data
          Room, Account Mapping, Budget vs Actuals, Forecasts, and CFO Brief.
        </p>
      </section>
    </section>
  );
}

function EditableSection({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="mt-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm leading-6 outline-none focus:border-neutral-950"
      />
    </section>
  );
}

function ReportHistoryTable({
  reports,
  onDownload,
}: {
  reports: MonthlyReportRecord[];
  onDownload: (report: MonthlyReportRecord) => void;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base font-semibold">Report History</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Prior generated and drafted monthly reports.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">Report title</th>
              <th className="px-4 py-3 font-medium">Reporting month</th>
              <th className="px-4 py-3 font-medium">Report type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created date</th>
              <th className="px-4 py-3 font-medium">Export</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-neutral-500">
                  No monthly reports have been saved yet.
                </td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.id} className="border-b border-neutral-100">
                  <td className="px-4 py-3 font-medium">
                    {report.title ?? "Untitled report"}
                  </td>
                  <td className="px-4 py-3">
                    {dateToDisplayMonth(report.reporting_month)}
                  </td>
                  <td className="px-4 py-3">{report.report_type}</td>
                  <td className="px-4 py-3">{report.status}</td>
                  <td className="px-4 py-3">{formatDate(report.created_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={!report.generated_file_path}
                      onClick={() => onDownload(report)}
                      className="rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-md border border-neutral-200 p-4">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}

function buildReadinessItems({
  closeItems,
  mappingWarning,
  forecastVersion,
}: {
  closeItems: MonthlyCloseItem[];
  mappingWarning: string | null;
  forecastVersion: ForecastVersionRecord | null;
}): ReadinessItem[] {
  const byCategory = new Map(closeItems.map((item) => [item.file_category, item]));
  const coreCategories = ["actuals", "budget", "cash", "revenue", "payroll"] as const;
  const closeReadiness = coreCategories.map((category) => {
    const config = monthlyCloseCategories.find((item) => item.id === category);
    const item = byCategory.get(category);

    return {
      label: config?.title ?? category,
      status: item?.status ?? "Not uploaded",
      detail: item?.file_name ?? "No file saved for this reporting month.",
    };
  });

  return [
    ...closeReadiness,
    {
      label: "Account Mapping",
      status: mappingWarning ? "Needs review" : "Ready",
      detail: mappingWarning ?? "All detected accounts are mapped.",
    },
    {
      label: "Forecast Version",
      status: forecastVersion?.status ?? "Not selected",
      detail: forecastVersion
        ? `${forecastVersion.name} (${forecastDateToDisplayMonth(forecastVersion.actuals_through_month) || "no actualized month"})`
        : "No saved forecast version selected.",
    },
  ];
}

function currentMonthValue() {
  const today = new Date();

  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not saved";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}
