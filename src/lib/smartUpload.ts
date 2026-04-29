"use client";

import Papa from "papaparse";
import {
  formatReportingMonth,
  monthlyCloseCategories,
  uploadMonthlyCloseFile,
  type MonthlyCloseCategory,
} from "@/lib/monthlyClose";

export type SmartUploadConfidence = "High" | "Medium" | "Low";
export type SmartUploadDetectedCategory = MonthlyCloseCategory | "unknown";

export type SmartColumnMapping = {
  period?: string;
  account?: string;
  amount?: string;
  department?: string;
  category?: string;
  notes?: string;
};

export type SmartUploadReview = {
  fileName: string;
  detectedCategory: SmartUploadDetectedCategory;
  confidence: SmartUploadConfidence;
  detectedPeriodStart: string | null;
  detectedPeriodEnd: string | null;
  suggestedColumnMapping: SmartColumnMapping;
  warnings: string[];
  reasoning: string;
  headers: string[];
  sampleRows: Record<string, unknown>[];
  aiUsed: boolean;
};

const headerSignals: Record<Exclude<SmartUploadDetectedCategory, "unknown">, string[]> = {
  actuals: ["account", "account name", "actual", "amount", "debit", "credit", "month", "period"],
  budget: ["budget", "plan", "forecast baseline", "budget amount"],
  cash: ["beginning cash", "ending cash", "cash in", "cash out", "burn", "runway"],
  revenue: ["customer", "revenue", "mrr", "arr", "product", "segment", "new", "existing"],
  payroll: ["employee", "role", "department", "salary", "benefits", "start date", "status"],
  kpi: ["kpi", "metric", "value", "unit"],
  notes: ["note", "assumption", "topic", "owner", "priority"],
};

const periodAliases = ["month", "date", "period", "accounting period", "reporting month", "fiscal month"];
const accountAliases = ["account", "account name", "gl account", "line item", "category", "expense category"];
const amountAliases = ["amount", "actual", "value", "total", "budget amount", "revenue amount", "debit", "credit"];
const departmentAliases = ["department", "dept", "function", "team", "cost center"];
const categoryAliases = ["category", "type", "classification", "revenue type"];
const noteAliases = ["note", "notes", "assumption", "comment", "description"];

export async function analyzeSmartUpload(file: File): Promise<SmartUploadReview> {
  const csvText = await file.text();
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  const sampleRows = parsed.data.slice(0, 8);
  const ruleReview = buildRuleBasedReview({
    fileName: file.name,
    headers,
    rows: parsed.data,
  });

  try {
    const response = await fetch("/api/ai/smart-upload-classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        file_name: file.name,
        headers,
        sample_rows: sampleRows,
        rule_based_result: ruleReview,
      }),
    });
    const body = (await response.json()) as {
      classification?: {
        detected_category?: SmartUploadDetectedCategory;
        confidence?: SmartUploadConfidence;
        detected_period_start?: string | null;
        detected_period_end?: string | null;
        suggested_column_mapping?: SmartColumnMapping;
        warnings?: string[];
        reasoning?: string;
      };
    };

    if (!response.ok || !body.classification) {
      return ruleReview;
    }

    return {
      ...ruleReview,
      detectedCategory: normalizeDetectedCategory(
        body.classification.detected_category ?? ruleReview.detectedCategory,
      ),
      confidence: body.classification.confidence ?? ruleReview.confidence,
      detectedPeriodStart:
        body.classification.detected_period_start ?? ruleReview.detectedPeriodStart,
      detectedPeriodEnd:
        body.classification.detected_period_end ?? ruleReview.detectedPeriodEnd,
      suggestedColumnMapping: {
        ...ruleReview.suggestedColumnMapping,
        ...(body.classification.suggested_column_mapping ?? {}),
      },
      warnings: [
        ...new Set([
          ...ruleReview.warnings,
          ...(body.classification.warnings ?? []),
        ]),
      ],
      reasoning: body.classification.reasoning ?? ruleReview.reasoning,
      aiUsed: true,
    };
  } catch (error) {
    console.warn("Smart Upload AI classification fell back to rules", error);
    return ruleReview;
  }
}

export async function confirmSmartUpload({
  file,
  reportingMonth,
  category,
}: {
  file: File;
  reportingMonth: string;
  category: MonthlyCloseCategory;
}) {
  return uploadMonthlyCloseFile({
    file,
    reportingMonth,
    fileCategory: category,
  });
}

export function categoryTitle(category: SmartUploadDetectedCategory) {
  if (category === "unknown") return "Unknown / Needs Review";

  return monthlyCloseCategories.find((item) => item.id === category)?.title ?? category;
}

export function smartUploadSummary(review: SmartUploadReview, reportingMonth: string) {
  return [
    `Detected File Type: ${categoryTitle(review.detectedCategory)}`,
    `Confidence: ${review.confidence}`,
    `Detected Period Range: ${formatPeriodRange(
      review.detectedPeriodStart,
      review.detectedPeriodEnd,
    )}`,
    `Selected Data Room Month: ${formatReportingMonth(reportingMonth)}`,
  ];
}

function buildRuleBasedReview({
  fileName,
  headers,
  rows,
}: {
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[];
}): SmartUploadReview {
  const scores = Object.entries(headerSignals).map(([category, signals]) => ({
    category: category as SmartUploadDetectedCategory,
    score: scoreHeaders(headers, signals),
    reason: `Matched ${signals.filter((signal) => headers.some((header) => normalizeHeader(header).includes(normalizeHeader(signal)))).length} header signal(s).`,
  }));
  const best = scores.sort((a, b) => b.score - a.score)[0] ?? {
    category: "unknown",
    score: 0,
    reason: "No recognizable finance headers were found.",
  };
  const detectedCategory =
    best.score >= 2 ? best.category : ("unknown" as SmartUploadDetectedCategory);
  const confidence: SmartUploadConfidence =
    best.score >= 5 ? "High" : best.score >= 2 ? "Medium" : "Low";
  const mapping = detectColumnMapping(headers);
  const periods = detectPeriods(rows, mapping.period);
  const warnings = buildWarnings({
    headers,
    rows,
    mapping,
    detectedCategory,
    periodCount: new Set(periods).size,
  });

  return {
    fileName,
    detectedCategory,
    confidence,
    detectedPeriodStart: periods[0] ?? null,
    detectedPeriodEnd: periods.at(-1) ?? null,
    suggestedColumnMapping: mapping,
    warnings,
    reasoning:
      detectedCategory === "unknown"
        ? "The file did not contain enough recognizable finance headers. Stage it as Needs Review or send it to Data Entry."
        : `Rule-based detection selected ${categoryTitle(detectedCategory)}. ${best.reason}`,
    headers,
    sampleRows: rows.slice(0, 8),
    aiUsed: false,
  };
}

function scoreHeaders(headers: string[], signals: string[]) {
  return signals.reduce((score, signal) => {
    const normalizedSignal = normalizeHeader(signal);
    return score + (headers.some((header) => normalizeHeader(header).includes(normalizedSignal)) ? 1 : 0);
  }, 0);
}

function detectColumnMapping(headers: string[]): SmartColumnMapping {
  return {
    period: findHeader(headers, periodAliases),
    account: findHeader(headers, accountAliases),
    amount: findHeader(headers, amountAliases),
    department: findHeader(headers, departmentAliases),
    category: findHeader(headers, categoryAliases),
    notes: findHeader(headers, noteAliases),
  };
}

function findHeader(headers: string[], aliases: string[]) {
  return headers.find((header) =>
    aliases.some((alias) => normalizeHeader(header).includes(normalizeHeader(alias))),
  );
}

function detectPeriods(rows: Record<string, unknown>[], periodColumn?: string) {
  if (!periodColumn) return [];

  return rows
    .map((row) => normalizePeriod(String(row[periodColumn] ?? "")))
    .filter((period): period is string => Boolean(period))
    .sort();
}

function buildWarnings({
  headers,
  rows,
  mapping,
  detectedCategory,
  periodCount,
}: {
  headers: string[];
  rows: Record<string, unknown>[];
  mapping: SmartColumnMapping;
  detectedCategory: SmartUploadDetectedCategory;
  periodCount: number;
}) {
  const warnings: string[] = [];

  if (detectedCategory === "unknown") warnings.push("File type needs review before staging.");
  if (!mapping.period) warnings.push("No clear date/period column detected.");
  if (!mapping.amount && detectedCategory !== "notes") warnings.push("No clear amount/value column detected.");
  if (!mapping.account && ["actuals", "budget"].includes(detectedCategory)) warnings.push("No clear account/line-item column detected.");
  if (periodCount > 12) warnings.push("Multiple years detected.");
  if (periodCount > 1) warnings.push(`${periodCount} reporting periods detected.`);
  if (headers.length > 0 && rows.length === 0) warnings.push("Headers were found, but no data rows were detected.");

  return warnings;
}

function normalizeDetectedCategory(value: string): SmartUploadDetectedCategory {
  const normalized = value.toLowerCase();

  if (normalized.includes("actual") || normalized.includes("p&l")) return "actuals";
  if (normalized.includes("budget")) return "budget";
  if (normalized.includes("cash")) return "cash";
  if (normalized.includes("revenue")) return "revenue";
  if (normalized.includes("payroll") || normalized.includes("headcount")) return "payroll";
  if (normalized.includes("kpi")) return "kpi";
  if (normalized.includes("note") || normalized.includes("assumption")) return "notes";
  return "unknown";
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function normalizePeriod(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;

  const parsed = new Date(`${trimmed} 1`);
  if (Number.isNaN(parsed.getTime())) return "";

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatPeriodRange(start: string | null, end: string | null) {
  if (!start && !end) return "Not detected";
  if (start === end) return formatReportingMonth(start ?? "");
  return `${formatReportingMonth(start ?? "")} - ${formatReportingMonth(end ?? "")}`;
}
