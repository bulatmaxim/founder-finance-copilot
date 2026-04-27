"use client";

import type PptxGenJS from "pptxgenjs";
import { sampleCompany } from "@/data/sampleCompany";
import { sampleForecast, type ForecastVersion } from "@/data/sampleForecast";
import {
  calculateVarianceDollars,
  calculateVariancePercent,
  getVarianceStatus,
  type FavorableDirection,
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
  getUploadedBankTransactions,
  getUploadedPayroll,
  getUploadedPipeline,
  getUploadedRevenueDetail,
} from "@/lib/localDataStore";
import type { FinancialPeriod } from "@/lib/calculations";

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

type MetricRow = {
  metric: string;
  actual: number;
  budget: number;
  format: "currency" | "percent" | "months";
  favorableDirection: FavorableDirection;
};

type Slide = ReturnType<PptxGenJS["addSlide"]>;
type PptxGenConstructor = new () => PptxGenJS;

const colors = {
  black: "111111",
  gray: "666666",
  midGray: "A3A3A3",
  lightGray: "E5E5E5",
  softGray: "F7F7F7",
  white: "FFFFFF",
};

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const shapeLine = "line";
const shapeRect = "rect";

export async function generateMonthlyCfoDeck({
  reportingMonth,
  brief,
}: {
  reportingMonth: string;
  brief: CfoBriefDeckContent | null | undefined;
}) {
  assertBrowserRuntime();

  const { default: PptxGenJSConstructor } = await import("pptxgenjs");
  const pptx = createDeck(PptxGenJSConstructor);
  const context = buildDeckContext(reportingMonth, brief);
  validateDeckContext(context);

  const slides = [
    addTitleSlide,
    addExecutiveSummarySlide,
    addKeyMetricsSlide,
    addRevenueSlide,
    addExpenseSlide,
    addBudgetVsActualsSlide,
    addCashRunwaySlide,
    addForecastSlide,
    addRisksSlide,
    addActionsSlide,
    addInvestorBulletsSlide,
    addAppendixSlide,
  ];

  slides.forEach((builder, index) => {
    const slide = pptx.addSlide();
    builder(slide, context, index + 1);
  });

  const fileName = `Acme_AI_Monthly_CFO_Deck_${sanitizeReportingMonth(context.reportingMonth)}.pptx`;
  const content = await pptx.write({ outputType: "blob" });
  downloadBlob(toPptxBlob(content), fileName);

  return fileName;
}

function assertBrowserRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error(
      "Cannot generate CFO deck outside the browser. Open the local app and click the Reports page button.",
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

  throw new Error("Cannot generate CFO deck: PptxGenJS returned an unsupported file payload.");
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

function sanitizeReportingMonth(reportingMonth: string) {
  return (
    reportingMonth
      .trim()
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "Reporting_Period"
  );
}

function createDeck(PptxGenJSConstructor: PptxGenConstructor) {
  const pptx = new PptxGenJSConstructor();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Founder Finance Copilot";
  pptx.company = getCompanyName();
  pptx.subject = "Monthly CFO Brief";
  pptx.title = `${getCompanyName()} Monthly CFO Brief`;
  pptx.theme = {
    headFontFace: "Arial",
    bodyFontFace: "Arial",
  };

  return pptx;
}

function buildDeckContext(
  reportingMonth: string,
  brief: CfoBriefDeckContent | null | undefined,
) {
  if (!reportingMonth) {
    throw new Error("Cannot generate CFO deck: reporting month is missing.");
  }

  const activeData = getActiveFinancialData();
  const activeBudget = getActiveBudgetData();
  const activeCash = getActiveCashData();
  const periods = activeData.periods;
  const index = periods.findIndex(
    (period) => period.month === reportingMonth,
  );
  const safeIndex = index >= 0 ? index : periods.length - 1;
  const actual = periods[safeIndex];
  const budget = getBudgetForMonth(actual.month, safeIndex);
  const cashMetrics = getCashMetricsForMonth(actual.month);
  const normalizedBrief = normalizeBrief(brief, reportingMonth);

  if (!actual) {
    throw new Error(
      `Cannot generate CFO deck: no local financial data found for ${reportingMonth}.`,
    );
  }

  if (!budget) {
    throw new Error(
      `Cannot generate CFO deck: no local budget data found for ${reportingMonth}.`,
    );
  }

  const budgetVersion = getForecastVersion("budget");
  const latestForecast = getForecastVersion("latest");
  const budgetSummary = summarizeForecast(budgetVersion);
  const latestSummary = summarizeForecast(latestForecast);
  const metricRows = buildMetricRows(actual, budget);
  const uploadedDataNotes = buildUploadedDataNotes();

  return {
    reportingMonth,
    actual,
    budget,
    brief: normalizedBrief,
    metricRows,
    activeData,
    activeBudget,
    activeCash,
    cashMetrics,
    budgetVersion,
    latestForecast,
    budgetSummary,
    latestSummary,
    forecastCommentary: buildForecastCommentary(budgetSummary, latestSummary),
    uploadedDataNotes,
  };
}

function normalizeBrief(
  brief: CfoBriefDeckContent | null | undefined,
  reportingMonth: string,
): CfoBriefDeckContent {
  return {
    executiveSummary: ensureTextArray(brief?.executiveSummary, [
      `${getCompanyName()} generated a local sample CFO deck for ${reportingMonth}.`,
      "Financial performance is based on local sample actuals, budget, forecast, and cash data.",
      "Management should review revenue, expense, EBITDA, burn, and runway trends before investor distribution.",
    ]),
    revenueCommentary: ensureTextArray(brief?.revenueCommentary, [
      "Revenue performance should be reviewed against budget and the latest forecast.",
    ]),
    expenseCommentary: ensureTextArray(brief?.expenseCommentary, [
      "Operating expenses should be reviewed against budget by major category.",
    ]),
    cashRunwayCommentary: ensureTextArray(brief?.cashRunwayCommentary, [
      "Cash balance, net burn, and runway are based on local sample data.",
    ]),
    budgetCommentary: ensureTextArray(brief?.budgetCommentary, [
      "Budget versus actuals are calculated from local sample data.",
    ]),
    risks: ensureTextArray(brief?.risks, [
      "No additional data-supported CFO risks were identified in the local sample for this period.",
    ]),
    actions: ensureTextArray(brief?.actions, [
      "Refresh the latest forecast with actual monthly performance.",
      "Review expense categories and hiring plans against runway targets.",
      "Prepare investor update language using the monthly CFO brief.",
    ]),
    investorBullets: ensureTextArray(brief?.investorBullets, [
      `${getCompanyName()} completed the ${reportingMonth} local sample CFO review.`,
      "The update is based on sample financials, budget, forecast, and cash data.",
      "Management is monitoring revenue, burn, EBITDA, and runway versus plan.",
    ]),
  };
}

function ensureTextArray(value: string[] | undefined, fallback: string[]) {
  const cleaned = Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];

  return cleaned.length > 0 ? cleaned : fallback;
}

function validateDeckContext(context: ReturnType<typeof buildDeckContext>) {
  const missing: string[] = [];

  if (!getCompanyName()) missing.push("company name");
  if (!context.reportingMonth) missing.push("reporting month");
  if (!context.actual) missing.push("latest financial data");
  if (!context.budget) missing.push("budget data");
  if (!context.budgetVersion?.months?.length) missing.push("budget forecast data");
  if (!context.latestForecast?.months?.length) missing.push("latest forecast data");
  if (!context.metricRows.length) missing.push("metrics");
  if (!context.brief.executiveSummary.length) missing.push("CFO brief executive summary");
  if (!context.brief.risks.length) missing.push("risks");
  if (!context.brief.actions.length) missing.push("recommended actions");
  if (!context.brief.investorBullets.length) missing.push("investor update bullets");

  if (missing.length > 0) {
    throw new Error(
      `Cannot generate CFO deck: missing ${missing.join(", ")}.`,
    );
  }
}

function getCompanyName() {
  return sampleCompany.name?.trim() || "Acme AI";
}

function addTitleSlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  slide.background = { color: colors.white };
  slide.addText(getCompanyName(), {
    x: 0.75,
    y: 1.35,
    w: 6.5,
    h: 0.45,
    fontFace: "Arial",
    fontSize: 18,
    bold: true,
    color: colors.black,
    margin: 0,
  });
  slide.addText("Monthly CFO Brief", {
    x: 0.75,
    y: 2.05,
    w: 8.7,
    h: 0.9,
    fontFace: "Arial",
    fontSize: 36,
    bold: true,
    color: colors.black,
    margin: 0,
    breakLine: false,
  });
  slide.addText(context.reportingMonth, {
    x: 0.75,
    y: 3.05,
    w: 4.3,
    h: 0.38,
    fontSize: 16,
    color: colors.gray,
    margin: 0,
  });
  slide.addShape(shapeLine, {
    x: 0.75,
    y: 3.72,
    w: 4.5,
    h: 0,
    line: { color: colors.black, width: 1 },
  });
  slide.addText("Prepared by Founder Finance Copilot", {
    x: 0.75,
    y: 4.05,
    w: 5.5,
    h: 0.32,
    fontSize: 12,
    color: colors.gray,
    margin: 0,
  });
  addFooter(slide, context.reportingMonth, pageNumber);
}

function addExecutiveSummarySlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  addSlideShell(slide, "Executive Summary", context.reportingMonth, pageNumber);
  addBulletList(slide, context.brief.executiveSummary.slice(0, 5), 0.95, 1.55, 11.3, 3.1);
  addMetricStrip(slide, [
    ["Revenue", formatCurrency(context.actual.revenue)],
    ["EBITDA", formatCurrency(context.actual.ebitda)],
    ["Cash", formatCurrency(context.actual.cashBalance)],
    ["Runway", formatRunwayMonths(context.cashMetrics?.runwayMonths ?? context.actual.runwayMonths)],
  ]);
}

function addKeyMetricsSlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  addSlideShell(slide, "Key Financial Metrics", context.reportingMonth, pageNumber);
  const rows = [
    ["Metric", "Actual", "Budget", "Variance", "Status"],
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
      .map((row) => formatTableRow(row)),
  ];
  addTable(slide, rows, 0.75, 1.35, 11.85, 4.8);
}

function addRevenueSlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  addSlideShell(slide, "Revenue Performance", context.reportingMonth, pageNumber);
  const variance = varianceFor(
    context.actual.revenue,
    context.budget.revenue,
    "higher",
  );
  addMetricStrip(slide, [
    ["Revenue actual", formatCurrency(context.actual.revenue)],
    ["Revenue budget", formatCurrency(context.budget.revenue)],
    ["Variance $", formatVarianceLabel(variance.dollars)],
    ["Variance %", formatPercentVarianceLabel(variance.percent)],
  ]);
  addBulletList(slide, context.brief.revenueCommentary.slice(0, 3), 0.95, 3.0, 11.3, 2.35);
}

function addExpenseSlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  addSlideShell(slide, "Expense Performance", context.reportingMonth, pageNumber);
  const rows = [
    ["Category", "Actual", "Budget", "Variance"],
    ["Operating Expenses", formatCurrency(context.actual.operatingExpenses), formatCurrency(context.budget.operatingExpenses), formatVarianceLabel(context.actual.operatingExpenses - context.budget.operatingExpenses)],
    ["Sales & Marketing", formatCurrency(context.actual.salesAndMarketing), formatCurrency(context.budget.salesAndMarketing), formatVarianceLabel(context.actual.salesAndMarketing - context.budget.salesAndMarketing)],
    ["R&D", formatCurrency(context.actual.researchAndDevelopment), formatCurrency(context.budget.researchAndDevelopment), formatVarianceLabel(context.actual.researchAndDevelopment - context.budget.researchAndDevelopment)],
    ["G&A", formatCurrency(context.actual.generalAndAdministrative), formatCurrency(context.budget.generalAndAdministrative), formatVarianceLabel(context.actual.generalAndAdministrative - context.budget.generalAndAdministrative)],
  ];
  addTable(slide, rows, 0.75, 1.35, 7.2, 3.2);
  addBulletList(slide, context.brief.expenseCommentary.slice(0, 3), 8.35, 1.55, 4.15, 3.25);
}

function addBudgetVsActualsSlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  addSlideShell(slide, "Budget vs Actuals", context.reportingMonth, pageNumber);
  const rows = [
    ["Metric", "Actual", "Budget", "Var $", "Var %", "Status"],
    ...context.metricRows
      .filter((row) =>
        ["Revenue", "Cost of Revenue", "Gross Profit", "Gross Margin", "Operating Expenses", "EBITDA", "Cash Balance", "Net Burn", "Runway"].includes(row.metric),
      )
      .map((row) => formatTableRow(row, true)),
  ];
  addTable(slide, rows, 0.55, 1.18, 12.25, 5.45, 8);
}

function addCashRunwaySlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  addSlideShell(slide, "Cash & Runway", context.reportingMonth, pageNumber);
  addMetricStrip(slide, [
    ["Latest cash", formatCurrency(context.actual.cashBalance)],
    ["Prior cash", context.cashMetrics?.priorCashBalance === null || context.cashMetrics?.priorCashBalance === undefined ? "N/A" : formatCurrency(context.cashMetrics.priorCashBalance)],
    ["Monthly change", context.cashMetrics?.monthlyCashChange === null || context.cashMetrics?.monthlyCashChange === undefined ? "N/A" : formatVarianceLabel(context.cashMetrics.monthlyCashChange)],
    ["3-mo avg burn", formatCurrency(context.cashMetrics?.threeMonthAverageNetBurn ?? context.actual.netBurn)],
    ["Runway", formatRunwayMonths(context.actual.runwayMonths)],
    ["Cash-out date", context.cashMetrics?.estimatedCashOutDate ?? "N/A"],
  ]);
  addBulletList(slide, context.brief.cashRunwayCommentary.slice(0, 5), 0.95, 3.0, 11.3, 2.3);
}

function addForecastSlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  addSlideShell(slide, "Forecast Update", context.reportingMonth, pageNumber);
  const rows = [
    ["Metric", "Budget", "Latest Forecast", "Variance"],
    ["Revenue", formatCurrency(context.budgetSummary.revenue), formatCurrency(context.latestSummary.revenue), formatVarianceLabel(context.latestSummary.revenue - context.budgetSummary.revenue)],
    ["EBITDA", formatCurrency(context.budgetSummary.ebitda), formatCurrency(context.latestSummary.ebitda), formatVarianceLabel(context.latestSummary.ebitda - context.budgetSummary.ebitda)],
    ["Ending Cash", formatCurrency(context.budgetSummary.endingCash), formatCurrency(context.latestSummary.endingCash), formatVarianceLabel(context.latestSummary.endingCash - context.budgetSummary.endingCash)],
    ["Ending Runway", formatRunwayMonths(context.budgetSummary.endingRunway), formatRunwayMonths(context.latestSummary.endingRunway), formatMonthVariance(context.latestSummary.endingRunway - context.budgetSummary.endingRunway)],
  ];
  addTable(slide, rows, 0.75, 1.35, 7.2, 3.2);
  addBulletList(slide, context.forecastCommentary.slice(0, 4), 8.35, 1.45, 4.1, 3.8);
}

function addRisksSlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  addSlideShell(slide, "Key Risks", context.reportingMonth, pageNumber);
  addBulletList(slide, context.brief.risks.slice(0, 5), 0.95, 1.4, 11.4, 4.6);
}

function addActionsSlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  addSlideShell(slide, "Recommended Actions", context.reportingMonth, pageNumber);
  addBulletList(slide, context.brief.actions.slice(0, 5), 0.95, 1.4, 11.4, 4.6);
}

function addInvestorBulletsSlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  addSlideShell(slide, "Investor Update Bullets", context.reportingMonth, pageNumber);
  addBulletList(slide, context.brief.investorBullets.slice(0, 5), 0.95, 1.4, 11.4, 4.6);
}

function addAppendixSlide(
  slide: Slide,
  context: ReturnType<typeof buildDeckContext>,
  pageNumber: number,
) {
  addSlideShell(slide, "Appendix", context.reportingMonth, pageNumber);
  addBulletList(
    slide,
    [
      "Data sources: local sample P&L, budget, forecast, and cash data.",
      "This deck is a prototype generated from sample TypeScript data.",
      "Revenue, expense, EBITDA, cash, burn, and runway are calculated from local sample values.",
      `${getActualsSourceLabel(context.activeData.dataSource)}.`,
      `${getBudgetSourceLabel(context.activeBudget.dataSource)}.`,
      `${getCashSourceLabel(context.activeCash.dataSource)}.`,
      ...(context.activeData.dataSource === "uploaded" ||
      context.activeBudget.dataSource === "uploaded" ||
      context.activeCash.dataSource === "uploaded"
        ? ["Uploaded actuals, budget, and cash CSV data are stored locally in the browser for prototype testing only."]
        : []),
      ...context.uploadedDataNotes,
      "Favorable variance logic: higher is favorable for revenue, margin, EBITDA, cash, and runway; lower is favorable for expenses and net burn.",
      "No external accounting, banking, payroll, CRM, AI, or database service is connected.",
    ],
    0.95,
    1.4,
    11.4,
    4.8,
  );
}

function buildUploadedDataNotes() {
  const payrollRows = getUploadedPayroll();
  const revenueRows = getUploadedRevenueDetail();
  const pipelineRows = getUploadedPipeline();
  const bankRows = getUploadedBankTransactions();

  return [
    payrollRows.length > 0
      ? `Payroll/headcount data uploaded: ${payrollRows.length} rows.`
      : "Payroll data not uploaded.",
    revenueRows.length > 0
      ? `Revenue detail uploaded: ${revenueRows.length} rows for concentration review.`
      : "Revenue detail not uploaded.",
    pipelineRows.length > 0
      ? `Pipeline data uploaded: ${pipelineRows.length} rows for forecast coverage review.`
      : "Pipeline data not uploaded.",
    bankRows.length > 0
      ? `Bank transaction data uploaded: ${bankRows.length} rows for cash outflow review.`
      : "Bank transactions not uploaded.",
  ];
}

function addSlideShell(
  slide: Slide,
  title: string,
  reportingMonth: string,
  pageNumber: number,
) {
  slide.background = { color: colors.white };
  slide.addText(title, {
    x: 0.65,
    y: 0.42,
    w: 8.6,
    h: 0.42,
    fontFace: "Arial",
    fontSize: 21,
    bold: true,
    color: colors.black,
    margin: 0,
  });
  slide.addText(reportingMonth, {
    x: 9.7,
    y: 0.47,
    w: 2.9,
    h: 0.28,
    fontSize: 10,
    color: colors.gray,
    align: "right",
    margin: 0,
  });
  slide.addShape(shapeLine, {
    x: 0.65,
    y: 0.98,
    w: 12.05,
    h: 0,
    line: { color: colors.lightGray, width: 1 },
  });
  addFooter(slide, reportingMonth, pageNumber);
}

function addFooter(slide: Slide, reportingMonth: string, pageNumber: number) {
  slide.addShape(shapeLine, {
    x: 0.65,
    y: 6.95,
    w: 12.05,
    h: 0,
    line: { color: colors.lightGray, width: 0.75 },
  });
  slide.addText(`${getCompanyName()} | ${reportingMonth}`, {
    x: 0.65,
    y: 7.08,
    w: 3.4,
    h: 0.18,
    fontSize: 7.5,
    color: colors.gray,
    margin: 0,
  });
  slide.addText("Confidential", {
    x: 5.05,
    y: 7.08,
    w: 3.2,
    h: 0.18,
    fontSize: 7.5,
    color: colors.gray,
    align: "center",
    margin: 0,
  });
  slide.addText(String(pageNumber), {
    x: 12.2,
    y: 7.08,
    w: 0.5,
    h: 0.18,
    fontSize: 7.5,
    color: colors.gray,
    align: "right",
    margin: 0,
  });
}

function addMetricStrip(slide: Slide, metrics: [string, string][]) {
  const width = 11.85 / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = 0.75 + index * width;
    slide.addShape(shapeRect, {
      x,
      y: 1.35,
      w: width - 0.12,
      h: 1.05,
      fill: { color: colors.softGray },
      line: { color: colors.lightGray, width: 0.75 },
    });
    slide.addText(label, {
      x: x + 0.15,
      y: 1.53,
      w: width - 0.42,
      h: 0.2,
      fontSize: 8.5,
      color: colors.gray,
      margin: 0,
      fit: "shrink",
    });
    slide.addText(value, {
      x: x + 0.15,
      y: 1.82,
      w: width - 0.42,
      h: 0.3,
      fontSize: 15,
      bold: true,
      color: colors.black,
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
) {
  slide.addText(
    bullets.map((bullet) => ({
      text: bullet,
      options: { bullet: { type: "bullet" }, breakLine: true },
    })),
    {
      x,
      y,
      w,
      h,
      fontSize: 13.2,
      color: colors.black,
      breakLine: false,
      fit: "shrink",
      valign: "top",
      paraSpaceAfter: 8,
    },
  );
}

function addTable(
  slide: Slide,
  rows: string[][],
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize = 9,
) {
  const tableRows = rows.map((row, rowIndex) =>
    row.map((text) => ({
      text,
      options:
        rowIndex === 0
          ? { bold: true, fill: { color: colors.softGray }, color: colors.black }
          : { color: colors.black },
    })),
  );

  slide.addTable(tableRows, {
    x,
    y,
    w,
    h,
    fontFace: "Arial",
    fontSize,
    color: colors.black,
    border: { type: "solid", color: colors.lightGray, pt: 0.6 },
    fill: { color: colors.white },
    margin: 0.06,
    valign: "middle",
    rowH: h / rows.length,
  });
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

function varianceFor(
  actual: number,
  budget: number,
  favorableDirection: FavorableDirection,
) {
  return {
    dollars: calculateVarianceDollars(actual, budget),
    percent: calculateVariancePercent(actual, budget),
    status: getVarianceStatus(actual, budget, favorableDirection),
  };
}

type ForecastSummary = {
  revenue: number;
  operatingExpenses: number;
  ebitda: number;
  endingCash: number;
  endingRunway: number;
};

function summarizeForecast(version: ForecastVersion): ForecastSummary {
  const endingMonth = version.months[version.months.length - 1];

  return {
    revenue: version.months.reduce((total, month) => total + month.revenue, 0),
    operatingExpenses: version.months.reduce(
      (total, month) => total + month.operatingExpenses,
      0,
    ),
    ebitda: version.months.reduce((total, month) => total + month.ebitda, 0),
    endingCash: endingMonth.cashBalance,
    endingRunway: endingMonth.runwayMonths,
  };
}

function buildForecastCommentary(
  budgetSummary: ForecastSummary,
  latestSummary: ForecastSummary,
) {
  const revenueVariance = latestSummary.revenue - budgetSummary.revenue;
  const opexVariance =
    latestSummary.operatingExpenses - budgetSummary.operatingExpenses;
  const cashVariance = latestSummary.endingCash - budgetSummary.endingCash;
  const ebitdaVariance = latestSummary.ebitda - budgetSummary.ebitda;
  const commentary: string[] = [];

  commentary.push(
    revenueVariance < 0
      ? `Latest forecast revenue is below budget by ${formatVarianceLabel(revenueVariance)}.`
      : `Latest forecast revenue is above budget by ${formatVarianceLabel(revenueVariance)}.`,
  );
  commentary.push(
    opexVariance > 0
      ? `Operating expenses are above budget by ${formatVarianceLabel(opexVariance)}, indicating expense pressure.`
      : `Operating expenses are below budget by ${formatVarianceLabel(opexVariance)}.`,
  );

  if (cashVariance < 0) {
    commentary.push(
      `Ending cash is below budget by ${formatVarianceLabel(cashVariance)}.`,
    );
  }

  if (latestSummary.endingRunway < 12) {
    commentary.push("Ending runway is below 12 months; review hiring and spend.");
  }

  if (ebitdaVariance < 0) {
    commentary.push(
      `EBITDA is below budget by ${formatVarianceLabel(ebitdaVariance)}; update investor reporting language.`,
    );
  }

  return commentary;
}

function getForecastVersion(id: "budget" | "latest") {
  const version = sampleForecast.find((item) => item.id === id);

  if (!version) {
    throw new Error(`Missing forecast version: ${id}`);
  }

  return version;
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

function formatPointVariance(value: number) {
  const prefix = value >= 0 ? "+" : "-";

  return `${prefix}${Math.abs(value * 100).toFixed(1)} pts`;
}

function formatMonthVariance(value: number) {
  const prefix = value >= 0 ? "+" : "-";

  return `${prefix}${Math.abs(value).toFixed(1)} months`;
}
