import type {
  ParsedCashCsv,
  ParsedFinancialCsv,
  ParsedPayrollCsv,
  ParsedRevenueDetailCsv,
} from "@/types/financial";
import type { MonthlyCloseCategory } from "@/lib/monthlyClose";

export type ValidationSeverity = "Info" | "Warning" | "Critical";

export type DataQualityIssue = {
  id: string;
  fileCategory: MonthlyCloseCategory;
  severity: ValidationSeverity;
  message: string;
};

export type ValidationSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  issues: DataQualityIssue[];
};

export type PriorActualRow = {
  account: string | null;
  category: string | null;
  amount: number | null;
};

type SupportedParsedUpload =
  | ParsedFinancialCsv
  | ParsedCashCsv
  | ParsedPayrollCsv
  | ParsedRevenueDetailCsv;

export function buildValidationSummary({
  fileCategory,
  reportingMonth,
  parsed,
  priorActualRows = [],
}: {
  fileCategory: MonthlyCloseCategory;
  reportingMonth: string;
  parsed: SupportedParsedUpload;
  priorActualRows?: PriorActualRow[];
}): ValidationSummary {
  const issues: DataQualityIssue[] = [];

  parsed.errors.forEach((message, index) => {
    issues.push({
      id: `${fileCategory}-parse-${index}`,
      fileCategory,
      severity: message.toLowerCase().includes("missing required column")
        ? "Critical"
        : "Warning",
      message: `${categoryLabel(fileCategory)}: ${message}`,
    });
  });

  const groupedMessages = new Map<string, number>();

  parsed.rows.forEach((row) => {
    row.messages.forEach((message) => {
      groupedMessages.set(message, (groupedMessages.get(message) ?? 0) + 1);
    });
  });

  [...groupedMessages.entries()].forEach(([message, count], index) => {
    const severity = criticalMessage(message) ? "Critical" : "Warning";
    issues.push({
      id: `${fileCategory}-row-${index}`,
      fileCategory,
      severity,
      message: `${categoryLabel(fileCategory)}: ${formatRowIssue(message, count)}.`,
    });
  });

  const monthMismatchCount = countMonthMismatches(parsed, reportingMonth);

  if (monthMismatchCount > 0) {
    issues.push({
      id: `${fileCategory}-month-mismatch`,
      fileCategory,
      severity: "Critical",
      message: `${categoryLabel(
        fileCategory,
      )}: ${monthMismatchCount} row(s) do not match the selected reporting month.`,
    });
  }

  if (
    fileCategory === "actuals" &&
    parsed.rows[0] &&
    "account" in parsed.rows[0]
  ) {
    issues.push(
      ...buildActualsVarianceIssues(
        fileCategory,
        reportingMonth,
        parsed as ParsedFinancialCsv,
        priorActualRows,
      ),
    );
  }

  return {
    totalRows: parsed.summary.totalRows,
    validRows: parsed.summary.validRows,
    warningRows: parsed.summary.warningRows,
    errorRows: parsed.summary.errorRows,
    issues,
  };
}

export function buildRawFileValidationSummary(
  fileCategory: MonthlyCloseCategory,
): ValidationSummary {
  return {
    totalRows: 0,
    validRows: 0,
    warningRows: 0,
    errorRows: 0,
    issues: [
      {
        id: `${fileCategory}-raw-file`,
        fileCategory,
        severity: "Info",
        message: `${categoryLabel(
          fileCategory,
        )}: File saved for monthly close review. Automated row parsing is not enabled for this category yet.`,
      },
    ],
  };
}

function countMonthMismatches(
  parsed: SupportedParsedUpload,
  reportingMonth: string,
) {
  return parsed.rows.filter((row) => {
    if (!("month" in row)) {
      return false;
    }

    return Boolean(row.month) && row.month !== reportingMonth;
  }).length;
}

function buildActualsVarianceIssues(
  fileCategory: MonthlyCloseCategory,
  reportingMonth: string,
  parsed: ParsedFinancialCsv,
  priorActualRows: PriorActualRow[],
) {
  if (priorActualRows.length === 0) {
    return [];
  }

  const priorPayroll = priorActualRows
    .filter((row) => isPayroll(row.account, row.category))
    .reduce((total, row) => total + Math.abs(row.amount ?? 0), 0);
  const currentPayroll = parsed.rows
    .filter((row) => row.month === reportingMonth && isPayroll(row.account, row.category))
    .reduce((total, row) => total + Math.abs(row.amount ?? 0), 0);

  if (priorPayroll <= 0 || currentPayroll <= 0) {
    return [];
  }

  const change = (currentPayroll - priorPayroll) / priorPayroll;

  if (Math.abs(change) <= 0.25) {
    return [];
  }

  return [
    {
      id: `${fileCategory}-payroll-variance`,
      fileCategory,
      severity: "Warning" as const,
      message: `${categoryLabel(fileCategory)}: Payroll expense ${
        change > 0 ? "increased" : "decreased"
      } ${Math.round(Math.abs(change) * 100)}% vs prior month.`,
    },
  ];
}

function criticalMessage(message: string) {
  const normalized = message.toLowerCase();

  return [
    "missing required column",
    "missing month",
    "missing account",
    "invalid date",
    "invalid month",
    "non-numeric",
    "duplicate",
  ].some((pattern) => normalized.includes(pattern));
}

function formatRowIssue(message: string, count: number) {
  const normalized = message.toLowerCase();

  if (normalized.includes("missing account")) {
    return `${count} row(s) have blank account names`;
  }

  if (normalized.includes("negative revenue") || normalized.includes("unexpected negative revenue")) {
    return `${count} row(s) show negative revenue`;
  }

  if (normalized.includes("duplicate")) {
    return `${count} duplicate row issue(s) detected`;
  }

  if (normalized.includes("missing month")) {
    return `${count} row(s) are missing month`;
  }

  if (normalized.includes("invalid date") || normalized.includes("invalid month")) {
    return `${count} row(s) have invalid dates`;
  }

  if (normalized.includes("large month-over-month")) {
    return `${count} row(s) have large month-over-month variance greater than 25%`;
  }

  return `${count} row(s): ${message}`;
}

function isPayroll(account: string | null, category: string | null) {
  return `${account ?? ""} ${category ?? ""}`.toLowerCase().includes("payroll");
}

function categoryLabel(category: MonthlyCloseCategory) {
  const labels: Record<MonthlyCloseCategory, string> = {
    actuals: "P&L / Actuals",
    budget: "Budget",
    cash: "Cash Report",
    payroll: "Headcount / Payroll",
    revenue: "Revenue Data",
    kpi: "KPI Inputs",
    notes: "Notes / Assumptions",
  };

  return labels[category];
}
