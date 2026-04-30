"use client";

import type PptxGenJS from "pptxgenjs";
import { sampleCompany } from "@/data/sampleCompany";
import type { DecisionMemoRecord } from "@/lib/decisionMemos";
import {
  calculateVarianceDollars,
  calculateVariancePercent,
  getVarianceStatus,
  type FavorableDirection,
  type FinancialPeriod,
} from "@/lib/calculations";
import {
  formatCurrency,
  formatCurrencyThousands,
  formatPercent,
  formatPercentVarianceLabel,
  formatRunwayMonths,
  formatVarianceLabel,
} from "@/lib/formatting";
import {
  getActiveBudgetData,
  getActiveCashData,
  getActiveFinancialData,
  getActualsSourceLabel,
  getBudgetForMonth,
  getBudgetSourceLabel,
  getCashMetricsForMonth,
  getCashSourceLabel,
  getUploadedPayroll,
  getUploadedPipeline,
  getUploadedRevenueDetail,
  isCompanyDataSource,
} from "@/lib/localDataStore";

export type CfoBriefDeckContent = {
  executiveSummary: string[];
  revenueCommentary: string[];
  expenseCommentary: string[];
  cashRunwayCommentary: string[];
  budgetCommentary: string[];
  risks: string[];
  actions: string[];
  investorBullets: string[];
};

export type PowerPointReportType =
  | "Monthly Performance Review"
  | "Board Pack"
  | "Forecast Update"
  | "Decision Memo"
  | "Monthly CFO Deck";

export type PowerPointReportSections = {
  executiveSummary?: boolean;
  financialHighlights?: boolean;
  revenuePerformance?: boolean;
  expensePerformance?: boolean;
  budgetVsActuals?: boolean;
  cashRunway?: boolean;
  forecastUpdate?: boolean;
  kpiSummary?: boolean;
  risks?: boolean;
  recommendations?: boolean;
  appendix?: boolean;
};

export type PowerPointReportMetadata = {
  companyName?: string | null;
  industry?: string | null;
  reportType?: PowerPointReportType | string | null;
  reportingMonth?: string | null;
  dataSource?: Record<string, unknown> | null;
  forecastVersionName?: string | null;
  closeStatus?: string | null;
  decisionMemo?: DecisionMemoRecord | null;
};

type MetricRow = {
  metric: string;
  actual: number;
  budget: number;
  format: "currency" | "percent" | "months";
  favorableDirection: FavorableDirection;
};

type DeckContext = ReturnType<typeof buildDeckContext>;
type Slide = ReturnType<PptxGenJS["addSlide"]>;
type PptxGenConstructor = new () => PptxGenJS;

const colors = {
  ink: "0A0D12",
  graphite: "151A22",
  graphite2: "232A35",
  slate: "46515F",
  muted: "6F7B8A",
  rule: "D7DCE3",
  panel: "F4F6F8",
  panel2: "EBF0F4",
  white: "FFFFFF",
  cyan: "67E8F9",
  cyanDark: "0891B2",
  success: "A7F3D0",
  warning: "FDE68A",
  danger: "FCA5A5",
};

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const shapeLine = "line";
const shapeRect = "rect";

export async function generateMonthlyCfoDeck({
  reportingMonth,
  brief,
  reportType = "Monthly CFO Deck",
  sections,
  metadata,
}: {
  reportingMonth: string;
  brief: CfoBriefDeckContent | null | undefined;
  reportType?: PowerPointReportType | string;
  sections?: PowerPointReportSections;
  metadata?: PowerPointReportMetadata;
}) {
  assertBrowserRuntime();

  const { default: PptxGenJSConstructor } = await import("pptxgenjs");
  const context = buildDeckContext(
    reportingMonth,
    brief,
    {
      ...metadata,
      reportType,
    },
    sections,
  );
  validateDeckContext(context);

  const pptx = createDeck(PptxGenJSConstructor, context);
  const builders = getSlideBuilders(context.sections, context);

  builders.forEach((builder, index) => {
    const slide = pptx.addSlide();
    builder(slide, context, index + 1);
  });

  const fileName = `${sanitizeFilePart(context.companyName)}_${sanitizeFilePart(
    context.reportType,
  )}_${sanitizeFilePart(context.reportingMonth)}.pptx`;
  const content = await pptx.write({ outputType: "blob" });
  const blob = toPptxBlob(content);
  downloadBlob(blob, fileName);

  return { fileName, blob };
}

function assertBrowserRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error(
      "Cannot generate PowerPoint outside the browser. Open the app and use the Reports export button.",
    );
  }
}

function toPptxBlob(content: string | ArrayBuffer | Blob | Uint8Array) {
  if (content instanceof Blob) {
    return content;
  }

  if (content instanceof ArrayBuffer) {
    return new Blob([content], { type: pptxMimeType });
  }

  if (content instanceof Uint8Array) {
    const copy = new ArrayBuffer(content.byteLength);

    new Uint8Array(copy).set(content);
    return new Blob([copy], { type: pptxMimeType });
  }

  if (typeof content === "string") {
    return new Blob([content], { type: pptxMimeType });
  }

  throw new Error("Cannot generate PowerPoint: unsupported file payload.");
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function sanitizeFilePart(value: string) {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "Report"
  );
}

function createDeck(PptxGenJSConstructor: PptxGenConstructor, context: DeckContext) {
  const pptx = new PptxGenJSConstructor();

  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Founder Finance Copilot";
  pptx.company = context.companyName;
  pptx.subject = context.reportType;
  pptx.title = `${context.companyName} ${context.reportType}`;
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };

  return pptx;
}

function buildDeckContext(
  reportingMonth: string,
  brief: CfoBriefDeckContent | null | undefined,
  metadata: PowerPointReportMetadata = {},
  sections?: PowerPointReportSections,
) {
  if (!reportingMonth) {
    throw new Error("Cannot generate PowerPoint: reporting month is missing.");
  }

  const activeData = getActiveFinancialData();
  const activeBudget = getActiveBudgetData();
  const activeCash = getActiveCashData();
  const periods = activeData.periods;
  const index = periods.findIndex((period) => period.month === reportingMonth);
  const safeIndex = index >= 0 ? index : Math.max(0, periods.length - 1);
  const actual = periods[safeIndex];
  const budget = actual ? getBudgetForMonth(actual.month, safeIndex) : null;
  const cashMetrics = actual ? getCashMetricsForMonth(actual.month) : null;
  const normalizedBrief = normalizeBrief(brief, reportingMonth);
  const metricRows = actual && budget ? buildMetricRows(actual, budget) : [];
  const trendMonths = buildTrendMonths(periods, activeBudget.periods);
  const uploadedDataNotes = buildUploadedDataNotes();
  const dataSource = metadata.dataSource ?? {};
  const reportType = String(metadata.reportType || "Monthly CFO Deck");

  return {
    reportingMonth,
    companyName: metadata.companyName || sampleCompany.name || "Company",
    industry: metadata.industry || sampleCompany.industry || "Finance workspace",
    reportType,
    forecastVersionName:
      metadata.forecastVersionName ||
      stringValue(dataSource.forecastVersionName) ||
      "No forecast version selected",
    closeStatus:
      metadata.closeStatus || stringValue(dataSource.closeStatus) || "Unknown",
    sourceLines: buildSourceLines({
      actuals: stringValue(dataSource.actuals) || getActualsSourceLabel(activeData.dataSource),
      budget: stringValue(dataSource.budget) || getBudgetSourceLabel(activeBudget.dataSource),
      cash: stringValue(dataSource.cash) || getCashSourceLabel(activeCash.dataSource),
      closeStatus: metadata.closeStatus || stringValue(dataSource.closeStatus),
      forecastVersionName:
        metadata.forecastVersionName || stringValue(dataSource.forecastVersionName),
    }),
    sections: normalizeSections(sections),
    actual,
    budget,
    brief: normalizedBrief,
    metricRows,
    activeData,
    activeBudget,
    activeCash,
    cashMetrics,
    trendMonths,
    uploadedDataNotes,
    dataSource,
    decisionMemo: metadata.decisionMemo ?? null,
  };
}

function normalizeSections(sections: PowerPointReportSections | undefined) {
  return {
    executiveSummary: sections?.executiveSummary ?? true,
    financialHighlights: sections?.financialHighlights ?? true,
    revenuePerformance: sections?.revenuePerformance ?? true,
    expensePerformance: sections?.expensePerformance ?? true,
    budgetVsActuals: sections?.budgetVsActuals ?? true,
    cashRunway: sections?.cashRunway ?? true,
    forecastUpdate: sections?.forecastUpdate ?? true,
    kpiSummary: sections?.kpiSummary ?? true,
    risks: sections?.risks ?? true,
    recommendations: sections?.recommendations ?? true,
    appendix: sections?.appendix ?? true,
  };
}

function normalizeBrief(
  brief: CfoBriefDeckContent | null | undefined,
  reportingMonth: string,
): CfoBriefDeckContent {
  return {
    executiveSummary: ensureTextArray(brief?.executiveSummary, [
      `${getFallbackCompanyName()} generated a monthly finance report for ${reportingMonth}.`,
      "Financial performance is summarized from the active dashboard, budget, cash, and reporting data.",
      "Use this deck as a management draft until monthly close status and source data are reviewed.",
    ]),
    revenueCommentary: ensureTextArray(brief?.revenueCommentary, [
      "Revenue performance should be reviewed against budget, forecast assumptions, and customer-level detail where available.",
    ]),
    expenseCommentary: ensureTextArray(brief?.expenseCommentary, [
      "Operating expenses should be reviewed by major category and tied to hiring, vendor, and investment timing.",
    ]),
    cashRunwayCommentary: ensureTextArray(brief?.cashRunwayCommentary, [
      "Cash, net burn, and runway are based on the active cash data source.",
    ]),
    budgetCommentary: ensureTextArray(brief?.budgetCommentary, [
      "Budget versus actuals are calculated from the active actuals and budget sources.",
    ]),
    risks: ensureTextArray(brief?.risks, [
      "No additional data-supported CFO risks were identified for this reporting period.",
    ]),
    actions: ensureTextArray(brief?.actions, [
      "Review variance drivers with the leadership team.",
      "Refresh the forecast if revenue, burn, or hiring timing has changed materially.",
      "Prepare investor-ready commentary on the key operating changes.",
    ]),
    investorBullets: ensureTextArray(brief?.investorBullets, [
      `${getFallbackCompanyName()} completed the ${reportingMonth} finance review.`,
      "The report summarizes revenue, expenses, budget variance, cash, and runway.",
      "Management is monitoring variance drivers and forecast implications.",
    ]),
  };
}

function ensureTextArray(value: string[] | undefined, fallback: string[]) {
  const cleaned = Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];

  return cleaned.length > 0 ? cleaned : fallback;
}

function validateDeckContext(context: DeckContext) {
  const missing: string[] = [];

  if (!context.companyName) missing.push("company name");
  if (!context.reportingMonth) missing.push("reporting month");
  if (context.reportType === "Decision Memo") {
    if (!context.decisionMemo) missing.push("decision memo");
    if (missing.length > 0) {
      throw new Error(`Cannot generate PowerPoint: missing ${missing.join(", ")}.`);
    }
    return;
  }
  if (!context.actual) missing.push("financial data");
  if (!context.budget) missing.push("budget data");

  if (missing.length > 0) {
    throw new Error(`Cannot generate PowerPoint: missing ${missing.join(", ")}.`);
  }
}

function getSlideBuilders(
  sections: Required<PowerPointReportSections>,
  context: DeckContext,
) {
  if (context.reportType === "Decision Memo" && context.decisionMemo) {
    return [
      addTitleSlide,
      addDecisionSummarySlide,
      addDecisionImpactSlide,
      addDecisionScenarioSlide,
      addDecisionRisksSlide,
      addDecisionAppendixSlide,
    ];
  }

  const builders: ((slide: Slide, context: DeckContext, pageNumber: number) => void)[] = [
    addTitleSlide,
  ];

  if (sections.executiveSummary) builders.push(addExecutiveSummarySlide);
  if (sections.financialHighlights) builders.push(addFinancialHighlightsSlide);
  if (sections.revenuePerformance) builders.push(addRevenueSlide);
  if (sections.expensePerformance) builders.push(addExpenseSlide);
  if (sections.budgetVsActuals) builders.push(addBudgetVsActualsSlide);
  if (sections.cashRunway) builders.push(addCashRunwaySlide);
  if (sections.forecastUpdate) builders.push(addForecastSlide);
  if (sections.kpiSummary) builders.push(addKpiSlide);
  if (sections.risks) builders.push(addRisksSlide);
  if (sections.recommendations) builders.push(addActionsSlide);
  if (sections.appendix) builders.push(addAppendixSlide);

  return builders;
}

function addTitleSlide(slide: Slide, context: DeckContext, pageNumber: number) {
  slide.background = { color: colors.ink };
  slide.addShape(shapeRect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: colors.ink },
    line: { color: colors.ink },
  });
  slide.addShape(shapeRect, {
    x: 0.62,
    y: 0.48,
    w: 0.06,
    h: 5.95,
    fill: { color: colors.cyan },
    line: { color: colors.cyan },
  });
  slide.addText(context.companyName, {
    x: 0.95,
    y: 0.72,
    w: 8.5,
    h: 0.35,
    fontSize: 13,
    bold: true,
    color: colors.cyan,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(context.reportType, {
    x: 0.92,
    y: 1.55,
    w: 8.9,
    h: 1.05,
    fontSize: 42,
    bold: true,
    color: colors.white,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(`${context.reportingMonth} | ${context.industry}`, {
    x: 0.95,
    y: 2.82,
    w: 8.4,
    h: 0.36,
    fontSize: 14,
    color: "B8C2CF",
    margin: 0,
    fit: "shrink",
  });
  slide.addText(reportTypePromise(context.reportType), {
    x: 0.95,
    y: 4.08,
    w: 7.3,
    h: 0.95,
    fontSize: 17,
    color: "E5E7EB",
    breakLine: false,
    margin: 0,
    fit: "shrink",
  });
  addCoverMetadata(slide, context);
  addDarkFooter(slide, context, pageNumber);
}

function addExecutiveSummarySlide(
  slide: Slide,
  context: DeckContext,
  pageNumber: number,
) {
  addSlideShell(slide, "Executive Summary", context, pageNumber);
  addStatement(slide, firstSentence(context.brief.executiveSummary[0]), 0.82, 1.22, 7.2);
  addBulletList(
    slide,
    context.brief.executiveSummary.slice(1, 5),
    0.92,
    2.72,
    6.9,
    3.1,
  );
  addSourcePanel(slide, context, 8.35, 1.28, 3.95, 3.95);
}

function addDecisionSummarySlide(
  slide: Slide,
  context: DeckContext,
  pageNumber: number,
) {
  addSlideShell(slide, "Decision Recommendation", context, pageNumber);
  const memo = context.decisionMemo;
  const analysis = memo?.analysis;

  addStatement(
    slide,
    `${analysis?.recommendation ?? "Recommendation pending"}: ${firstSentence(analysis?.cfoSummary ?? "Decision memo analysis is not available.")}`,
    0.82,
    1.22,
    7.25,
  );
  addMiniTable(
    slide,
    "Decision Context",
    [
      ["Field", "Detail"],
      ["Decision", shorten(memo?.decision_prompt ?? memo?.title ?? "Decision memo", 78)],
      ["Type", memo?.decision_type ?? "Not classified"],
      ["Created", formatDeckDate(memo?.created_at)],
      ["Status", memo?.status ?? "Draft"],
    ],
    8.15,
    1.3,
    4.25,
    3.3,
  );
  addBulletList(
    slide,
    analysis?.keyAssumptions?.slice(0, 5) ?? ["No assumptions were saved with this memo."],
    0.92,
    4.05,
    6.9,
    1.65,
  );
}

function addDecisionImpactSlide(
  slide: Slide,
  context: DeckContext,
  pageNumber: number,
) {
  addSlideShell(slide, "Financial Impact", context, pageNumber);
  const impact = context.decisionMemo?.analysis?.financialImpact;

  addDesignedTable(
    slide,
    [
      ["Impact Area", "Decision Memo View"],
      ["Upfront cost", impact?.upfrontCost ?? "Not specified"],
      ["Monthly recurring impact", impact?.monthlyRecurringImpact ?? "Not specified"],
      ["Cash balance impact", impact?.cashBalanceImpact ?? "Not specified"],
      ["Runway impact", impact?.runwayImpact ?? "Not specified"],
      ["EBITDA / OpEx impact", impact?.ebitdaOperatingExpenseImpact ?? "Not specified"],
      ["Forecast impact", impact?.forecastImpact ?? "Not specified"],
      ["Payback / ROI", impact?.paybackRoi ?? "Not specified"],
    ],
    0.68,
    1.28,
    11.95,
    4.95,
    7.8,
  );
}

function addDecisionScenarioSlide(
  slide: Slide,
  context: DeckContext,
  pageNumber: number,
) {
  addSlideShell(slide, "Scenario View", context, pageNumber);
  const scenarios = context.decisionMemo?.analysis?.scenarios ?? [];

  addDesignedTable(
    slide,
    [
      ["Scenario", "Summary", "Cash Impact", "Runway Impact", "Conditions"],
      ...scenarios.map((scenario) => [
        scenario.name,
        scenario.summary,
        scenario.cashImpact,
        scenario.runwayImpact,
        scenario.conditions,
      ]),
    ],
    0.68,
    1.28,
    11.95,
    4.95,
    7.2,
  );
}

function addDecisionRisksSlide(
  slide: Slide,
  context: DeckContext,
  pageNumber: number,
) {
  addSlideShell(slide, "Risks & Next Steps", context, pageNumber);
  const analysis = context.decisionMemo?.analysis;

  addMiniTable(
    slide,
    "Key Risks",
    [
      ["Risk", "Mitigation"],
      ...(analysis?.risks ?? []).slice(0, 4).map((risk) => [
        `${risk.severity} ${risk.category}: ${risk.description}`,
        risk.mitigation,
      ]),
    ],
    0.72,
    1.25,
    6.3,
    4.05,
  );
  addBulletList(
    slide,
    analysis?.recommendedNextSteps?.slice(0, 6) ?? ["No next steps were saved with this memo."],
    7.45,
    1.42,
    4.75,
    3.95,
  );
}

function addDecisionAppendixSlide(
  slide: Slide,
  context: DeckContext,
  pageNumber: number,
) {
  addSlideShell(slide, "Decision Memo Appendix", context, pageNumber);
  const analysis = context.decisionMemo?.analysis;

  addMiniTable(
    slide,
    "Source Metadata",
    [
      ["Field", "Source"],
      ["Company", context.companyName],
      ["Forecast version", context.forecastVersionName],
      ["Monthly close", context.closeStatus],
      ["Actuals", String(context.dataSource.actuals ?? "Unknown")],
      ["Cash", String(context.dataSource.cash ?? "Unknown")],
      ["Decision created", formatDeckDate(context.decisionMemo?.created_at)],
    ],
    0.82,
    1.25,
    5.6,
    4.2,
  );
  addBulletList(
    slide,
    [
      ...(analysis?.dataWarnings ?? []),
      ...(analysis?.unresolvedQuestions ?? []).slice(0, 4),
    ].slice(0, 7),
    7.0,
    1.38,
    5.0,
    4.2,
  );
}

function addFinancialHighlightsSlide(
  slide: Slide,
  context: DeckContext,
  pageNumber: number,
) {
  addSlideShell(slide, "Financial Highlights", context, pageNumber);
  addMetricRail(slide, [
    metricCard("Revenue", formatCurrency(context.actual?.revenue ?? 0), varianceLabel(context, "Revenue")),
    metricCard("EBITDA", formatCurrency(context.actual?.ebitda ?? 0), varianceLabel(context, "EBITDA")),
    metricCard("Cash", formatCurrency(context.actual?.cashBalance ?? 0), "Ending cash balance"),
    metricCard(
      "Runway",
      formatRunwayMonths(context.cashMetrics?.runwayMonths ?? context.actual?.runwayMonths ?? 0),
      "Based on active cash data",
    ),
  ]);
  addTrendBars(slide, context, "Revenue and OpEx Trend", 0.86, 3.0, 5.55, 2.85);
  addTrendBars(slide, context, "Cash Balance Trend", 7.0, 3.0, 5.25, 2.85, "cash");
}

function addRevenueSlide(slide: Slide, context: DeckContext, pageNumber: number) {
  addSlideShell(slide, "Revenue Performance", context, pageNumber);
  const revenueRow = context.metricRows.find((row) => row.metric === "Revenue");
  const usageRows = getUploadedRevenueDetail().filter((row) => row.status !== "Error");
  const topCustomers = topRevenueRows(usageRows);

  addMetricRail(slide, [
    metricCard("Actual Revenue", formatCurrency(context.actual?.revenue ?? 0), "Current month"),
    metricCard("Budget", formatCurrency(context.budget?.revenue ?? 0), "Approved plan"),
    metricCard("Variance", revenueRow ? formatMetricVariance(revenueRow) : "N/A", "Actual vs budget"),
  ]);
  addBulletList(
    slide,
    context.brief.revenueCommentary.slice(0, 4),
    0.92,
    2.75,
    6.3,
    3.15,
  );
  addMiniTable(
    slide,
    "Revenue Detail",
    [["Segment / Customer", "Amount"], ...topCustomers],
    7.65,
    2.72,
    4.55,
    2.85,
  );
}

function addExpenseSlide(slide: Slide, context: DeckContext, pageNumber: number) {
  addSlideShell(slide, "Expense Performance", context, pageNumber);
  addMiniTable(
    slide,
    "Operating Expense Detail",
    [
      ["Category", "Actual", "Budget", "Var"],
      expenseRow("Sales & Marketing", context, "salesAndMarketing"),
      expenseRow("R&D", context, "researchAndDevelopment"),
      expenseRow("G&A", context, "generalAndAdministrative"),
      expenseRow("Total OpEx", context, "operatingExpenses"),
    ],
    0.82,
    1.28,
    6.65,
    3.35,
  );
  addBulletList(
    slide,
    context.brief.expenseCommentary.slice(0, 4),
    8.0,
    1.42,
    4.1,
    3.75,
  );
}

function addBudgetVsActualsSlide(
  slide: Slide,
  context: DeckContext,
  pageNumber: number,
) {
  addSlideShell(slide, "Budget vs Actuals", context, pageNumber);
  const rows = [
    ["Metric", "Actual", "Budget", "Var $", "Var %", "Status"],
    ...context.metricRows
      .filter((row) =>
        [
          "Revenue",
          "Gross Margin",
          "Operating Expenses",
          "EBITDA",
          "Cash Balance",
          "Net Burn",
          "Runway",
        ].includes(row.metric),
      )
      .map((row) => formatTableRow(row, true)),
  ];

  addDesignedTable(slide, rows, 0.68, 1.28, 11.95, 4.95, 8.3);
}

function addCashRunwaySlide(slide: Slide, context: DeckContext, pageNumber: number) {
  addSlideShell(slide, "Cash & Runway", context, pageNumber);
  addMetricRail(slide, [
    metricCard("Latest Cash", formatCurrency(context.actual?.cashBalance ?? 0), "Ending balance"),
    metricCard(
      "Cash Change",
      context.cashMetrics?.monthlyCashChange === null ||
        context.cashMetrics?.monthlyCashChange === undefined
        ? "N/A"
        : formatVarianceLabel(context.cashMetrics.monthlyCashChange),
      "Month over month",
    ),
    metricCard(
      "3-Month Burn",
      formatCurrency(context.cashMetrics?.threeMonthAverageNetBurn ?? context.actual?.netBurn ?? 0),
      "Average net burn",
    ),
    metricCard(
      "Runway",
      formatRunwayMonths(context.cashMetrics?.runwayMonths ?? context.actual?.runwayMonths ?? 0),
      context.cashMetrics?.estimatedCashOutDate
        ? `Cash-out: ${context.cashMetrics.estimatedCashOutDate}`
        : "Cash-out date unavailable",
    ),
  ]);
  addBulletList(
    slide,
    context.brief.cashRunwayCommentary.slice(0, 5),
    0.92,
    2.9,
    11.0,
    2.95,
  );
}

function addForecastSlide(slide: Slide, context: DeckContext, pageNumber: number) {
  addSlideShell(slide, "Forecast Update", context, pageNumber);
  addStatement(slide, context.forecastVersionName, 0.82, 1.22, 6.8);
  addBulletList(slide, context.brief.budgetCommentary.slice(0, 4), 0.92, 2.55, 6.2, 3.25);
  addMiniTable(
    slide,
    "Forecast Context",
    [
      ["Item", "Context"],
      ["Version", context.forecastVersionName],
      ["Close status", context.closeStatus],
      ["Actuals source", getActualsSourceLabel(context.activeData.dataSource)],
      ["Budget source", getBudgetSourceLabel(context.activeBudget.dataSource)],
    ],
    7.55,
    1.35,
    4.65,
    3.55,
  );
}

function addKpiSlide(slide: Slide, context: DeckContext, pageNumber: number) {
  addSlideShell(slide, "KPI Summary", context, pageNumber);
  const payrollRows = getUploadedPayroll().filter((row) => row.status !== "Error");
  const latestPayrollMonth = [...new Set(payrollRows.map((row) => row.month))]
    .sort()
    .at(-1);
  const latestPayrollRows = payrollRows.filter((row) => row.month === latestPayrollMonth);
  const payrollCost = latestPayrollRows.reduce(
    (total, row) => total + (row.totalMonthlyPayrollCost ?? 0),
    0,
  );
  const pipelineRows = getUploadedPipeline().filter((row) => row.status !== "Error");
  const weightedPipeline = pipelineRows.reduce(
    (total, row) => total + (row.weightedPipeline ?? 0),
    0,
  );

  addMetricRail(slide, [
    metricCard("Headcount", String(latestPayrollRows.length || "N/A"), latestPayrollMonth || "No payroll file"),
    metricCard("Payroll Cost", payrollCost ? formatCurrency(payrollCost) : "N/A", "Monthly payroll"),
    metricCard("Revenue Detail", String(getUploadedRevenueDetail().length), "Rows available"),
    metricCard("Weighted Pipeline", weightedPipeline ? formatCurrency(weightedPipeline) : "N/A", "Pipeline coverage"),
  ]);
  addBulletList(
    slide,
    [
      ...context.uploadedDataNotes,
      "KPI inputs remain optional; missing supporting files are shown as placeholders rather than blocking export.",
    ],
    0.92,
    2.88,
    11.0,
    2.85,
  );
}

function addRisksSlide(slide: Slide, context: DeckContext, pageNumber: number) {
  addSlideShell(slide, "Risks", context, pageNumber);
  addNumberedList(slide, context.brief.risks.slice(0, 5), 0.92, 1.32, 11.15, 4.8);
}

function addActionsSlide(slide: Slide, context: DeckContext, pageNumber: number) {
  addSlideShell(slide, "Recommendations", context, pageNumber);
  addNumberedList(slide, context.brief.actions.slice(0, 5), 0.92, 1.32, 11.15, 4.8);
}

function addAppendixSlide(slide: Slide, context: DeckContext, pageNumber: number) {
  addSlideShell(slide, "Appendix: Source Metadata", context, pageNumber);
  addMiniTable(
    slide,
    "Report Metadata",
    [
      ["Field", "Value"],
      ["Company", context.companyName],
      ["Industry", context.industry],
      ["Report type", context.reportType],
      ["Reporting month", context.reportingMonth],
      ["Close status", context.closeStatus],
      ["Forecast version", context.forecastVersionName],
    ],
    0.82,
    1.25,
    5.45,
    4.25,
  );
  addBulletList(
    slide,
    [
      ...context.sourceLines,
      ...(isCompanyDataSource(context.activeData.dataSource) ||
      isCompanyDataSource(context.activeBudget.dataSource) ||
      isCompanyDataSource(context.activeCash.dataSource)
        ? ["Reporting prefers approved Data Room data, then saved company uploads, then clearly labeled fallbacks."]
        : ["Demo sample fallback data is used when company uploads are unavailable."]),
      "Optional files can be absent; export placeholders are used instead of failing deck generation.",
    ],
    6.8,
    1.33,
    5.45,
    4.4,
    11.2,
  );
}

function addSlideShell(
  slide: Slide,
  title: string,
  context: DeckContext,
  pageNumber: number,
) {
  slide.background = { color: colors.white };
  slide.addShape(shapeRect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.16,
    fill: { color: colors.ink },
    line: { color: colors.ink },
  });
  slide.addText(title, {
    x: 0.66,
    y: 0.46,
    w: 7.9,
    h: 0.46,
    fontFace: "Aptos Display",
    fontSize: 24,
    bold: true,
    color: colors.ink,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(`${context.reportType} | ${context.reportingMonth}`, {
    x: 8.75,
    y: 0.52,
    w: 3.9,
    h: 0.26,
    fontSize: 9,
    bold: true,
    color: colors.muted,
    align: "right",
    margin: 0,
    fit: "shrink",
  });
  slide.addShape(shapeLine, {
    x: 0.66,
    y: 1.02,
    w: 11.98,
    h: 0,
    line: { color: colors.rule, width: 0.7 },
  });
  addFooter(slide, context, pageNumber);
}

function addFooter(slide: Slide, context: DeckContext, pageNumber: number) {
  slide.addShape(shapeLine, {
    x: 0.66,
    y: 6.92,
    w: 11.98,
    h: 0,
    line: { color: colors.rule, width: 0.6 },
  });
  slide.addText(`${context.companyName} | Confidential`, {
    x: 0.66,
    y: 7.06,
    w: 4.4,
    h: 0.16,
    fontSize: 7.3,
    color: colors.muted,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(context.sourceLines[0] ?? "Source: Active reporting data", {
    x: 5.25,
    y: 7.06,
    w: 4.25,
    h: 0.16,
    fontSize: 7.3,
    color: colors.muted,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
  slide.addText(String(pageNumber), {
    x: 12.16,
    y: 7.06,
    w: 0.48,
    h: 0.16,
    fontSize: 7.3,
    color: colors.muted,
    align: "right",
    margin: 0,
  });
}

function addDarkFooter(slide: Slide, context: DeckContext, pageNumber: number) {
  slide.addText(`${context.companyName} | Confidential`, {
    x: 0.95,
    y: 6.9,
    w: 3.8,
    h: 0.18,
    fontSize: 7.5,
    color: "94A3B8",
    margin: 0,
  });
  slide.addText(String(pageNumber), {
    x: 12.0,
    y: 6.9,
    w: 0.5,
    h: 0.18,
    fontSize: 7.5,
    color: "94A3B8",
    align: "right",
    margin: 0,
  });
}

function addCoverMetadata(slide: Slide, context: DeckContext) {
  const rows = [
    ["Close Status", context.closeStatus],
    ["Forecast", context.forecastVersionName],
    ["Source", sourceSummary(context)],
  ];

  rows.forEach(([label, value], index) => {
    const y = 1.22 + index * 1.18;

    slide.addText(label, {
      x: 9.1,
      y,
      w: 2.6,
      h: 0.22,
      fontSize: 8.2,
      bold: true,
      color: colors.cyan,
      margin: 0,
      fit: "shrink",
    });
    slide.addText(value, {
      x: 9.1,
      y: y + 0.32,
      w: 3.0,
      h: 0.45,
      fontSize: 13,
      bold: true,
      color: colors.white,
      margin: 0,
      fit: "shrink",
    });
    slide.addShape(shapeLine, {
      x: 9.1,
      y: y + 0.9,
      w: 2.8,
      h: 0,
      line: { color: colors.graphite2, width: 0.8 },
    });
  });
}

function addSourcePanel(
  slide: Slide,
  context: DeckContext,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  slide.addShape(shapeRect, {
    x,
    y,
    w,
    h,
    fill: { color: colors.panel },
    line: { color: colors.rule, width: 0.7 },
  });
  slide.addText("Source Metadata", {
    x: x + 0.24,
    y: y + 0.22,
    w: w - 0.48,
    h: 0.24,
    fontSize: 11,
    bold: true,
    color: colors.ink,
    margin: 0,
  });
  addBulletList(slide, context.sourceLines.slice(0, 5), x + 0.27, y + 0.72, w - 0.55, h - 1.0, 9.4);
}

function addStatement(slide: Slide, text: string, x: number, y: number, w: number) {
  slide.addText(text || "No commentary available.", {
    x,
    y,
    w,
    h: 1.1,
    fontFace: "Aptos Display",
    fontSize: 22,
    bold: true,
    color: colors.ink,
    breakLine: false,
    margin: 0,
    fit: "shrink",
  });
  slide.addShape(shapeRect, {
    x,
    y: y + 1.34,
    w: 1.15,
    h: 0.06,
    fill: { color: colors.cyanDark },
    line: { color: colors.cyanDark },
  });
}

function addMetricRail(
  slide: Slide,
  metrics: { label: string; value: string; detail: string }[],
) {
  const width = 11.9 / metrics.length;

  metrics.forEach((metricItem, index) => {
    const x = 0.72 + index * width;

    slide.addShape(shapeRect, {
      x,
      y: 1.28,
      w: width - 0.14,
      h: 1.08,
      fill: { color: colors.panel },
      line: { color: colors.rule, width: 0.7 },
    });
    slide.addText(metricItem.label, {
      x: x + 0.16,
      y: 1.46,
      w: width - 0.48,
      h: 0.19,
      fontSize: 7.9,
      bold: true,
      color: colors.muted,
      margin: 0,
      fit: "shrink",
    });
    slide.addText(metricItem.value, {
      x: x + 0.16,
      y: 1.72,
      w: width - 0.48,
      h: 0.28,
      fontSize: 15,
      bold: true,
      color: colors.ink,
      margin: 0,
      fit: "shrink",
    });
    slide.addText(metricItem.detail, {
      x: x + 0.16,
      y: 2.08,
      w: width - 0.48,
      h: 0.18,
      fontSize: 7.2,
      color: colors.muted,
      margin: 0,
      fit: "shrink",
    });
  });
}

function addBulletList(
  slide: Slide,
  bullets: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize = 12.6,
) {
  const safeBullets = bullets.length > 0 ? bullets : ["No commentary available."];

  slide.addText(
    safeBullets.map((bullet) => ({
      text: shorten(bullet, 168),
      options: { bullet: { type: "bullet" }, breakLine: true },
    })),
    {
      x,
      y,
      w,
      h,
      fontSize,
      color: colors.graphite,
      breakLine: false,
      fit: "shrink",
      valign: "top",
      paraSpaceAfter: 8,
    },
  );
}

function addNumberedList(
  slide: Slide,
  items: string[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const safeItems = items.length > 0 ? items : ["No items available."];
  const rowH = Math.min(0.85, h / Math.max(1, safeItems.length));

  safeItems.slice(0, 5).forEach((item, index) => {
    const rowY = y + index * rowH;

    slide.addShape(shapeRect, {
      x,
      y: rowY + 0.02,
      w: 0.36,
      h: 0.36,
      fill: { color: colors.ink },
      line: { color: colors.ink },
    });
    slide.addText(String(index + 1), {
      x,
      y: rowY + 0.095,
      w: 0.36,
      h: 0.12,
      fontSize: 8,
      bold: true,
      align: "center",
      color: colors.cyan,
      margin: 0,
    });
    slide.addText(shorten(item, 180), {
      x: x + 0.55,
      y: rowY,
      w: w - 0.55,
      h: 0.52,
      fontSize: 13.5,
      color: colors.graphite,
      margin: 0,
      fit: "shrink",
    });
  });
}

function addMiniTable(
  slide: Slide,
  title: string,
  rows: string[][],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  slide.addText(title, {
    x,
    y,
    w,
    h: 0.25,
    fontSize: 11,
    bold: true,
    color: colors.ink,
    margin: 0,
  });
  addDesignedTable(slide, rows, x, y + 0.42, w, h - 0.42, 8.2);
}

function addDesignedTable(
  slide: Slide,
  rows: string[][],
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize = 8.7,
) {
  const safeRows = rows.length > 0 ? rows : [["Item", "Value"], ["No data", "Available"]];
  const rowH = h / safeRows.length;

  safeRows.forEach((row, rowIndex) => {
    const rowY = y + rowIndex * rowH;
    const fill = rowIndex === 0 ? colors.ink : rowIndex % 2 === 0 ? colors.panel : colors.white;
    const textColor = rowIndex === 0 ? colors.white : colors.graphite;

    slide.addShape(shapeRect, {
      x,
      y: rowY,
      w,
      h: rowH,
      fill: { color: fill },
      line: { color: rowIndex === 0 ? colors.ink : colors.rule, width: 0.35 },
    });
    row.forEach((cell, cellIndex) => {
      const cellW = w / row.length;
      const align = cellIndex === 0 ? "left" : "right";

      slide.addText(shorten(String(cell), 46), {
        x: x + cellIndex * cellW + 0.08,
        y: rowY + 0.08,
        w: cellW - 0.16,
        h: Math.max(0.12, rowH - 0.12),
        fontSize,
        bold: rowIndex === 0,
        color: textColor,
        margin: 0,
        align,
        fit: "shrink",
      });
    });
  });
}

function addTrendBars(
  slide: Slide,
  context: DeckContext,
  title: string,
  x: number,
  y: number,
  w: number,
  h: number,
  mode: "financial" | "cash" = "financial",
) {
  const months = context.trendMonths.slice(-6);
  const maxValue = Math.max(
    1,
    ...months.flatMap((month) =>
      mode === "cash"
        ? [month.cashBalance]
        : [month.revenue, month.operatingExpenses],
    ),
  );

  slide.addText(title, {
    x,
    y,
    w,
    h: 0.25,
    fontSize: 11,
    bold: true,
    color: colors.ink,
    margin: 0,
  });

  const chartY = y + 0.52;
  const chartH = h - 0.85;
  const groupW = w / Math.max(1, months.length);

  months.forEach((month, index) => {
    const groupX = x + index * groupW + 0.08;
    const values =
      mode === "cash"
        ? [{ value: month.cashBalance, color: colors.cyanDark }]
        : [
            { value: month.revenue, color: colors.cyanDark },
            { value: month.operatingExpenses, color: colors.graphite2 },
          ];
    const barW = mode === "cash" ? groupW * 0.42 : groupW * 0.22;

    values.forEach((bar, barIndex) => {
      const barH = Math.max(0.08, (bar.value / maxValue) * chartH);
      const barX = groupX + (mode === "cash" ? groupW * 0.18 : barIndex * (barW + 0.05));

      slide.addShape(shapeRect, {
        x: barX,
        y: chartY + chartH - barH,
        w: barW,
        h: barH,
        fill: { color: bar.color, transparency: 4 },
        line: { color: bar.color, transparency: 100 },
      });
    });
    slide.addText(month.label, {
      x: groupX - 0.02,
      y: chartY + chartH + 0.08,
      w: groupW - 0.08,
      h: 0.16,
      fontSize: 6.9,
      color: colors.muted,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
  });
}

function buildTrendMonths(actualPeriods: FinancialPeriod[], budgetPeriods: FinancialPeriod[]) {
  const periods = actualPeriods.length > 0 ? actualPeriods : budgetPeriods;

  return periods.map((period) => ({
    label: period.month.split(" ")[0],
    revenue: period.revenue,
    operatingExpenses: period.operatingExpenses,
    cashBalance: period.cashBalance,
  }));
}

function buildMetricRows(actual: FinancialPeriod, budget: FinancialPeriod): MetricRow[] {
  return [
    metric("Revenue", actual.revenue, budget.revenue, "currency", "higher"),
    metric("Cost of Revenue", actual.costOfRevenue, budget.costOfRevenue, "currency", "lower"),
    metric("Gross Profit", actual.grossProfit, budget.grossProfit, "currency", "higher"),
    metric("Gross Margin", actual.grossMargin, budget.grossMargin, "percent", "higher"),
    metric("Operating Expenses", actual.operatingExpenses, budget.operatingExpenses, "currency", "lower"),
    metric("EBITDA", actual.ebitda, budget.ebitda, "currency", "higher"),
    metric("Cash Balance", actual.cashBalance, budget.cashBalance, "currency", "higher"),
    metric("Net Burn", actual.netBurn, budget.netBurn, "currency", "lower"),
    metric("Runway", actual.runwayMonths, budget.runwayMonths, "months", "higher"),
  ];
}

function metric(
  metricName: string,
  actual: number,
  budget: number,
  format: MetricRow["format"],
  favorableDirection: FavorableDirection,
): MetricRow {
  return {
    metric: metricName,
    actual,
    budget,
    format,
    favorableDirection,
  };
}

function formatTableRow(row: MetricRow, compact = false) {
  const varianceDollars = calculateVarianceDollars(row.actual, row.budget);
  const variancePercent = calculateVariancePercent(row.actual, row.budget);
  const status = getVarianceStatus(row.actual, row.budget, row.favorableDirection);
  const varianceLabel =
    row.format === "percent"
      ? formatPointVariance(varianceDollars)
      : row.format === "months"
        ? formatMonthVariance(varianceDollars)
        : formatVarianceLabel(varianceDollars);

  if (compact) {
    return [
      row.metric,
      formatMetricValue(row.actual, row.format),
      formatMetricValue(row.budget, row.format),
      varianceLabel,
      formatPercentVarianceLabel(variancePercent),
      status,
    ];
  }

  return [
    row.metric,
    formatMetricValue(row.actual, row.format),
    formatMetricValue(row.budget, row.format),
    `${varianceLabel} (${formatPercentVarianceLabel(variancePercent)})`,
    status,
  ];
}

function formatMetricValue(value: number, format: MetricRow["format"]) {
  if (format === "percent") {
    return formatPercent(value);
  }

  if (format === "months") {
    return formatRunwayMonths(value);
  }

  return formatCurrencyThousands(value);
}

function formatMetricVariance(row: MetricRow) {
  const variance = calculateVarianceDollars(row.actual, row.budget);

  if (row.format === "percent") return formatPointVariance(variance);
  if (row.format === "months") return formatMonthVariance(variance);
  return formatVarianceLabel(variance);
}

function formatPointVariance(value: number) {
  const prefix = value >= 0 ? "+" : "-";

  return `${prefix}${Math.abs(value * 100).toFixed(1)} pts`;
}

function formatMonthVariance(value: number) {
  const prefix = value >= 0 ? "+" : "-";

  return `${prefix}${Math.abs(value).toFixed(1)} months`;
}

function varianceLabel(context: DeckContext, metricName: string) {
  const row = context.metricRows.find((metricRow) => metricRow.metric === metricName);

  return row ? `${formatMetricVariance(row)} vs budget` : "Variance unavailable";
}

function expenseRow(
  label: string,
  context: DeckContext,
  key:
    | "salesAndMarketing"
    | "researchAndDevelopment"
    | "generalAndAdministrative"
    | "operatingExpenses",
) {
  const actual = context.actual?.[key] ?? 0;
  const budget = context.budget?.[key] ?? 0;

  return [
    label,
    formatCurrency(actual),
    formatCurrency(budget),
    formatVarianceLabel(actual - budget),
  ];
}

function metricCard(label: string, value: string, detail: string) {
  return { label, value, detail };
}

function topRevenueRows(
  rows: { customer: string; product: string; amount: number | null }[],
) {
  if (rows.length === 0) {
    return [["No revenue detail", "Optional file missing"]];
  }

  const totals = new Map<string, number>();

  rows.forEach((row) => {
    const label = row.customer || row.product || "Unknown";

    totals.set(label, (totals.get(label) ?? 0) + (row.amount ?? 0));
  });

  return [...totals.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 4)
    .map(([label, value]) => [label, formatCurrency(value)]);
}

function buildUploadedDataNotes() {
  const payrollRows = getUploadedPayroll();
  const revenueRows = getUploadedRevenueDetail();
  const pipelineRows = getUploadedPipeline();

  return [
    payrollRows.length > 0
      ? `Payroll/headcount data: ${payrollRows.length} rows available.`
      : "Payroll/headcount data: optional file not available.",
    revenueRows.length > 0
      ? `Revenue detail: ${revenueRows.length} rows available.`
      : "Revenue detail: optional file not available.",
    pipelineRows.length > 0
      ? `Pipeline: ${pipelineRows.length} rows available.`
      : "Pipeline: optional file not available.",
  ];
}

function buildSourceLines({
  actuals,
  budget,
  cash,
  closeStatus,
  forecastVersionName,
}: {
  actuals: string;
  budget: string;
  cash: string;
  closeStatus?: string;
  forecastVersionName?: string;
}) {
  return [
    actuals,
    budget,
    cash,
    closeStatus ? `Close Status: ${closeStatus}` : "",
    forecastVersionName ? `Forecast Version: ${forecastVersionName}` : "",
  ].filter(Boolean);
}

function sourceSummary(context: DeckContext) {
  if (context.sourceLines.some((line) => line.includes("Demo Data"))) {
    return "Demo Data";
  }

  if (context.sourceLines.some((line) => line.includes("Approved Data Room"))) {
    return "Approved Data Room";
  }

  return "Active company data";
}

function reportTypePromise(reportType: string) {
  if (reportType === "Board Pack") {
    return "Board-ready finance narrative with source context, variance discipline, and operating recommendations.";
  }

  if (reportType === "Forecast Update") {
    return "Forward-looking finance update connecting closed actuals, forecast assumptions, and runway decisions.";
  }

  if (reportType === "Decision Memo") {
    return "Decision-support memo for management action, tradeoffs, risks, and recommended next steps.";
  }

  return "Monthly performance review built from approved close data, CFO commentary, forecast context, and source metadata.";
}

function firstSentence(value: string) {
  return value.split(/(?<=\.)\s+/)[0] || value;
}

function shorten(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function formatDeckDate(value: string | null | undefined) {
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

function getFallbackCompanyName() {
  return sampleCompany.name?.trim() || "Company";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
